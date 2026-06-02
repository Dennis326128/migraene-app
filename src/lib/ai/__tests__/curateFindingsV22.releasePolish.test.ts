import { describe, it, expect } from "vitest";
import { curateFindingsV22, applySectionCaps } from "../curateFindingsV22";
import { groupFindingsBySection, type NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";
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
  it("forces Medikamentengebrauch im Zeitraum as first medication card and integrates single effect cards", () => {
    const findings = [
      f({
        id: "med.sumatriptan.effect",
        category: "medication_effect",
        section: "medication",
        title: "Gemischte Wirksamkeit und Kontext von Sumatriptan",
        summary: "Sumatriptan zeigt Wirkung, aber nicht immer.",
        evidenceLevel: "moderate",
      }),
      f({
        id: "medication.usage_overview",
        category: "medication_use",
        section: "medication",
        title: "Medikamentengebrauch in den letzten 30 Tagen",
        summary: "Sumatriptan: 4 Einnahmen, subjektiv überwiegend hilfreich bewertet\nIbuprofen: 2 Einnahmen\nDiazepam: 1 Einnahme, subjektiv häufig hilfreich bewertet",
        evidenceLevel: "moderate",
      }),
      f({
        id: "med.triptan.avoid",
        category: "medication_use",
        section: "medication",
        title: "Tendenz zur Triptan-Vermeidung",
        summary: "Mehrfach kein Triptan trotz Schmerzen.",
        evidenceLevel: "moderate",
      }),
    ];
    const r = curateFindingsV22(findings, ctx);
    const medication = groupFindingsBySection(r.findings).medication;
    expect(medication[0].title).toBe("Medikamentengebrauch im Zeitraum");
    expect(medication[0].summary).toMatch(/Sumatriptan: 4 Einnahmen/);
    expect(medication[0].summary).toMatch(/Ibuprofen: 2 Einnahmen/);
    expect(medication[0].summary).toMatch(/Diazepam: 1 Einnahme/);
    expect(medication).toHaveLength(2);
    expect(medication.some((x) => /Gemischte Wirksamkeit|Sumatriptan zeigt Wirkung/i.test(x.title + x.summary))).toBe(false);
  });

  it("keeps Diazepam neutral and removes strong medication wording", () => {
    const r = curateFindingsV22([
      f({ id: "medication.usage_overview", category: "medication_use", section: "medication", title: "Medikamentengebrauch im Zeitraum", summary: "Diazepam: 2 Einnahmen, subjektiv häufig hilfreich bewertet" }),
      f({ id: "d", category: "medication_effect", section: "medication", title: "Diazepam zeigt hohe Wirksamkeit", summary: "Diazepam als Alternative zu Triptanen." }),
    ], ctx);
    const txt = r.findings.map((x) => `${x.title} ${x.summary}`).join("\n");
    expect(txt).toMatch(/Diazepam: 2 Einnahmen, subjektiv häufig hilfreich bewertet/);
    expect(txt).not.toMatch(/Diazepam zeigt hohe Wirksamkeit|Alternative zu Triptan|wirksam/i);
  });

  it("dedupes ME/CFS against details and suppresses heat/weather covered by burden context", () => {
    const r = curateFindingsV22([
      f({ id: "m1", category: "mecfs_energy_pem", section: "mecfs", title: "ME/CFS Belastung", summary: "Lange Belastungshypothese mit PEM-Daten fehlen.", evidenceLevel: "moderate" }),
      f({ id: "wheat", category: "weather", section: "weather", title: "Hitze und Belastung", summary: "Hitze im Kontext von Erschöpfung und fehlender Erholung.", evidenceLevel: "moderate" }),
    ], ctx);
    expect(r.findings.filter((x) => x.category === "mecfs_energy_pem")).toHaveLength(1);
    expect(r.findings.find((x) => x.id === "wheat")).toBeUndefined();
    expect(r.findings.map((x) => x.summary).join(" ")).not.toMatch(/PEM-Daten fehlen|Trigger|Verst[äa]rker/i);
  });

  it("balances doctor questions and keeps triptan trend plus documentation summary", () => {
    const r = curateFindingsV22([
      f({ id: "medication_trend.acute_use_short_term", category: "medication_trend", section: "course_trend", title: "Triptan-Einnahmen zuletzt seltener", summary: "Triptantrend bleibt sichtbar.", evidenceLevel: "moderate" }),
      f({ id: "medication.usage_overview", category: "medication_use", section: "medication", title: "Medikamentengebrauch im Zeitraum", summary: "Sumatriptan: 10 Einnahmen" }),
    ], { analysisV21: { data_basis: { documented_days: 30, pain_days: 28, medication_intake_days: 12, mecfs_energy_days: 17 }, period: { from: "2026-05-01", to: "2026-05-30" } } });
    expect(r.openQuestions).toHaveLength(4);
    expect(r.openQuestions.some((q) => /Kopfschmerzfrequenz/i.test(q))).toBe(true);
    expect(r.openQuestions.some((q) => /Triptan-Zur[üu]ckhaltung/i.test(q))).toBe(true);
    expect(r.openQuestions.some((q) => /[ÜU]bergebrauchsrisiken/i.test(q))).toBe(true);
    expect(r.openQuestions.some((q) => /ME\/CFS/i.test(q))).toBe(true);
    expect(r.findings.some((x) => x.id === "medication_trend.acute_use_short_term")).toBe(true);
    expect(r.findings.some((x) => x.id === "data_quality.diary_coverage")).toBe(true);
  });

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
