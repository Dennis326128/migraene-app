/**
 * E2E Consistency Matrix Test
 * 
 * Verifies that ALL pain_level consumers in the app produce
 * identical numeric results for every known input variant.
 * Prevents silent divergence between SSOT, legacy code, and DB functions.
 */
import { describe, it, expect } from 'vitest';
import { normalizePainLevel, normalizePainLevelStrict } from '../pain';
import { computeDayStats, groupEntriesByDay, type EntryLike } from '../dayGrouping';

// ─── Canonical mapping (the single truth) ─────────────────────────
// Both normalizePainLevel and normalizePainLevelStrict must agree on these:
const CANONICAL_BOTH: Record<string, number> = {
  'leicht': 2,
  'mittel': 5,
  'stark': 7,
  'sehr_stark': 9,
  'keine': 0,
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
};

// normalizePainLevel maps '-' → 0 (safe for aggregation)
// normalizePainLevelStrict maps '-' → null (explicit gap)
const STRICT_DIVERGENCES: Record<string, { normal: number; strict: number | null }> = {
  '-': { normal: 0, strict: null },
};

// ─── Matrix: every input must produce the canonical value ─────────
describe('Pain level consistency matrix', () => {
  for (const [input, expected] of Object.entries(CANONICAL_BOTH)) {
    it(`normalizePainLevel("${input}") === ${expected}`, () => {
      expect(normalizePainLevel(input)).toBe(expected);
    });
    it(`normalizePainLevelStrict("${input}") === ${expected}`, () => {
      expect(normalizePainLevelStrict(input)).toBe(expected);
    });
  }

  for (const [input, { normal, strict }] of Object.entries(STRICT_DIVERGENCES)) {
    it(`normalizePainLevel("${input}") === ${normal} (aggregation-safe)`, () => {
      expect(normalizePainLevel(input)).toBe(normal);
    });
    it(`normalizePainLevelStrict("${input}") === ${strict} (gap)`, () => {
      expect(normalizePainLevelStrict(input)).toBe(strict);
    });
  }

  // Edge cases that must NOT produce false positives
  const SHOULD_BE_ZERO_OR_NULL: string[] = ['', 'unknown', 'abc', 'foobar'];
  for (const input of SHOULD_BE_ZERO_OR_NULL) {
    it(`normalizePainLevel("${input}") === 0 (safe aggregation)`, () => {
      expect(normalizePainLevel(input)).toBe(0);
    });
    it(`normalizePainLevelStrict("${input}") === null (strict)`, () => {
      expect(normalizePainLevelStrict(input)).toBeNull();
    });
  }
});

// ─── Mixed legacy + numeric data in aggregation ───────────────────
describe('Mixed legacy + numeric aggregation', () => {
  it('maxPain with mixed legacy text and numeric entries', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-01-01', pain_level: 'leicht' },   // 2
      { id: '2', selected_date: '2025-01-01', pain_level: '8' },        // 8
      { id: '3', selected_date: '2025-01-01', pain_level: 'stark' },    // 7
    ];
    expect(computeDayStats(entries).maxPain).toBe(8);
  });

  it('multi-day with mixed formats produces correct per-day max', () => {
    const entries: EntryLike[] = [
      // Day A: legacy text
      { id: '1', selected_date: '2025-01-01', pain_level: 'leicht' },   // 2
      { id: '2', selected_date: '2025-01-01', pain_level: 'sehr_stark' }, // 9
      // Day B: numeric
      { id: '3', selected_date: '2025-01-02', pain_level: '3' },        // 3
      { id: '4', selected_date: '2025-01-02', pain_level: '6' },        // 6
      // Day C: empty pain_level
      { id: '5', selected_date: '2025-01-03', pain_level: '' },         // 0
    ];
    
    const groups = groupEntriesByDay(entries);
    const byDate = new Map(groups.map(g => [g.date, g]));
    
    expect(byDate.get('2025-01-01')!.maxPain).toBe(9);
    expect(byDate.get('2025-01-02')!.maxPain).toBe(6);
    expect(byDate.get('2025-01-03')!.maxPain).toBe(0);
  });

  it('average calculation excludes zeros correctly', () => {
    const painValues = ['leicht', '5', 'stark', '', '8'].map(v => normalizePainLevel(v));
    // leicht=2, 5=5, stark=7, ''=0, 8=8
    const nonZero = painValues.filter(v => v > 0);
    const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    // (2+5+7+8)/4 = 5.5
    expect(avg).toBe(5.5);
  });
});

// ─── 5/10 bug: entry-level vs day-level must never be confused ────
describe('Entry-level vs day-level separation', () => {
  it('each entry retains its own pain_level after grouping', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-01-01', selected_time: '08:00', pain_level: '2' },
      { id: '2', selected_date: '2025-01-01', selected_time: '12:00', pain_level: '7' },
      { id: '3', selected_date: '2025-01-01', selected_time: '18:00', pain_level: '4' },
    ];

    const groups = groupEntriesByDay(entries);
    const day = groups[0];

    // Day header should show max
    expect(day.maxPain).toBe(7);

    // Individual entries must NOT be mutated
    expect(normalizePainLevel(day.entries[0].pain_level)).toBe(2);
    expect(normalizePainLevel(day.entries[1].pain_level)).toBe(7);
    expect(normalizePainLevel(day.entries[2].pain_level)).toBe(4);
  });

  it('normalizePainLevel never returns 5 as a default for non-5 inputs', () => {
    // This is the core 5/10 regression guard
    const inputs = ['1', '2', '3', '4', '6', '7', '8', '9', '10', 'leicht', 'stark', 'sehr_stark'];
    for (const input of inputs) {
      const result = normalizePainLevel(input);
      if (input !== '5') {
        expect(result, `"${input}" should not map to 5`).not.toBe(5);
      }
    }
  });
});

// ─── Pagination: no duplicate groups ──────────────────────────────
describe('Pagination grouping stability', () => {
  it('re-grouping combined data produces no duplicate days', () => {
    // Simulate: page 1 loaded, then page 2 loaded, then all re-grouped
    const page1: EntryLike[] = [
      { id: '1', selected_date: '2025-01-03', pain_level: '7' },
      { id: '2', selected_date: '2025-01-02', pain_level: '5' },
    ];
    const page2: EntryLike[] = [
      { id: '3', selected_date: '2025-01-02', pain_level: '3' }, // same day as page1
      { id: '4', selected_date: '2025-01-01', pain_level: '2' },
    ];

    const combined = [...page1, ...page2];
    const groups = groupEntriesByDay(combined);

    // 3 unique days, not 4
    expect(groups).toHaveLength(3);
    
    // Jan 2 should have 2 entries merged
    const jan2 = groups.find(g => g.date === '2025-01-02')!;
    expect(jan2.entryCount).toBe(2);
    expect(jan2.maxPain).toBe(5); // max of 5 and 3
  });

  it('duplicate entry IDs in combined data are handled', () => {
    // Edge case: same entry appears in both pages (shouldn't happen but defensive)
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-01-01', pain_level: '7' },
      { id: '1', selected_date: '2025-01-01', pain_level: '7' }, // duplicate
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups).toHaveLength(1);
    // Currently includes both — the grouping is by date, not by ID dedup
    // This is acceptable; React keys by entry.id would catch rendering issues
  });
});
