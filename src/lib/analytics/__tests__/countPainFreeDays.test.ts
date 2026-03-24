/**
 * Regression tests for countPainFreeDays pain-free classification.
 * Tests the pure classification logic extracted from the async function,
 * since the DB call itself can't run in unit tests.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirror of the classification logic in countPainFreeDays:
 * returns true if the pain_level value counts as "pain day".
 */
function isPainDay(painLevel: string | null | undefined): boolean {
  const level = (painLevel || '').toLowerCase().trim();
  // These are pain-FREE → not a pain day
  if (level === 'keine' || level === '-' || level === '' || level === '0') {
    return false;
  }
  return true;
}

describe('countPainFreeDays – pain-free classification', () => {
  // ── Must count as pain-FREE ──
  it.each([
    ['0', 'numeric NRS zero'],
    ['keine', 'legacy text "keine"'],
    ['-', 'dash placeholder'],
    ['', 'empty string'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('"%s" (%s) → pain-free', (input, _label) => {
    expect(isPainDay(input as string | null | undefined)).toBe(false);
  });

  // ── Must count as pain DAY ──
  it.each([
    ['1', 'NRS 1'],
    ['5', 'NRS 5'],
    ['10', 'NRS 10'],
    ['leicht', 'legacy "leicht"'],
    ['mittel', 'legacy "mittel"'],
    ['stark', 'legacy "stark"'],
    ['sehr_stark', 'legacy "sehr_stark"'],
  ])('"%s" (%s) → pain day', (input, _label) => {
    expect(isPainDay(input)).toBe(true);
  });

  // ── Mixed-day scenario (regression for the 5/10 bug) ──
  it('correctly classifies a mixed set of entries', () => {
    const entries = [
      { date: '2026-03-01', pain_level: '0' },
      { date: '2026-03-01', pain_level: '5' },
      { date: '2026-03-02', pain_level: 'keine' },
      { date: '2026-03-03', pain_level: 'stark' },
      { date: '2026-03-04', pain_level: '-' },
      { date: '2026-03-05', pain_level: null },
    ];

    const daysWithPain = new Set<string>();
    for (const e of entries) {
      if (isPainDay(e.pain_level)) {
        daysWithPain.add(e.date);
      }
    }

    // Day 1 has mixed → at least one pain entry → pain day
    expect(daysWithPain.has('2026-03-01')).toBe(true);
    // Day 2 "keine" → pain-free
    expect(daysWithPain.has('2026-03-02')).toBe(false);
    // Day 3 "stark" → pain day
    expect(daysWithPain.has('2026-03-03')).toBe(true);
    // Day 4 "-" → pain-free
    expect(daysWithPain.has('2026-03-04')).toBe(false);
    // Day 5 null → pain-free
    expect(daysWithPain.has('2026-03-05')).toBe(false);

    expect(daysWithPain.size).toBe(2);
  });
});
