import { supabase } from "@/integrations/supabase/client";
import type { EntryMedication, CreateEntryMedicationPayload } from "@/types/entryMedications";

export async function getEntryMedications(entryId: number): Promise<EntryMedication[]> {
  const { data, error } = await supabase
    .from("entry_medications")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createEntryMedication(payload: CreateEntryMedicationPayload): Promise<EntryMedication> {
  const { data, error } = await supabase
    .from("entry_medications")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEntryMedication(
  id: string, 
  patch: Partial<CreateEntryMedicationPayload>
): Promise<EntryMedication> {
  const { data, error } = await supabase
    .from("entry_medications")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEntryMedication(id: string): Promise<void> {
  const { error } = await supabase
    .from("entry_medications")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getLastEntryDefaults() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not authenticated");

  // Get the latest entry
  const { data: entry, error: entryError } = await supabase
    .from("pain_entries")
    .select("id, pain_location")
    .eq("user_id", user.user.id)
    .order("timestamp_created", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entryError) throw entryError;
  
  if (!entry) {
    return { pain_location: null, symptom_ids: [] };
  }

  // Get symptoms from the latest entry
  const { data: symptoms, error: symptomsError } = await supabase
    .from("entry_symptoms")
    .select("symptom_id")
    .eq("entry_id", entry.id);

  if (symptomsError) throw symptomsError;

  return {
    pain_location: entry.pain_location,
    symptom_ids: symptoms?.map(s => s.symptom_id) || []
  };
}