import { describe, it, expect } from 'vitest';
import { computeHeadacheTreatmentDayDistribution } from './computeHeadacheTreatmentDayDistribution';

const isoDate = (dayOffset: number) => {
  const date = new Date('2026-01-01T00:00:00');
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
};

describe('computeHeadacheTreatmentDayDistribution', () => {
  it('handles 90 fully documented days with 3 pain-free, 37 headache without medication, 50 with medication', () => {
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => ({ selected_date: isoDate(i), pain_level: '0', entry_kind: 'pain' })),
      ...Array.from({ length: 37 }, (_, i) => ({ selected_date: isoDate(i + 3), pain_level: '5', entry_kind: 'pain' })),
      ...Array.from({ length: 50 }, (_, i) => ({ selected_date: isoDate(i + 40), pain_level: '5', entry_kind: 'pain', medications: ['Naproxen'] })),
    ];

    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', isoDate(89), entries);
    expect(result.totalDays).toBe(90);
    expect(result.documentedDays).toBe(90);
    expect(result.painFreeDays).toBe(3);
    expect(result.painDaysNoMedication).toBe(37);
    expect(result.painDaysWithMedication).toBe(50);
    expect(result.undocumentedDays).toBe(0);
    expect(result.painFreeDays + result.painDaysNoMedication + result.painDaysWithMedication + result.undocumentedDays).toBe(90);
  });

  it('separates undocumented days from pain-free days in a 90-day range', () => {
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => ({ selected_date: isoDate(i), pain_level: '0', entry_kind: 'pain' })),
      ...Array.from({ length: 37 }, (_, i) => ({ selected_date: isoDate(i + 3), pain_level: '5', entry_kind: 'pain' })),
      ...Array.from({ length: 40 }, (_, i) => ({ selected_date: isoDate(i + 40), pain_level: '5', entry_kind: 'pain', medications: ['Ibuprofen'] })),
    ];

    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', isoDate(89), entries);
    expect(result.totalDays).toBe(90);
    expect(result.documentedDays).toBe(80);
    expect(result.undocumentedDays).toBe(10);
    expect(result.painFreeDays + result.painDaysNoMedication + result.painDaysWithMedication + result.undocumentedDays).toBe(90);
    expect(result.painFreeDays + result.painDaysNoMedication + result.painDaysWithMedication).toBe(80);
  });

  it('counts total days correctly for a 30-day range', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-30', []);
    expect(result.totalDays).toBe(30);
    expect(result.painFreeDays).toBe(0);
    expect(result.undocumentedDays).toBe(30);
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
    expect(result.painFreeDays).toBe(0);
    expect(result.painDaysNoTriptan).toBe(1);
    expect(result.triptanDays).toBe(0);
    expect(result.undocumentedDays).toBe(2);
  });

  it('classifies medication day with highest priority', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-01', [
      { selected_date: '2026-01-01', pain_level: 'stark', entry_kind: 'pain', medications: ['Ibuprofen'] },
    ]);
    expect(result.triptanDays).toBe(1);
    expect(result.painDaysWithMedication).toBe(1);
    expect(result.painDaysNoTriptan).toBe(0);
    expect(result.painFreeDays).toBe(0);
  });

  it('merges multiple entries per day — highest priority wins', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-01', [
      { selected_date: '2026-01-01', pain_level: '0', entry_kind: 'pain' },
      { selected_date: '2026-01-01', pain_level: '5', entry_kind: 'pain' },
    ]);
    expect(result.triptanDays).toBe(0);
    expect(result.painDaysNoTriptan).toBe(1);
  });

  it('counts a day without entries as undocumented and outside documented basis', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-01', []);
    expect(result.totalDays).toBe(1);
    expect(result.documentedDays).toBe(0);
    expect(result.undocumentedDays).toBe(1);
  });

  it('filters entries to range', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-03', [
      { selected_date: '2025-12-31', pain_level: 'stark', entry_kind: 'pain' },
      { selected_date: '2026-01-04', pain_level: 'stark', entry_kind: 'pain' },
    ]);
    expect(result.undocumentedDays).toBe(3);
    expect(result.debug.entryCount).toBe(0);
  });

  it('sums to totalDays', () => {
    const result = computeHeadacheTreatmentDayDistribution('2026-01-01', '2026-01-10', [
      { selected_date: '2026-01-02', pain_level: 'leicht', entry_kind: 'pain' },
      { selected_date: '2026-01-05', pain_level: 'stark', entry_kind: 'pain', medications: ['Sumatriptan'] },
    ]);
    expect(result.painFreeDays + result.painDaysNoTriptan + result.triptanDays + result.undocumentedDays).toBe(result.totalDays);
    expect(result.totalDays).toBe(10);
  });
});
