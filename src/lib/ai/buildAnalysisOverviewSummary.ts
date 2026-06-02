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

  // 2) Triptan-/Akutmedikationsentwicklung — Kurzfristtrend (10 vs 10) hat
  // Vorrang vor dem 15-vs-15-Trend. Wir übernehmen den ersten Satz aus dem
  // Trend-Finding direkt, weil dieser bereits das verwendete Vergleichs-
  // fenster („in den letzten 10 Tagen…", „in der zweiten Hälfte…") nennt.
  const triptanShort = findings.find(
    (f) => f.id === "medication_trend.acute_use_short_term",
  );
  const medTrend = findByCategory(findings, "medication_trend");
  const medFinding = triptanShort ?? medTrend;
  if (medFinding) {
    const first = firstSentence(medFinding.summary);
    if (first) {
      sentences.push(first);
    } else if (!triptanShort) {
      sentences.push("Die Akutmedikation war im Verlauf weitgehend stabil.");
    }
  }

  // 3) ME/CFS-/Energiehinweis — gleiches Muster, Fenster-Phrase bleibt erhalten.
  const mecfsTrend = findByCategory(findings, "mecfs_energy_trend");
  if (mecfsTrend) {
    const first = firstSentence(mecfsTrend.summary);
    if (first) {
      sentences.push(first);
    } else {
      sentences.push("ME/CFS-/Energiesignale blieben im Verlauf weitgehend ähnlich.");
    }
  } else if (isFinite(mecfsDays) && mecfsDays >= 10) {
    sentences.push("ME/CFS-/Energiesignale wurden über den Zeitraum hinweg regelmäßig dokumentiert.");
  }

  // 4) Dokumentationsfazit — ruhig, ohne Pflicht- oder Mangelformulierung.
  const docSummary = findFriendlyDocSummary(findings);
  if (docSummary) {
    sentences.push("Die Dokumentation ist insgesamt sehr gut.");
  }

  if (sentences.length === 0) return null;

  // Cap to max. 4 sentences for Summary-first readability, then run the output policy
  // as a safety net so no banned wording (weather coverage counts, voice
  // events, schmerzfreie Vergleichstage, …) can leak into the summary.
  const joined = sentences.slice(0, 4).join(" ");
  const safe = sanitizeOutputText(joined);
  return safe || null;
}
