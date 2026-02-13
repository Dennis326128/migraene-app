import { supabase } from "@/lib/supabaseClient";

export interface SymptomBurden {
  id: string;
  user_id: string;
  symptom_key: string;
  burden_level: number;
  updated_at: string;
}

/** Load all burden ratings for the current user */
export async function listSymptomBurdens(): Promise<SymptomBurden[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_symptom_burden")
    .select("id, user_id, symptom_key, burden_level, updated_at")
    .eq("user_id", user.id);

  if (error) {
    console.warn("listSymptomBurdens error:", error.message);
    return [];
  }
  return (data || []) as SymptomBurden[];
}

/** Upsert a single burden rating */
export async function upsertSymptomBurden(
  symptomKey: string,
  burdenLevel: number
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");

  const { error } = await supabase
    .from("user_symptom_burden")
    .upsert(
      {
        user_id: user.id,
        symptom_key: symptomKey,
        burden_level: burdenLevel,
      },
      { onConflict: "user_id,symptom_key" }
    );

  if (error) throw error;
}
