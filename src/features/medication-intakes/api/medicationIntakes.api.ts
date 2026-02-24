/**
 * Medication Intakes API
 * Handles CRUD operations for medication intakes with dose_quarters
 */

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";

export interface MedicationIntake {
  id: string;
  user_id: string;
  entry_id: number;
  medication_id: string | null;
  medication_name: string;
  dose_quarters: number;
  taken_at: string | null;
  taken_date: string | null;
  taken_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIntakeInput {
  entry_id: number;
  medication_name: string;
  medication_id?: string | null;
  dose_quarters?: number;
  taken_at?: string;
  taken_date?: string;
  taken_time?: string;
}

export interface UpdateIntakeInput {
  dose_quarters: number;
}

/**
 * Fetch all medication intakes for an entry
 */
export async function getIntakesForEntry(entryId: number): Promise<MedicationIntake[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("medication_intakes")
    .select("*")
    .eq("entry_id", entryId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch medication intakes for multiple entries
 */
export async function getIntakesForEntries(entryIds: number[]): Promise<MedicationIntake[]> {
  if (entryIds.length === 0) return [];
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("medication_intakes")
    .select("*")
    .in("entry_id", entryIds)
    .eq("user_id", user.id);

  if (error) throw error;
  return data || [];
}

/**
 * Create a medication intake record
 */
export async function createIntake(input: CreateIntakeInput): Promise<MedicationIntake> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("medication_intakes")
    .insert({
      user_id: user.id,
      entry_id: input.entry_id,
      medication_name: input.medication_name,
      medication_id: input.medication_id || null,
      dose_quarters: input.dose_quarters ?? DEFAULT_DOSE_QUARTERS,
      ...(input.taken_at && { taken_at: input.taken_at }),
      ...(input.taken_date && { taken_date: input.taken_date }),
      ...(input.taken_time && { taken_time: input.taken_time }),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create multiple medication intake records
 */
export async function createIntakes(inputs: CreateIntakeInput[]): Promise<MedicationIntake[]> {
  if (inputs.length === 0) return [];
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const records = inputs.map(input => ({
    user_id: user.id,
    entry_id: input.entry_id,
    medication_name: input.medication_name,
    medication_id: input.medication_id || null,
    dose_quarters: input.dose_quarters ?? DEFAULT_DOSE_QUARTERS,
    ...(input.taken_at && { taken_at: input.taken_at }),
    ...(input.taken_date && { taken_date: input.taken_date }),
    ...(input.taken_time && { taken_time: input.taken_time }),
  }));

  const { data, error } = await supabase
    .from("medication_intakes")
    .insert(records)
    .select();

  if (error) throw error;
  return data || [];
}

/**
 * Update a medication intake's dose
 */
export async function updateIntakeDose(intakeId: string, doseQuarters: number): Promise<MedicationIntake> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("medication_intakes")
    .update({ dose_quarters: doseQuarters })
    .eq("id", intakeId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a medication intake
 */
export async function deleteIntake(intakeId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("medication_intakes")
    .delete()
    .eq("id", intakeId)
    .eq("user_id", user.id);

  if (error) throw error;
}

/**
 * Delete all medication intakes for an entry
 */
export async function deleteIntakesForEntry(entryId: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("medication_intakes")
    .delete()
    .eq("entry_id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
}

/**
 * Upsert medication intakes for an entry (sync with pain_entries.medications)
 * Creates new intakes or updates existing ones
 */
export async function syncIntakesForEntry(
  entryId: number,
  medications: Array<{ name: string; doseQuarters?: number; medicationId?: string }>
): Promise<MedicationIntake[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get existing intakes
  const existingIntakes = await getIntakesForEntry(entryId);
  const existingByName = new Map(existingIntakes.map(i => [i.medication_name, i]));

  const toCreate: CreateIntakeInput[] = [];
  const toUpdate: Array<{ id: string; doseQuarters: number }> = [];
  const toKeep = new Set<string>();

  // Process each medication
  for (const med of medications) {
    const existing = existingByName.get(med.name);
    if (existing) {
      toKeep.add(existing.id);
      // Update dose if different
      const newDose = med.doseQuarters ?? DEFAULT_DOSE_QUARTERS;
      if (existing.dose_quarters !== newDose) {
        toUpdate.push({ id: existing.id, doseQuarters: newDose });
      }
    } else {
      // Create new
      toCreate.push({
        entry_id: entryId,
        medication_name: med.name,
        medication_id: med.medicationId,
        dose_quarters: med.doseQuarters ?? DEFAULT_DOSE_QUARTERS,
      });
    }
  }

  // Delete intakes that are no longer in the list
  const toDelete = existingIntakes.filter(i => !toKeep.has(i.id));
  for (const intake of toDelete) {
    await deleteIntake(intake.id);
  }

  // Update existing
  for (const update of toUpdate) {
    await updateIntakeDose(update.id, update.doseQuarters);
  }

  // Create new
  if (toCreate.length > 0) {
    await createIntakes(toCreate);
  }

  // Return updated list
  return getIntakesForEntry(entryId);
}

/**
 * Get medication usage statistics with dose information
 */
export async function getMedicationUsageStats(
  fromDate: string,
  toDate: string
): Promise<Array<{
  medication_name: string;
  total_quarters: number;
  total_tablets: number;
  days_used: number;
  intake_count: number;
}>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("medication_intakes")
    .select(`
      medication_name,
      dose_quarters,
      created_at,
      pain_entries!inner(selected_date)
    `)
    .eq("user_id", user.id)
    .gte("created_at", fromDate)
    .lte("created_at", toDate);

  if (error) throw error;

  // Aggregate by medication
  const stats = new Map<string, {
    total_quarters: number;
    days: Set<string>;
    intake_count: number;
  }>();

  (data || []).forEach((intake: any) => {
    const name = intake.medication_name;
    const date = intake.pain_entries?.selected_date || intake.created_at.split("T")[0];
    
    if (!stats.has(name)) {
      stats.set(name, { total_quarters: 0, days: new Set(), intake_count: 0 });
    }
    
    const s = stats.get(name)!;
    s.total_quarters += intake.dose_quarters;
    s.days.add(date);
    s.intake_count++;
  });

  return Array.from(stats.entries()).map(([medication_name, s]) => ({
    medication_name,
    total_quarters: s.total_quarters,
    total_tablets: s.total_quarters / 4,
    days_used: s.days.size,
    intake_count: s.intake_count,
  }));
}
