import { describe, it, expect } from "vitest";
import { curateFindingsV22, applySectionCaps } from "../curateFindingsV22";
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

const ctxHighPain = {
  analysisV21: {
    data_basis: { documented_days: 30, pain_days: 28, mecfs_energy_days: 16 },
    period: { from: "2026-05-01", to: "2026-05-30" },
  },
};

describe("curateFindingsV22 — detail-view polish", () => {
  it("drops fatigue/PEM interaction cards when ME/CFS block exists", () => {
    const r = curateFindingsV22(
      [
        f({ id: "mecfs", category: "mecfs_energy_pem", title: "ME/CFS- und Energie-Signale", evidenceLevel: "moderate" }),
        f({
          id: "inter",
          category: "interaction",
          title: "Überlappung von Schmerz und Fatigue-Symptomen",
          summary: "Mögliche Wechselwirkung Schmerz × Fatigue.",
          evidenceLevel: "low",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "mecfs")).toBeDefined();
    expect(r.findings.find((x) => x.id === "inter")).toBeUndefined();
  });

  it("drops weather card with 'kein klarer Auslöser' / 'möglicher Verstärkungsfaktor'", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "w1",
          category: "weather",
          title: "Wetter",
          summary: "Wetter kann ein möglicher Verstärkungsfaktor sein. Ein klarer Auslöser lässt sich daraus nicht ableiten.",
          evidenceLevel: "low",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "w1")).toBeUndefined();
  });

  it("drops pressure-change weather card when pain density is very high", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "w2",
          category: "weather",
          title: "Auffällige Koinzidenz von Druckänderungen und Schmerztagen",
          summary: "Druckabfall an mehreren Tagen vor Schmerz.",
          evidenceLevel: "low",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "w2")).toBeUndefined();
  });

  it("keeps weather card with subjective marker (Hitze)", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "w3",
          category: "weather",
          title: "Hitze als möglicher Trigger",
          summary: "Mehrfach Hitze als subjektiver Auslöser dokumentiert.",
          evidenceLevel: "low",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "w3")).toBeDefined();
  });

  it("caps open questions at 4 and keeps only one fatigue/ME/CFS question", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "m1",
          category: "mecfs_energy_pem",
          doctorDiscussionPoints: ["ME/CFS-Signale im Zusammenhang mit Migräne besprechen."],
        }),
        f({
          id: "m2",
          category: "interaction",
          title: "X",
          summary: "Y",
          doctorDiscussionPoints: ["Mögliche Fatigue-Überlappung besprechen."],
        }),
        f({
          id: "m3",
          category: "medication_use",
          doctorDiscussionPoints: ["Akutmedikation und Übergebrauch besprechen."],
        }),
        f({
          id: "m4",
          category: "burden",
          doctorDiscussionPoints: ["Hohe Kopfschmerzfrequenz ärztlich einordnen."],
        }),
      ],
      ctxHighPain,
    );
    expect(r.openQuestions.length).toBeLessThanOrEqual(4);
    const fatigueCount = r.openQuestions.filter((q) => /fatigue|me\/?cfs|erschöpf|pem|energie/i.test(q)).length;
    expect(fatigueCount).toBeLessThanOrEqual(1);
  });

  it("interaction section cap is 1", () => {
    const items = [
      f({ id: "1", evidenceLevel: "moderate" }),
      f({ id: "2", evidenceLevel: "moderate" }),
      f({ id: "3", evidenceLevel: "low" }),
    ];
    expect(applySectionCaps("interaction", items).length).toBe(1);
    expect(applySectionCaps("lifestyle", items).length).toBe(1);
  });
});
