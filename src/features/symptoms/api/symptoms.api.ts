import { supabase } from "@/lib/supabaseClient";

export type Symptom = { id: string; name: string; is_active: boolean };

export async function listSymptomCatalog(): Promise<Symptom[]> {
  const { data, error } = await supabase
    .from("symptom_catalog")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Symptom[];
}

export async function listEntrySymptoms(entryId: number): Promise<string[]> {
  const { data, error } = await supabase
    .from("entry_symptoms")
    .select("symptom_id")
    .eq("entry_id", entryId);
  if (error) throw error;
  return (data || []).map((r: any) => r.symptom_id as string);
}

/** Setzt die Menge der Symptome eines Eintrags (idempotent). */
export async function setEntrySymptoms(entryId: number, symptomIds: string[]): Promise<void> {
  // aktuelle lesen
  const current = new Set(await listEntrySymptoms(entryId));
  const next = new Set(symptomIds);

  const toInsert = [...next].filter(id => !current.has(id)).map(id => ({ entry_id: entryId, symptom_id: id }));
  const toDelete = [...current].filter(id => !next.has(id));

  if (toInsert.length) {
    const { error } = await supabase.from("entry_symptoms").insert(toInsert);
    if (error) throw error;
  }
  if (toDelete.length) {
    const { error } = await supabase
      .from("entry_symptoms")
      .delete()
      .eq("entry_id", entryId)
      .in("symptom_id", toDelete);
    if (error) throw error;
  }
}