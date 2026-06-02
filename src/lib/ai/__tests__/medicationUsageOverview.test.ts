/**
 * Release-Polish — Medikamentengebrauch im Zeitraum
 *
 * 1) Übersicht erscheint als deterministische Karte in category=medication_use
 *    (sektion „Medikamente & Wirkung").
 * 2) Enthält dokumentierte Medikamente mit Einnahmen-Anzahl.
 * 3) Mit Wirkungsbewertungen → Wirkung wird textuell genutzt.
 * 4) Ohne Wirkungsbewertungen → KEINE Mangel-Aussage.
 * 5) Keine Pflicht-/Mangelfloskeln in der Output-Policy mehr.
 * 6) Akutmedikation enthält keinen „Einnahmezeitpunkt..."-Tracking-Hinweis.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateMedicationUsage,
  buildMedicationUsageOverviewFinding,
  formatMedicationUsageSummary,
  medicationUsageOverviewTitle,
} from "@/lib/ai/medicationUsageOverview";
import { buildAnalysisReportV21 } from "@/lib/ai/buildAnalysisReportV21";
import { sanitizeOutputText, hasSoftBannedText } from "@/lib/ai/analysisOutputPolicy";
import type { PreAnalysis } from "@/lib/voice/analysisEngine";

function basePre(over: Partial<PreAnalysis["medication"]> = {}): PreAnalysis {
  return {
    weather: {
      daysWithData: 0, pressureDropDays: 0, pressureRiseDays: 0,
      painOnDropDays: 0, painOnRiseDays: 0, painOnStableDays: 0, stableDays: 0,
      pressureMin: null, pressureMax: null, tempMin: null, tempMax: null, note: "",
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

describe("Medikamentengebrauch im Zeitraum", () => {
  it("aggregiert Einnahmen und Wirkung pro Medikament", () => {
    const items = aggregateMedicationUsage(
      [
        { medication_name: "Sumatriptan" },
        { medication_name: "Sumatriptan" },
        { medication_name: "Ibuprofen" },
      ],
      [
        { med_name: "Sumatriptan", effect_score: 7, effect_rating: null, notes: "wirkt schnell" },
        { med_name: "Sumatriptan", effect_score: 8, effect_rating: null, notes: null },
      ],
    );
    expect(items[0].name).toBe("Sumatriptan");
    expect(items[0].intakeCount).toBe(2);
    expect(items[0].ratedCount).toBe(2);
    expect(items[0].avgScore).toBe(7.5);
    expect(items[1].name).toBe("Ibuprofen");
    expect(items[1].avgScore).toBeNull();
  });

  it("formatiert OHNE Wirkungsdaten KEINE Mangelaussage", () => {
    const text = formatMedicationUsageSummary(
      aggregateMedicationUsage([{ medication_name: "Ibuprofen" }], []),
    );
    expect(text).toContain("Ibuprofen: 1 Einnahme");
    expect(text).not.toMatch(/keine?\s+Wirkungsdaten/i);
    expect(text).not.toMatch(/Wirkung\s+(?:fehlt|nicht\s+bewertet)/i);
  });

  it("Titel ist zeitraumabhängig", () => {
    expect(medicationUsageOverviewTitle(7)).toMatch(/letzten 7 Tagen/);
    expect(medicationUsageOverviewTitle(30)).toMatch(/letzten 30 Tagen/);
    expect(medicationUsageOverviewTitle(90)).toMatch(/letzten 90 Tagen/);
    expect(medicationUsageOverviewTitle(45)).toBe("Medikamentengebrauch im Zeitraum");
  });

  it("Karte erscheint nicht ohne dokumentierte Einnahmen", () => {
    expect(buildMedicationUsageOverviewFinding([], 30)).toBeNull();
  });

  it("buildAnalysisReportV21 injiziert die Übersicht in 'Medikamente & Wirkung'", () => {
    const pre = basePre({
      usageOverview: aggregateMedicationUsage(
        [
          { medication_name: "Sumatriptan" },
          { medication_name: "Sumatriptan" },
          { medication_name: "Ibuprofen" },
        ],
        [{ med_name: "Sumatriptan", effect_score: 8, effect_rating: null, notes: null }],
      ),
    });
    const report = buildAnalysisReportV21({
      fromISO: "2026-05-01",
      toISO: "2026-05-30",
      daysTotal: 30,
      preAnalysis: pre,
      meta: baseMeta,
    });
    const overview = report.findings.find((f) => f.id === "medication.usage_overview");
    expect(overview).toBeDefined();
    expect(overview!.category).toBe("medication_use");
    expect(overview!.title).toMatch(/Medikamentengebrauch/);
    expect(overview!.plain_language_summary).toContain("Sumatriptan");
    expect(overview!.plain_language_summary).toContain("Ibuprofen");
  });

  it("Akutmedikations-Karte enthält keine 'Einnahmezeitpunkt...'-Pflichtnote", () => {
    const report = buildAnalysisReportV21({
      fromISO: "2026-05-01", toISO: "2026-05-30", daysTotal: 30,
      preAnalysis: basePre(), meta: baseMeta,
    });
    const acute = report.findings.find((f) => f.id === "medication.acute_intakes");
    expect(acute!.recommended_tracking_next.join(" ")).not.toMatch(/Einnahmezeitpunkt/i);
    expect(acute!.limitations.join(" ")).not.toMatch(/MOH ohne längeren/i);
  });

  it("Output-Policy filtert Wirkungs-/Timing-Pflichtfloskeln", () => {
    const banned = [
      "Die Wirksamkeit oder Unwirksamkeit der einzelnen Medikamentengaben ist nicht detailliert beschrieben.",
      "Informationen zur zeitlichen Abfolge der Medikamentenwirkung fehlen oft.",
      "Dosis und Wirksamkeit überprüfen.",
      "Wirkung bewerten.",
      "Wirkung nach 2 Stunden bewerten.",
      "Keine Wirkungsdaten vorhanden.",
      "Wirksamkeit kann nicht beurteilt werden.",
      "Dokumentiere Wirkung nach 2 Stunden.",
      "Dokumentiere den Einnahmezeitpunkt.",
    ];
    for (const phrase of banned) {
      expect(hasSoftBannedText(phrase)).toBe(true);
      expect(sanitizeOutputText(phrase)).toBe("");
    }
  });
});
