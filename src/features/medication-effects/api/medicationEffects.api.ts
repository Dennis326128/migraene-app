import { supabase } from "@/integrations/supabase/client";

export type MedicationEffect = {
  id: string;
  entry_id: number;
  med_name: string;
  effect_rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
  side_effects: string[];
  notes: string;
  method: 'ui' | 'voice';
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
  updated_at: string;
};

export type MedicationEffectPayload = {
  entry_id: number;
  med_name: string;
  effect_rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
  side_effects: string[];
  notes: string;
  method?: 'ui' | 'voice';
  confidence?: 'high' | 'medium' | 'low';
};

export type UnratedMedicationEntry = {
  id: number;
  medications: string[];
  selected_date: string;
  selected_time: string;
  pain_level: string;
  rated_medications: string[];
};

export async function getUnratedMedicationEntries(): Promise<UnratedMedicationEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get entries with medications from last 48 hours
  const twoDaysAgo = new Date();
  twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);

  const { data: entries, error: entriesError } = await supabase
    .from("pain_entries")
    .select("id, medications, selected_date, selected_time, pain_level")
    .eq("user_id", user.id)
    .not("medications", "is", null)
    .gte("timestamp_created", twoDaysAgo.toISOString())
    .order("timestamp_created", { ascending: false })
    .limit(10);

  if (entriesError) throw entriesError;

  // Get existing medication effects for these entries
  const entryIds = entries?.map(e => e.id) || [];
  if (entryIds.length === 0) return [];

  const { data: effects, error: effectsError } = await supabase
    .from("medication_effects")
    .select("entry_id, med_name")
    .in("entry_id", entryIds);

  if (effectsError) throw effectsError;

  // Create lookup for rated medications per entry
  const ratedMedsLookup: Record<number, string[]> = {};
  effects?.forEach(effect => {
    if (!ratedMedsLookup[effect.entry_id]) {
      ratedMedsLookup[effect.entry_id] = [];
    }
    ratedMedsLookup[effect.entry_id].push(effect.med_name);
  });

  // Filter entries that have unrated medications
  const unratedEntries = entries?.filter(entry => {
    const ratedMeds = ratedMedsLookup[entry.id] || [];
    const allMeds = entry.medications || [];
    return allMeds.some(med => !ratedMeds.includes(med));
  }) || [];

  return unratedEntries.map(entry => ({
    ...entry,
    rated_medications: ratedMedsLookup[entry.id] || []
  }));
}

export async function createMedicationEffect(payload: MedicationEffectPayload): Promise<MedicationEffect> {
  const { data, error } = await supabase
    .from("medication_effects")
    .insert({
      ...payload,
      method: payload.method || 'ui',
      confidence: payload.confidence || 'high'
    })
    .select()
    .single();

  if (error) throw error;
  return data as MedicationEffect;
}

export async function createMedicationEffects(payloads: MedicationEffectPayload[]): Promise<MedicationEffect[]> {
  const { data, error } = await supabase
    .from("medication_effects")
    .insert(payloads.map(payload => ({
      ...payload,
      method: payload.method || 'ui',
      confidence: payload.confidence || 'high'
    })))
    .select();

  if (error) throw error;
  return data as MedicationEffect[];
}

export async function getMedicationEffects(entryId: number): Promise<MedicationEffect[]> {
  const { data, error } = await supabase
    .from("medication_effects")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as MedicationEffect[];
}

export type RecentMedicationEntry = {
  id: number;
  medications: string[];
  selected_date: string;
  selected_time: string;
  pain_level: string;
  timestamp_created: string;
  medication_effects: MedicationEffect[];
};

export async function getRecentMedicationsWithEffects(): Promise<RecentMedicationEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get entries with medications from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: entries, error: entriesError } = await supabase
    .from("pain_entries")
    .select("id, medications, selected_date, selected_time, pain_level, timestamp_created")
    .eq("user_id", user.id)
    .not("medications", "is", null)
    .gte("timestamp_created", sevenDaysAgo.toISOString())
    .order("timestamp_created", { ascending: false })
    .limit(20);

  if (entriesError) throw entriesError;

  // Get existing medication effects for these entries
  const entryIds = entries?.map(e => e.id) || [];
  if (entryIds.length === 0) return [];

  const { data: effects, error: effectsError } = await supabase
    .from("medication_effects")
    .select("*")
    .in("entry_id", entryIds)
    .order("created_at", { ascending: false });

  if (effectsError) throw effectsError;

  // Group effects by entry_id
  const effectsByEntry: Record<number, MedicationEffect[]> = {};
  effects?.forEach(effect => {
    if (!effectsByEntry[effect.entry_id]) {
      effectsByEntry[effect.entry_id] = [];
    }
    effectsByEntry[effect.entry_id].push(effect as MedicationEffect);
  });

  return (entries || []).map(entry => ({
    ...entry,
    medication_effects: effectsByEntry[entry.id] || []
  }));
}