import { supabase } from "@/lib/supabaseClient";

export type ReportSettings = {
  user_id: string;
  default_report_preset: "3m" | "6m" | "12m" | "custom";
  selected_medications: string[];
  include_all_medications: boolean;
  include_patient_data: boolean;
  include_doctor_data: boolean;
  include_statistics: boolean;
  include_chart: boolean;
  include_ai_analysis: boolean;
  include_entries_list: boolean;
  include_medication_summary: boolean;
  created_at: string;
  updated_at: string;
};

export async function getReportSettings(): Promise<ReportSettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data, error } = await supabase
    .from("user_report_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  
  if (error) throw error;
  return data as ReportSettings | null;
}

export async function upsertReportSettings(
  settings: Partial<Omit<ReportSettings, "user_id" | "created_at" | "updated_at">>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");
  
  const { error } = await supabase
    .from("user_report_settings")
    .upsert(
      { user_id: user.id, ...settings },
      { onConflict: "user_id" }
    );
  
  if (error) throw error;
}
