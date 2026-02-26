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
 * - Never use timestamp_created for target time calculation.
 * - Never use split('T')[0] for day assignment (timezone bug).
 * - Day key is exclusively DayCountRecord.dateISO (SSOT).
 * - Entry day key: selected_date > toLocalDateISO(occurred_at) > toLocalDateISO(timestamp_created) [last resort].
 * - Target time per day: configurable via preferPainAsTarget (default true).
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
  /** YYYY-MM-DD local date — primary day assignment */
  selected_date?: string | null;
  /** HH:mm or HH:mm:ss local time of the event */
  selected_time?: string | null;
  /** ISO timestamp of when event occurred — fallback for day assignment */
  occurred_at?: string | null;
  /** ISO timestamp of creation — last-resort fallback for day assignment only */
  timestamp_created?: string | null;
  weather_id?: number | null;
  entry_kind?: string | null;
  pain_level?: string | number | null;
}

export interface WeatherCoverageCounts {
  daysWithEntryWeather: number;
  daysWithSnapshotWeather: number;
  daysWithNoWeather: number;
}

export interface BuildWeatherDayFeaturesInput {
  countsByDay: DayCountRecord[];
  entries: EntryForWeatherJoin[];
  weatherLogs: WeatherLogForFeature[];
  /** Timezone for local time calculations. Default: 'Europe/Berlin' */
  timezone?: string;
  /**
   * If true (default), target time = earliest pain entry, then any entry, then 12:00.
   * If false, target time = earliest any entry, then 12:00.
   */
  preferPainAsTarget?: boolean;
}

export interface BuildWeatherDayFeaturesResult {
  features: WeatherDayFeature[];
  coverageCounts: WeatherCoverageCounts;
}

// ─── Timezone Helpers ───────────────────────────────────────────────────

/**
 * Convert an ISO timestamp to a local YYYY-MM-DD string in the given timezone.
 * Uses Intl.DateTimeFormat — no split('T')[0].
 */
export function toLocalDateISO(isoTimestamp: string, tz: string): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return '';
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
 * Parse selected_time string to { hour, minute } or null.
 * Accepts: "8:00", "08:00", "08:00:00", "23:59".
 * "24:00" → clamped to 23:59. Invalid → null.
 */
export function parseSelectedTime(timeStr: string | null | undefined): { hour: number; minute: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  let hh = parseInt(match[1], 10);
  let mm = parseInt(match[2], 10);

  // Clamp 24:00 → 23:59
  if (hh === 24 && mm === 0) {
    hh = 23;
    mm = 59;
  }

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return { hour: hh, minute: mm };
}

function toEpochMs(isoTimestamp: string): number {
  return new Date(isoTimestamp).getTime();
}

function localNoonEpochMs(dateISO: string, tz: string): number {
  return localTimeToEpochMs(dateISO, 12, 0, tz);
}

/**
 * Get epoch ms for a given dateISO + hour + minute in a timezone.
 * Uses Intl.DateTimeFormat to compute the UTC offset for the target timezone,
 * avoiding locale-dependent toLocaleString parsing.
 */
export function localTimeToEpochMs(dateISO: string, hour: number, minute: number, tz: string): number {
  // Build local time string and convert to UTC using date-fns-tz (DST-safe)
  const isoStr = `${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

  // Use Intl.DateTimeFormat.formatToParts to compute the UTC offset
  // for the given local time in the target timezone — no string parsing.
  const naive = new Date(isoStr + 'Z'); // treat as UTC temporarily
  if (isNaN(naive.getTime())) return NaN;

  // Get the offset of the target timezone at this approximate moment
  const tzOffsetMs = getTimezoneOffsetMs(naive, tz);

  // The actual UTC epoch = naive (as UTC) - offset
  // naive represents "dateISO hour:minute in UTC", we want it in tz
  // so: localTime = UTC + offset => UTC = localTime - offset
  return naive.getTime() - tzOffsetMs;
}

/**
 * Compute the UTC offset (in ms) for a given timezone at a given moment.
 * Uses Intl.DateTimeFormat.formatToParts — no toLocaleString string parsing.
 * Returns offsetMs such that: localTime = UTC + offsetMs.
 */
function getTimezoneOffsetMs(refDate: Date, tz: string): number {
  // Get parts in UTC
  const utcFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const tzFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const utcParts = partsToDate(utcFmt.formatToParts(refDate));
  const tzParts = partsToDate(tzFmt.formatToParts(refDate));

  return tzParts - utcParts;
}

function partsToDate(parts: Intl.DateTimeFormatPart[]): number {
  const get = (type: string) => {
    let val = parts.find(p => p.type === type)?.value ?? '0';
    // Handle "24" hour (midnight) as 0
    if (type === 'hour' && val === '24') val = '0';
    return parseInt(val, 10);
  };
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

// ─── Entry Day Key Resolution ───────────────────────────────────────────

/**
 * Resolve the day key for an entry using the fallback chain:
 * 1. selected_date (primary SSOT)
 * 2. toLocalDateISO(occurred_at, tz)
 * 3. toLocalDateISO(timestamp_created, tz) — last resort, only for day assignment
 *
 * Returns null if no key can be derived.
 */
function resolveEntryDayKey(entry: EntryForWeatherJoin, tz: string): string | null {
  if (entry.selected_date) return entry.selected_date;
  if (entry.occurred_at) {
    const key = toLocalDateISO(entry.occurred_at, tz);
    if (key) return key;
  }
  if (entry.timestamp_created) {
    const key = toLocalDateISO(entry.timestamp_created, tz);
    if (key) return key;
  }
  return null;
}

// ─── Main Builder ───────────────────────────────────────────────────────

export function buildWeatherDayFeatures(
  input: BuildWeatherDayFeaturesInput
): WeatherDayFeature[];
export function buildWeatherDayFeatures(
  input: BuildWeatherDayFeaturesInput,
  returnCounts: true
): BuildWeatherDayFeaturesResult;
export function buildWeatherDayFeatures(
  input: BuildWeatherDayFeaturesInput,
  returnCounts?: boolean
): WeatherDayFeature[] | BuildWeatherDayFeaturesResult {
  const {
    countsByDay,
    entries,
    weatherLogs,
    timezone = 'Europe/Berlin',
    preferPainAsTarget = true,
  } = input;
  const tz = timezone;

  // ── Valid day keys from countsByDay ──
  const validDays = new Set(countsByDay.map(d => d.dateISO));

  // ── Lookup: weather_log by id ──
  const weatherById = new Map<number, WeatherLogForFeature>();
  for (const wl of weatherLogs) {
    weatherById.set(wl.id, wl);
  }

  // ── Group entries by day key (with fallback chain) ──
  const entriesByDate = new Map<string, EntryForWeatherJoin[]>();
  for (const entry of entries) {
    const dayKey = resolveEntryDayKey(entry, tz);
    if (!dayKey) continue;
    // Only include entries whose day key is within the report range
    if (!validDays.has(dayKey)) continue;
    const arr = entriesByDate.get(dayKey) ?? [];
    arr.push(entry);
    entriesByDate.set(dayKey, arr);
  }

  // ── Group weather_log candidates by date (for snapshot fallback) ──
  const weatherCandidatesByDate = new Map<string, WeatherLogForFeature[]>();
  for (const wl of weatherLogs) {
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
  let daysWithEntryWeather = 0;
  let daysWithSnapshotWeather = 0;
  let daysWithNoWeather = 0;

  for (const day of countsByDay) {
    if (!day.documented) continue;

    const painMax = day.painMax ?? 0;
    const hadHeadache = day.headache;
    const hadAcuteMed = day.acuteMedUsed === true;

    // ── Determine target time for this day ──
    const dayEntries = entriesByDate.get(day.dateISO) ?? [];
    const targetMs = computeTargetTimeMs(dayEntries, day.dateISO, tz, preferPainAsTarget);

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

    // Track coverage counts
    if (coverage === 'entry') daysWithEntryWeather++;
    else if (coverage === 'snapshot') daysWithSnapshotWeather++;
    else daysWithNoWeather++;

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

  if (returnCounts) {
    return {
      features,
      coverageCounts: {
        daysWithEntryWeather,
        daysWithSnapshotWeather,
        daysWithNoWeather,
      },
    };
  }

  return features;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Build epoch ms from entry's selected_date + selected_time in a timezone.
 * Uses parseSelectedTime for robust parsing.
 * Returns null if date is missing or time is invalid.
 */
function entryEpochMs(entry: EntryForWeatherJoin, tz: string): number | null {
  const date = entry.selected_date;
  if (!date) return null;
  const parsed = parseSelectedTime(entry.selected_time);
  if (!parsed) {
    // No valid time → use noon as default
    return localTimeToEpochMs(date, 12, 0, tz);
  }
  return localTimeToEpochMs(date, parsed.hour, parsed.minute, tz);
}

/**
 * Compute target time (epoch ms) for a documented day.
 *
 * If preferPainAsTarget:
 *   Priority: earliest pain entry time > earliest any entry time > 12:00 local
 * Else:
 *   Priority: earliest any entry time > 12:00 local
 */
function computeTargetTimeMs(
  dayEntries: EntryForWeatherJoin[],
  dateISO: string,
  tz: string,
  preferPainAsTarget: boolean
): number {
  const withTime = dayEntries.filter(e => e.selected_date && parseSelectedTime(e.selected_time) !== null);

  if (preferPainAsTarget) {
    // Try pain entries first
    const painEntries = withTime.filter(
      e => e.entry_kind === 'pain' || (!e.entry_kind && (e.pain_level != null && e.pain_level !== ''))
    );
    if (painEntries.length > 0) {
      return findEarliestMs(painEntries, tz, dateISO);
    }
  }

  // Any entry with time
  if (withTime.length > 0) {
    return findEarliestMs(withTime, tz, dateISO);
  }

  // Fallback: 12:00 local
  return localNoonEpochMs(dateISO, tz);
}

/** Find earliest entry epoch ms from a non-empty array. Falls back to noon. */
function findEarliestMs(entries: EntryForWeatherJoin[], tz: string, dateISO: string): number {
  let earliestMs = Infinity;
  for (const entry of entries) {
    const ms = entryEpochMs(entry, tz);
    if (ms != null && ms < earliestMs) {
      earliestMs = ms;
    }
  }
  return earliestMs === Infinity ? localNoonEpochMs(dateISO, tz) : earliestMs;
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
 * Filters out logs without requested_at first. If all lack it, picks lowest id.
 * Stable: on tie, pick lower id.
 */
function pickNearestWeatherLog(
  logs: WeatherLogForFeature[],
  targetMs: number
): WeatherLogForFeature {
  // Filter to candidates with requested_at
  const withTime = logs.filter(wl => wl.requested_at != null);

  if (withTime.length > 0) {
    let best = withTime[0];
    let bestDist = weatherLogDistance(best, targetMs);

    for (let i = 1; i < withTime.length; i++) {
      const dist = weatherLogDistance(withTime[i], targetMs);
      if (dist < bestDist || (dist === bestDist && withTime[i].id < best.id)) {
        best = withTime[i];
        bestDist = dist;
      }
    }
    return best;
  }

  // All lack requested_at → deterministic fallback: lowest id
  let lowest = logs[0];
  for (let i = 1; i < logs.length; i++) {
    if (logs[i].id < lowest.id) {
      lowest = logs[i];
    }
  }
  return lowest;
}

function weatherLogDistance(wl: WeatherLogForFeature, targetMs: number): number {
  if (!wl.requested_at) return Infinity;
  return Math.abs(toEpochMs(wl.requested_at) - targetMs);
}
