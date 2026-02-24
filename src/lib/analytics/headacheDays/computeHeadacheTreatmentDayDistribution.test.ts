import { describe, it, expect } from 'vitest';
import { computeHeadacheTreatmentDayDistribution } from './computeHeadacheTreatmentDayDistribution';

describe('computeHeadacheTreatmentDayDistribution', () => {
  it('counts total days correctly for a 30-day range', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-30', []);
    expect(result.totalDays).toBe(30);
    expect(result.painFreeDays).toBe(30);
    expect(result.triptanDays).toBe(0);
  });

  it('counts total days correctly for a 90-day range', () => {
    const result = computeHeadacheTreatmentDayDistribution('2025-11-26', '2026-02-23', []);
    expect(result.totalDays).toBe(90);
  });

  it('classifies pain day without medication correctly', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-03', [
      { selected_date: '2026-01-02', pain_level: 'mittel', entry_kind: 'pain' },
    ]);
    expect(result.painFreeDays).toBe(2);
    expect(result.painDaysNoTriptan).toBe(1);
    expect(result.triptanDays).toBe(0);
  });

  it('classifies triptan day with highest priority', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-01', [
      { selected_date: '2026-01-01', pain_level: 'stark', entry_kind: 'pain', medications: ['Sumatriptan'] },
    ]);
    expect(result.triptanDays).toBe(1);
    expect(result.painDaysNoTriptan).toBe(0);
    expect(result.painFreeDays).toBe(0);
  });

  it('merges multiple entries per day — highest priority wins', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-01', [
      { selected_date: '2026-01-01', pain_level: 'leicht', entry_kind: 'pain' },
      { selected_date: '2026-01-01', pain_level: 'stark', entry_kind: 'pain', medications: ['Sumatriptan'] },
    ]);
    expect(result.triptanDays).toBe(1);
    expect(result.painDaysNoTriptan).toBe(0);
  });

  it('filters entries to range', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-03', [
      { selected_date: '2025-12-31', pain_level: 'stark', entry_kind: 'pain' },
      { selected_date: '2026-01-04', pain_level: 'stark', entry_kind: 'pain' },
    ]);
    expect(result.painFreeDays).toBe(3);
    expect(result.debug.entryCount).toBe(0);
  });

  it('sums to totalDays', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-10', [
      { selected_date: '2026-01-02', pain_level: 'leicht', entry_kind: 'pain' },
      { selected_date: '2026-01-05', pain_level: 'stark', entry_kind: 'pain', medications: ['Sumatriptan'] },
    ]);
    expect(result.painFreeDays + result.painDaysNoTriptan + result.triptanDays).toBe(result.totalDays);
    expect(result.totalDays).toBe(10);
  });
});
