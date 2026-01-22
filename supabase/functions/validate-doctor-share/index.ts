/**
 * Edge Function: validate-doctor-share
 * Arzt gibt Code ein → Session wird erstellt (Cookie)
 * ÖFFENTLICH (kein JWT), aber rate-limited
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Dynamischer CORS Origin für Credentials (Wildcard * funktioniert nicht mit credentials)
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  // Alle lovable.app Subdomains erlauben
  const isAllowed = origin.includes("lovable.app") || origin.includes("localhost");
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://migraene-app.lovable.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Rate Limiting: In-Memory (für Edge Function Instanz)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 Minute
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

// Code normalisieren: Uppercase, ohne Bindestrich/Leerzeichen
function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[-\s]/g, "");
}

// Hash für User-Agent (optional, für Audit)
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate Limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ valid: false, error: "Zu viele Versuche. Bitte warten Sie eine Minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Body parsen
    const body = await req.json().catch(() => ({}));
    const rawCode = body.code;
    
    if (!rawCode || typeof rawCode !== "string" || rawCode.length < 4) {
      return new Response(
        JSON.stringify({ valid: false, error: "Bitte geben Sie einen gültigen Code ein" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = normalizeCode(rawCode);

    // Supabase Client mit Service Role (für Session-Erstellung)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Share suchen
    const { data: share, error: shareError } = await supabase
      .from("doctor_shares")
      .select("id, user_id, expires_at, revoked_at, default_range")
      .eq("code", code)
      .maybeSingle();

    if (shareError) {
      console.error("Share lookup error:", shareError);
      return new Response(
        JSON.stringify({ valid: false, error: "Fehler bei der Überprüfung" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validierungen
    if (!share) {
      return new Response(
        JSON.stringify({ valid: false, error: "Code nicht gefunden" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (share.revoked_at) {
      return new Response(
        JSON.stringify({ valid: false, error: "Dieser Code wurde widerrufen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const expiresAt = new Date(share.expires_at);
    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ valid: false, error: "Dieser Code ist abgelaufen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session erstellen
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
        JSON.stringify({ valid: false, error: "Session konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // last_accessed_at aktualisieren
    await supabase
      .from("doctor_shares")
      .update({ last_accessed_at: now.toISOString() })
      .eq("id", share.id);

    // Cookie setzen (httpOnly, 60 Minuten)
    const isProduction = supabaseUrl.includes("supabase.co");
    const cookieOptions = [
      `doctor_session=${session.id}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=3600", // 60 Minuten
    ];
    if (isProduction) {
      cookieOptions.push("Secure");
    }

    return new Response(
      JSON.stringify({
        valid: true,
        expires_at: share.expires_at,
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
      JSON.stringify({ valid: false, error: "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
