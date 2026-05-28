import { describe, it, expect } from "vitest";
import { buildAnalysisReportV21 } from "../buildAnalysisReportV21";
import { buildTrendDaysFromEntries } from "../trendAnalysis";
import type { PreAnalysis } from "@/lib/voice/analysisEngine";

const basePre: PreAnalysis = {
  weather: {
    daysWithData: 20, pressureDropDays: 5, pressureRiseDays: 4,
    painOnDropDays: 4, painOnRiseDays: 3, painOnStableDays: 6,
    stableDays: 11, pressureMin: 990, pressureMax: 1020,
    tempMin: 5, tempMax: 22, note: "",
  },
  time: {
    topWeekday: "Mo", topWeekdayShare: 0.2, topPhase: "morgens",
    topPhaseShare: 0.3, weekdayCount: 20, weekendCount: 8, withTime: 25, note: "",
  },
  mecfs: { daysWithMecfs: 4, contextNoteCount: 6, note: "" },
  medication: { intakeCount: 12, highPainEntries: 8, highPainWithMed: 6, highPainWithoutMed: 2, note: "" },
  dataQuality: { painEntries: 29, voiceEvents: 0, weatherDays: 20, rangeDays: 30, note: "" },
};

const baseMeta = {
  totalDays: 30, voiceEventCount: 0, painEntryCount: 29,
  medicationIntakeCount: 12, daysWithPain: 22, daysWithMecfs: 4,
};

function isoRange(days: number): { from: string; to: string; fromISO: string; toISO: string } {
  const to = new Date("2026-05-30T00:00:00Z");
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
  };
}

describe("buildAnalysisReportV21 trend wiring", () => {
  it("emits course_trend + medication_trend when trendDays provided", () => {
    const r = isoRange(30);
    // 30 painEntries: previous half more headaches & triptan, recent half fewer triptan
    const painEntries = [] as any[];
    const medIntakes = [] as any[];
    const start = new Date(`${r.from}T00:00:00Z`).getTime();
    for (let i = 0; i < 30; i++) {
      const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      const isRecent = i >= 15;
      painEntries.push({ selected_date: d, pain_level: "stark", medications: [] });
      if (!isRecent && i % 2 === 0) medIntakes.push({ taken_date: d, medication_name: "Sumatriptan" });
      else if (isRecent && i % 5 === 0) medIntakes.push({ taken_date: d, medication_name: "Sumatriptan" });
    }
    const trendDays = buildTrendDaysFromEntries({ fromDate: r.from, toDate: r.to, painEntries, medIntakes });

    const report = buildAnalysisReportV21({
      fromISO: r.fromISO, toISO: r.toISO, daysTotal: 30,
      preAnalysis: basePre, meta: baseMeta, trendDays,
    });

    const cats = report.findings.map((f) => f.category);
    expect(cats).toContain("course_trend");
    expect(cats).toContain("medication_trend");
    expect(report.section_map.course_trend.length).toBeGreaterThan(0);
  });

  it("emits no trend findings when trendDays empty/absent", () => {
    const r = isoRange(30);
    const report = buildAnalysisReportV21({
      fromISO: r.fromISO, toISO: r.toISO, daysTotal: 30,
      preAnalysis: basePre, meta: baseMeta,
    });
    const cats = report.findings.map((f) => f.category);
    expect(cats).not.toContain("course_trend");
    expect(cats).not.toContain("medication_trend");
    expect(report.section_map.course_trend.length).toBe(0);
  });

  it("emits mecfs_energy_trend when mecfs signals present", () => {
    const r = isoRange(30);
    const painEntries = [] as any[];
    const start = new Date(`${r.from}T00:00:00Z`).getTime();
    for (let i = 0; i < 30; i++) {
      const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      painEntries.push({
        selected_date: d, pain_level: "mittel", medications: [],
        me_cfs_severity_score: i % 2 === 0 ? 3 : 0,
      });
    }
    const trendDays = buildTrendDaysFromEntries({ fromDate: r.from, toDate: r.to, painEntries, medIntakes: [] });
    const report = buildAnalysisReportV21({
      fromISO: r.fromISO, toISO: r.toISO, daysTotal: 30,
      preAnalysis: basePre, meta: baseMeta, trendDays,
    });
    expect(report.findings.map((f) => f.category)).toContain("mecfs_energy_trend");
  });
});

describe("Dokumentationsfazit wording (29/30)", () => {
  it("uses friendly headline and avoids 'Mangel'/'unzureichend'", () => {
    const r = isoRange(30);
    const report = buildAnalysisReportV21({
      fromISO: r.fromISO, toISO: r.toISO, daysTotal: 30,
      preAnalysis: basePre, meta: { ...baseMeta, painEntryCount: 29 },
    });
    const doc = report.findings.find((f) => f.id === "data_quality.diary_coverage");
    expect(doc).toBeTruthy();
    const text = doc!.plain_language_summary;
    expect(text).toMatch(/29 von 30 Tagen/);
    expect(text).toMatch(/Grundlage für Verlauf und Belastung/);
    expect(text).not.toMatch(/unzureichend/i);
    expect(text).not.toMatch(/Mangel an Dokumentation/i);
    expect(text).not.toMatch(/Mangel an schmerzfreien/i);
    expect(text).not.toMatch(/fehlende schmerzfreie/i);
  });
});

describe("Wetter-Wording bei hoher Schmerzlast (painRate >= 0.85)", () => {
  it("uses soft phrasing and avoids forbidden 'Mangel'/'fehlende schmerzfreie' formulations", () => {
    const r = isoRange(30);
    const report = buildAnalysisReportV21({
      fromISO: r.fromISO, toISO: r.toISO, daysTotal: 30,
      preAnalysis: basePre,
      meta: { ...baseMeta, daysWithPain: 29 }, // painRate ≈ 0.967
    });
    const weather = report.findings.find((f) => f.id === "weather.pressure_drop");
    expect(weather).toBeTruthy();
    const text = weather!.plain_language_summary;
    expect(text).toMatch(/Wetteranalyse bleibt vorsichtig/);
    expect(text).not.toMatch(/Mangel an schmerzfreien/i);
    expect(text).not.toMatch(/fehlende schmerzfreie/i);
    expect(text).not.toMatch(/fast fehlende schmerzfreie/i);
    for (const lim of weather!.limitations) {
      expect(lim).not.toMatch(/Mangel an schmerzfreien/i);
      expect(lim).not.toMatch(/fehlende schmerzfreie/i);
    }
  });
});
