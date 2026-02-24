/**
 * Medication History API
 * Paginated intake history for a specific medication
 */

import { supabase } from "@/integrations/supabase/client";

export interface MedicationHistoryEntry {
  id: string;
  entry_id: number;
  medication_name: string;
  dose_quarters: number;
  created_at: string;
  selected_date: string | null;
  selected_time: string | null;
  timestamp_created: string | null;
  pain_level: string;
}

export interface MedicationHistoryResult {
  items: MedicationHistoryEntry[];
  totalCount: number;
}

/**
 * Fetch paginated intake history for a specific medication.
 * Joins pain_entries to get date/time context.
 */
export async function getMedicationHistory(
  medicationName: string,
  offset: number = 0,
  limit: number = 10
): Promise<MedicationHistoryResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get total count (independent of pagination)
  const { count, error: countError } = await supabase
    .from("medication_intakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_name", medicationName);

  if (countError) throw countError;

  // Get paginated items with entry data
  const { data, error } = await supabase
    .from("medication_intakes")
    .select(`
      id,
      entry_id,
      medication_name,
      dose_quarters,
      created_at,
      pain_entries!inner (
        selected_date,
        selected_time,
        timestamp_created,
        pain_level
      )
    `)
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const items: MedicationHistoryEntry[] = (data || []).map((row: any) => ({
    id: row.id,
    entry_id: row.entry_id,
    medication_name: row.medication_name,
    dose_quarters: row.dose_quarters,
    created_at: row.created_at,
    selected_date: row.pain_entries?.selected_date ?? null,
    selected_time: row.pain_entries?.selected_time ?? null,
    timestamp_created: row.pain_entries?.timestamp_created ?? null,
    pain_level: row.pain_entries?.pain_level ?? '-',
  }));

  return { items, totalCount: count ?? 0 };
}

/**
 * Count intakes for a medication in a date range.
 * Uses selected_date from pain_entries for accurate day-based counting.
 */
export async function countMedicationIntakesInRange(
  medicationName: string,
  from: string,
  to: string
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { count, error } = await supabase
    .from("medication_intakes")
    .select("id, pain_entries!inner(selected_date)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .gte("pain_entries.selected_date", from)
    .lte("pain_entries.selected_date", to);

  if (error) throw error;
  return count ?? 0;
}
