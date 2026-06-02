/**
 * Release-Polish (Medikation, final) – subjektive Wortwahl, Diazepam-
 * Sicherheitsnetz, keine Pflicht-/Mangelformulierungen in der Summary,
 * Medikamenten-Sektion bleibt kompakt.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateMedicationUsage,
  formatMedicationUsageLine,
  formatMedicationUsageSummary,
} from "@/lib/ai/medicationUsageOverview";
import {
  hasBannedText,
  hasSoftBannedText,
  sanitizeOutputText,
  applyOutputPolicy,
} from "@/lib/ai/analysisOutputPolicy";
import { applySectionCaps } from "@/lib/ai/curateFindingsV22";
import { buildAnalysisOverviewSummary } from "@/lib/ai/buildAnalysisOverviewSummary";
import type { NormalizedAnalysisFinding } from "@/lib/ai/normalizeAnalysisFindings";

function nf(over: Partial<NormalizedAnalysisFinding> = {}): NormalizedAnalysisFinding {
  return {
    id: over.id ?? "test.1",
    category: over.category ?? "medication_use",
    section: over.section ?? "medication",
    title: over.title ?? "Test",
    summary: over.summary ?? "",
    reasoning: over.reasoning,
    evidenceLevel: over.evidenceLevel ?? "moderate",
    limitations: over.limitations ?? [],
    recommendedTrackingNext: over.recommendedTrackingNext ?? [],
    doctorDiscussionPoints: over.doctorDiscussionPoints ?? [],
    source: over.source ?? "deterministic",
    shouldShowInDoctorShare: over.shouldShowInDoctorShare ?? true,
  } as NormalizedAnalysisFinding;
}

describe("Medikamenten-Wirkung wird subjektiv formuliert", () => {
  it("nennt KEINE numerische Skala in der Ausgabe", () => {
    const items = aggregateMedicationUsage(
      [{ medication_name: "Sumatriptan" }, { medication_name: "Sumatriptan" }],
      [{ med_name: "Sumatriptan", effect_score: 8, effect_rating: null, notes: null }],
    );
    const line = formatMedicationUsageLine(items[0]);
    expect(line).toMatch(/Sumatriptan: 2 Einnahmen/);
    expect(line).toMatch(/subjektiv/i);
    expect(line).not.toMatch(/Ø\s*\d/);
    expect(line).not.toMatch(/\d+\/10/);
    expect(line).not.toMatch(/\bwirkt\s+gut\b/i);
    expect(line).not.toMatch(/\bsehr\s+gut\b/i);
  });

  it("ohne Wirkungsbewertung: KEINE Wirkungsphrase", () => {
    const items = aggregateMedicationUsage([{ medication_name: "Ibuprofen" }], []);
    const line = formatMedicationUsageLine(items[0]);
    expect(line).toBe("Ibuprofen: 1 Einnahme");
  });
});

describe("Diazepam-Sicherheitsnetz", () => {
  it("Diazepam wird NICHT als ‚wirksam' / ‚sehr gut' beschrieben, auch bei hohem Score", () => {
    const items = aggregateMedicationUsage(
      Array.from({ length: 6 }, () => ({ medication_name: "Diazepam" })),
      Array.from({ length: 6 }, () => ({
        med_name: "Diazepam",
        effect_score: 9,
        effect_rating: null,
        notes: null,
      })),
    );
    const line = formatMedicationUsageLine(items[0]);
    expect(line).toMatch(/Diazepam: 6 Einnahmen/);
    expect(line).toMatch(/subjektiv\s+h[äa]ufig\s+hilfreich\s+bewertet/i);
    expect(line).not.toMatch(/sehr\s+gut/i);
    expect(line).not.toMatch(/wirkt\s+gut/i);
    expect(line).not.toMatch(/wirksam/i);
  });

  it("BAN_ALWAYS blockt Diazepam-Wirksamkeits-/Migränetherapie-Wording", () => {
    const banned = [
      "Diazepam zeigt hohe Wirksamkeit bei Migräne.",
      "Diazepam wirkt sehr gut.",
      "Diazepam ist wirksam.",
      "Diazepam als Alternative zu Triptanen.",
      "Gezielter Einsatz von Diazepam im Migräne-Management.",
      "Diazepam zur Migränebehandlung geeignet.",
      "Diazepam Migränetherapie etablieren.",
    ];
    for (const phrase of banned) {
      expect(hasBannedText(phrase)).toBe(true);
    }
  });

  it("applyOutputPolicy verwirft Karten mit Diazepam-Wirksamkeitsaussage", () => {
    const f = nf({
      id: "med.diazepam.effect",
      title: "Diazepam zeigt hohe Wirksamkeit",
      summary: "Diazepam wirkt sehr gut bei Migräne.",
    });
    const res = applyOutputPolicy([f], []);
    expect(res.findings.length).toBe(0);
    expect(res.removed[0].reason).toBe("policy_banned_content");
  });
});

describe("Summary – keine Pflicht-/Mangelformulierung", () => {
  it("Dokumentationsfazit → ruhige Aussage, kein ‚wären zusätzliche Angaben hilfreich'", () => {
    const responseJson = {
      analysisV21: {
        period: { from: "2026-05-01", to: "2026-05-30" },
        data_basis: { pain_days: 10, documented_days: 28, mecfs_energy_days: 0 },
      },
    };
    const findings: NormalizedAnalysisFinding[] = [
      nf({
        id: "data_quality.diary_coverage",
        category: "data_quality",
        section: "data_quality",
        title: "Gute Dokumentationsgrundlage",
        summary: "Gute Grundlage.",
      }),
    ];
    const out = buildAnalysisOverviewSummary({ responseJson, findings });
    expect(out).toBeTruthy();
    expect(out!).toMatch(/Dokumentation ist insgesamt sehr gut/);
    expect(out!).not.toMatch(/w[äa]ren\s+zus[äa]tzliche\s+Angaben/i);
    expect(out!).not.toMatch(/feinere\s+Zusammenh[äa]nge/i);
  });

  it("Soft-Ban: alte Boilerplate wird gefiltert", () => {
    const phrase =
      "Für feinere Zusammenhänge wären zusätzliche Angaben zu Schlaf, Stress und Medikamentenwirkung hilfreich.";
    expect(hasSoftBannedText(phrase)).toBe(true);
    expect(sanitizeOutputText(phrase)).toBe("");
  });
});

describe("Medikamenten-Sektion bleibt kompakt", () => {
  it("applySectionCaps('medication', …) cap = 2", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      nf({ id: `m${i}`, evidenceLevel: i === 0 ? "high" : "low" }),
    );
    const capped = applySectionCaps("medication", items);
    expect(capped.length).toBe(2);
  });
});

describe("Zusammenfassung enthält alle dokumentierten Medikamente", () => {
  it("listet jedes dokumentierte Medikament", () => {
    const items = aggregateMedicationUsage(
      [
        { medication_name: "Sumatriptan" },
        { medication_name: "Sumatriptan" },
        { medication_name: "Ibuprofen" },
        { medication_name: "Diazepam" },
      ],
      [],
    );
    const txt = formatMedicationUsageSummary(items);
    expect(txt).toMatch(/Sumatriptan/);
    expect(txt).toMatch(/Ibuprofen/);
    expect(txt).toMatch(/Diazepam/);
  });
});
