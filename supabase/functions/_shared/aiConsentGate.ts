/**
 * AI Consent Gate
 *
 * Verifies that the authenticated user has explicitly consented to
 * AI-based processing of their data before allowing any call to the
 * Lovable AI Gateway. Returns null when consent is granted, or a
 * Response object (HTTP 403) that the caller MUST return immediately
 * when consent is missing.
 *
 * Usage in an edge function:
 *   const block = await requireAiConsent(supabase, userId, corsHeaders);
 *   if (block) return block;
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const AI_CONSENT_MISSING_MESSAGE =
  "KI-Analyse erfordert deine Zustimmung. Bitte in den Einstellungen aktivieren.";

export async function hasAiConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("has_ai_consent", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[aiConsentGate] has_ai_consent RPC error:", error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("[aiConsentGate] Unexpected error:", err);
    return false;
  }
}

export async function requireAiConsent(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const ok = await hasAiConsent(supabase, userId);
  if (ok) return null;

  return new Response(
    JSON.stringify({
      error: AI_CONSENT_MISSING_MESSAGE,
      code: "AI_CONSENT_REQUIRED",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
