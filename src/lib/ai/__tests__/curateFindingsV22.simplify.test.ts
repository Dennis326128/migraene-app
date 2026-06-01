import { describe, it, expect } from "vitest";
import { curateFindingsV22 } from "../curateFindingsV22";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";

function f(over: Partial<NormalizedAnalysisFinding> & { id: string }): NormalizedAnalysisFinding {
  return {
    id: over.id,
    category: over.category ?? "data_quality",
    section: over.section ?? "data_quality",
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

// Period 30 days, 28 documented days → coverage 93% → triggers friendly summary
const goodDocCtx = {
  analysisV21: {
    data_basis: { documented_days: 28, pain_days: 12, mecfs_energy_days: 5 },
    period: { from: "2026-05-01", to: "2026-05-30" },
  },
};

describe("curateFindingsV22 — release simplification", () => {
  it("removes medication timing findings via policy guard", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "x", category: "medication_use",
          title: "Fehlende Dokumentation des Medikamenten-Einsatzzeitpunkts",
          summary: "Bitte Einnahmezeitpunkt relativ zum Schmerzbeginn dokumentieren.",
        }),
      ],
      goodDocCtx,
    );
    expect(r.findings.find((x) => x.id === "x")).toBeUndefined();
  });

  it("removes 'mangelnde Dokumentation der Medikamentenwirkung'", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "y", category: "medication_effect",
          title: "Mangelnde Dokumentation der Medikamentenwirkung",
          summary: "Wirksamkeit der Medikamente nach Einnahme bewerten.",
        }),
      ],
      goodDocCtx,
    );
    expect(r.findings.find((x) => x.id === "y")).toBeUndefined();
  });

  it("drops PEM-Mangelkarte when good documentation is present", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "pem", category: "data_quality",
          title: "Mangel an detaillierten PEM-Daten",
          summary: "Belastungs-Daten fehlen.",
        }),
      ],
      goodDocCtx,
    );
    const dq = r.findings.filter((x) => x.category === "data_quality");
    expect(dq).toHaveLength(1);
    expect(dq[0].id).toBe("data_quality.diary_coverage");
  });

  it("injects exactly one friendly Dokumentationsfazit at ≥80%", () => {
    const r = curateFindingsV22([], goodDocCtx);
    const friendly = r.findings.filter((x) => x.id === "data_quality.diary_coverage");
    expect(friendly).toHaveLength(1);
    expect(friendly[0].title).toBe("Gute Dokumentationsgrundlage");
    expect(friendly[0].recommendedTrackingNext).toEqual([
      "Aktuelle Dokumentationsroutine beibehalten.",
    ]);
  });

  it("strips ALL recommendedTrackingNext from non-DQ findings on good documentation", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "burden", category: "burden", section: "strongest",
          title: "Sehr hohe Schmerzlast", summary: "Hoch.",
          recommendedTrackingNext: [
            "Einnahmezeitpunkt dokumentieren",
            "Tägliche Schlafqualität erfassen",
            "Prozent Schmerzreduktion notieren",
            "Trigger-Notizen weiter führen",
          ],
        }),
      ],
      goodDocCtx,
    );
    const burden = r.findings.find((x) => x.id === "burden");
    expect(burden?.recommendedTrackingNext).toEqual([]);
  });

  it("keeps the Dokumentationsfazit's own 'Routine beibehalten' tracking line", () => {
    const r = curateFindingsV22([], goodDocCtx);
    const friendly = r.findings.find((x) => x.id === "data_quality.diary_coverage");
    expect(friendly?.recommendedTrackingNext).toEqual([
      "Aktuelle Dokumentationsroutine beibehalten.",
    ]);
  });

  it("strips technical raw tokens from text via policy sanitation", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "tech", category: "burden", section: "strongest",
          title: "Belastung hoch",
          summary: "Quelle: deterministic_finding und medication_use ausgewertet. Hoch.",
        }),
      ],
      goodDocCtx,
    );
    const t = r.findings.find((x) => x.id === "tech");
    expect(t?.summary).not.toMatch(/deterministic_finding/);
    expect(t?.summary).not.toMatch(/medication_use/);
  });

  it("keeps medication/triptan trend findings unaffected", () => {
    const r = curateFindingsV22(
      [
        f({
          id: "trip", category: "medication_use",
          title: "Triptan-Kurzfristtrend", summary: "Triptantage gesunken.",
          evidenceLevel: "moderate",
        }),
      ],
      goodDocCtx,
    );
    expect(r.findings.find((x) => x.id === "trip")).toBeDefined();
  });
});
