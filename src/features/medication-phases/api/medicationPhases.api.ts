/**
 * Medication Phases API
 * Tracks start/stop periods for each medication (multiple cycles allowed)
 */

import { supabase } from "@/lib/supabaseClient";

export type MedicationPhase = {
  id: string;
  user_id: string;
  medication_id: string;
  start_date: string;
  end_date: string | null;
  stop_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatePhaseInput = {
  medication_id: string;
  start_date: string;
  end_date?: string | null;
  stop_reason?: string | null;
  note?: string | null;
};

export type UpdatePhaseInput = Partial<Omit<CreatePhaseInput, "medication_id">>;

/**
 * Get all phases for a medication
 */
export async function getPhasesForMedication(medicationId: string): Promise<MedicationPhase[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from("medication_phases")
    .select("*")
    .eq("medication_id", medicationId)
    .eq("user_id", user.id)
    .order("start_date", { ascending: false });
  
  if (error) throw error;
  return (data || []) as MedicationPhase[];
}

/**
 * Get the current (active) phase for a medication
 */
export async function getActivePhase(medicationId: string): Promise<MedicationPhase | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data, error } = await supabase
    .from("medication_phases")
    .select("*")
    .eq("medication_id", medicationId)
    .eq("user_id", user.id)
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data as MedicationPhase | null;
}

/**
 * Get all phases for all user medications
 */
export async function getAllPhases(): Promise<MedicationPhase[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from("medication_phases")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false });
  
  if (error) throw error;
  return (data || []) as MedicationPhase[];
}

/**
 * Get the most recent phase for a medication (active or ended)
 */
export async function getLatestPhase(medicationId: string): Promise<MedicationPhase | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data, error } = await supabase
    .from("medication_phases")
    .select("*")
    .eq("medication_id", medicationId)
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data as MedicationPhase | null;
}

/**
 * Create a new phase for a medication
 */
export async function createPhase(input: CreatePhaseInput): Promise<MedicationPhase> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");
  
  const { data, error } = await supabase
    .from("medication_phases")
    .insert({
      user_id: user.id,
      medication_id: input.medication_id,
      start_date: input.start_date,
      end_date: input.end_date || null,
      stop_reason: input.stop_reason || null,
      note: input.note || null,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data as MedicationPhase;
}

/**
 * Update a phase
 */
export async function updatePhase(phaseId: string, input: UpdatePhaseInput): Promise<MedicationPhase> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");
  
  const updateData: Record<string, unknown> = {};
  if (input.start_date !== undefined) updateData.start_date = input.start_date;
  if (input.end_date !== undefined) updateData.end_date = input.end_date;
  if (input.stop_reason !== undefined) updateData.stop_reason = input.stop_reason;
  if (input.note !== undefined) updateData.note = input.note;
  
  const { data, error } = await supabase
    .from("medication_phases")
    .update(updateData)
    .eq("id", phaseId)
    .eq("user_id", user.id)
    .select()
    .single();
  
  if (error) throw error;
  return data as MedicationPhase;
}

/**
 * End the active phase for a medication (deactivate)
 */
export async function endActivePhase(
  medicationId: string, 
  endDate: string, 
  stopReason?: string | null
): Promise<MedicationPhase | null> {
  const activePhase = await getActivePhase(medicationId);
  if (!activePhase) return null;
  
  return updatePhase(activePhase.id, {
    end_date: endDate,
    stop_reason: stopReason || null,
  });
}

/**
 * Create a new active phase for a medication (reactivate)
 * If start & end on same day, merges automatically (no separate phase)
 */
export async function startNewPhase(
  medicationId: string, 
  startDate: string = new Date().toISOString().split("T")[0]
): Promise<MedicationPhase> {
  // Check if there's already an active phase
  const activePhase = await getActivePhase(medicationId);
  if (activePhase) {
    // Already active, just return it
    return activePhase;
  }
  
  // Check if the most recent ended phase ended today - merge
  const latestPhase = await getLatestPhase(medicationId);
  if (latestPhase && latestPhase.end_date === startDate) {
    // Same day start/end - clear the end_date to reactivate
    return updatePhase(latestPhase.id, { end_date: null, stop_reason: null });
  }
  
  // Create new phase
  return createPhase({
    medication_id: medicationId,
    start_date: startDate,
  });
}

/**
 * Delete a phase
 */
export async function deletePhase(phaseId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");
  
  const { error } = await supabase
    .from("medication_phases")
    .delete()
    .eq("id", phaseId)
    .eq("user_id", user.id);
  
  if (error) throw error;
}
