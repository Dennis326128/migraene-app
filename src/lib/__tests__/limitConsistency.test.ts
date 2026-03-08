import { describe, it, expect } from 'vitest';
import { computeStatistics, type MedicationLimit } from '../statistics';
import type { MedicationSummary } from '@/features/medication-intakes/api/medicationSummary.api';
import type { MigraineEntry } from '@/types/painApp';

/**
 * Consistency test: ALL limit displays must use medication_intakes SSOT.
 *
 * Root cause of regression: Multiple counting pipelines existed:
 * 1. PatternCards used calculateRolling30DayCount (pain_entries, including today)
 * 2. MedicationOverviewCard used medication_intakes (excluding today)
 * 3. Edge function check-medication-limits counted from pain_entries
 *
 * Fix: All pipelines now use medication_intakes as SSOT.
 */

const makeSummary = (name: string, count30d: number, count7d = 3): MedicationSummary => ({
  medication_name: name,
  last_intake_at: null,
  count_7d: count7d,
  count_30d: count30d,
});

const makeLimit = (name: string, limitCount: number, periodType = 'month'): MedicationLimit => ({
  id: 'l1',
  medication_name: name,
  limit_count: limitCount,
  period_type: periodType,
  is_active: true,
});

const makeEntry = (name: string, date: string): MigraineEntry => ({
  id: '1',
  timestamp_created: `${date}T10:00:00Z`,
  selected_date: date,
  pain_level: 'mittel',
  medications: [name],
});

describe('Limit consistency — SSOT from medication_intakes', () => {
  it('PatternCards limit uses medicationSummaries count, not entry count', () => {
    // Simulate: 20 pain_entries but only 11 medication_intakes (the real data)
    const entries: MigraineEntry[] = Array.from({ length: 20 }, (_, i) =>
      makeEntry('Sumatriptan', `2026-03-${String(i + 1).padStart(2, '0')}`)
    );
    const summaries = [makeSummary('Sumatriptan', 11)];
    const limits = [makeLimit('Sumatriptan', 10)];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const sumaInfo = stats.medicationAndEffect.topMedications.find(m => m.name === 'Sumatriptan');

    expect(sumaInfo?.limitInfo).toBeDefined();
    // Must use SSOT count (11), not entry count (20)
    expect(sumaInfo!.limitInfo!.rolling30Count).toBe(11);
    expect(sumaInfo!.limitInfo!.overBy).toBe(1);
    expect(sumaInfo!.limitInfo!.isOverLimit).toBe(true);
  });

  it('same limit value in both PatternCards and MedicationOverviewCard pipelines', () => {
    const summaries = [makeSummary('Ibuprofen', 7)];
    const limits = [makeLimit('Ibuprofen', 10)];
    const entries = [makeEntry('Ibuprofen', '2026-03-01')];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const info = stats.medicationAndEffect.topMedications.find(m => m.name === 'Ibuprofen');

    // PatternCards gets 7 from SSOT
    expect(info!.limitInfo!.rolling30Count).toBe(7);
    expect(info!.limitInfo!.isOverLimit).toBe(false);
    expect(info!.limitInfo!.remaining).toBe(3);

    // MedicationOverviewCard would also show 7/10 from the same summaries[0].count_30d
    expect(summaries[0].count_30d).toBe(7);
  });

  it('without summaries, limit count defaults to 0', () => {
    const entries = [makeEntry('Med', '2026-03-01')];
    const limits = [makeLimit('Med', 5)];

    const stats = computeStatistics(entries, [], [], limits, undefined, undefined);
    const info = stats.medicationAndEffect.topMedications.find(m => m.name === 'Med');

    expect(info!.limitInfo!.rolling30Count).toBe(0);
    expect(info!.limitInfo!.isOverLimit).toBe(false);
  });

  it('multiple medications each get correct SSOT count', () => {
    const entries = [
      makeEntry('Sumatriptan', '2026-03-01'),
      makeEntry('Ibuprofen', '2026-03-01'),
    ];
    entries[0].medications = ['Sumatriptan', 'Ibuprofen'];
    
    const summaries = [
      makeSummary('Sumatriptan', 15),
      makeSummary('Ibuprofen', 8),
    ];
    const limits = [
      makeLimit('Sumatriptan', 10),
      { ...makeLimit('Ibuprofen', 10), id: 'l2' },
    ];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const suma = stats.medicationAndEffect.topMedications.find(m => m.name === 'Sumatriptan');
    const ibu = stats.medicationAndEffect.topMedications.find(m => m.name === 'Ibuprofen');

    expect(suma!.limitInfo!.rolling30Count).toBe(15);
    expect(suma!.limitInfo!.overBy).toBe(5);
    expect(ibu!.limitInfo!.rolling30Count).toBe(8);
    expect(ibu!.limitInfo!.isOverLimit).toBe(false);
  });

  it('week period_type uses count_7d from SSOT', () => {
    const summaries = [makeSummary('Sumatriptan', 20, 5)]; // 30d=20, 7d=5
    const limits = [makeLimit('Sumatriptan', 4, 'week')];
    const entries = [makeEntry('Sumatriptan', '2026-03-01')];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const info = stats.medicationAndEffect.topMedications.find(m => m.name === 'Sumatriptan');

    expect(info!.limitInfo).toBeDefined();
    // Must use count_7d (5), not count_30d (20)
    expect(info!.limitInfo!.rolling30Count).toBe(5);
    expect(info!.limitInfo!.period).toBe('week');
    expect(info!.limitInfo!.isOverLimit).toBe(true);
    expect(info!.limitInfo!.overBy).toBe(1);
  });

  it('non-month period types still create limitInfo (previously skipped)', () => {
    const summaries = [makeSummary('Rizatriptan', 10, 2)];
    const limits = [makeLimit('Rizatriptan', 3, 'week')];
    const entries = [makeEntry('Rizatriptan', '2026-03-01')];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const info = stats.medicationAndEffect.topMedications.find(m => m.name === 'Rizatriptan');

    // Previously, period_type !== 'month' resulted in no limitInfo
    expect(info!.limitInfo).toBeDefined();
    expect(info!.limitInfo!.rolling30Count).toBe(2);
    expect(info!.limitInfo!.isOverLimit).toBe(false);
  });

  it('regression test: Sumatriptan 20 entries vs 11 intakes — must show 11', () => {
    // This is the exact scenario from the user report:
    // - pain_entries has 20 entries with Sumatriptan in range
    // - medication_intakes has only 11 intake records in 30 days
    // Before fix: PatternCards showed 20/10, MedicationOverviewCard showed 11/10
    // After fix: both must show 11/10
    const entries: MigraineEntry[] = Array.from({ length: 20 }, (_, i) =>
      makeEntry('Sumatriptan', `2026-03-${String(i + 1).padStart(2, '0')}`)
    );
    const summaries = [makeSummary('Sumatriptan', 11)];
    const limits = [makeLimit('Sumatriptan', 10)];

    const stats = computeStatistics(entries, [], [], limits, undefined, summaries);
    const med = stats.medicationAndEffect.topMedications.find(m => m.name === 'Sumatriptan');

    // PatternCards limit display
    const patternCardsLimitCount = med!.limitInfo!.rolling30Count;
    // MedicationOverviewCard uses summaries[0].count_30d directly
    const overviewCardLimitCount = summaries[0].count_30d;

    // BOTH must be identical
    expect(patternCardsLimitCount).toBe(overviewCardLimitCount);
    expect(patternCardsLimitCount).toBe(11);
    // Not 20 (which was the old bug from counting pain_entries)
    expect(patternCardsLimitCount).not.toBe(20);
  });
});
