/**
 * weatherCoverage.ts — read-only helper for V2.3 planning.
 *
 * Purpose: count weather coverage of an analysis window without
 * touching the database. Used by analysis/QA to surface data gaps.
 * No fetches, no writes, deterministic.
 */

export interface WeatherDayRecord {
  /** ISO date (YYYY-MM-DD) the snapshot belongs to. */
  snapshot_date: string | null;
  /** Whether the row has the minimum required fields for analysis. */
  pressure_mb?: number | null;
  temperature_c?: number | null;
  pressure_change_24h?: number | null;
}

export interface WeatherCoverageInput {
  /** Window start (ISO date, inclusive). */
  fromISO: string;
  /** Window end (ISO date, inclusive). */
  toISO: string;
  /** Weather rows available for the user in the window. */
  weather: WeatherDayRecord[];
  /** Days with documented pain entries (ISO dates). */
  painDays?: string[];
}

export interface WeatherCoverageReport {
  totalDays: number;
  daysWithWeather: number;
  daysWithUsableWeather: number;
  coveragePct: number;
  missingDays: string[];
  painDaysWithoutWeather: string[];
  painFreeDaysWithWeather: number;
  /** Coverage classification used by V2.2/V2.3 analysis prompts. */
  status: 'ok' | 'limited' | 'insufficient';
}

function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function isUsable(row: WeatherDayRecord): boolean {
  return (
    typeof row.pressure_mb === 'number' &&
    typeof row.temperature_c === 'number'
  );
}

export function computeWeatherCoverage(
  input: WeatherCoverageInput,
): WeatherCoverageReport {
  const days = eachDay(input.fromISO, input.toISO);
  const totalDays = days.length;

  const byDay = new Map<string, WeatherDayRecord>();
  for (const w of input.weather) {
    if (!w.snapshot_date) continue;
    // Normalise to YYYY-MM-DD and ignore anything outside the requested window.
    const key = String(w.snapshot_date).slice(0, 10);
    if (key < input.fromISO || key > input.toISO) continue;
    const prev = byDay.get(key);
    if (!prev || (!isUsable(prev) && isUsable(w))) byDay.set(key, w);
  }

  // Hard cap on totalDays so we never report "31 of 30".
  const rawDaysWithWeather = days.filter((d) => byDay.has(d)).length;
  const rawDaysWithUsableWeather = days.filter((d) => {
    const r = byDay.get(d);
    return !!r && isUsable(r);
  }).length;
  const daysWithWeather = Math.min(rawDaysWithWeather, totalDays);
  const daysWithUsableWeather = Math.min(rawDaysWithUsableWeather, totalDays);

  const missingDays = days.filter((d) => !byDay.has(d));
  const painDaySet = new Set(input.painDays ?? []);
  const painDaysWithoutWeather = [...painDaySet].filter((d) => !byDay.has(d));
  const painFreeDaysWithWeather = days.filter(
    (d) => byDay.has(d) && !painDaySet.has(d),
  ).length;

  const coveragePct = totalDays > 0 ? daysWithUsableWeather / totalDays : 0;

  let status: WeatherCoverageReport['status'] = 'ok';
  if (coveragePct < 0.5) status = 'insufficient';
  else if (coveragePct < 0.85) status = 'limited';

  return {
    totalDays,
    daysWithWeather,
    daysWithUsableWeather,
    coveragePct: Math.round(coveragePct * 1000) / 1000,
    missingDays,
    painDaysWithoutWeather,
    painFreeDaysWithWeather,
    status,
  };
}

