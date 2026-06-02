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
 * Sentence splitter that does NOT break inside parentheses or after common
 * abbreviations like "vs.", "bzw.", "z. B.", "ca.", "u. a.", "d. h.".
 * Critical: prevents Summary fragments like "(5 vs." being treated as a
 * complete sentence and being glued to the next topic.
 */
const ABBR_TAIL_RE = /\b(?:vs|bzw|z\s?\.?\s?B|ca|u\s?\.?\s?a|d\s?\.?\s?h|i\s?\.?\s?d\s?\.?\s?R|etc|Nr|Mio|Mrd|inkl|exkl|ggf|sog|evtl|bzgl|max|min)\.$/i;

function splitSentencesSmart(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if ((ch === "." || ch === "!" || ch === "?") && depth === 0) {
      const next = text[i + 1];
      if (!next || /\s/.test(next)) {
        const trimmed = buf.trim();
        if (!ABBR_TAIL_RE.test(trimmed)) {
          out.push(trimmed);
          buf = "";
          while (i + 1 < text.length && /\s/.test(text[i + 1])) i++;
        }
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * Validates that a sentence is safe to surface in the Summary:
 *  - balanced parentheses
 *  - ends with a real sentence terminator
 *  - does not end with an abbreviation fragment ("(5 vs.", "ca.")
 *  - does not contain dangling "vs" / "vs." without a comparison value
 */
function isValidSentence(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!/[.!?]$/.test(t)) return false;
  let depth = 0;
  for (const ch of t) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;
  if (ABBR_TAIL_RE.test(t.slice(0, -1) + ".")) return false;
  // Trailing comparison fragment like "(5 vs.)" or "vs.)"
  if (/\bvs\.?\s*\)?\s*[.!?]$/i.test(t)) return false;
  // Open numeric fragment "5 vs.)"
  if (/\d+\s*vs\.?\s*\)?\s*[.!?]$/i.test(t)) return false;
  return true;
}

function firstSafeSentence(s: string | undefined | null): string | null {
  if (!s) return null;
  const parts = splitSentencesSmart(s.trim());
  for (const p of parts) {
    if (isValidSentence(p)) return p;
  }
  return null;
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
    // Prefer the trend's own first sentence when it carries window/quantity
    // information; otherwise fall back to a title-driven phrasing so the
    // summary stays informative even for legacy/short summaries.
    if (first && first.length >= 20 && /(Tagen|Hälfte|Monat|davor|seltener|häufiger|stabil|hoch|niedriger)/i.test(first)) {
      sentences.push(first);
    } else {
      const t = medFinding.title.toLowerCase();
      const hay = `${medFinding.title} ${medFinding.summary}`.toLowerCase();
      if (hay.includes("seltener") && hay.includes("triptan")) {
        sentences.push("Triptane wurden zuletzt etwas seltener dokumentiert.");
      } else if (t.includes("seltener")) {
        sentences.push("Die Akutmedikation wurde zuletzt etwas seltener dokumentiert.");
      } else if (t.includes("häufiger")) {
        sentences.push("Die Akutmedikation wurde zuletzt etwas häufiger dokumentiert.");
      } else if (!triptanShort) {
        sentences.push("Die Akutmedikation war im Verlauf weitgehend stabil.");
      }
    }
  }

  // 3) ME/CFS-/Energiehinweis — gleiches Muster, Fenster-Phrase bleibt erhalten.
  const mecfsTrend = findByCategory(findings, "mecfs_energy_trend");
  if (mecfsTrend) {
    const first = firstSentence(mecfsTrend.summary);
    if (first && first.length >= 20 && /(Tagen|Hälfte|Monat|davor|seltener|häufiger|stabil)/i.test(first)) {
      sentences.push(first);
    } else {
      const t = mecfsTrend.title.toLowerCase();
      if (t.includes("seltener")) {
        sentences.push("ME/CFS-/Energiesignale wurden zuletzt etwas seltener dokumentiert.");
      } else if (t.includes("häufiger")) {
        sentences.push("ME/CFS-/Energiesignale wurden zuletzt etwas häufiger dokumentiert.");
      } else {
        sentences.push("ME/CFS-/Energiesignale blieben im Verlauf weitgehend ähnlich.");
      }
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
