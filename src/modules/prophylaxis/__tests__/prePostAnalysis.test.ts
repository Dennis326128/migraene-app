/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Pre/Post Window Analysis — Unit Tests (6+ tests)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { compareDoseEvent, computeProphylaxisAnalysis } from '../prePostAnalysis';
import type { DoseEvent, ProphylaxisDayFeature } from '../types';
import { addBerlinDays } from '../dateKeyHelpers';

// ─── Helper: generate day features ──────────────────────────────────────

function makeDayFeatures(
  startDate: string,
  days: Array<Partial<ProphylaxisDayFeature> & { offset: number }>,
): Map<string, ProphylaxisDayFeature> {
  const map = new Map<string, ProphylaxisDayFeature>();
  for (const day of days) {
    const dateKey = addBerlinDays(startDate, day.offset);
    map.set(dateKey, {
      dateKeyBerlin: dateKey,
      documented: day.documented ?? true,
      hadHeadache: day.hadHeadache ?? false,
      painMax: day.painMax ?? null,
      acuteMedTaken: day.acuteMedTaken ?? false,
      acuteMedCount: day.acuteMedCount ?? 0,
    });
  }
  return map;
}

function makeDoseEvent(dateKeyBerlin: string): DoseEvent {
  return {
    drug: 'ajovy',
    dateKeyBerlin,
    confidence: 1.0,
    primarySource: 'diary_medication_entry',
    evidences: [],
  };
}

describe('Pre/Post Window Analysis', () => {
  // ─── 1) Pre worse than post → negative delta (improvement) ────────────

  it('1) Pre worse than post is correctly detected', () => {
    const doseDate = '2026-02-15';
    const features = makeDayFeatures('2026-02-08', [
      // Pre window: D-7..D-1 (Feb 8-14) — bad days
      { offset: 0, hadHeadache: true, painMax: 8 },
      { offset: 1, hadHeadache: true, painMax: 7 },
      { offset: 2, hadHeadache: true, painMax: 9 },
      { offset: 3, hadHeadache: true, painMax: 6 },
      { offset: 4, hadHeadache: true, painMax: 8 },
      { offset: 5, hadHeadache: false, painMax: 0 },
      { offset: 6, hadHeadache: true, painMax: 7 },
      // Post window: D+1..D+7 (Feb 16-22) — good days
      { offset: 8, hadHeadache: false, painMax: 0 },
      { offset: 9, hadHeadache: true, painMax: 3 },
      { offset: 10, hadHeadache: false, painMax: 0 },
      { offset: 11, hadHeadache: false, painMax: 0 },
      { offset: 12, hadHeadache: true, painMax: 4 },
      { offset: 13, hadHeadache: false, painMax: 0 },
      { offset: 14, hadHeadache: false, painMax: 0 },
    ]);

    const result = compareDoseEvent(makeDoseEvent(doseDate), features);

    expect(result.pre.headacheDays).toBeGreaterThan(result.post.headacheDays);
    expect(result.delta.headacheRate).toBeLessThan(0); // improvement
    expect(result.pre.intensityMean).toBeGreaterThan(result.post.intensityMean!);
  });

  // ─── 2) Low coverage → stats still computed but coverage reflects it ──

  it('2) Low coverage is reflected in stats', () => {
    const doseDate = '2026-02-15';
    const features = makeDayFeatures('2026-02-08', [
      // Only 2 pre days documented
      { offset: 0, hadHeadache: true, painMax: 7 },
      { offset: 3, hadHeadache: true, painMax: 8 },
      // Only 1 post day documented
      { offset: 8, hadHeadache: false, painMax: 0 },
    ]);

    const result = compareDoseEvent(makeDoseEvent(doseDate), features);

    expect(result.pre.coverage).toBeLessThan(0.5);
    expect(result.post.coverage).toBeLessThan(0.3);
    expect(result.pre.documentedDays).toBe(2);
    expect(result.post.documentedDays).toBe(1);
  });

  // ─── 3) "No symptoms" day counts as documented ───────────────────────

  it('3) Day with documented=true but hadHeadache=false counts as documented', () => {
    const doseDate = '2026-02-15';
    const features = makeDayFeatures('2026-02-08', [
      // All 7 pre days documented, most pain-free
      { offset: 0, documented: true, hadHeadache: false, painMax: 0 },
      { offset: 1, documented: true, hadHeadache: false, painMax: 0 },
      { offset: 2, documented: true, hadHeadache: true, painMax: 5 },
      { offset: 3, documented: true, hadHeadache: false, painMax: 0 },
      { offset: 4, documented: true, hadHeadache: false, painMax: 0 },
      { offset: 5, documented: true, hadHeadache: false, painMax: 0 },
      { offset: 6, documented: true, hadHeadache: false, painMax: 0 },
    ]);

    const result = compareDoseEvent(makeDoseEvent(doseDate), features);

    expect(result.pre.documentedDays).toBe(7);
    expect(result.pre.coverage).toBe(1.0);
    expect(result.pre.headacheDays).toBe(1);
  });

  // ─── 4) Empty features → all zeros ────────────────────────────────────

  it('4) No features → window stats are zero', () => {
    const features = new Map<string, ProphylaxisDayFeature>();
    const result = compareDoseEvent(makeDoseEvent('2026-02-15'), features);

    expect(result.pre.documentedDays).toBe(0);
    expect(result.post.documentedDays).toBe(0);
    expect(result.pre.headacheRate).toBe(0);
    expect(result.delta.headacheRate).toBe(0);
  });

  // ─── 5) Aggregation over 2 injections ─────────────────────────────────

  it('5) Aggregation over 2 dose events computes mean deltas', () => {
    const features = new Map<string, ProphylaxisDayFeature>();

    // Injection 1: Feb 15. Pre = 5/7 headache, Post = 2/7
    for (let i = -7; i <= -1; i++) {
      const dk = addBerlinDays('2026-02-15', i);
      features.set(dk, {
        dateKeyBerlin: dk, documented: true,
        hadHeadache: i >= -5, painMax: i >= -5 ? 7 : 0,
        acuteMedTaken: false, acuteMedCount: 0,
      });
    }
    for (let i = 1; i <= 7; i++) {
      const dk = addBerlinDays('2026-02-15', i);
      features.set(dk, {
        dateKeyBerlin: dk, documented: true,
        hadHeadache: i <= 2, painMax: i <= 2 ? 4 : 0,
        acuteMedTaken: false, acuteMedCount: 0,
      });
    }

    // Injection 2: Mar 15. Pre = 4/7, Post = 1/7
    for (let i = -7; i <= -1; i++) {
      const dk = addBerlinDays('2026-03-15', i);
      features.set(dk, {
        dateKeyBerlin: dk, documented: true,
        hadHeadache: i >= -4, painMax: i >= -4 ? 6 : 0,
        acuteMedTaken: false, acuteMedCount: 0,
      });
    }
    for (let i = 1; i <= 7; i++) {
      const dk = addBerlinDays('2026-03-15', i);
      features.set(dk, {
        dateKeyBerlin: dk, documented: true,
        hadHeadache: i <= 1, painMax: i <= 1 ? 3 : 0,
        acuteMedTaken: false, acuteMedCount: 0,
      });
    }

    const events: DoseEvent[] = [
      makeDoseEvent('2026-02-15'),
      makeDoseEvent('2026-03-15'),
    ];

    const analysis = computeProphylaxisAnalysis(events, features);

    expect(analysis.comparisons).toHaveLength(2);
    expect(analysis.aggregate).not.toBeNull();
    expect(analysis.aggregate!.avgDeltaHeadacheRate).toBeLessThan(0); // improvement
    expect(analysis.evidenceSummary.countDoseEvents).toBe(2);
  });

  // ─── 6) Severe days (painMax >= 7) counted correctly ──────────────────

  it('6) Severe days (painMax >= 7) are counted', () => {
    const doseDate = '2026-02-15';
    const features = makeDayFeatures('2026-02-08', [
      { offset: 0, hadHeadache: true, painMax: 8 },
      { offset: 1, hadHeadache: true, painMax: 7 },
      { offset: 2, hadHeadache: true, painMax: 5 },
      { offset: 3, hadHeadache: true, painMax: 9 },
      { offset: 4, hadHeadache: false, painMax: 0 },
      { offset: 5, hadHeadache: true, painMax: 6 },
      { offset: 6, hadHeadache: true, painMax: 3 },
    ]);

    const result = compareDoseEvent(makeDoseEvent(doseDate), features);
    expect(result.pre.severeDays).toBe(3); // 8, 7, 9
  });

  // ─── 7) Acute med tracking ────────────────────────────────────────────

  it('7) Acute medication days and counts are tracked', () => {
    const doseDate = '2026-02-15';
    const features = makeDayFeatures('2026-02-08', [
      { offset: 0, hadHeadache: true, painMax: 7, acuteMedTaken: true, acuteMedCount: 2 },
      { offset: 1, hadHeadache: true, painMax: 6, acuteMedTaken: true, acuteMedCount: 1 },
      { offset: 2, hadHeadache: false, painMax: 0 },
      { offset: 3, hadHeadache: true, painMax: 8, acuteMedTaken: true, acuteMedCount: 3 },
      { offset: 4, hadHeadache: false, painMax: 0 },
      { offset: 5, hadHeadache: false, painMax: 0 },
      { offset: 6, hadHeadache: false, painMax: 0 },
    ]);

    const result = compareDoseEvent(makeDoseEvent(doseDate), features);
    expect(result.pre.acuteMedDays).toBe(3);
    expect(result.pre.acuteMedCountSum).toBe(6);
  });

  // ─── 8) Empty dose events → null aggregate ───────────────────────────

  it('8) Empty dose events → null aggregate', () => {
    const analysis = computeProphylaxisAnalysis([], new Map());
    expect(analysis.aggregate).toBeNull();
    expect(analysis.doseEvents).toEqual([]);
    expect(analysis.comparisons).toEqual([]);
  });
});
