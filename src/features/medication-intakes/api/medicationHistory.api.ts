/**
 * Medication History API
 * Paginated intake history using taken_at/taken_date (no join needed for count/sort)
 */

import { supabase } from "@/integrations/supabase/client";

export interface MedicationHistoryEntry {
  id: string;
  entry_id: number;
  medication_name: string;
  dose_quarters: number;
  taken_at: string;
  taken_date: string;
  taken_time: string;
}

export interface MedicationHistoryResult {
  items: MedicationHistoryEntry[];
  totalCount: number;
}

/**
 * Fetch paginated intake history for a specific medication within a date range.
 * Uses taken_at for sorting and taken_date for range filtering (no join needed).
 */
export async function getMedicationHistory(
  medicationName: string,
  from: string,
  to: string,
  offset: number = 0,
  limit: number = 10
): Promise<MedicationHistoryResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Total count within date range (no join, uses taken_date directly)
  const { count, error: countError } = await supabase
    .from("medication_intakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .gte("taken_date", from)
    .lte("taken_date", to);

  if (countError) throw countError;

  // Paginated items sorted by taken_at DESC
  const { data, error } = await supabase
    .from("medication_intakes")
    .select("id, entry_id, medication_name, dose_quarters, taken_at, taken_date, taken_time")
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .gte("taken_date", from)
    .lte("taken_date", to)
    .order("taken_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const items: MedicationHistoryEntry[] = (data || []).map((row: any) => ({
    id: row.id,
    entry_id: row.entry_id,
    medication_name: row.medication_name,
    dose_quarters: row.dose_quarters,
    taken_at: row.taken_at,
    taken_date: row.taken_date,
    taken_time: row.taken_time,
  }));

  return { items, totalCount: count ?? 0 };
}

/**
 * Fetch the latest N intakes for a medication (no date range filter).
 * Used in medication history mode to always show the most recent entries.
 */
export async function getMedicationHistoryLatest(
  medicationName: string,
  offset: number = 0,
  limit: number = 10
): Promise<MedicationHistoryResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Total count (all time, no date filter)
  const { count, error: countError } = await supabase
    .from("medication_intakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_name", medicationName);

  if (countError) throw countError;

  // Paginated items sorted by taken_at DESC
  const { data, error } = await supabase
    .from("medication_intakes")
    .select("id, entry_id, medication_name, dose_quarters, taken_at, taken_date, taken_time")
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .order("taken_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const items: MedicationHistoryEntry[] = (data || []).map((row: any) => ({
    id: row.id,
    entry_id: row.entry_id,
    medication_name: row.medication_name,
    dose_quarters: row.dose_quarters,
    taken_at: row.taken_at,
    taken_date: row.taken_date,
    taken_time: row.taken_time,
  }));

  return { items, totalCount: count ?? 0 };
}

/**
 * Count intakes for a medication in a date range.
 * Uses taken_date directly (no join to pain_entries needed).
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
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("medication_name", medicationName)
    .gte("taken_date", from)
    .lte("taken_date", to);

  if (error) throw error;
  return count ?? 0;
}
