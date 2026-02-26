import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the nearest snapshot weather_log for a given date+time
 * when the entry has no weather_id or the linked log is missing.
 *
 * Strategy:
 * 1. Find weather_logs with snapshot_date == entryDate for this user
 * 2. Pick the one with requested_at closest to the entry time
 * 3. If no requested_at, fall back to created_at
 */

export interface SnapshotWeatherData {
  id: number;
  temperature_c: number | null;
  pressure_mb: number | null;
  humidity: number | null;
  condition_text: string | null;
  pressure_change_24h: number | null;
  location: string | null;
  moon_phase: number | null;
  source: 'snapshot';
}

async function fetchSnapshotWeather(
  userId: string,
  entryDate: string, // YYYY-MM-DD
  entryTimeMs: number // epoch ms of the entry time (for nearest match)
): Promise<SnapshotWeatherData | null> {
  const { data, error } = await supabase
    .from('weather_logs')
    .select('id, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, location, moon_phase, requested_at, created_at')
    .eq('user_id', userId)
    .eq('snapshot_date', entryDate)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !data || data.length === 0) return null;

  // Find nearest to entryTimeMs
  let best = data[0];
  let bestDiff = Infinity;

  for (const row of data) {
    const ts = row.requested_at || row.created_at;
    if (!ts) continue;
    const diff = Math.abs(new Date(ts).getTime() - entryTimeMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }

  return {
    id: best.id,
    temperature_c: best.temperature_c,
    pressure_mb: best.pressure_mb,
    humidity: best.humidity,
    condition_text: best.condition_text,
    pressure_change_24h: best.pressure_change_24h,
    location: best.location,
    moon_phase: best.moon_phase,
    source: 'snapshot',
  };
}

/**
 * Hook: load nearest snapshot weather for an entry that has no weather data.
 * Only fetches when enabled=true and entry has no weather.
 */
export function useSnapshotWeather(params: {
  entryId: number | string;
  userId: string | undefined;
  entryDate: string | undefined; // YYYY-MM-DD
  entryTime: string | undefined; // HH:MM or HH:MM:SS
  hasEntryWeather: boolean;
  enabled: boolean;
}) {
  const { entryId, userId, entryDate, entryTime, hasEntryWeather, enabled } = params;

  // Compute entry time in epoch ms (for nearest match)
  const entryTimeMs = entryDate
    ? new Date(`${entryDate}T${entryTime || '12:00'}:00`).getTime()
    : 0;

  return useQuery({
    queryKey: ['snapshot-weather', entryId],
    queryFn: () => fetchSnapshotWeather(userId!, entryDate!, entryTimeMs),
    enabled: enabled && !hasEntryWeather && !!userId && !!entryDate,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,
  });
}
