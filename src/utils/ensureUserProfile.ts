import { supabase } from "@/lib/supabaseClient";

export async function ensureUserProfile(consentData?: {
  termsAccepted: boolean;
  privacyAccepted: boolean;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { data: existing } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (!existing) {
    try {
      await supabase.from("user_profiles").insert({ user_id: uid });
    } catch (error) {
      // Ignore insert errors (profile might already exist)
    }
  }
  
  // Consent speichern wenn beim Signup gegeben
  if (consentData?.termsAccepted && consentData?.privacyAccepted) {
    try {
      await supabase.from("user_consents").insert({
        user_id: uid,
        terms_version: '1.0',
        privacy_version: '1.0'
      });
    } catch (error) {
      console.error('Failed to save consent:', error);
    }
  }
}
