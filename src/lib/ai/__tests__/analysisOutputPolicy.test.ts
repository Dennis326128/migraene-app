import { describe, it, expect } from "vitest";
import {
  applyOutputPolicy,
  sanitizeOutputText,
  hasBannedText,
} from "../analysisOutputPolicy";
import type { NormalizedAnalysisFinding } from "../normalizeAnalysisFindings";

function f(over: Partial<NormalizedAnalysisFinding> & { id: string }): NormalizedAnalysisFinding {
  return {
    id: over.id,
    category: over.category ?? "data_quality",
    section: "data_quality",
    title: over.title ?? "T",
    summary: over.summary ?? "S",
    evidenceLevel: over.evidenceLevel ?? "low",
    limitations: over.limitations ?? [],
    recommendedTrackingNext: over.recommendedTrackingNext ?? [],
    doctorDiscussionPoints: over.doctorDiscussionPoints ?? [],
    source: "deterministic",
    shouldShowInDoctorShare: true,
  };
}

describe("analysisOutputPolicy", () => {
  it("removes findings that contain weather coverage counts", () => {
    const r = applyOutputPolicy(
      [
        f({ id: "w", category: "data_quality", title: "Wetterabdeckung",
            summary: "Wetterdaten lagen für 31 von 30 Tagen vor." }),
        f({ id: "k", title: "Krankheitslast", summary: "Hohe Belastung." }),
      ],
      [],
    );
    expect(r.findings.map((x) => x.id)).toEqual(["k"]);
    expect(r.removed.find((x) => x.id === "w")?.reason).toBe("policy_banned_content");
  });

  it("removes Voice/Sprach-event findings", () => {
    const r = applyOutputPolicy(
      [f({ id: "v", title: "Sprachereignisse", summary: "Wenige Sprachnotizen." })],
      [],
    );
    expect(r.findings).toEqual([]);
  });

  it("removes findings referencing fehlende schmerzfreie Vergleichstage", () => {
    const r = applyOutputPolicy(
      [f({ id: "p", title: "Mangel an schmerzfreien Vergleichstagen",
           summary: "Auch beschwerdefreie Tage dokumentieren." })],
      [],
    );
    expect(r.findings).toEqual([]);
  });

  it("strips banned sentences from narrative text", () => {
    const text =
      "Im Zeitraum war die Schmerzlast hoch. " +
      "Wetterdaten lagen für 31 von 30 Tagen vor. " +
      "Bitte ärztlich besprechen.";
    const safe = sanitizeOutputText(text);
    expect(safe).not.toMatch(/31 von 30/);
    expect(safe).not.toMatch(/Wetterdaten lagen/i);
    expect(safe).toMatch(/Schmerzlast hoch/);
    expect(safe).toMatch(/ärztlich besprechen/);
  });

  it("filters banned open questions", () => {
    const r = applyOutputPolicy(
      [],
      [
        "Sollten mehr Sprachnotizen genutzt werden?",
        "Wie wird die aktuelle Triptanstrategie bewertet?",
      ],
    );
    expect(r.openQuestions).toHaveLength(1);
    expect(r.openQuestions[0]).toMatch(/Triptan/);
  });

  it("hasBannedText flags forbidden phrases", () => {
    expect(hasBannedText("Sprachereignisse zählen")).toBe(true);
    expect(hasBannedText("Schmerzlast war hoch")).toBe(false);
  });

  it("drops negative dq cards when friendly summary is present", () => {
    const r = applyOutputPolicy(
      [
        f({ id: "neg", category: "data_quality",
            title: "Unzureichende Dokumentation",
            summary: "Datenlage ungenügend." }),
      ],
      [],
      { hasFriendlyDocSummary: true },
    );
    expect(r.findings).toEqual([]);
    expect(r.removed[0]?.reason).toBe("policy_dq_negative_when_friendly_summary");
  });
});
