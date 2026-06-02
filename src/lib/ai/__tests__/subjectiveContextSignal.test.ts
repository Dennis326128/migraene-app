import { describe, it, expect } from "vitest";
import {
  hasUserObservedContextSignal,
  isAutomaticOnlySignal,
} from "../subjectiveContextSignal";
import { curateFindingsV22 } from "../curateFindingsV22";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";

function f(over: Partial<NormalizedAnalysisFinding> & { id: string }): NormalizedAnalysisFinding {
  return {
    id: over.id,
    category: over.category ?? "burden",
    section: over.section ?? "strongest",
    title: over.title ?? "T",
    summary: over.summary ?? "S",
    evidenceLevel: over.evidenceLevel ?? "low",
    limitations: [],
    recommendedTrackingNext: [],
    doctorDiscussionPoints: over.doctorDiscussionPoints ?? [],
    source: "deterministic",
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

describe("subjectiveContextSignal", () => {
  it("detects free user notes (reporting verbs)", () => {
    expect(
      hasUserObservedContextSignal({
        title: "Hinweis",
        summary: "Nutzer hat dokumentiert, dass es zu warm war.",
      }),
    ).toBe(true);
  });

  it("detects subjective experience phrasing", () => {
    expect(
      hasUserObservedContextSignal({
        title: "X",
        summary: "Trotz Schmerzen einen Termin wahrgenommen, kaum Ruhe.",
      }),
    ).toBe(true);
  });

  it("detects triptan-avoidance as subjective", () => {
    expect(
      hasUserObservedContextSignal({
        title: "Triptan-Vermeidung",
        summary: "Wollte kein Triptan nehmen.",
      }),
    ).toBe(true);
  });

  it("treats pure pressure/temperature wording as automatic-only", () => {
    expect(
      isAutomaticOnlySignal({
        category: "weather",
        title: "Druckänderung",
        summary: "Druckabfall an mehreren Tagen.",
      }),
    ).toBe(true);
  });

  it("treats weather with subjective marker as NOT automatic-only", () => {
    expect(
      isAutomaticOnlySignal({
        category: "weather",
        title: "Hitze",
        summary: "Nutzer beschrieb Hitze als Auslöser.",
      }),
    ).toBe(false);
  });
});

describe("curateFindingsV22 — general subjective gating", () => {
  it("drops 'Fehlende Details zu Begleitsymptomen und Aura'", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "s1",
          category: "symptoms_aura",
          title: "Fehlende Details zu Begleitsymptomen und Aura",
          summary: "Mangel an Aura-Daten.",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "s1")).toBeUndefined();
  });

  it("removes interaction Triptan-Vermeidung when medication trend already covers it", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "m1",
          category: "medication_trend",
          title: "Triptan-Vermeidung im Verlauf",
          summary: "Nutzer dokumentiert mehrfach Verzicht auf Triptan.",
          evidenceLevel: "moderate",
        }),
        f({
          id: "i1",
          category: "interaction",
          title: "Tendenz zur Triptan-Vermeidung trotz Schmerz",
          summary: "Mehrfach kein Triptan trotz Schmerzen.",
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.find((x) => x.id === "i1")).toBeUndefined();
  });

  it("keeps subjective weather card but does not force a weather doctor question", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "w1",
          category: "weather",
          title: "Hitze als möglicher Verstärkungsfaktor",
          summary: "Nutzer notiert mehrfach Hitze an Schmerztagen.",
          evidenceLevel: "low",
          doctorDiscussionPoints: ["Wetter-/Umweltbelastung als möglichen Verstärkungsfaktor besprechen."],
        }),
      ],
      ctxHighPain,
    );
    expect(r.findings.some((x) => x.id === "w1")).toBe(true);
    expect(r.openQuestions.some((q) => /wetter|umweltbelastung/i.test(q))).toBe(false);
  });

  it("drops weather doctor question that is auto-only and low evidence", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "w2",
          category: "weather",
          title: "Luftdruck-Koinzidenz",
          summary: "Druckabfall an 3 Tagen vor Schmerztagen registriert.",
          evidenceLevel: "low",
          doctorDiscussionPoints: ["Wetter besprechen."],
        }),
      ],
      { analysisV21: { data_basis: { documented_days: 30, pain_days: 10, mecfs_energy_days: 0 }, period: { from: "2026-05-01", to: "2026-05-30" } } },
    );
    expect(r.openQuestions.some((q) => /wetter/i.test(q))).toBe(false);
  });
});
