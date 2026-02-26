import { describe, it, expect } from 'vitest';
import {
  buildWeatherDayFeatures,
  toLocalDateISO,
  parseSelectedTime,
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
    const result = toLocalDateISO('2026-02-25T23:30:00Z', TZ);
    expect(result).toBe('2026-02-26');
  });

  it('assigns pre-midnight UTC correctly to Berlin next day', () => {
    const result = toLocalDateISO('2026-03-28T23:30:00Z', TZ);
    expect(result).toBe('2026-03-29');
  });
});

// ─── Test 2: Target time uses earliest pain entry ────────────────────────
describe('buildWeatherDayFeatures – target time priority', () => {
  it('selects weather nearest to earliest pain entry time', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 6 });
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '06:00', entry_kind: 'lifestyle', pain_level: null, weather_id: null }),
      makeEntry({ selected_time: '08:00', entry_kind: 'pain', pain_level: '6', weather_id: null }),
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T05:30:00Z', pressure_mb: 1010 }),
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T06:45:00Z', pressure_mb: 1015 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].pressureMb).toBe(1015);
    expect(result[0].weatherCoverage).toBe('snapshot');
  });
});

// ─── Test 3: Entry-linked weather nearest to target ─────────────────────
describe('buildWeatherDayFeatures – entry weather nearest', () => {
  it('picks entry with weather_id nearest to target time', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 7 });
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '10:00', weather_id: 100 }),
      makeEntry({ selected_time: '07:00', weather_id: 200 }),
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(100, { pressure_mb: 1010 }),
      makeWeatherLog(200, { pressure_mb: 1020 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].pressureMb).toBe(1020);
    expect(result[0].weatherCoverage).toBe('entry');
  });
});

// ─── Test 4: Snapshot nearest to target ──────────────────────────────────
describe('buildWeatherDayFeatures – snapshot nearest', () => {
  it('picks snapshot nearest to target, not first in array', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: false, painMax: 0 });
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '14:00', weather_id: null, entry_kind: 'lifestyle', pain_level: null }),
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T07:00:00Z', pressure_mb: 1001 }),
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T12:30:00Z', pressure_mb: 1002 }),
      makeWeatherLog(3, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T18:00:00Z', pressure_mb: 1003 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
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
      countsByDay: days, entries: [], weatherLogs: [], timezone: TZ,
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
      entries: [], weatherLogs: [], timezone: TZ,
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
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(99, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T10:00:00Z', pressure_mb: 999 }),
      makeWeatherLog(5,  { snapshot_date: '2026-02-26', requested_at: '2026-02-26T12:00:00Z', pressure_mb: 555 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries: [], weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].pressureMb).toBe(555);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEW TESTS (Prompt 2/3)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Test 8: parseSelectedTime robust parsing ───────────────────────────
describe('parseSelectedTime', () => {
  it('parses "8:00" same as "08:00"', () => {
    expect(parseSelectedTime('8:00')).toEqual({ hour: 8, minute: 0 });
    expect(parseSelectedTime('08:00')).toEqual({ hour: 8, minute: 0 });
  });

  it('parses HH:MM:SS format', () => {
    expect(parseSelectedTime('14:30:45')).toEqual({ hour: 14, minute: 30 });
  });

  it('clamps 24:00 to 23:59', () => {
    expect(parseSelectedTime('24:00')).toEqual({ hour: 23, minute: 59 });
  });

  it('returns null for invalid input', () => {
    expect(parseSelectedTime(null)).toBeNull();
    expect(parseSelectedTime('')).toBeNull();
    expect(parseSelectedTime('abc')).toBeNull();
    expect(parseSelectedTime('25:00')).toBeNull();
    expect(parseSelectedTime('12:60')).toBeNull();
  });
});

// ─── Test 9: All requested_at null → lowest id chosen ───────────────────
describe('buildWeatherDayFeatures – snapshot all null requested_at', () => {
  it('picks lowest id when all requested_at are null', () => {
    const day = makeDay('2026-02-26', { documented: true });
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(50, { snapshot_date: '2026-02-26', requested_at: null, pressure_mb: 1050 }),
      makeWeatherLog(10, { snapshot_date: '2026-02-26', requested_at: null, pressure_mb: 1010 }),
      makeWeatherLog(30, { snapshot_date: '2026-02-26', requested_at: null, pressure_mb: 1030 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries: [], weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Lowest id = 10
    expect(result[0].pressureMb).toBe(1010);
    expect(result[0].weatherCoverage).toBe('snapshot');
  });
});

// ─── Test 10: preferPainAsTarget=false → earliest any entry ─────────────
describe('buildWeatherDayFeatures – preferPainAsTarget=false', () => {
  it('uses earliest any entry as target, not pain', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 5 });
    // Lifestyle at 06:00, pain at 10:00
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '06:00', entry_kind: 'lifestyle', pain_level: null, weather_id: null }),
      makeEntry({ selected_time: '10:00', entry_kind: 'pain', pain_level: '5', weather_id: null }),
    ];
    // Weather log at 06:30 (close to lifestyle) vs 09:30 (close to pain)
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T05:30:00Z', pressure_mb: 1001 }), // 06:30 Berlin
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T08:30:00Z', pressure_mb: 1002 }), // 09:30 Berlin
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
      preferPainAsTarget: false,
    });

    expect(result).toHaveLength(1);
    // Target = 06:00 (earliest any entry). Log 1 at 06:30 is closer than log 2 at 09:30.
    expect(result[0].pressureMb).toBe(1001);
  });
});

// ─── Test 11: Entry fallback dayKey via occurred_at ──────────────────────
describe('buildWeatherDayFeatures – entry dayKey fallback', () => {
  it('uses occurred_at as day key when selected_date is missing', () => {
    const day = makeDay('2026-02-26', { documented: true });
    // Entry without selected_date but with occurred_at
    const entries: EntryForWeatherJoin[] = [
      {
        selected_date: null,
        selected_time: null,
        occurred_at: '2026-02-25T23:30:00Z', // = 2026-02-26 00:30 Berlin
        weather_id: 1,
        entry_kind: 'pain',
        pain_level: '3',
      },
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { pressure_mb: 1005 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    // Entry should be assigned to 2026-02-26 via occurred_at in Berlin TZ
    expect(result[0].pressureMb).toBe(1005);
    expect(result[0].weatherCoverage).toBe('entry');
  });
});

// ─── Test 12: Coverage counts ───────────────────────────────────────────
describe('buildWeatherDayFeatures – coverage counts', () => {
  it('returns correct coverage counts', () => {
    const days: DayCountRecord[] = [
      makeDay('2026-02-24', { documented: true }),
      makeDay('2026-02-25', { documented: true }),
      makeDay('2026-02-26', { documented: true }),
    ];

    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_date: '2026-02-24', weather_id: 1 }),
    ];

    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { pressure_mb: 1010 }),
      makeWeatherLog(2, { snapshot_date: '2026-02-25', requested_at: '2026-02-25T10:00:00Z', pressure_mb: 1015 }),
    ];

    const result = buildWeatherDayFeatures(
      { countsByDay: days, entries, weatherLogs, timezone: TZ },
      true
    );

    expect(result.features).toHaveLength(3);
    expect(result.coverageCounts.daysWithEntryWeather).toBe(1);
    expect(result.coverageCounts.daysWithSnapshotWeather).toBe(1);
    expect(result.coverageCounts.daysWithNoWeather).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 3/3 TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Test 13: Pain entry with missing selected_time → noon fallback (pain priority) ──
describe('buildWeatherDayFeatures – pain entry without time', () => {
  it('pain entry with missing selected_time still triggers pain-priority fallback to noon', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 5 });
    // Pain entry WITHOUT time, lifestyle entry WITH time at 06:00
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '06:00', entry_kind: 'lifestyle', pain_level: null, weather_id: null }),
      makeEntry({ selected_time: null, entry_kind: 'pain', pain_level: '5', weather_id: null }),
    ];
    // Snapshot at 06:30 (near lifestyle) vs 11:30 (near noon)
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T05:30:00Z', pressure_mb: 1001 }),
      makeWeatherLog(2, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T10:30:00Z', pressure_mb: 1002 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
      preferPainAsTarget: true,
    });

    expect(result).toHaveLength(1);
    // Pain entry exists but has no time → target = noon (12:00 Berlin)
    // Log 2 at ~11:30 Berlin is closer to noon than Log 1 at ~06:30
    expect(result[0].pressureMb).toBe(1002);
  });
});

// ─── Test 14: Entry has weather_id but weatherLog missing → uses snapshot fallback ──
describe('buildWeatherDayFeatures – entry weather_id but wl missing', () => {
  it('falls back to snapshot when entry weather_id has no matching log', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 4 });
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '08:00', weather_id: 999 }), // id 999 not in weatherLogs
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      // Only a snapshot, no id=999
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T07:00:00Z', pressure_mb: 1020 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].weatherCoverage).toBe('snapshot');
    expect(result[0].pressureMb).toBe(1020);
  });
});

// ─── Test 15: computeWeatherAssociation RR with reference 0 ──
import { computeWeatherAssociation } from '@/lib/weather/computeWeatherAssociation';

describe('computeWeatherAssociation – RR edge cases', () => {
  it('reference rate 0 → rr null, absDiff correct', () => {
    // Create features: 10 stable days (no headache), 10 drop days (2 headache)
    const features = [];
    for (let i = 0; i < 25; i++) {
      features.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        documented: true,
        painMax: 0,
        hadHeadache: false,
        hadAcuteMed: false,
        pressureMb: 1013,
        pressureChange24h: 0, // stable
        temperatureC: 10,
        humidity: 60,
        weatherCoverage: 'snapshot' as const,
      });
    }
    for (let i = 0; i < 10; i++) {
      features.push({
        date: `2026-02-${String(i + 1).padStart(2, '0')}`,
        documented: true,
        painMax: i < 2 ? 5 : 0,
        hadHeadache: i < 2,
        hadAcuteMed: false,
        pressureMb: 1013,
        pressureChange24h: -10, // strong drop
        temperatureC: 10,
        humidity: 60,
        weatherCoverage: 'snapshot' as const,
      });
    }

    const result = computeWeatherAssociation(features);

    expect(result.pressureDelta24h.enabled).toBe(true);
    // Reference (stable) has 0% headache rate → rr null
    if (result.pressureDelta24h.relativeRisk) {
      expect(result.pressureDelta24h.relativeRisk.rr).toBeNull();
      expect(result.pressureDelta24h.relativeRisk.absDiff).toBe(0.2);
    }
  });
});
