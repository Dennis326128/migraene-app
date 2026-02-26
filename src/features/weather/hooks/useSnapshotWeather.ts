import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localTimeToEpochMs } from '@/lib/report-v2/adapters/buildWeatherDayFeatures';

/**
 * Fetches the nearest snapshot weather_log for a given date+time
 * when the entry has no weather_id or the linked log is missing.
 *
 * Strategy:
 * 1. Find weather_logs with snapshot_date == entryDate for this user
 * 2. Pick the one with requested_at closest to the entry time (DST-safe)
 * 3. Fallback: created_at if requested_at is null
 */

const TZ = 'Europe/Berlin';

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

/**
 * DST-safe epoch ms for an entry date + time in Europe/Berlin.
 * Falls back to local noon if no time provided.
 */
function entryTargetEpochMs(dateISO: string, timeStr: string | undefined): number {
  if (!timeStr) {
    return localTimeToEpochMs(dateISO, 12, 0, TZ);
  }
  const parts = timeStr.split(':');
  const hour = Math.min(parseInt(parts[0] || '12', 10), 23);
  const minute = parseInt(parts[1] || '0', 10);
  return localTimeToEpochMs(dateISO, hour, minute, TZ);
}

async function fetchSnapshotWeather(
  userId: string,
  entryDate: string,
  entryTimeMs: number
): Promise<SnapshotWeatherData | null> {
  const { data, error } = await supabase
    .from('weather_logs')
    .select('id, temperature_c, pressure_mb, humidity, condition_text, pressure_change_24h, location, moon_phase, requested_at, created_at')
    .eq('user_id', userId)
    .eq('snapshot_date', entryDate)
    .order('requested_at', { ascending: true })
    .limit(20);

  if (error || !data || data.length === 0) return null;

  // Find nearest to entryTimeMs (prefer requested_at, fallback created_at)
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

  // DST-safe epoch ms computation via SSOT helper
  const entryTimeMs = entryDate
    ? entryTargetEpochMs(entryDate, entryTime)
    : 0;

  return useQuery({
    queryKey: ['snapshot-weather', entryId],
    queryFn: () => fetchSnapshotWeather(userId!, entryDate!, entryTimeMs),
    enabled: enabled && !hasEntryWeather && !!userId && !!entryDate,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
