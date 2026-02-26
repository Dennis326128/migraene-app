/**
 * Edge Function: validate-doctor-share
 * Arzt gibt Code ein → Prüft Freigabe → Signiertes Access-Token zurück
 * ÖFFENTLICH (kein JWT), rate-limited
 *
 * Freigabe aktiv = is_active=true AND (expires_at IS NULL OR expires_at > now())
 * NO COOKIES, NO SESSIONS — access_token returned in JSON.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { signDoctorAccessToken, getDoctorAccessSecret } from "../_shared/doctorAccess.ts";

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

    // Sign access token
    const secret = getDoctorAccessSecret();
    const now = Math.floor(Date.now() / 1000);
    const maxExp = now + 24 * 60 * 60; // now + 24h
    const shareExp = share.expires_at ? Math.floor(new Date(share.expires_at).getTime() / 1000) : maxExp;
    const exp = Math.min(shareExp, maxExp);

    const accessToken = await signDoctorAccessToken(
      { share_id: share.id, user_id: share.user_id, exp, v: 1 },
      secret,
    );

    // Update last_accessed_at (analytics, non-blocking)
    await supabase.from("doctor_shares").update({ last_accessed_at: new Date().toISOString() }).eq("id", share.id);

    console.log(`[Doctor Share] Access token issued for share ${share.id.substring(0, 8)}...`);

    return new Response(
      JSON.stringify({
        valid: true,
        access_token: accessToken,
        expires_at: share.expires_at,
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
