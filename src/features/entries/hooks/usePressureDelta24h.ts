import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Δ 24h pressure fallback calculation.
 *
 * Why is pressure_change_24h often NULL?
 * - The weather API only returns this field for "current" requests, not for historical backfills.
 * - Historical weather_logs (backfilled via background job) store a snapshot at a single point
 *   in time without a pre-computed 24h delta.
 * - This hook computes the delta on-demand by finding a weather_log ~24h earlier.
 *
 * Tolerance window: ±90 minutes around (occurred_at - 24h).
 * Only runs when expanded entry has pressure_mb but no stored delta.
 */

interface PressureDeltaResult {
  delta: number | null;
  source: 'stored' | 'calculated' | 'missing';
  matchedWeatherAt?: string;
}

async function fetchPressureDelta24h(
  userId: string,
  occurredAt: string,
  currentPressureMb: number,
  currentWeatherLogId?: number
): Promise<PressureDeltaResult> {
  const targetTime = new Date(new Date(occurredAt).getTime() - 24 * 60 * 60 * 1000);
  const toleranceMs = 90 * 60 * 1000; // ±90 min
  const windowStart = new Date(targetTime.getTime() - toleranceMs).toISOString();
  const windowEnd = new Date(targetTime.getTime() + toleranceMs).toISOString();

  const { data, error } = await supabase
    .from('weather_logs')
    .select('id, pressure_mb, created_at, requested_at')
    .eq('user_id', userId)
    .not('pressure_mb', 'is', null)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('[usePressureDelta24h] Query error:', error.message);
    return { delta: null, source: 'missing' };
  }

  if (!data || data.length === 0) {
    return { delta: null, source: 'missing' };
  }

  // Find closest match to targetTime
  let bestMatch = data[0];
  let bestDiff = Math.abs(new Date(bestMatch.created_at!).getTime() - targetTime.getTime());

  for (const row of data) {
    // Skip self
    if (currentWeatherLogId && row.id === currentWeatherLogId) continue;
    const diff = Math.abs(new Date(row.created_at!).getTime() - targetTime.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = row;
    }
  }

  if (bestMatch.pressure_mb === null || bestMatch.pressure_mb === undefined) {
    return { delta: null, source: 'missing' };
  }

  const delta = Math.round(currentPressureMb - bestMatch.pressure_mb);
  return {
    delta,
    source: 'calculated',
    matchedWeatherAt: bestMatch.created_at ?? undefined,
  };
}

/**
 * React Query hook: on-demand Δ 24h calculation for a single entry.
 * Only enabled when entry is expanded, has pressure_mb, and stored delta is null.
 */
export function usePressureDelta24h(params: {
  entryId: number | string;
  userId: string | undefined;
  occurredAt: string | null | undefined;
  currentPressureMb: number | null | undefined;
  currentWeatherLogId?: number;
  storedDelta: number | null | undefined;
  enabled: boolean;
}): PressureDeltaResult {
  const { entryId, userId, occurredAt, currentPressureMb, currentWeatherLogId, storedDelta, enabled } = params;

  const hasDelta = storedDelta !== null && storedDelta !== undefined && !Number.isNaN(storedDelta);

  const { data } = useQuery({
    queryKey: ['pressure-delta-24h', entryId],
    queryFn: () => fetchPressureDelta24h(userId!, occurredAt!, currentPressureMb!, currentWeatherLogId),
    enabled: enabled && !hasDelta && !!userId && !!occurredAt && currentPressureMb !== null && currentPressureMb !== undefined,
    staleTime: 6 * 60 * 60 * 1000,  // 6h
    gcTime: 24 * 60 * 60 * 1000,    // 24h
    placeholderData: (prev) => prev,
  });

  if (hasDelta) {
    return { delta: storedDelta!, source: 'stored' };
  }

  return data ?? { delta: null, source: 'missing' };
}
