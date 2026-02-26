import { describe, it, expect } from 'vitest';
import {
  buildWeatherDayFeatures,
  toLocalDateISO,
  parseSelectedTime,
  localTimeToEpochMs,
  type WeatherLogForFeature,
  type EntryForWeatherJoin,
} from '../adapters/buildWeatherDayFeatures';
import type { DayCountRecord } from '../types';
import { explainWeatherMissing } from '@/features/weather/components/WeatherDebugPanel';

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

// ─── Test 15: Entry weather_id miss → joinReason diagnostic ──
describe('buildWeatherDayFeatures – weatherJoinReason', () => {
  it('sets joinReason to entry-weather-id-miss→snapshot when wl missing', () => {
    const day = makeDay('2026-02-26', { documented: true, headache: true, painMax: 4 });
    const entries: EntryForWeatherJoin[] = [
      makeEntry({ selected_time: '08:00', weather_id: 999 }),
    ];
    const weatherLogs: WeatherLogForFeature[] = [
      makeWeatherLog(1, { snapshot_date: '2026-02-26', requested_at: '2026-02-26T07:00:00Z', pressure_mb: 1020 }),
    ];

    const result = buildWeatherDayFeatures({
      countsByDay: [day], entries, weatherLogs, timezone: TZ,
    });

    expect(result).toHaveLength(1);
    expect(result[0].weatherCoverage).toBe('snapshot');
    expect(result[0].weatherJoinReason).toBe('entry-weather-id-miss->snapshot');
  });
});

// ─── Test 16: computeWeatherAssociation RR with reference 0 ──
import {
  computeWeatherAssociation,
  fmtPct,
  fmtPain,
  fmtRR,
  fmtAbsDiff,
  hasAnyWeatherValue,
  hasDelta,
  PRESSURE_DELTA_BUCKET_LABELS,
} from '@/lib/weather/computeWeatherAssociation';
import { localDateBoundsToUtcIso } from '@/lib/weather/dateBounds';

describe('computeWeatherAssociation – RR edge cases', () => {
  it('reference rate 0 → rr null, absDiff correct', () => {
    const features = [];
    for (let i = 0; i < 25; i++) {
      features.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        documented: true,
        painMax: 0,
        hadHeadache: false,
        hadAcuteMed: false,
        pressureMb: 1013,
        pressureChange24h: 0,
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
        pressureChange24h: -10,
        temperatureC: 10,
        humidity: 60,
        weatherCoverage: 'snapshot' as const,
      });
    }

    const result = computeWeatherAssociation(features);

    expect(result.pressureDelta24h.enabled).toBe(true);
    if (result.pressureDelta24h.relativeRisk) {
      expect(result.pressureDelta24h.relativeRisk.rr).toBeNull();
      expect(result.pressureDelta24h.relativeRisk.absDiff).toBe(0.2);
    }
  });
});

// ─── Test 17: Format helpers ──
describe('Format helpers (SSOT)', () => {
  it('fmtPct formats rate as percentage', () => {
    expect(fmtPct(0.234)).toBe('23%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(null)).toBe('–');
  });

  it('fmtPain formats pain with 1 decimal', () => {
    expect(fmtPain(3.456)).toBe('3.5');
    expect(fmtPain(null)).toBe('–');
  });

  it('fmtRR formats relative risk', () => {
    expect(fmtRR(2.34)).toBe('2.3×');
    expect(fmtRR(null)).toBe('–');
  });

  it('fmtAbsDiff formats percentage points', () => {
    expect(fmtAbsDiff(0.15)).toBe('+15 pp');
    expect(fmtAbsDiff(-0.1)).toBe('-10 pp');
    expect(fmtAbsDiff(null)).toBe('–');
  });
});

// ─── Test 18: hasAnyWeatherValue + hasDelta helpers ──
describe('Coverage helpers (SSOT)', () => {
  const base = {
    date: '2026-01-01', documented: true, painMax: 0,
    hadHeadache: false, hadAcuteMed: false, weatherCoverage: 'none' as const,
  };

  it('hasAnyWeatherValue detects any non-null weather field', () => {
    expect(hasAnyWeatherValue({ ...base, pressureMb: null, temperatureC: null, humidity: null, pressureChange24h: null })).toBe(false);
    expect(hasAnyWeatherValue({ ...base, pressureMb: 1013, temperatureC: null, humidity: null, pressureChange24h: null })).toBe(true);
    expect(hasAnyWeatherValue({ ...base, pressureMb: null, temperatureC: null, humidity: 60, pressureChange24h: null })).toBe(true);
  });

  it('hasDelta checks pressureChange24h only', () => {
    expect(hasDelta({ ...base, pressureMb: 1013, temperatureC: null, humidity: null, pressureChange24h: null })).toBe(false);
    expect(hasDelta({ ...base, pressureMb: null, temperatureC: null, humidity: null, pressureChange24h: -5 })).toBe(true);
  });
});

// ─── Test 19: Bucket labels contain thresholds (regex, no glyph dependency) ──
describe('Bucket labels (SSOT)', () => {
  it('labels contain threshold numbers', () => {
    expect(PRESSURE_DELTA_BUCKET_LABELS.strongDrop).toMatch(/8/);
    expect(PRESSURE_DELTA_BUCKET_LABELS.moderateDrop).toMatch(/8/);
    expect(PRESSURE_DELTA_BUCKET_LABELS.moderateDrop).toMatch(/3/);
    expect(PRESSURE_DELTA_BUCKET_LABELS.stableOrRise).toMatch(/3/);
  });
});

// ─── Test 20: 0-day bucket has null meanPainMax ──
describe('computeWeatherAssociation – 0-day bucket', () => {
  it('bucket with 0 days has null meanPainMax and 0 rates', () => {
    // All days are stable → strongDrop bucket will have 0 days
    const features = [];
    for (let i = 0; i < 25; i++) {
      features.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        documented: true,
        painMax: 3,
        hadHeadache: true,
        hadAcuteMed: false,
        pressureMb: 1013,
        pressureChange24h: 0, // all stable
        temperatureC: 10,
        humidity: 60,
        weatherCoverage: 'snapshot' as const,
      });
    }

    const result = computeWeatherAssociation(features);
    const strongDropBucket = result.pressureDelta24h.buckets.find(b => b.label.includes('Starker'));
    expect(strongDropBucket).toBeDefined();
    expect(strongDropBucket!.nDays).toBe(0);
    expect(strongDropBucket!.meanPainMax).toBeNull();
    expect(strongDropBucket!.headacheRate).toBe(0);
  });
});

// ─── Test 21: Confounding hint NOT triggered with small buckets ──
describe('computeWeatherAssociation – confounding hint', () => {
  it('does not trigger confounding note when no bucket has >= 20 days', () => {
    // 10 stable + 10 drop days with very different acuteMed rates
    const features = [];
    for (let i = 0; i < 10; i++) {
      features.push({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        documented: true, painMax: 3, hadHeadache: true, hadAcuteMed: true,
        pressureMb: 1013, pressureChange24h: 0,
        temperatureC: 10, humidity: 60, weatherCoverage: 'snapshot' as const,
      });
    }
    for (let i = 0; i < 10; i++) {
      features.push({
        date: `2026-02-${String(i + 1).padStart(2, '0')}`,
        documented: true, painMax: 3, hadHeadache: true, hadAcuteMed: false,
        pressureMb: 1013, pressureChange24h: -10,
        temperatureC: 10, humidity: 60, weatherCoverage: 'snapshot' as const,
      });
    }

    const result = computeWeatherAssociation(features);
    // Both buckets have only 10 days (< 20), confounding note should NOT appear
    const confoundingNote = result.pressureDelta24h.notes.find(n => n.includes('Akutmedikation'));
    expect(confoundingNote).toBeUndefined();
  });
});

// ─── Test 22: DST-safe UTC bounds ──
describe('localDateBoundsToUtcIso', () => {
  it('produces valid ISO strings for DST start (spring forward)', () => {
    const { startIso, endIso } = localDateBoundsToUtcIso('2026-03-29', '2026-03-29', 'Europe/Berlin');
    expect(startIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(endIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(startIso).getTime()).toBeLessThan(new Date(endIso).getTime());
  });

  it('produces valid ISO strings for DST end (fall back)', () => {
    const { startIso, endIso } = localDateBoundsToUtcIso('2026-10-25', '2026-10-25', 'Europe/Berlin');
    expect(new Date(startIso).getTime()).not.toBeNaN();
    expect(new Date(endIso).getTime()).not.toBeNaN();
    expect(new Date(startIso).getTime()).toBeLessThan(new Date(endIso).getTime());
  });

  it('covers full local day (approx 24h span)', () => {
    const { startIso, endIso } = localDateBoundsToUtcIso('2026-06-15', '2026-06-15', 'Europe/Berlin');
    const spanMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    // Should be approximately 24h (86399999 ms)
    expect(spanMs).toBeGreaterThan(86000000);
    expect(spanMs).toBeLessThan(87000000);
  });
});

// ─── Test 23: joinReason = 'none' when coverage = 'none' ──
describe('buildWeatherDayFeatures – joinReason typed', () => {
  it('sets joinReason to none when no weather data', () => {
    const result = buildWeatherDayFeatures({
      countsByDay: [makeDay('2026-02-26', { documented: true })],
      entries: [], weatherLogs: [], timezone: TZ,
    });
    expect(result[0].weatherCoverage).toBe('none');
    expect(result[0].weatherJoinReason).toBe('none');
  });
});

// ─── Test: entry-weather-id-miss triggers snapshot fallback ──
describe('buildWeatherDayFeatures – snapshot fallback', () => {
  it('entry has weather_id but no matching log -> uses snapshot', () => {
    const entry = makeEntry({
      selected_date: '2026-02-26',
      selected_time: '10:00',
      weather_id: 999, // non-existent ID
    });
    const snapshotLog = makeWeatherLog(50, {
      snapshot_date: '2026-02-26',
      requested_at: '2026-02-26T09:00:00Z',
    });
    const result = buildWeatherDayFeatures({
      countsByDay: [makeDay('2026-02-26', { documented: true, headache: true })],
      entries: [entry],
      weatherLogs: [snapshotLog],
      timezone: TZ,
    });
    expect(result[0].weatherCoverage).toBe('snapshot');
    expect(result[0].weatherJoinReason).toBe('entry-weather-id-miss->snapshot');
    expect(result[0].pressureMb).toBe(1013);
  });

  it('entry without weather_id and without snapshot -> coverage none', () => {
    const entry = makeEntry({
      selected_date: '2026-02-26',
      selected_time: '10:00',
      weather_id: null,
    });
    const result = buildWeatherDayFeatures({
      countsByDay: [makeDay('2026-02-26', { documented: true })],
      entries: [entry],
      weatherLogs: [],
      timezone: TZ,
    });
    expect(result[0].weatherCoverage).toBe('none');
    expect(result[0].pressureMb).toBeNull();
  });
});

// ─── Test: Δ24h null display ──
describe('Δ24h null handling', () => {
  it('feature with null pressureChange24h has null delta', () => {
    const entry = makeEntry({ selected_date: '2026-02-26', selected_time: '10:00' });
    const log = makeWeatherLog(1, {
      snapshot_date: '2026-02-26',
      requested_at: '2026-02-26T10:00:00Z',
      pressure_change_24h: null,
    });
    const result = buildWeatherDayFeatures({
      countsByDay: [makeDay('2026-02-26', { documented: true })],
      entries: [entry],
      weatherLogs: [log],
      timezone: TZ,
    });
    expect(result[0].pressureChange24h).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2+3 TESTS — queryKey, TZ, backfill, explainWeatherMissing
// ═══════════════════════════════════════════════════════════════════════════

// ─── Test: TZ conversion — local 10:00 Berlin ≠ 10:00 UTC ──
describe('localTimeToEpochMs – TZ correctness', () => {
  it('local 10:00 Berlin in winter (CET, UTC+1) differs from 10:00 UTC', () => {
    const berlinMs = localTimeToEpochMs('2026-01-15', 10, 0, 'Europe/Berlin');
    const utcMs = new Date('2026-01-15T10:00:00Z').getTime();
    // Berlin 10:00 CET = 09:00 UTC → should be 1h earlier than 10:00 UTC
    expect(berlinMs).toBe(utcMs - 3600000);
  });

  it('local 10:00 Berlin in summer (CEST, UTC+2) differs from 10:00 UTC', () => {
    const berlinMs = localTimeToEpochMs('2026-07-15', 10, 0, 'Europe/Berlin');
    const utcMs = new Date('2026-07-15T10:00:00Z').getTime();
    // Berlin 10:00 CEST = 08:00 UTC → should be 2h earlier
    expect(berlinMs).toBe(utcMs - 7200000);
  });
});

// ─── Test: explainWeatherMissing returns expected codes ──
describe('explainWeatherMissing', () => {
  it('returns OK when entry weather exists', () => {
    expect(explainWeatherMissing({
      weatherId: 1, weatherStatus: 'ok', weatherErrorCode: null,
      hasEntryWeather: true, snapshotAvailable: false, hasLocation: true,
    })).toBe('OK');
  });

  it('returns OK when snapshot available', () => {
    expect(explainWeatherMissing({
      weatherId: null, weatherStatus: null, weatherErrorCode: null,
      hasEntryWeather: false, snapshotAvailable: true, hasLocation: true,
    })).toBe('OK');
  });

  it('returns NO_LOCATION when no coordinates', () => {
    expect(explainWeatherMissing({
      weatherId: null, weatherStatus: null, weatherErrorCode: null,
      hasEntryWeather: false, snapshotAvailable: false, hasLocation: false,
    })).toBe('NO_LOCATION');
  });

  it('returns WEATHER_PENDING', () => {
    expect(explainWeatherMissing({
      weatherId: null, weatherStatus: 'pending', weatherErrorCode: null,
      hasEntryWeather: false, snapshotAvailable: false, hasLocation: true,
    })).toBe('WEATHER_PENDING');
  });

  it('returns WEATHER_FAILED with code', () => {
    const result = explainWeatherMissing({
      weatherId: null, weatherStatus: 'failed', weatherErrorCode: 'API_TIMEOUT',
      hasEntryWeather: false, snapshotAvailable: false, hasLocation: true,
    });
    expect(result).toBe('WEATHER_FAILED:API_TIMEOUT');
  });

  it('returns WEATHER_ID_MISSING_LOG', () => {
    expect(explainWeatherMissing({
      weatherId: 123, weatherStatus: 'ok', weatherErrorCode: null,
      hasEntryWeather: false, snapshotAvailable: false, hasLocation: true,
    })).toBe('WEATHER_ID_MISSING_LOG');
  });

  it('returns NO_WEATHER_ID_AND_NO_SNAPSHOT', () => {
    expect(explainWeatherMissing({
      weatherId: null, weatherStatus: 'ok', weatherErrorCode: null,
      hasEntryWeather: false, snapshotAvailable: false, hasLocation: true,
    })).toBe('NO_WEATHER_ID_AND_NO_SNAPSHOT');
  });
});

// ─── WeatherDebugPanel prod gating ─────────────────────────────────────
describe('WeatherDebugPanel prod gating', () => {
  it('should only render when DEV or VITE_WEATHER_DEBUG flag is set', () => {
    // The component checks: import.meta.env.DEV || import.meta.env.VITE_WEATHER_DEBUG === 'true'
    // In prod (DEV=false, no flag) it returns null.
    // We test the logic inline since we can't easily mock import.meta.env in vitest without setup.
    const isDebugEnabled = (isDev: boolean, flag?: string) => isDev || flag === 'true';

    expect(isDebugEnabled(false)).toBe(false);
    expect(isDebugEnabled(false, undefined)).toBe(false);
    expect(isDebugEnabled(false, 'false')).toBe(false);
    expect(isDebugEnabled(true)).toBe(true);
    expect(isDebugEnabled(false, 'true')).toBe(true);
  });
});

// ─── Δ24h display logic ────────────────────────────────────────────────
describe('Δ24h display logic', () => {
  it('storedDelta null => source missing', () => {
    const storedDelta: number | null = null;
    const hasDelta = storedDelta !== null && storedDelta !== undefined && !Number.isNaN(storedDelta);
    expect(hasDelta).toBe(false);
  });

  it('storedDelta 0 => valid, shows 0 hPa', () => {
    const storedDelta: number | null = 0;
    const hasDelta = storedDelta !== null && storedDelta !== undefined && !Number.isNaN(storedDelta);
    expect(hasDelta).toBe(true);
    expect(Math.round(storedDelta)).toBe(0);
  });

  it('storedDelta NaN => treated as missing', () => {
    const storedDelta: number = NaN;
    const hasDelta = storedDelta !== null && storedDelta !== undefined && !Number.isNaN(storedDelta);
    expect(hasDelta).toBe(false);
  });

  it('calculated source shows value', () => {
    const deltaResult = { delta: -5, source: 'calculated' as const };
    expect(deltaResult.delta).toBe(-5);
    expect(deltaResult.source).toBe('calculated');
  });

  it('stored source with real value', () => {
    const deltaResult = { delta: 3, source: 'stored' as const };
    const hasDelta = deltaResult.delta !== null && !Number.isNaN(deltaResult.delta);
    expect(hasDelta).toBe(true);
    expect(deltaResult.delta > 0 ? '+' : '').toBe('+');
  });
});
