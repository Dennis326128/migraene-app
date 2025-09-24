import { supabase } from "@/lib/supabaseClient";

export type UserSettings = {
  user_id: string;
  snapshot_hours: number[];
  backfill_days: number;
  default_report_preset: "3m" | "6m" | "12m";
  include_no_meds: boolean;
  updated_at: string;
};

export async function getUserSettings(): Promise<UserSettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as UserSettings) ?? null;
}

export async function upsertUserSettings(patch: Partial<UserSettings>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const payload: Partial<UserSettings> & { user_id: string } = { user_id: user.id, ...patch };
  const { error } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}