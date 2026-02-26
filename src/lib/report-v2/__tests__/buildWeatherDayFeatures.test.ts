import { describe, it, expect } from 'vitest';
import {
  buildWeatherDayFeatures,
  toLocalDateISO,
  type WeatherLogForFeature,
  type EntryForWeatherJoin,
} from '../adapters/buildWeatherDayFeatures';
import type { DayCountRecord } from '../types';

const TZ = 'Europe/Berlin';

function makeDay(dateISO: string, opts: Partial<DayCountRecord> = {}): DayCountRecord {
  return {
    dateISO,
    documented: true,
    headache: false,
    treatment: false,
    painMax: null,
    ...opts,
  };
}

function makeEntry(overrides: Partial<EntryForWeatherJoin> = {}): EntryForWeatherJoin {
  return {
    selected_date: '2026-02-26',
    selected_time: '08:00',
    weather_id: null,
    entry_kind: 'pain',
    pain_level: '5',
    ...overrides,
  };
}

function makeWeatherLog(id: number, overrides: Partial<WeatherLogForFeature> = {}): WeatherLogForFeature {
  return {
    id,
    snapshot_date: null,
    requested_at: null,
    pressure_mb: 1013,
    pressure_change_24h: -2,
    temperature_c: 10,
    humidity: 65,
    ...overrides,
  };
}

// ─── Test 1: Timezone edge ──────────────────────────────────────────────
describe('toLocalDateISO', () => {
  it('does NOT assign post-midnight Berlin time to previous day', () => {
    // 2026-02-26T00:30:00+01:00 Berlin = Feb 26, NOT Feb 25
    // In UTC this is 2026-02-25T23:30:00Z
    const result = toLocalDateISO('2026-02-25T23:30:00Z', TZ);
    expect(result).toBe('2026-02-26'); // Berlin is UTC+1 in winter
  });

  it('assigns pre-midnight UTC correctly to Berlin next day', () => {
    // 2026-03-28T23:30:00Z = 2026-03-29T01:30:00+02:00 (CEST)
    const result = toLocalDateISO('2026-03-28T23:30:00Z', TZ);
    expect(result).toBe('2026-03-29');
  });
});

// ─── Test 2: Target time uses earliest pain entry ────────────────────────
describe('buildWeatherDayFeatures – target time priority', () => {
  it('selects weather nearest to earliest pain entry time', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 6 });

    // Pain entry at 08:00, lifestyle entry at 06:00
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '06:00', entry_kind: 'lifestyle', pain_level: null, weather_id: null }),
      makeEntry({ selected_time: '08:00', entry_kind: 'pain', pain_level: '6', weather_id: null }),
    ];

    // Two weather logs: one at 06:30 (closer to lifestyle), one at 07:45 (closer to pain)
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T05:30:00Z', pressure_mb: 1010 }), // 06:30 Berlin
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T06:45:00Z', pressure_mb: 1015 }), // 07:45 Berlin
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day],
      entries,
      weatherLogs,
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Target is 08:00 Berlin. Weather log 2 (07:45) is closer than log 1 (06:30).
    expect(result[0].pressureMb).toBe(1015);
    expect(result[0].weatherCoverage).toBe('snapshot');
  });
});

// ─── Test 3: Entry-linked weather nearest to target ─────────────────────
describe('buildWeatherDayFeatures – entry weather nearest', () => {
  it('picks entry with weather_id nearest to target time', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 7 });

    // Two pain entries with weather_id, at different times
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '10:00', weather_id: 100 }),
      makeEntry({ selected_time: '07:00', weather_id: 200 }), // earliest pain = target
    ];

    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(100, { pressure_mb: 1010 }),
      makeWeatherLog(200, { pressure_mb: 1020 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day],
      entries,
      weatherLogs,
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Target = 07:00 (earliest pain). Entry at 07:00 has weather_id=200, entry at 10:00 has 100.
    // Nearest to 07:00 is the 07:00 entry → weather_id=200
    expect(result[0].pressureMb).toBe(1020);
    expect(result[0].weatherCoverage).toBe('entry');
  });
});

// ─── Test 4: Snapshot nearest to target (not "pick first") ──────────────
describe('buildWeatherDayFeatures – snapshot nearest', () => {
  it('picks snapshot nearest to target, not first in array', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: false, painMax: 0 });

    // No entries with weather_id
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '14:00', weather_id: null, entry_kind: 'lifestyle', pain_level: null }),
    ];

    // Three snapshot candidates at different times
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T07:00:00Z', pressure_mb: 1001 }), // 08:00 Berlin
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T12:30:00Z', pressure_mb: 1002 }), // 13:30 Berlin
      makeWeatherLog(3, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T18:00:00Z', pressure_mb: 1003 }), // 19:00 Berlin
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day],
      entries,
      weatherLogs,
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Target = 14:00 Berlin (lifestyle entry, no pain entry).
    // Nearest: log 2 at 13:30 Berlin (30min away) vs log 1 at 08:00 (6h) vs log 3 at 19:00 (5h)
    expect(result[0].pressureMb).toBe(1002);
    expect(result[0].weatherCoverage).toBe('snapshot');
  });
});

// ─── Test 5: Undocumented days excluded ─────────────────────────────────
describe('buildWeatherDayFeatures – undocumented exclusion', () => {
  it('excludes undocumented days', () => {
    const days: DayCountRecord[] = [
      makeDay('2026-02-25', { documented: true }),
      makeDay('2026-02-26', { documented: false }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: days,
      entries: [],
      weatherLogs: [],
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-02-25');
  });
});

// ─── Test 6: No weather → coverage=none ─────────────────────────────────
describe('buildWeatherDayFeatures – no weather', () => {
  it('sets coverage=none when no weather data exists', () => {
    const result = buildWeatherDayFeatures({
      countsByDay: [makeDay('2026-02-26', { documented: true })],
      entries: [],
      weatherLogs: [],
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].weatherCoverage).toBe('none');
    expect(result[0].pressureMb).toBeNull();
  });
});

// ─── Test 7: Stable tie-breaking by id ──────────────────────────────────
describe('buildWeatherDayFeatures – deterministic tie-break', () => {
  it('on equal distance, picks lower weather_log id', () => {
    const day = makeDay('2026-02-26', { documented: true });

    // No entries → target = 12:00 local
    // Two logs equidistant from 12:00
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(99, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T10:00:00Z', pressure_mb: 999 }), // 11:00 Berlin
      makeWeatherLog(5,  { snapshot_date: '2026-02-26', requested_at: '2026-02-26T12:00:00Z', pressure_mb: 555 }), // 13:00 Berlin
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day],
      entries: [],
      weatherLogs,
      timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Both are 1h from 12:00 Berlin. Lower id=5 wins.
    expect(result[0].pressureMb).toBe(555);
  });
});
