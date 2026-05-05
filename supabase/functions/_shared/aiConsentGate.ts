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
// Use a type-only loose definition to avoid pulling supabase-js into this shared module's bundle.
// The actual client is created in the calling edge function.
type SupabaseClient = {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export const AI_CONSENT_MISSING_MESSAGE =
  "KI-Analyse erfordert deine Zustimmung. Bitte in den Einstellungen aktivieren.";

export async function hasAiConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const shortId = userId ? `${userId.slice(0, 8)}…` : "<no-user>";
  try {
    console.log(`[aiConsentGate] check user=${shortId}`);
    const { data, error } = await supabase.rpc("has_ai_consent", {
      p_user_id: userId,
    });
    if (error) {
      console.error(`[aiConsentGate] has_ai_consent RPC error user=${shortId}:`, error);
      return false;
    }
    const ok = data === true;
    if (!ok) console.log(`[aiConsentGate] AI_CONSENT_REQUIRED user=${shortId}`);
    return ok;
  } catch (err) {
    console.error(`[aiConsentGate] Unexpected error user=${shortId}:`, err);
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
