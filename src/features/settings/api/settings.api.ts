import { supabase } from "@/lib/supabaseClient";

export type UserSettings = {
  user_id: string;
  snapshot_hours: number[];
  backfill_days: number;
  default_report_preset: "3m" | "6m" | "12m";
  include_no_meds: boolean;
  selected_report_medications: string[];
  updated_at: string;
};

export type UserDefaults = {
  user_id: string;
  default_symptoms: string[];
  default_pain_location: string | null;
  voice_notes_enabled: boolean;
  ai_enabled: boolean;
  track_cycle: boolean;
  medication_limit_warning_threshold_pct: number;
  updated_at: string;
};

export async function getUserSettings(): Promise<UserSettings | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn('getUserSettings error, using defaults:', error.message);
      return null;
    }
    return (data as UserSettings) ?? null;
  } catch (error) {
    console.warn('getUserSettings failed, using defaults:', error);
    return null;
  }
}

export async function upsertUserSettings(patch: Partial<UserSettings>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const payload: Partial<UserSettings> & { user_id: string } = { user_id: user.id, ...patch };
  const { error } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function getUserDefaults(): Promise<UserDefaults | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id, default_symptoms, default_pain_location, voice_notes_enabled, ai_enabled, track_cycle, medication_limit_warning_threshold_pct, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn('getUserDefaults error:', error.message);
      return null;
    }
    return (data as UserDefaults) ?? null;
  } catch (error) {
    console.warn('getUserDefaults failed:', error);
    return null;
  }
}

export async function upsertUserDefaults(patch: Partial<UserDefaults>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const payload: Partial<UserDefaults> & { user_id: string } = { user_id: user.id, ...patch };
  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}