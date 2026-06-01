import { describe, it, expect } from "vitest";
import { curateFindingsV22 } from "../curateFindingsV22";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";

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

// High pain ratio scenario (28/30 pain days, 30 documented)
const ctxHighPain = {
  analysisV21: {
    data_basis: { documented_days: 30, pain_days: 28, mecfs_energy_days: 5 },
    period: { from: "2026-05-01", to: "2026-05-30" },
  },
};

describe("curateFindingsV22 — release polish", () => {
  it("merges ALL burden findings into a single 'Sehr hohe Schmerzlast' on high pain ratio", () => {
    const r = curateFindingsV22(
      [
        f({ id: "b1", category: "burden", title: "Sehr hohe Schmerzlast", evidenceLevel: "high" }),
        f({ id: "b2", category: "burden", title: "Schmerztage im Zeitraum", evidenceLevel: "moderate" }),
        f({ id: "c1", category: "chronification", title: "Chronifizierungs-Risiko", evidenceLevel: "moderate" }),
      ],
      ctxHighPain,
    );
    const burdens = r.findings.filter((x) => x.category === "burden");
    const chronif = r.findings.filter((x) => x.category === "chronification");
    expect(burdens).toHaveLength(1);
    expect(chronif).toHaveLength(0);
    expect(burdens[0].title).toBe("Sehr hohe Schmerzlast im gesamten Zeitraum");
  });

  it("renames an existing diary_coverage card titled 'Dokumentationsfazit'", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "data_quality.diary_coverage",
          category: "data_quality",
          section: "data_quality",
          title: "Dokumentationsfazit",
          summary: "Du hast viele Tage dokumentiert.",
          evidenceLevel: "moderate",
        }),
      ],
      ctxHighPain,
    );
    const card = r.findings.find((x) => x.id === "data_quality.diary_coverage");
    expect(card?.title).toBe("Gute Dokumentationsgrundlage");
  });

  it("does not emit redundant 'Patient'/'muss ausgeschlossen'/'Schmerzlast' open questions", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "b1", category: "burden", title: "Belastung",
          doctorDiscussionPoints: [
            "Schmerzlast des Patienten besprechen",
            "Chronifizierung muss ausgeschlossen werden",
            "Triptan-Strategie besprechen",
          ],
        }),
      ],
      ctxHighPain,
    );
    expect(r.openQuestions.every((q) => !/patient/i.test(q))).toBe(true);
    expect(r.openQuestions.every((q) => !/muss\s+ausgeschlossen/i.test(q))).toBe(true);
  });

  it("caps open questions at 5", () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      f({
        id: `m${i}`,
        category: "medication_use",
        title: `Med ${i}`,
        evidenceLevel: "moderate",
        doctorDiscussionPoints: [`Frage ${i}: Triptan-Punkt ${i} besprechen`],
      }),
    );
    const r = curateFindingsV22(findings, ctxHighPain);
    expect(r.openQuestions.length).toBeLessThanOrEqual(5);
  });
});
