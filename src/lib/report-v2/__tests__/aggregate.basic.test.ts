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
});
