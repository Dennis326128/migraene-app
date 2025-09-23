import { supabase } from "@/lib/supabaseClient";
import type { PainEntry } from "@/types/painApp";

export type ListParams = { from?: string; to?: string };

export type PainEntryPayload = {
  selected_date: string;      // "YYYY-MM-DD"
  selected_time: string;      // "HH:MM"
  pain_level: string;         // "leicht" | "mittel" | "stark" | "sehr_stark" | "-"
  medications: string[];      // Namen
  notes?: string | null;
  weather_id?: number | null;
};

function normalizeWeather(w: any) {
  if (!w) return undefined;
  if (Array.isArray(w)) return w[0] ? {
    temperature_c: w[0].temperature_c ?? null,
    pressure_mb:   w[0].pressure_mb ?? null,
    humidity:      w[0].humidity ?? null,
    condition_text:w[0].condition_text ?? null,
    location:      w[0].location ?? null,
    pressure_change_24h: w[0].pressure_change_24h ?? null,
    moon_phase:    w[0].moon_phase ?? null,
    moonrise:      w[0].moonrise ?? null,
    moonset:       w[0].moonset ?? null,
    id:            w[0].id ?? undefined,
  } : undefined;
  return w;
}

export async function listEntries(params: ListParams = {}): Promise<PainEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase
    .from("pain_entries")
    .select(`
      id,
      timestamp_created,
      selected_date,
      selected_time,
      pain_level,
      medications,
      notes,
      weather:weather_logs!pain_entries_weather_id_fkey (
        id, location, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, moon_phase, moonrise, moonset
      )
    `)
    .eq("user_id", user.id)
    .order("timestamp_created", { ascending: false });

  if (params.from) q = q.gte("timestamp_created", new Date(params.from).toISOString());
  if (params.to)   q = q.lte("timestamp_created", new Date(params.to).toISOString());

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((e: any) => ({
    ...e,
    medications: e.medications || [],
    weather: normalizeWeather(e.weather),
  })) as PainEntry[];
}

export async function getEntry(id: string): Promise<PainEntry | null> {
  const { data, error } = await supabase
    .from("pain_entries")
    .select(`
      id, timestamp_created, selected_date, selected_time, pain_level, medications, notes,
      weather:weather_logs!pain_entries_weather_id_fkey (
        id, location, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, moon_phase, moonrise, moonset
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    medications: data.medications || [],
    weather: normalizeWeather(data.weather),
  } as PainEntry;
}

export async function createEntry(payload: PainEntryPayload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");

  const insert = {
    user_id: user.id,
    timestamp_created: new Date().toISOString(),
    ...payload,
  };

  const { data, error } = await supabase
    .from("pain_entries")
    .insert(insert)
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function updateEntry(id: string, patch: Partial<PainEntryPayload>) {
  const { error } = await supabase.from("pain_entries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from("pain_entries").delete().eq("id", id);
  if (error) throw error;
}