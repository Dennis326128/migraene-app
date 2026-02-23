import { describe, it, expect } from 'vitest';
import { computeMiaryReport } from '../aggregate';
import type { ComputeReportInput } from '../types';
import fixtureRaw from './fixtures/fixture-basic.json';

const fixture = fixtureRaw as {
  range: ComputeReportInput['range'];
  entries: ComputeReportInput['entries'];
  expected: typeof fixtureRaw.expected;
};

describe('computeMiaryReport — basic fixture', () => {
  const report = computeMiaryReport({
    range: fixture.range,
    entries: fixture.entries,
  });

  // ─── Meta / Basis ────────────────────────────────────────────────
  it('computes totalDaysInRange', () => {
    expect(report.meta.basis.totalDaysInRange).toBe(fixture.expected.meta.basis.totalDaysInRange);
  });

  it('computes documentedDays', () => {
    expect(report.meta.basis.documentedDays).toBe(fixture.expected.meta.basis.documentedDays);
  });

  it('computes undocumentedDays', () => {
    expect(report.meta.basis.undocumentedDays).toBe(fixture.expected.meta.basis.undocumentedDays);
  });

  // ─── KPIs ────────────────────────────────────────────────────────
  it('computes headacheDays', () => {
    expect(report.kpis.headacheDays).toBe(fixture.expected.kpis.headacheDays);
  });

  it('computes treatmentDays', () => {
    expect(report.kpis.treatmentDays).toBe(fixture.expected.kpis.treatmentDays);
  });

  it('computes triptanDays', () => {
    expect(report.kpis.triptanDays).toBe(fixture.expected.kpis.triptanDays);
  });

  it('computes acuteMedDays', () => {
    expect(report.kpis.acuteMedDays).toBe(fixture.expected.kpis.acuteMedDays);
  });

  it('computes avgPain', () => {
    expect(report.kpis.avgPain).toBe(fixture.expected.kpis.avgPain);
  });

  it('computes maxPain', () => {
    expect(report.kpis.maxPain).toBe(fixture.expected.kpis.maxPain);
  });

  it('computes mohRiskFlag', () => {
    expect(report.kpis.mohRiskFlag).toBe(fixture.expected.kpis.mohRiskFlag);
  });

  // ─── Charts: Headache Donut ──────────────────────────────────────
  it('computes headacheDaysDonut segments', () => {
    const segments = report.charts.headacheDaysDonut.segments;
    for (const exp of fixture.expected.charts.headacheDaysDonut) {
      const seg = segments.find(s => s.key === exp.key);
      expect(seg, `segment ${exp.key} should exist`).toBeDefined();
      expect(seg!.days).toBe(exp.days);
    }
  });

  // ─── Charts: Legacy Pie ──────────────────────────────────────────
  it('computes legacyHeadacheDaysPie segments', () => {
    expect(report.charts.legacyHeadacheDaysPie).toBeDefined();
    const segments = report.charts.legacyHeadacheDaysPie!.segments;
    for (const exp of fixture.expected.charts.legacyHeadacheDaysPie) {
      const seg = segments.find(s => s.key === exp.key);
      expect(seg, `legacy segment ${exp.key} should exist`).toBeDefined();
      expect(seg!.days).toBe(exp.days);
    }
    // Sum must equal totalDaysInRange
    const sum = segments.reduce((acc, s) => acc + s.days, 0);
    expect(sum).toBe(report.meta.basis.totalDaysInRange);
  });

  // ─── Charts: ME/CFS Donut ───────────────────────────────────────
  it('computes meCfs donut', () => {
    expect(report.charts.meCfs).toBeDefined();
    const donut = report.charts.meCfs!.donut;
    for (const exp of fixture.expected.charts.meCfsDonut) {
      const seg = donut.find(s => s.key === exp.key);
      expect(seg, `meCfs segment ${exp.key} should exist`).toBeDefined();
      expect(seg!.days).toBe(exp.days);
    }
  });

  // ─── Charts: Medications ─────────────────────────────────────────
  it('computes medication stats for Sumatriptan', () => {
    const triptan = report.charts.medications.items.find(m => m.medicationId === 'med-triptan');
    expect(triptan).toBeDefined();
    expect(triptan!.daysUsed).toBe(fixture.expected.charts.medications.sumatriptan_daysUsed);
    expect(triptan!.avgEffect).toBe(fixture.expected.charts.medications.sumatriptan_avgEffect);
  });

  it('computes medication stats for Ibuprofen', () => {
    const ibu = report.charts.medications.items.find(m => m.medicationId === 'med-ibu');
    expect(ibu).toBeDefined();
    expect(ibu!.daysUsed).toBe(fixture.expected.charts.medications.ibuprofen_daysUsed);
    expect(ibu!.avgEffect).toBe(fixture.expected.charts.medications.ibuprofen_avgEffect);
  });

  // ─── Raw countsByDay ─────────────────────────────────────────────
  it('raw countsByDay has correct length', () => {
    expect(report.raw.countsByDay.length).toBe(10);
  });

  it('raw countsByDay is sorted ascending', () => {
    for (let i = 1; i < report.raw.countsByDay.length; i++) {
      expect(report.raw.countsByDay[i].dateISO >= report.raw.countsByDay[i - 1].dateISO).toBe(true);
    }
  });

  it('raw countsByDay includes triptanUsed and acuteMedUsed', () => {
    const day1 = report.raw.countsByDay.find(d => d.dateISO === '2026-02-01');
    expect(day1?.triptanUsed).toBe(true);
    expect(day1?.acuteMedUsed).toBe(true);
    const day3 = report.raw.countsByDay.find(d => d.dateISO === '2026-02-03');
    expect(day3?.triptanUsed).toBe(false);
    expect(day3?.acuteMedUsed).toBe(false);
  });
});

// ─── range.totalDaysInRange override ─────────────────────────────
describe('computeMiaryReport — totalDaysInRange from range', () => {
  it('uses range.totalDaysInRange when provided', () => {
    const report = computeMiaryReport({
      range: {
        ...fixture.range,
        totalDaysInRange: 30,
      },
      entries: fixture.entries,
    });
    expect(report.meta.basis.totalDaysInRange).toBe(30);
    expect(report.meta.basis.documentedDays).toBe(7);
    expect(report.meta.basis.undocumentedDays).toBe(23);
  });

  it('legacyPie sums to totalDaysInRange override', () => {
    const report = computeMiaryReport({
      range: {
        ...fixture.range,
        totalDaysInRange: 30,
      },
      entries: fixture.entries,
    });
    const sum = report.charts.legacyHeadacheDaysPie!.segments.reduce((a, s) => a + s.days, 0);
    expect(sum).toBe(30);
  });
});
