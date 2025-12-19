import { supabase } from "@/integrations/supabase/client";

export interface UserConsent {
  user_id: string;
  terms_version: string;
  terms_accepted_at: string;
  privacy_version: string;
  privacy_accepted_at: string;
  health_data_consent: boolean;
  health_data_consent_at: string | null;
  health_data_consent_version: string;
  medical_disclaimer_accepted_at: string | null;
  consent_withdrawn_at: string | null;
  withdrawal_reason: string | null;
  created_at: string;
}

export async function getUserConsent(): Promise<UserConsent | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_consents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching consent:", error);
    return null;
  }

  return data as UserConsent | null;
}

export async function saveHealthDataConsent(consent: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  // Check if consent record exists
  const existing = await getUserConsent();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from("user_consents")
      .update({
        health_data_consent: consent,
        health_data_consent_at: consent ? new Date().toISOString() : null,
        health_data_consent_version: "1.0",
        consent_withdrawn_at: consent ? null : new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) throw error;
  } else {
    // Create new consent record with health data consent
    const { error } = await supabase
      .from("user_consents")
      .insert({
        user_id: user.id,
        terms_version: "1.0",
        terms_accepted_at: new Date().toISOString(),
        privacy_version: "1.0",
        privacy_accepted_at: new Date().toISOString(),
        health_data_consent: consent,
        health_data_consent_at: consent ? new Date().toISOString() : null,
        health_data_consent_version: "1.0",
      });

    if (error) throw error;
  }
}

export async function saveMedicalDisclaimerAccepted(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  const existing = await getUserConsent();

  if (existing) {
    const { error } = await supabase
      .from("user_consents")
      .update({
        medical_disclaimer_accepted_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) throw error;
  }
}

export async function withdrawHealthDataConsent(reason?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  const { error } = await supabase
    .from("user_consents")
    .update({
      health_data_consent: false,
      consent_withdrawn_at: new Date().toISOString(),
      withdrawal_reason: reason || null,
    })
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function hasValidHealthDataConsent(): Promise<boolean> {
  const consent = await getUserConsent();
  if (!consent) return false;
  
  return consent.health_data_consent === true && 
         consent.consent_withdrawn_at === null;
}
