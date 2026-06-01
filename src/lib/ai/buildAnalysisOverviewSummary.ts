/**
 * buildAnalysisOverviewSummary
 *
 * Baut einen kurzen, empathischen Fließtext (max. 5–7 Sätze) aus den
 * bereits kuratierten V2.2-Findings und dem analysisV21.data_basis.
 *
 * Wird sowohl in der UI (Sektion "Zusammenfassung" direkt nach der
 * Datenbasis) als auch im kopierbaren Bericht verwendet.
 *
 * Rein deterministisch, ohne LLM-Aufruf.
 */
import type { NormalizedAnalysisFinding } from "./normalizeAnalysisFindings";
import { sanitizeOutputText } from "./analysisOutputPolicy";

export interface OverviewInputs {
  responseJson: unknown;
  findings: NormalizedAnalysisFinding[];
}

function fmtDate(d?: unknown): string | null {
  if (typeof d !== "string") return null;
  try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
}

function findByCategory(
  findings: NormalizedAnalysisFinding[],
  cat: string,
): NormalizedAnalysisFinding | undefined {
  return findings.find((f) => f.category === cat);
}

function findFriendlyDocSummary(
  findings: NormalizedAnalysisFinding[],
): NormalizedAnalysisFinding | undefined {
  return findings.find(
    (f) =>
      f.category === "data_quality" &&
      (f.id === "data_quality.diary_coverage" ||
        /dokumentationsfazit|dokumentationsgrundlage|gute\s+dokumentation/i.test(f.title)),
  );
}

/**
 * Returns a 5–7 sentence Fließtext or null when no analysisV21 is present.
 */
export function buildAnalysisOverviewSummary(
  { responseJson, findings }: OverviewInputs,
): string | null {
  if (!responseJson || typeof responseJson !== "object") return null;
  const v21 = (responseJson as any).analysisV21;
  if (!v21) return null;
  const db = (v21.data_basis ?? {}) as Record<string, unknown>;
  const period = (v21.period ?? {}) as Record<string, unknown>;

  const painDays = Number(db.pain_days);
  const docDays = Number(db.documented_days);
  const mecfsDays = Number(db.mecfs_energy_days);

  const sentences: string[] = [];

  // 1) Schmerzlast im Zeitraum
  const from = fmtDate(period.from);
  const to = fmtDate(period.to);
  if (isFinite(painDays) && isFinite(docDays) && docDays > 0) {
    const ratio = painDays / docDays;
    const tone =
      ratio >= 0.85 ? "sehr hoch"
      : ratio >= 0.6 ? "deutlich erhöht"
      : ratio >= 0.3 ? "moderat"
      : "eher niedrig";
    const periodPart = from && to ? `Im Zeitraum ${from} bis ${to}` : "Im beobachteten Zeitraum";
    sentences.push(
      `${periodPart} war die Schmerzlast ${tone}: An ${painDays} von ${docDays} Tagen wurden Schmerzen dokumentiert.`,
    );
  } else if (from && to) {
    sentences.push(`Im Zeitraum ${from} bis ${to} liegt eine Auswertung der dokumentierten Tage vor.`);
  }

  // 2) Verlauf / Veränderung
  const courseTrend = findByCategory(findings, "course_trend");
  if (courseTrend) {
    const t = courseTrend.title.toLowerCase();
    if (t.includes("seltener")) {
      sentences.push("Im Verlauf wurden die Schmerztage zuletzt etwas seltener.");
    } else if (t.includes("häufiger")) {
      sentences.push("Im Verlauf wurden die Schmerztage zuletzt etwas häufiger.");
    } else if (t.includes("ähnlich") || t.includes("hoch")) {
      sentences.push("Im Verlauf blieb die Schmerzlast ähnlich hoch.");
    } else {
      sentences.push("Für eine belastbare Verlaufsbewertung ist der Zeitraum bisher kurz.");
    }
  }

  // 3) Triptan-/Akutmedikationsentwicklung — Kurzfristtrend (10 vs 10) hat
  // Vorrang vor dem 15-vs-15-Trend; "stabil" wird nur erwähnt, wenn kein
  // Kurzfristtrend Sinnvolles aussagt.
  const triptanShort = findings.find(
    (f) => f.id === "medication_trend.acute_use_short_term",
  );
  const medTrend = findByCategory(findings, "medication_trend");
  const medFinding = triptanShort ?? medTrend;
  if (medFinding) {
    const t = medFinding.title.toLowerCase();
    const shortSummary = (medFinding.summary || "").trim();
    if (triptanShort && shortSummary) {
      sentences.push(shortSummary);
    } else if (t.includes("triptan") && t.includes("seltener")) {
      sentences.push("Triptane wurden zuletzt seltener eingenommen, die Schmerzlast blieb dabei unverändert.");
    } else if (t.includes("seltener")) {
      sentences.push("Die Akutmedikation wurde zuletzt etwas seltener eingenommen.");
    } else if (t.includes("häufiger")) {
      sentences.push("Die Akutmedikation wurde zuletzt etwas häufiger eingenommen.");
    } else if (!triptanShort) {
      // Only mention "stabil" when there is no short-term trend to highlight.
      sentences.push("Die Akutmedikation war im Verlauf weitgehend stabil.");
    }
  }

  // 4) ME/CFS-/Energiehinweis
  const mecfsTrend = findByCategory(findings, "mecfs_energy_trend");
  if (mecfsTrend) {
    const t = mecfsTrend.title.toLowerCase();
    if (t.includes("seltener")) {
      sentences.push("ME/CFS-/Energiesignale wurden zuletzt etwas seltener dokumentiert.");
    } else if (t.includes("häufiger")) {
      sentences.push("ME/CFS-/Energiesignale wurden zuletzt etwas häufiger dokumentiert.");
    } else {
      sentences.push("ME/CFS-/Energiesignale blieben im Verlauf weitgehend ähnlich.");
    }
  } else if (isFinite(mecfsDays) && mecfsDays >= 10) {
    sentences.push("ME/CFS-/Energiesignale wurden über den Zeitraum hinweg regelmäßig dokumentiert.");
  }

  // 5) Wetterhinweis, falls vorhanden
  const weather = findByCategory(findings, "weather");
  if (weather) {
    if (weather.evidenceLevel === "high" || weather.evidenceLevel === "moderate") {
      sentences.push("Wetterveränderungen zeigen in diesem Zeitraum einen erkennbaren Zusammenhang mit den Schmerztagen.");
    } else {
      sentences.push(
        "Wetter kann in diesem Zeitraum eher als möglicher Verstärkungsfaktor betrachtet werden; ein klarer Auslöser lässt sich daraus nicht ableiten.",
      );
    }
  }

  // 6) Dokumentationsfazit
  const docSummary = findFriendlyDocSummary(findings);
  if (docSummary) {
    sentences.push(
      "Die Dokumentation ist insgesamt sehr gut; für feinere Zusammenhänge wären zusätzliche Angaben zu Schlaf, Stress, PEM und Medikamentenwirkung hilfreich.",
    );
  } else if (isFinite(docDays) && docDays > 0) {
    sentences.push(
      "Für feinere Zusammenhänge wären zusätzliche Angaben zu Schlaf, Stress, PEM und Medikamentenwirkung hilfreich.",
    );
  }

  if (sentences.length === 0) return null;

  // Cap to max. 7 sentences for readability, then run the output policy
  // as a safety net so no banned wording (weather coverage counts, voice
  // events, schmerzfreie Vergleichstage, …) can leak into the summary.
  const joined = sentences.slice(0, 7).join(" ");
  const safe = sanitizeOutputText(joined);
  return safe || null;
}
