/**
 * Tests for buildMecfsDonutData – ME/CFS documentation counting.
 *
 * Cases A–E per specification:
 *   A: 3 days, all entries ME/CFS='none' → documented=3, none=3, undocumented=0
 *   B: 3 days, 2 days 'none', 1 day ME/CFS not set → documented=2, undocumented=1
 *   C: 1 day with two entries: 'none' and 'mild' → documented=1, mild=1
 *   D: 1 day entry without ME/CFS + 1 day entry 'severe' → documented=1, undocumented=1, severe=1
 *   E: Days without entries in range → undocumented
 */
import { describe, it, expect } from 'vitest';
import { buildMecfsDonutData } from '../donutData';
import type { PainEntry } from '@/types/painApp';

/** Helper to build a minimal PainEntry */
function entry(date: string, score?: number, level?: string): PainEntry {
  return {
    id: Math.random(),
    user_id: 'test',
    selected_date: date,
    selected_time: null,
    pain_level: 'none',
    timestamp_created: null,
    medications: null,
    medication_ids: null,
    notes: null,
    pain_locations: null,
    aura_type: 'none',
    entry_kind: 'pain',
    entry_note_is_private: false,
    symptoms_source: 'unknown',
    symptoms_state: 'untouched',
    latitude: null,
    longitude: null,
    voice_note_id: null,
    weather_id: null,
    me_cfs_severity_score: score as any,
    me_cfs_severity_level: level as any,
  } as unknown as PainEntry;
}

describe('buildMecfsDonutData – documentation counting', () => {
  it('Case A: all entries ME/CFS=none → all documented', () => {
    const entries = [
      entry('2025-01-01', 0, 'none'),
      entry('2025-01-02', 0, 'none'),
      entry('2025-01-03', 0, 'none'),
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-03');

    expect(data.documentedDays).toBe(3);
    expect(data.distribution.none).toBe(3);
    expect(data.distribution.undocumented).toBe(0);
    expect(data.daysWithBurden).toBe(0);
  });

  it('Case B: 2 days none, 1 day ME/CFS not set → documented=2, undocumented=1', () => {
    const entries = [
      entry('2025-01-01', 0, 'none'),
      entry('2025-01-02', 0, 'none'),
      entry('2025-01-03', undefined, undefined), // ME/CFS not set
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-03');

    expect(data.documentedDays).toBe(2);
    expect(data.distribution.none).toBe(2);
    expect(data.distribution.undocumented).toBe(1);
    expect(data.calendarDays).toBe(3);
  });

  it('Case C: 1 day, two entries (none + mild) → documented=1, mild=1 (tagesmaximum)', () => {
    const entries = [
      entry('2025-01-01', 0, 'none'),
      entry('2025-01-01', 3, 'mild'),
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-01');

    expect(data.documentedDays).toBe(1);
    expect(data.distribution.mild).toBe(1);
    expect(data.distribution.none).toBe(0); // overridden by mild
    expect(data.daysWithBurden).toBe(1);
  });

  it('Case D: 1 day unset + 1 day severe → documented=1, undocumented=1', () => {
    const entries = [
      entry('2025-01-01', undefined, undefined), // no ME/CFS
      entry('2025-01-02', 9, 'severe'),
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-02');

    expect(data.documentedDays).toBe(1);
    expect(data.distribution.undocumented).toBe(1);
    expect(data.distribution.severe).toBe(1);
    expect(data.daysWithBurden).toBe(1);
  });

  it('Case E: days without any entries → undocumented', () => {
    const entries = [
      entry('2025-01-01', 0, 'none'),
      // 2025-01-02 and 2025-01-03 have no entries at all
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-03');

    expect(data.calendarDays).toBe(3);
    expect(data.documentedDays).toBe(1);
    expect(data.distribution.none).toBe(1);
    expect(data.distribution.undocumented).toBe(2);
  });

  it('Mixed day: entry without ME/CFS + entry with none → documented as none', () => {
    const entries = [
      entry('2025-01-01', undefined, undefined), // no ME/CFS
      entry('2025-01-01', 0, 'none'),             // explicit none
    ];
    const data = buildMecfsDonutData(entries, '2025-01-01', '2025-01-01');

    expect(data.documentedDays).toBe(1);
    expect(data.distribution.none).toBe(1);
    expect(data.distribution.undocumented).toBe(0);
  });
});
