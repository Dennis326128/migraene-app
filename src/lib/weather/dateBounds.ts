/**
 * DST-safe conversion of local date range → UTC ISO bounds.
 * Uses Intl.DateTimeFormat for offset calculation.
 */

import { localTimeToEpochMs } from '@/lib/report-v2/adapters/buildWeatherDayFeatures';

/**
 * Convert local date boundaries (YYYY-MM-DD) to UTC ISO strings.
 * startIso = start of `fromDateISO` in the given timezone (00:00:00.000)
 * endIso = end of `toDateISO` in the given timezone (23:59:59.999)
 */
export function localDateBoundsToUtcIso(
  fromDateISO: string,
  toDateISO: string,
  tz: string = 'Europe/Berlin'
): { startIso: string; endIso: string } {
  const startMs = localTimeToEpochMs(fromDateISO, 0, 0, tz);
  const endMs = localTimeToEpochMs(toDateISO, 23, 59, tz) + 59_999; // +59.999s

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}
