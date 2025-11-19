import { supabase } from "@/lib/supabaseClient";
import type { PainEntry } from "@/types/painApp";
import { EntryPayloadSchema, type EntryPayload } from "@/lib/zod/schemas";

export type ListParams = { 
  from?: string; 
  to?: string;
  limit?: number;
  offset?: number;
};

export type PainEntryPayload = EntryPayload;

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

  const { from, to, limit = 50, offset = 0 } = params;

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
    .order("timestamp_created", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) q = q.gte("timestamp_created", new Date(from).toISOString());
  if (to) {
    // Fix: Include the entire "to" day by setting time to end of day
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    q = q.lte("timestamp_created", toDate.toISOString());
  }

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

  // Zod-Validierung
  const parsed = EntryPayloadSchema.parse(payload);

  // Ereigniszeitpunkt aus Datum+Uhrzeit ableiten
  const atISO = parsed.selected_date && parsed.selected_time
    ? new Date(`${parsed.selected_date}T${parsed.selected_time}:00`).toISOString()
    : new Date().toISOString();

  const insert = {
    user_id: user.id,
    timestamp_created: atISO, // wichtig: Ereigniszeitpunkt
    ...parsed,
  };

  // UPSERT statt INSERT - vermeidet Duplikate bei gleichem Datum+Uhrzeit
  const { data, error } = await supabase
    .from("pain_entries")
    .upsert(insert, { 
      onConflict: 'user_id,selected_date,selected_time',
      ignoreDuplicates: false // Bei Konflikt: UPDATE
    })
    .select("id")
    .single();

  if (error) {
    // Bei Date/Timestamp-Fehlern: Version-Check triggern
    if (error.code === '23505' || /timestamp|date/i.test(error.message)) {
      console.warn('⚠️ Potential version mismatch detected');
      import('@/lib/version').then(m => m.triggerVersionCheckFromAPI()).catch(() => {});
    }
    
    console.error('Entry save failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      buildId: import.meta.env.VITE_BUILD_ID
    });
    
    throw error;
  }
  
  return data.id as string;
}

export async function updateEntry(id: string, patch: Partial<PainEntryPayload>) {
  // Zod-Validierung für Teilupdates
  const parsed = EntryPayloadSchema.partial().parse(patch);
  const update: any = { ...parsed };

  // Wenn Datum oder Uhrzeit geändert werden, timestamp_created neu setzen
  if (parsed.selected_date || parsed.selected_time) {
    // Wir brauchen beide Komponenten; fehlende aus DB nachladen
    const { data: current } = await supabase
      .from("pain_entries")
      .select("selected_date, selected_time")
      .eq("id", id)
      .single();

    const date = parsed.selected_date ?? current?.selected_date;
    const time = parsed.selected_time ?? current?.selected_time;

    if (date && time) {
      update.timestamp_created = new Date(`${date}T${time}:00`).toISOString();
    }
  }

  const { error } = await supabase.from("pain_entries").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from("pain_entries").delete().eq("id", id);
  if (error) throw error;
}