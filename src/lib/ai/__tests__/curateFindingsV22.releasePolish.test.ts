import { describe, it, expect } from "vitest";
import { curateFindingsV22, applySectionCaps } from "../curateFindingsV22";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";
import { generateAnalysisReportText } from "../generateAnalysisReportText";

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

const ctx = {
  analysisV21: {
    data_basis: { documented_days: 30, pain_days: 28, mecfs_energy_days: 16 },
    period: { from: "2026-05-01", to: "2026-05-30" },
  },
};

describe("curateFindingsV22 — release polish (final)", () => {
  it("caps open questions at 4", () => {
    const findings = Array.from({ length: 8 }, (_, i) =>
      f({
        id: `m${i}`,
        category: "medication_use",
        title: `Med ${i}`,
        evidenceLevel: "moderate",
        doctorDiscussionPoints: [`Frage ${i}: Triptan-Punkt ${i} besprechen`],
      }),
    );
    const r = curateFindingsV22(findings, ctx);
    expect(r.openQuestions.length).toBeLessThanOrEqual(4);
  });

  it("drops stable mecfs_energy_trend cards entirely", () => {
    const r = curateFindingsV22(
      [
        f({ id: "mt", category: "mecfs_energy_trend", title: "ME/CFS bleibt ähnlich", evidenceLevel: "low" }),
        f({ id: "ct", category: "course_trend", title: "Schmerzlast bleibt ähnlich hoch", evidenceLevel: "moderate" }),
      ],
      ctx,
    );
    expect(r.findings.find((x) => x.id === "mt")).toBeUndefined();
    expect(r.findings.find((x) => x.id === "ct")).toBeDefined();
  });

  it("triptan short-term trend replaces generic medication_trend", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "medication_trend.acute_use_short_term",
          category: "medication_trend",
          title: "Triptan-Einnahmen zuletzt seltener",
          summary: "Kurzfristtrend",
          evidenceLevel: "moderate",
        }),
        f({
          id: "medication_trend.generic",
          category: "medication_trend",
          title: "Akutmedikation im Verlauf stabil",
          evidenceLevel: "low",
        }),
      ],
      ctx,
    );
    const ids = r.findings.map((x) => x.id);
    expect(ids).toContain("medication_trend.acute_use_short_term");
    expect(ids).not.toContain("medication_trend.generic");
  });

  it("strips technical wording (deterministic, Voranalyse) from text", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "tech",
          category: "burden",
          section: "strongest",
          title: "Hoch",
          summary: "Die deterministische Voranalyse zeigt, dass die Last hoch ist. Sehr belastend.",
          reasoning: "Die Analyse zeigt, dass viele Tage betroffen sind.",
        }),
      ],
      ctx,
    );
    const t = r.findings.find((x) => x.id === "tech");
    expect(t?.summary).not.toMatch(/deterministisch/i);
    expect(t?.summary).not.toMatch(/Voranalyse/i);
    expect(t?.reasoning ?? "").not.toMatch(/Die Analyse zeigt/i);
  });

  it("caps course_trend section to 2 via applySectionCaps", () => {
    const items = [
      f({ id: "1", evidenceLevel: "high" }),
      f({ id: "2", evidenceLevel: "moderate" }),
      f({ id: "3", evidenceLevel: "low" }),
      f({ id: "4", evidenceLevel: "low" }),
    ];
    expect(applySectionCaps("course_trend", items).length).toBe(2);
    expect(applySectionCaps("medication", items).length).toBe(2);
    expect(applySectionCaps("mecfs", items).length).toBe(1);
    expect(applySectionCaps("weather", items).length).toBe(1);
    expect(applySectionCaps("time", items).length).toBe(1);
  });

  it("ME/CFS card uses neutral wording (no PEM-Mangel formulation)", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "mecfs1",
          category: "mecfs_energy_pem",
          section: "mecfs",
          title: "ME/CFS nicht ausreichend dokumentiert",
          summary: "Mangelnde PEM-Dokumentation.",
          evidenceLevel: "insufficient",
        }),
      ],
      ctx,
    );
    const card = r.findings.find((x) => x.category === "mecfs_energy_pem");
    expect(card?.title).toBe("ME/CFS- und Energie-Signale");
    expect(card?.summary).not.toMatch(/fehlen|mangel|nicht\s+dokumentiert/i);
    expect(card?.summary).toMatch(/An 16 von 30 Tagen/);
  });

  it("report contains no technical terms and caps open questions at 4", () => {
    const rj = {
      ...ctx,
      analysisV21: {
        ...ctx.analysisV21,
        findings: [
          {
            id: "x",
            category: "burden",
            title: "Schmerzlast hoch",
            summary: "Die deterministische Voranalyse zeigt eine hohe Last.",
            evidence_level: "high",
          },
        ],
      },
    };
    const text = generateAnalysisReportText(rj);
    expect(text).not.toMatch(/deterministisch/i);
    expect(text).not.toMatch(/Voranalyse/i);
  });
});
