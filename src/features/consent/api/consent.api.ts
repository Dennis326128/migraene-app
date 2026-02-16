import { supabase } from "@/integrations/supabase/client";

/**
 * Current disclaimer version — bump this to re-show the modal.
 */
export const DISCLAIMER_VERSION = "2026-02-16";

const LS_KEY = "miary_disclaimer_accepted_version";

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
  medical_disclaimer_version: string | null;
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
    .maybeSingle();

  if (error) {
    console.error("Error fetching consent:", error);
    return null;
  }

  // Sync server→local for flicker prevention
  if (data?.medical_disclaimer_version) {
    try {
      localStorage.setItem(LS_KEY, data.medical_disclaimer_version);
    } catch { /* ignore */ }
  }

  return data as UserConsent | null;
}

/**
 * Speichert Health Data Consent via UPSERT (genau 1 Zeile pro User)
 */
export async function saveHealthDataConsent(consent: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  const now = new Date().toISOString();
  
  const { error } = await supabase
    .from("user_consents")
    .upsert({
      user_id: user.id,
      terms_version: "1.0",
      terms_accepted_at: now,
      privacy_version: "1.0",
      privacy_accepted_at: now,
      health_data_consent: consent,
      health_data_consent_at: consent ? now : null,
      health_data_consent_version: "1.1",
      consent_withdrawn_at: consent ? null : now,
    }, { 
      onConflict: "user_id",
      ignoreDuplicates: false 
    });

  if (error) throw error;
}

/**
 * Speichert Medical Disclaimer Akzeptanz mit Version
 */
export async function saveMedicalDisclaimerAccepted(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  const now = new Date().toISOString();

  // Hole bestehenden Consent für Merge
  const existing = await getUserConsent();
  
  const { error } = await supabase
    .from("user_consents")
    .upsert({
      user_id: user.id,
      terms_version: existing?.terms_version || "1.0",
      terms_accepted_at: existing?.terms_accepted_at || now,
      privacy_version: existing?.privacy_version || "1.0",
      privacy_accepted_at: existing?.privacy_accepted_at || now,
      health_data_consent: existing?.health_data_consent ?? false,
      health_data_consent_at: existing?.health_data_consent_at || null,
      health_data_consent_version: existing?.health_data_consent_version || "1.1",
      medical_disclaimer_accepted_at: now,
      medical_disclaimer_version: DISCLAIMER_VERSION,
    }, { 
      onConflict: "user_id",
      ignoreDuplicates: false 
    });

  if (error) throw error;

  // Persist locally for flicker prevention
  try {
    localStorage.setItem(LS_KEY, DISCLAIMER_VERSION);
  } catch { /* ignore */ }
}

/**
 * Widerruft Health Data Consent (eindeutig 1 Datensatz)
 */
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

/**
 * Prüft ob gültige Gesundheitsdaten-Einwilligung vorliegt
 */
export async function hasValidHealthDataConsent(): Promise<boolean> {
  const consent = await getUserConsent();
  if (!consent) return false;
  
  return consent.health_data_consent === true && 
         consent.consent_withdrawn_at === null;
}

/**
 * Prüft ob Medical Disclaimer in aktueller Version akzeptiert wurde.
 * Uses localStorage as fast initial check to avoid flicker.
 */
export function isDisclaimerAcceptedLocally(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

/**
 * Consent-Status für Gate-Checks
 */
export interface ConsentStatus {
  isLoading: boolean;
  hasConsent: boolean;
  needsHealthDataConsent: boolean;
  needsMedicalDisclaimer: boolean;
  isWithdrawn: boolean;
}

export async function getConsentStatus(): Promise<Omit<ConsentStatus, 'isLoading'>> {
  const consent = await getUserConsent();
  
  if (!consent) {
    return {
      hasConsent: false,
      needsHealthDataConsent: true,
      needsMedicalDisclaimer: true,
      isWithdrawn: false,
    };
  }

  const isWithdrawn = consent.consent_withdrawn_at !== null;
  const needsHealthDataConsent = !consent.health_data_consent || isWithdrawn;
  
  // Version-based check: needs disclaimer if version doesn't match current
  const needsMedicalDisclaimer = consent.medical_disclaimer_version !== DISCLAIMER_VERSION;

  return {
    hasConsent: !needsHealthDataConsent && !needsMedicalDisclaimer,
    needsHealthDataConsent,
    needsMedicalDisclaimer,
    isWithdrawn,
  };
}
