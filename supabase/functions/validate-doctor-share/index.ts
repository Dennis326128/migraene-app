/**
 * Edge Function: validate-doctor-share
 * Arzt gibt Code ein → Prüft share_active_until → Session wird erstellt (Cookie)
 * ÖFFENTLICH (kein JWT), aber rate-limited
 * 
 * NEU: Prüft share_active_until für 24h-Freigabe-Fenster
 * error_codes: invalid, revoked, expired_code, not_shared
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Erlaubte Origins für CORS mit Credentials
const ALLOWED_ORIGINS = [
  "https://migraina.lovable.app",
  "https://migraene-app.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://migraina.lovable.app",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-doctor-session, authorization, x-client-info, apikey, cookie",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

// Rate Limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Code normalisieren
function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[-\s]/g, "");
}

// Hash für User-Agent
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Rate Limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Zu viele Versuche. Bitte warten Sie eine Minute.",
          error_code: "rate_limited" 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Body parsen
    const body = await req.json().catch(() => ({}));
    const rawCode = body.code;
    
    if (!rawCode || typeof rawCode !== "string" || rawCode.length < 4) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Bitte geben Sie einen gültigen Code ein",
          error_code: "invalid" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = normalizeCode(rawCode);

    // Supabase Client mit Service Role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Share suchen (inkl. neue Felder)
    const { data: share, error: shareError } = await supabase
      .from("doctor_shares")
      .select("id, user_id, expires_at, revoked_at, default_range, share_active_until, share_revoked_at")
      .eq("code", code)
      .maybeSingle();

    if (shareError) {
      console.error("Share lookup error:", shareError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Fehler bei der Überprüfung",
          error_code: "internal_error" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Code nicht gefunden
    if (!share) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Code nicht gefunden",
          error_code: "invalid" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Code dauerhaft widerrufen (revoked_at)
    if (share.revoked_at) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Dieser Code wurde dauerhaft widerrufen",
          error_code: "revoked" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Code-Lebensdauer abgelaufen (expires_at - für temporäre Codes)
    if (share.expires_at) {
      const now = new Date();
      const expiresAt = new Date(share.expires_at);
      if (now > expiresAt) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Dieser Code ist abgelaufen",
            error_code: "expired_code" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4) NEUE PRÜFUNG: 24h-Freigabe-Fenster (share_active_until)
    const now = new Date();
    if (!share.share_active_until || new Date(share.share_active_until) <= now) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Freigabe nicht aktiv. Bitte bitten Sie den Patienten, in der App erneut freizugeben.",
          error_code: "not_shared" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Alle Checks bestanden → Session erstellen
    const userAgent = req.headers.get("user-agent") || "";
    const userAgentHash = userAgent ? await hashString(userAgent) : null;

    const { data: session, error: sessionError } = await supabase
      .from("doctor_share_sessions")
      .insert({
        share_id: share.id,
        user_agent_hash: userAgentHash,
      })
      .select("id")
      .single();

    if (sessionError) {
      console.error("Session creation error:", sessionError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Session konnte nicht erstellt werden",
          error_code: "internal_error" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // last_accessed_at aktualisieren
    await supabase
      .from("doctor_shares")
      .update({ last_accessed_at: now.toISOString() })
      .eq("id", share.id);

    console.log(`[Doctor Share] Session created for share ${share.id.substring(0, 8)}...`);

    // Cookie setzen
    const isProduction = supabaseUrl.includes("supabase.co");
    const cookieOptions = [
      `doctor_session=${session.id}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=3600",
    ];
    if (isProduction) {
      cookieOptions.push("Secure");
    }

    return new Response(
      JSON.stringify({
        valid: true,
        session_id: session.id,
        share_active_until: share.share_active_until,
        default_range: share.default_range,
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Set-Cookie": cookieOptions.join("; "),
        } 
      }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: "Interner Fehler",
        error_code: "internal_error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
