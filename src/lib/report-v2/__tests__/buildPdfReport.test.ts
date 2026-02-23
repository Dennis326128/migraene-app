import { describe, it, expect } from 'vitest';
import { buildPdfReport } from '../adapters/buildPdfReport';

describe('buildPdfReport — SSOT consistency', () => {
  const entries = [
    {
      id: 1,
      selected_date: '2026-02-01',
      pain_level: 'stark',
      entry_kind: 'pain',
      medications: ['Sumatriptan 50mg', 'Ibuprofen 400'],
      medication_intakes: [
        { medication_name: 'Sumatriptan 50mg', dose_quarters: 4 },
        { medication_name: 'Ibuprofen 400', dose_quarters: 2 },
      ],
      me_cfs_severity_level: 'moderate',
    },
    {
      id: 2,
      selected_date: '2026-02-02',
      pain_level: 'leicht',
      entry_kind: 'pain',
      medications: [],
      me_cfs_severity_level: 'none',
    },
    {
      id: 3,
      selected_date: '2026-02-03',
      pain_level: 'keine',
      entry_kind: 'pain',
      medications: [],
      me_cfs_severity_level: null,
    },
    {
      id: 4,
      selected_date: '2026-02-04',
      pain_level: null,
      entry_kind: 'lifestyle',
      medications: [],
    },
  ];

  const effects = [
    { entry_id: 1, med_name: 'Sumatriptan 50mg', effect_rating: 'good', effect_score: null },
  ];

  const result = buildPdfReport({
    range: {
      startISO: '2026-02-01',
      endISO: '2026-02-10',
      totalDaysInRange: 10,
    },
    entries: entries as any,
    medicationEffects: effects,
  });

  it('uses totalDaysInRange from range', () => {
    expect(result.report.meta.basis.totalDaysInRange).toBe(10);
  });

  it('counts documented days correctly', () => {
    expect(result.report.meta.basis.documentedDays).toBe(4);
  });

  it('counts headache days (painMax > 0)', () => {
    // entry 1: stark=7 > 0 ✓, entry 2: leicht=2 > 0 ✓, entry 3: keine=0 ✗, entry 4: lifestyle painMax=null ✗
    expect(result.report.kpis.headacheDays).toBe(2);
  });

  it('counts triptan days', () => {
    expect(result.report.kpis.triptanDays).toBe(1);
  });

  it('counts acute med days', () => {
    expect(result.report.kpis.acuteMedDays).toBe(1);
  });

  it('computes avgPain from headache entries only', () => {
    // entry 1: 7, entry 2: 2 → avg = 4.5
    expect(result.report.kpis.avgPain).toBe(4.5);
  });

  it('legacy pie sums to totalDaysInRange', () => {
    const pie = result.report.charts.legacyHeadacheDaysPie!;
    const sum = pie.segments.reduce((a, s) => a + s.days, 0);
    expect(sum).toBe(10);
  });

  it('undocumentedDays = totalDaysInRange - documentedDays', () => {
    expect(result.report.meta.basis.undocumentedDays).toBe(6);
  });
});
