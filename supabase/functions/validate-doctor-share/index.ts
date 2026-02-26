/**
 * Edge Function: validate-doctor-share
 * Arzt gibt Code ein → Prüft is_active + expires_at → Session wird erstellt
 * ÖFFENTLICH (kein JWT), rate-limited
 *
 * Freigabe aktiv = is_active=true AND (expires_at IS NULL OR expires_at > now())
 * NO COOKIES — session_id returned in JSON, client sends via x-doctor-session header.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

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
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[-\s]/g, "");
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
}

function isShareCurrentlyActive(isActive: boolean, expiresAt: string | null): boolean {
  if (!isActive) return false;
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ valid: false, error: "Zu viele Versuche. Bitte warten Sie eine Minute.", error_code: "rate_limited" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawCode = body.code;
    if (!rawCode || typeof rawCode !== "string" || rawCode.length < 4) {
      return new Response(
        JSON.stringify({ valid: false, error: "Bitte geben Sie einen gültigen Code ein", error_code: "invalid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = normalizeCode(rawCode);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: share, error: shareError } = await supabase
      .from("doctor_shares")
      .select("id, user_id, is_active, expires_at, revoked_at, default_range")
      .eq("code", code)
      .maybeSingle();

    if (shareError) {
      console.error("Share lookup error:", shareError);
      return new Response(
        JSON.stringify({ valid: false, error: "Fehler bei der Überprüfung", error_code: "internal_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!share) {
      return new Response(
        JSON.stringify({ valid: false, error: "Code nicht gefunden", error_code: "invalid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (share.revoked_at) {
      return new Response(
        JSON.stringify({ valid: false, error: "Dieser Code wurde dauerhaft widerrufen", error_code: "revoked" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isShareCurrentlyActive(share.is_active, share.expires_at)) {
      // Auto-correct expired
      if (share.is_active && share.expires_at && new Date(share.expires_at) <= new Date()) {
        await supabase.from("doctor_shares").update({ is_active: false }).eq("id", share.id);
      }
      return new Response(
        JSON.stringify({ valid: false, error: "Freigabe nicht aktiv. Bitte bitten Sie den Patienten, in der App erneut freizugeben.", error_code: "not_shared" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create session
    const userAgent = req.headers.get("user-agent") || "";
    const userAgentHash = userAgent ? await hashString(userAgent) : null;

    const { data: session, error: sessionError } = await supabase
      .from("doctor_share_sessions")
      .insert({ share_id: share.id, user_agent_hash: userAgentHash })
      .select("id")
      .single();

    if (sessionError) {
      console.error("Session creation error:", sessionError);
      return new Response(
        JSON.stringify({ valid: false, error: "Session konnte nicht erstellt werden", error_code: "internal_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("doctor_shares").update({ last_accessed_at: new Date().toISOString() }).eq("id", share.id);

    console.log(`[Doctor Share] Session created for share ${share.id.substring(0, 8)}...`);

    // NO Set-Cookie — session_id in JSON body only
    return new Response(
      JSON.stringify({
        valid: true,
        session_id: session.id,
        share_active_until: share.expires_at,
        default_range: share.default_range,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ valid: false, error: "Interner Fehler", error_code: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
