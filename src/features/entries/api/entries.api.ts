import { supabase } from "@/lib/supabaseClient";
import type { PainEntry } from "@/types/painApp";
import { EntryPayloadSchema, type EntryPayload } from "@/lib/zod/schemas";
import { addToOfflineQueue, syncPendingEntries } from "@/lib/offlineQueue";

export type ListParams = { 
  from?: string; 
  to?: string;
  limit?: number;
  offset?: number;
};

export type PainEntryPayload = EntryPayload;

// Helper: Convert medication names to IDs
async function getMedicationIds(userId: string, medicationNames: string[]): Promise<string[]> {
  if (!medicationNames || medicationNames.length === 0) return [];
  
  const { data, error } = await supabase
    .from('user_medications')
    .select('id, name')
    .eq('user_id', userId)
    .in('name', medicationNames);
  
  if (error) {
    console.error('Error fetching medication IDs:', error);
    return [];
  }
  
  // Map names to IDs (case-insensitive match)
  const nameToId = new Map(
    (data || []).map(med => [med.name.toLowerCase().trim(), med.id])
  );
  
  return medicationNames
    .map(name => nameToId.get(name.toLowerCase().trim()))
    .filter((id): id is string => id !== undefined);
}

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
      pain_locations,
      aura_type,
      medications,
      notes,
      weather:weather_logs!pain_entries_weather_id_fkey (
        id, location, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, moon_phase, moonrise, moonset
      ),
      medication_intakes (
        medication_name,
        medication_id,
        dose_quarters
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
    pain_locations: e.pain_locations || [],
    aura_type: e.aura_type || 'keine',
    medications: e.medications || [],
    medication_intakes: e.medication_intakes || [],
    weather: normalizeWeather(e.weather),
  })) as PainEntry[];
}

/**
 * Fetch ALL entries for a date range - used for PDF export.
 * No limit/pagination - loads everything in range.
 * Uses batched fetching to handle large datasets (Supabase 1000 row limit per request).
 */
export async function fetchAllEntriesForExport(from: string, to: string): Promise<PainEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const BATCH_SIZE = 1000; // Supabase max per request
  let allEntries: PainEntry[] = [];
  let offset = 0;
  let hasMore = true;

  // End of day for 'to' date
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  const toIso = toDate.toISOString();
  const fromIso = new Date(from).toISOString();

  while (hasMore) {
    const { data, error } = await supabase
      .from("pain_entries")
      .select(`
        id,
        timestamp_created,
        selected_date,
        selected_time,
        pain_level,
        pain_locations,
        aura_type,
        medications,
        notes,
        weather:weather_logs!pain_entries_weather_id_fkey (
          id, location, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, moon_phase, moonrise, moonset
        ),
        medication_intakes (
          medication_name,
          medication_id,
          dose_quarters
        )
      `)
      .eq("user_id", user.id)
      .gte("timestamp_created", fromIso)
      .lte("timestamp_created", toIso)
      .order("timestamp_created", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;

    const batch = (data || []).map((e: any) => ({
      ...e,
      pain_locations: e.pain_locations || [],
      aura_type: e.aura_type || 'keine',
      medications: e.medications || [],
      medication_intakes: e.medication_intakes || [],
      weather: normalizeWeather(e.weather),
    })) as PainEntry[];

    allEntries = allEntries.concat(batch);
    
    // If we got less than BATCH_SIZE, we've fetched everything
    if (batch.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  console.log(`[PDF Export] Fetched ${allEntries.length} entries for range ${from} to ${to}`);
  return allEntries;
}

export async function getEntry(id: string): Promise<PainEntry | null> {
  const { data, error } = await supabase
    .from("pain_entries")
    .select(`
      id, timestamp_created, selected_date, selected_time, pain_level, pain_locations, aura_type, medications, notes,
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
    pain_locations: data.pain_locations || [],
    aura_type: data.aura_type || 'keine',
    medications: data.medications || [],
    weather: normalizeWeather(data.weather),
  } as PainEntry;
}

export async function createEntry(payload: PainEntryPayload): Promise<string> {
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
    timestamp_created: atISO,
    ...parsed,
  };

  // OFFLINE CHECK: Bei fehlender Verbindung in Queue speichern
  if (!navigator.onLine) {
    console.log('📴 Offline - saving to local queue');
    const offlineId = await addToOfflineQueue('pain_entry', insert);
    return `offline_${offlineId}`;
  }

  try {
    // UPSERT statt INSERT - vermeidet Duplikate bei gleichem Datum+Uhrzeit
    const { data, error } = await supabase
      .from("pain_entries")
      .upsert(insert, { 
        onConflict: 'user_id,selected_date,selected_time',
        ignoreDuplicates: false
      })
      .select("id")
      .single();

    if (error) {
      // Bei Netzwerk-Fehlern: in Queue speichern
      if (error.message?.includes('fetch') || error.message?.includes('network') || error.code === 'PGRST000') {
        console.log('🔄 Network error - saving to offline queue');
        const offlineId = await addToOfflineQueue('pain_entry', insert);
        return `offline_${offlineId}`;
      }

      // Bei Date/Timestamp-Fehlern: Version-Check triggern
      if (error.code === '23505' || /timestamp|date/i.test(error.message)) {
        console.warn('⚠️ Potential version mismatch detected');
        import('@/lib/version').then(m => m.triggerVersionCheckFromAPI()).catch(() => {});
      }
      
      console.error('Entry save failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      
      throw error;
    }
    
    return data.id as string;
  } catch (err: any) {
    // Bei unerwarteten Fehlern (z.B. Timeout): in Queue speichern
    if (err?.message?.includes('fetch') || err?.message?.includes('Failed') || !navigator.onLine) {
      console.log('🔄 Request failed - saving to offline queue');
      const offlineId = await addToOfflineQueue('pain_entry', insert);
      return `offline_${offlineId}`;
    }
    throw err;
  }
}

export async function updateEntry(id: string, patch: Partial<PainEntryPayload>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");

  // Zod-Validierung für Teilupdates
  const parsed = EntryPayloadSchema.partial().parse(patch);
  const update: any = { ...parsed };

  // If medications are updated, also update medication_ids
  if (parsed.medications) {
    update.medication_ids = await getMedicationIds(user.id, parsed.medications);
  }

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

export async function getFirstEntryDate(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("pain_entries")
    .select("timestamp_created")
    .eq("user_id", user.id)
    .order("timestamp_created", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return null;
  
  // Nur das Datum zurückgeben (ohne Zeit)
  return data.timestamp_created?.split('T')[0] || null;
}

/**
 * Count ALL entries in a date range - no limit.
 * Used for accurate UI display of entry counts.
 */
export async function countEntriesInRange(from: string, to: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  const toIso = toDate.toISOString();
  const fromIso = new Date(from).toISOString();

  const { count, error } = await supabase
    .from("pain_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("timestamp_created", fromIso)
    .lte("timestamp_created", toIso);

  if (error) {
    console.error("Error counting entries:", error);
    return 0;
  }

  return count ?? 0;
}