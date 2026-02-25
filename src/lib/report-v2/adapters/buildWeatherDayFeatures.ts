/**
 * ═══════════════════════════════════════════════════════════════════════════
 * buildWeatherDayFeatures — Maps DayRecords + WeatherLogs → WeatherDayFeature[]
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure function. No DB, no I/O. Isomorphic (Browser + Deno).
 * Builds the input array for computeWeatherAssociation().
 *
 * Only documented days are included. Undocumented days are excluded entirely.
 * Weather data is matched per day: entry-linked weather first, then snapshot fallback.
 */

import type { DayCountRecord } from '../types';

// Re-declare locally to avoid cross-runtime import issues (Deno vs Browser)
export interface WeatherDayFeature {
  date: string;
  documented: boolean;
  painMax: number;
  hadHeadache: boolean;
  hadAcuteMed: boolean;
  pressureMb: number | null;
  pressureChange24h: number | null;
  temperatureC: number | null;
  humidity: number | null;
  weatherCoverage: 'entry' | 'snapshot' | 'none';
}

/** Minimal weather log shape for matching */
export interface WeatherLogForFeature {
  id: number;
  snapshot_date?: string | null;
  requested_at?: string | null;
  pressure_mb?: number | null;
  pressure_change_24h?: number | null;
  temperature_c?: number | null;
  humidity?: number | null;
}

/** Pain entry shape with weather_id for joining */
export interface EntryForWeatherJoin {
  selected_date?: string | null;
  timestamp_created?: string | null;
  weather_id?: number | null;
  entry_kind?: string | null;
  pain_level?: string | number | null;
}

export interface BuildWeatherDayFeaturesInput {
  /** SSOT day-level records from computeMiaryReport */
  countsByDay: DayCountRecord[];
  /** All pain entries in range (for weather_id join) */
  entries: EntryForWeatherJoin[];
  /** All weather_logs in range for this user */
  weatherLogs: WeatherLogForFeature[];
}

/**
 * Build WeatherDayFeature[] from SSOT day records + weather data.
 *
 * For each documented day:
 * 1. Try to find weather via entry.weather_id (priority: pain entries first)
 * 2. Fallback: find weather_log with matching snapshot_date
 * 3. If nothing: weatherCoverage='none', all weather fields null
 */
export function buildWeatherDayFeatures(
  input: BuildWeatherDayFeaturesInput
): WeatherDayFeature[] {
  const { countsByDay, entries, weatherLogs } = input;

  // Build weather_log lookup by id
  const weatherById = new Map<number, WeatherLogForFeature>();
  for (const wl of weatherLogs) {
    weatherById.set(wl.id, wl);
  }

  // Build weather_log lookup by snapshot_date (for fallback)
  const weatherByDate = new Map<string, WeatherLogForFeature[]>();
  for (const wl of weatherLogs) {
    const d = wl.snapshot_date ?? wl.requested_at?.split('T')[0];
    if (d) {
      const arr = weatherByDate.get(d) ?? [];
      arr.push(wl);
      weatherByDate.set(d, arr);
    }
  }

  // Build entry lookup by date (for weather_id resolution)
  // Priority: pain entries first, then others
  const entryWeatherByDate = new Map<string, number | null>();
  for (const entry of entries) {
    const d = entry.selected_date ?? entry.timestamp_created?.split('T')[0];
    if (!d || !entry.weather_id) continue;

    const existing = entryWeatherByDate.get(d);
    if (existing == null) {
      entryWeatherByDate.set(d, entry.weather_id);
    }
    // If pain entry, prefer its weather_id over non-pain
    if (entry.entry_kind === 'pain' || !entry.entry_kind) {
      entryWeatherByDate.set(d, entry.weather_id);
    }
  }

  const features: WeatherDayFeature[] = [];

  for (const day of countsByDay) {
    if (!day.documented) continue;

    const painMax = day.painMax ?? 0;
    const hadHeadache = day.headache;
    const hadAcuteMed = day.acuteMedUsed === true;

    // Resolve weather
    let weatherLog: WeatherLogForFeature | null = null;
    let coverage: 'entry' | 'snapshot' | 'none' = 'none';

    // Priority A: weather from entry's weather_id
    const entryWeatherId = entryWeatherByDate.get(day.dateISO);
    if (entryWeatherId != null) {
      const wl = weatherById.get(entryWeatherId);
      if (wl) {
        weatherLog = wl;
        coverage = 'entry';
      }
    }

    // Priority B: snapshot weather_log for same date
    if (!weatherLog) {
      const candidates = weatherByDate.get(day.dateISO);
      if (candidates && candidates.length > 0) {
        // Pick first available (they're for the same date)
        weatherLog = candidates[0];
        coverage = 'snapshot';
      }
    }

    features.push({
      date: day.dateISO,
      documented: true,
      painMax,
      hadHeadache,
      hadAcuteMed,
      pressureMb: weatherLog?.pressure_mb ?? null,
      pressureChange24h: weatherLog?.pressure_change_24h ?? null,
      temperatureC: weatherLog?.temperature_c ?? null,
      humidity: weatherLog?.humidity ?? null,
      weatherCoverage: coverage,
    });
  }

  return features;
}
