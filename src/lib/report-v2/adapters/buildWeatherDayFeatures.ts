/**
 * ═══════════════════════════════════════════════════════════════════════════
 * buildWeatherDayFeatures — Maps DayRecords + WeatherLogs → WeatherDayFeature[]
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure function. No DB, no I/O. Isomorphic (Browser + Deno).
 * Builds the input array for computeWeatherAssociation().
 *
 * Only documented days are included. Undocumented days are excluded entirely.
 *
 * CRITICAL RULES:
 * - Never use timestamp_created for day assignment or target time.
 * - Never use split('T')[0] for day assignment (timezone bug).
 * - Day key is exclusively DayCountRecord.dateISO (SSOT).
 * - Target time per day: earliest pain entry occurred_at > earliest any entry > 12:00 local.
 * - Weather selection: nearest to target time (deterministic, stable sort by id on tie).
 */

import type { DayCountRecord } from '../types';

// ─── Exported Types ─────────────────────────────────────────────────────

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

export interface WeatherLogForFeature {
  id: number;
  snapshot_date?: string | null;
  requested_at?: string | null;
  pressure_mb?: number | null;
  pressure_change_24h?: number | null;
  temperature_c?: number | null;
  humidity?: number | null;
}

export interface EntryForWeatherJoin {
  /** YYYY-MM-DD local date — SSOT day assignment */
  selected_date?: string | null;
  /** HH:mm or HH:mm:ss local time of the event */
  selected_time?: string | null;
  weather_id?: number | null;
  entry_kind?: string | null;
  pain_level?: string | number | null;
}

export interface BuildWeatherDayFeaturesInput {
  countsByDay: DayCountRecord[];
  entries: EntryForWeatherJoin[];
  weatherLogs: WeatherLogForFeature[];
  /** Timezone for local time calculations. Default: 'Europe/Berlin' */
  timezone?: string;
}

// ─── Timezone Helpers ───────────────────────────────────────────────────

/**
 * Convert an ISO timestamp to a local YYYY-MM-DD string in the given timezone.
 * Uses Intl.DateTimeFormat — no split('T')[0].
 */
export function toLocalDateISO(isoTimestamp: string, tz: string): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return '';
  // Format parts in target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value ?? '';
  const month = parts.find(p => p.type === 'month')?.value ?? '';
  const day = parts.find(p => p.type === 'day')?.value ?? '';
  return `${year}-${month}-${day}`;
}

/**
 * Get the epoch milliseconds of a timestamp interpreted in a given timezone.
 * Used for "distance" comparisons within the same day.
 */
function toEpochMs(isoTimestamp: string): number {
  return new Date(isoTimestamp).getTime();
}

/** Get epoch ms for 12:00 local on a given date in a timezone. */
function localNoonEpochMs(dateISO: string, tz: string): number {
  return localTimeToEpochMs(dateISO, 12, 0, tz);
}

/**
 * Get epoch ms for a given dateISO + hour + minute in a timezone.
 */
function localTimeToEpochMs(dateISO: string, hour: number, minute: number, tz: string): number {
  const naive = new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  const utcStr = naive.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = naive.toLocaleString('en-US', { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offsetMs = utcDate.getTime() - tzDate.getTime();
  return naive.getTime() + offsetMs;
}

// ─── Main Builder ───────────────────────────────────────────────────────

export function buildWeatherDayFeatures(
  input: BuildWeatherDayFeaturesInput
): WeatherDayFeature[] {
  const { countsByDay, entries, weatherLogs, timezone = 'Europe/Berlin' } = input;
  const tz = timezone;

  // ── Lookup: weather_log by id ──
  const weatherById = new Map<number, WeatherLogForFeature>();
  for (const wl of weatherLogs) {
    weatherById.set(wl.id, wl);
  }

  // ── Group entries by SSOT date (selected_date) ──
  // We use selected_date as the authoritative day key (matches DayCountRecord.dateISO).
  const entriesByDate = new Map<string, EntryForWeatherJoin[]>();
  for (const entry of entries) {
    const d = entry.selected_date;
    if (!d) continue;
    const arr = entriesByDate.get(d) ?? [];
    arr.push(entry);
    entriesByDate.set(d, arr);
  }

  // ── Group weather_log candidates by date (for snapshot fallback) ──
  const weatherCandidatesByDate = new Map<string, WeatherLogForFeature[]>();
  for (const wl of weatherLogs) {
    // Use snapshot_date if available, otherwise derive from requested_at via proper TZ conversion
    let dateKey: string | null = wl.snapshot_date ?? null;
    if (!dateKey && wl.requested_at) {
      dateKey = toLocalDateISO(wl.requested_at, tz);
    }
    if (!dateKey) continue;
    const arr = weatherCandidatesByDate.get(dateKey) ?? [];
    arr.push(wl);
    weatherCandidatesByDate.set(dateKey, arr);
  }

  // ── Build features ──
  const features: WeatherDayFeature[] = [];

  for (const day of countsByDay) {
    if (!day.documented) continue;

    const painMax = day.painMax ?? 0;
    const hadHeadache = day.headache;
    const hadAcuteMed = day.acuteMedUsed === true;

    // ── Determine target time for this day ──
    const dayEntries = entriesByDate.get(day.dateISO) ?? [];
    const targetMs = computeTargetTimeMs(dayEntries, day.dateISO, tz);

    // ── Resolve weather ──
    let weatherLog: WeatherLogForFeature | null = null;
    let coverage: 'entry' | 'snapshot' | 'none' = 'none';

    // Priority A: entry-linked weather (nearest to target)
    const entriesWithWeather = dayEntries.filter(e => e.weather_id != null);
    if (entriesWithWeather.length > 0) {
      const best = pickNearestEntry(entriesWithWeather, targetMs, tz);
      if (best?.weather_id != null) {
        const wl = weatherById.get(best.weather_id);
        if (wl) {
          weatherLog = wl;
          coverage = 'entry';
        }
      }
    }

    // Priority B: snapshot weather_log nearest to target
    if (!weatherLog) {
      const candidates = weatherCandidatesByDate.get(day.dateISO);
      if (candidates && candidates.length > 0) {
        weatherLog = pickNearestWeatherLog(candidates, targetMs);
        coverage = 'snapshot';
      }
    }

    // Priority C: none
    if (!weatherLog) {
      coverage = 'none';
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

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Build epoch ms from selected_date + selected_time in a timezone.
 * Returns null if date is missing.
 */
function entryEpochMs(entry: EntryForWeatherJoin, tz: string): number | null {
  if (!entry.selected_date) return null;
  const time = entry.selected_time ?? '12:00';
  const timeParts = time.split(':');
  const hh = parseInt(timeParts[0] ?? '12', 10);
  const mm = parseInt(timeParts[1] ?? '00', 10);
  return localTimeToEpochMs(entry.selected_date, hh, mm, tz);
}

/**
 * Compute target time (epoch ms) for a documented day.
 * Priority: earliest pain entry time > earliest any entry time > 12:00 local
 */
function computeTargetTimeMs(
  dayEntries: EntryForWeatherJoin[],
  dateISO: string,
  tz: string
): number {
  const withTime = dayEntries.filter(e => e.selected_date && e.selected_time);

  // Try pain entries first
  const painEntries = withTime.filter(
    e => e.entry_kind === 'pain' || (!e.entry_kind && (e.pain_level != null && e.pain_level !== ''))
  );

  if (painEntries.length > 0) {
    let earliest = painEntries[0];
    let earliestMs = entryEpochMs(earliest, tz)!;
    for (let i = 1; i < painEntries.length; i++) {
      const ms = entryEpochMs(painEntries[i], tz)!;
      if (ms < earliestMs) { earliest = painEntries[i]; earliestMs = ms; }
    }
    return earliestMs;
  }

  // Any entry with time
  if (withTime.length > 0) {
    let earliest = withTime[0];
    let earliestMs = entryEpochMs(earliest, tz)!;
    for (let i = 1; i < withTime.length; i++) {
      const ms = entryEpochMs(withTime[i], tz)!;
      if (ms < earliestMs) { earliest = withTime[i]; earliestMs = ms; }
    }
    return earliestMs;
  }

  // Fallback: 12:00 local
  return localNoonEpochMs(dateISO, tz);
}

/**
 * Pick the entry whose time is nearest to targetMs.
 * Stable: on tie, pick lower weather_id.
 */
function pickNearestEntry(
  entries: EntryForWeatherJoin[],
  targetMs: number,
  tz: string
): EntryForWeatherJoin | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  let best = entries[0];
  let bestDist = entryDistanceMs(best, targetMs, tz);

  for (let i = 1; i < entries.length; i++) {
    const dist = entryDistanceMs(entries[i], targetMs, tz);
    if (dist < bestDist || (dist === bestDist && (entries[i].weather_id ?? Infinity) < (best.weather_id ?? Infinity))) {
      best = entries[i];
      bestDist = dist;
    }
  }

  return best;
}

function entryDistanceMs(entry: EntryForWeatherJoin, targetMs: number, tz: string): number {
  const ms = entryEpochMs(entry, tz);
  if (ms == null) return Infinity;
  return Math.abs(ms - targetMs);
}

/**
 * Pick the weather_log whose requested_at is nearest to targetMs.
 * Stable: on tie, pick lower id.
 */
function pickNearestWeatherLog(
  logs: WeatherLogForFeature[],
  targetMs: number
): WeatherLogForFeature {
  let best = logs[0];
  let bestDist = weatherLogDistance(best, targetMs);

  for (let i = 1; i < logs.length; i++) {
    const dist = weatherLogDistance(logs[i], targetMs);
    if (dist < bestDist || (dist === bestDist && logs[i].id < best.id)) {
      best = logs[i];
      bestDist = dist;
    }
  }

  return best;
}

function weatherLogDistance(wl: WeatherLogForFeature, targetMs: number): number {
  if (!wl.requested_at) return Infinity;
  return Math.abs(toEpochMs(wl.requested_at) - targetMs);
}
