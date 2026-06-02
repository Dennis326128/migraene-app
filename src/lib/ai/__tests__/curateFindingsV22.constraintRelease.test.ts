/**
 * Release-Polish — generic uncertainty boilerplate must be gone from any
 * surface that runs through the curation + output policy.
 */
import { describe, it, expect } from "vitest";
import { curateFindingsV22 } from "../curateFindingsV22";
import {
  sanitizeOutputText,
  hasSoftBannedText,
  applyOutputPolicy,
} from "../analysisOutputPolicy";
import { buildAnalysisReportV21 } from "../buildAnalysisReportV21";
import { buildCourseTrendFindings } from "../buildCourseTrendFindings";
import { buildTrendDaysFromEntries, computeTrendAnalysis } from "../trendAnalysis";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";
import type { PreAnalysis } from "@/lib/voice/analysisEngine";

function f(over: Partial<NormalizedAnalysisFinding> & { id: string }): NormalizedAnalysisFinding {
  return {
    id: over.id,
    category: over.category ?? "burden",
    section: over.section ?? "strongest",
    title: over.title ?? "T",
    summary: over.summary ?? "S",
    evidenceLevel: over.evidenceLevel ?? "moderate",
    limitations: over.limitations ?? [],
    recommendedTrackingNext: over.recommendedTrackingNext ?? [],
    doctorDiscussionPoints: over.doctorDiscussionPoints ?? [],
    source: over.source ?? "deterministic",
    shouldShowInDoctorShare: true,
    ...over,
  };
}

function basePre(over: Partial<PreAnalysis["medication"]> = {}): PreAnalysis {
  return {
    weather: {
      daysWithData: 0, pressureDropDays: 0, pressureRiseDays: 0,
      painOnDropDays: 0, painOnRiseDays: 0, painOnStableDays: 0, stableDays: 0,
      pressureMin: null, pressureMax: null, tempMin: null, tempMax: null,
      note: "",
    },
    time: {
      topWeekday: null, topWeekdayShare: 0, topPhase: null, topPhaseShare: 0,
      weekdayCount: 0, weekendCount: 0, withTime: 0, note: "",
    },
    mecfs: { daysWithMecfs: 0, contextNoteCount: 0, note: "" },
    medication: {
      intakeCount: 5, highPainEntries: 4, highPainWithMed: 3, highPainWithoutMed: 1,
      effectRatedCount: 0, note: "", ...over,
    },
    dataQuality: { painEntries: 26, voiceEvents: 0, weatherDays: 0, rangeDays: 30, note: "" },
  };
}

const baseMeta = {
  totalDays: 30, voiceEventCount: 0, painEntryCount: 28,
  medicationIntakeCount: 5, daysWithPain: 26, daysWithMecfs: 0,
};

function buildStableTrend() {
  const days: { selected_date: string; pain_level: string; medications: string[]; me_cfs_severity_score: number | null; me_cfs_severity_level: string | null }[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date("2026-04-01T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    days.push({
      selected_date: d.toISOString().slice(0, 10),
      pain_level: i % 2 === 0 ? "5" : "-",
      medications: i % 3 === 0 ? ["Ibu"] : [],
      me_cfs_severity_score: null,
      me_cfs_severity_level: null,
    });
  }
  const trendDays = buildTrendDaysFromEntries({
    fromDate: "2026-04-01",
    toDate: "2026-05-30",
    painEntries: days,
    medIntakes: [],
  });
  return computeTrendAnalysis(trendDays);
}

describe("Release-Polish: generische Einschränkungen sind entfernt", () => {
  it("Burden-Merge bei ≥80 % Dokumentationsabdeckung enthält keine 'ohne vollständige Dokumentation'", () => {
    const burdens = [f({ id: "b1", category: "burden", evidenceLevel: "high", summary: "Sehr hohe Belastung." })];
    const chronif = [f({ id: "c1", category: "chronification", evidenceLevel: "moderate", summary: "Chronifizierung möglich." })];
    const ctx = {
      analysisV21: {
        data_basis: { documented_days: 28, pain_days: 27 },
        period: { from: "2026-05-01", to: "2026-05-30", days_total: 30 },
      },
    };
    const r = curateFindingsV22([...burdens, ...chronif], ctx);
    const merged = r.findings.find((x) => x.category === "burden");
    expect(merged).toBeDefined();
    expect(merged?.limitations.join(" ")).not.toMatch(/ohne\s+vollständige\s+Dokumentation/i);
  });

  it("Stabile Verlaufskarten enthalten nicht 'Verläufe brauchen längere Zeiträume'", () => {
    const trend = buildStableTrend();
    expect(trend).not.toBeNull();
    const findings = buildCourseTrendFindings(trend);
    const headache = findings.find((t) => t.id === "course_trend.pain_burden");
    expect(headache).toBeDefined();
    expect((headache?.limitations ?? []).join(" ")).not.toMatch(/Verläufe\s+brauchen\s+längere\s+Zeiträume/i);
  });

  it("Medikamenten-Trend (non-triptan) ohne Wirksamkeits-Pauschalfloskel und ohne Wirkungs-Tracking-Pflicht", () => {
    const trend = buildStableTrend();
    const findings = buildCourseTrendFindings(trend);
    const med = findings.find((t) => t.id === "medication_trend.acute_use");
    if (med) {
      expect((med.limitations ?? []).join(" ")).not.toMatch(/Medikamenten[-\s]?Trend\s+allein/i);
      expect((med.limitations ?? []).join(" ")).not.toMatch(/Wirksamkeit\s+wird\s+hier\s+nicht\s+bewertet/i);
      expect((med.recommended_tracking_next ?? []).join(" ")).not.toMatch(/Wirksamkeit\s+der\s+Akutmedikation/i);
    }
  });

  it("buildAnalysisReportV21: bei effectRatedCount ≥ 1 → effect_rating_count gesetzt, keine Wirksamkeits-Floskel", () => {
    const report = buildAnalysisReportV21({
      fromISO: "2026-05-01",
      toISO: "2026-05-30",
      daysTotal: 30,
      preAnalysis: basePre({ effectRatedCount: 2 }),
      meta: baseMeta,
    });
    expect(report.data_basis.effect_rating_count).toBe(2);
    const medFinding = report.findings.find((x) => x.id === "medication.acute_intakes");
    expect((medFinding?.limitations ?? []).join(" ")).not.toMatch(/Wirksamkeit\s+wird\s+hier\s+nicht\s+bewertet/i);
  });

  it("buildAnalysisReportV21: bei ≥80 % Coverage entfällt 'Ohne vollständige Dokumentation' auf burden.pain_days_share", () => {
    const report = buildAnalysisReportV21({
      fromISO: "2026-05-01",
      toISO: "2026-05-30",
      daysTotal: 30,
      preAnalysis: basePre(),
      meta: { ...baseMeta, painEntryCount: 28 }, // documentedDays = min(30, 28+0) = 28 → cov 28/30 ≥ 0.8
    });
    const burden = report.findings.find((x) => x.id === "burden.pain_days_share");
    expect((burden?.limitations ?? []).join(" ")).not.toMatch(/ohne\s+vollständige\s+Dokumentation/i);
  });

  it("Output-Policy entfernt 'nicht aus dem Datensatz ersichtlich' und 'nicht explizit dokumentiert' Sätze", () => {
    const txt = sanitizeOutputText(
      "Es gibt Hinweise auf Triptan-Zurückhaltung. Die genauen Gründe sind nicht aus dem Datensatz ersichtlich. Die Vermeidung ist nicht explizit dokumentiert.",
    );
    expect(txt).toMatch(/Hinweise auf Triptan-Zurückhaltung/);
    expect(txt).not.toMatch(/nicht\s+aus\s+dem\s+Datensatz/i);
    expect(txt).not.toMatch(/nicht\s+explizit\s+dokumentiert/i);
  });

  it("applyOutputPolicy entfernt soft-banned limitations, behält aber die Karte", () => {
    const card = f({
      id: "triptan",
      category: "interaction",
      title: "Triptan-Zurückhaltung",
      summary: "Hinweise auf Triptan-Zurückhaltung.",
      limitations: [
        "Die Gründe sind nicht aus dem Datensatz ersichtlich.",
        "Triptan-Vermeidung ist nicht explizit dokumentiert.",
      ],
    });
    const { findings } = applyOutputPolicy([card], []);
    expect(findings.length).toBe(1);
    expect(findings[0].limitations.length).toBe(0);
  });

  it("hasSoftBannedText erkennt alle Release-Polish-Phrasen", () => {
    expect(hasSoftBannedText("Ohne vollständige Dokumentation kann die Last höher sein.")).toBe(true);
    expect(hasSoftBannedText("Verläufe brauchen längere Zeiträume, um stabil zu sein.")).toBe(true);
    expect(hasSoftBannedText("Medikamenten-Trend allein erlaubt keine Aussage zur Wirksamkeit.")).toBe(true);
    expect(hasSoftBannedText("Wirksamkeit wird hier nicht bewertet.")).toBe(true);
    expect(hasSoftBannedText("Keine Informationen zur Wirksamkeit vorhanden.")).toBe(true);
    expect(hasSoftBannedText("Datenlage erschwert die Analyse.")).toBe(true);
    expect(hasSoftBannedText("Eine normale Aussage ohne Floskel.")).toBe(false);
  });
});
