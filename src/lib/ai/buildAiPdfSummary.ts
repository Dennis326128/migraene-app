/**
 * buildAiPdfSummary
 * -----------------
 * Single Source of Truth for the static AI block in the PDF report.
 *
 * Uses the SAME pipeline as the App KI-Analyse:
 *   normalizeAnalysisFindings → curateFindingsV22 → groupFindingsBySection
 *   + buildAnalysisOverviewSummary
 *
 * Falls back to the legacy `possiblePatterns` shape for older records.
 *
 * Output is intentionally compact and print-friendly:
 *  - one summary paragraph (≤ ~4 sentences)
 *  - max 3 highlights (one short line each)
 *  - max 4 doctor-conversation points
 *
 * It does NOT include expandable details, raw findings, weather
 * narratives or chronobiological prose — those belong to the App UI
 * or to the structured (non-AI) report sections.
 */

import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  type NormalizedAnalysisFinding,
} from "./normalizeAnalysisFindings";
import { curateFindingsV22 } from "./curateFindingsV22";
import { buildAnalysisOverviewSummary } from "./buildAnalysisOverviewSummary";
import { sanitizeOutputText } from "./analysisOutputPolicy";

export interface AiPdfSummary {
  /** Short Fließtext summary, max ~4 sentences. */
  summary: string;
  /** Max 3 highlights — one short line each. */
  highlights: Array<{ title: string; line: string }>;
  /** Max 4 doctor-conversation points. */
  openQuestions: string[];
  /** ISO timestamp the analysis was produced. */
  analyzedAt: string;
  /** Days covered by the analysis. */
  daysAnalyzed: number;
}

const MAX_HIGHLIGHTS = 3;
const MAX_OPEN_QUESTIONS = 4;
const MAX_SUMMARY_SENTENCES = 4;
const MAX_SUMMARY_CHARS = 480;
const MAX_HIGHLIGHT_LINE_CHARS = 220;

// German abbreviations whose trailing dot must NOT be treated as a
// sentence boundary. Lowercased for case-insensitive matching.
const SAFE_ABBREVIATIONS = [
  "vs", "bzw", "ca", "z.b", "u.a", "u.ä", "etc", "ggf",
  "max", "min", "mind", "evtl", "inkl", "exkl", "bspw",
  "nr", "abs", "dr", "prof", "mio", "mrd", "ggü", "sog",
];

const DOT_TOKEN = "§§DOT§§";

function protectDots(text: string): string {
  let t = text;
  // Protect full / partial numeric dates like "2.5.2026", "02.05.", "31.5."
  t = t.replace(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/g, (_m, a, b, c) =>
    c ? `${a}${DOT_TOKEN}${b}${DOT_TOKEN}${c}` : `${a}${DOT_TOKEN}${b}${DOT_TOKEN}`,
  );
  // Protect abbreviations followed by a dot.
  for (const abbr of SAFE_ABBREVIATIONS) {
    const re = new RegExp(`(^|[^\\p{L}])(${abbr.replace(/\./g, "\\.")})\\.`, "giu");
    t = t.replace(re, (_m, pre, word) => `${pre}${word}${DOT_TOKEN}`);
  }
  // Protect ordinal numbers ("12.", "1.") in the middle of a sentence
  // when followed by a space + lowercase letter (e.g. "am 12. Mai").
  t = t.replace(/(\d{1,2})\.(\s+\p{L})/gu, (_m, n, rest) => `${n}${DOT_TOKEN}${rest}`);
  return t;
}

function unprotectDots(text: string): string {
  return text.split(DOT_TOKEN).join(".");
}

function splitSentences(text: string): string[] {
  const protectedText = protectDots(text.trim());
  const parts = protectedText.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) {
    return [unprotectDots(protectedText)].filter(Boolean);
  }
  return parts.map((p) => unprotectDots(p.trim())).filter(Boolean);
}

function endsWithTerminator(s: string): boolean {
  return /[.!?]$/.test(s.trim());
}

function looksFragmented(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (!endsWithTerminator(t)) return true;
  // Dangling abbreviation/comparator at the end (after stripping terminator).
  const body = t.replace(/[.!?]+$/, "");
  if (/\b(vs|bzw|ca|z\.b|u\.a|etc|ggf|inkl|exkl|bspw|mind|evtl)$/i.test(body)) return true;
  // Unbalanced brackets.
  const opens = (t.match(/[(\[]/g) || []).length;
  const closes = (t.match(/[)\]]/g) || []).length;
  if (opens !== closes) return true;
  // Dangling slash ratio without context ("12/14 vs.").
  if (/\d+\/\d+\s*(vs|bzw)?\.?$/i.test(body)) return true;
  return false;
}

function clip(text: string, maxChars: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

/**
 * Take whole sentences up to the limits. NEVER cut mid-sentence, mid-date,
 * or mid-abbreviation. Returns "" if no full sentence fits — callers must
 * provide a safe fallback in that case.
 */
function truncateSentences(text: string, maxSentences: number, maxChars: number): string {
  if (!text) return "";
  const sentences = splitSentences(text);
  let out = "";
  let count = 0;
  for (const s of sentences) {
    if (count >= maxSentences) break;
    if (looksFragmented(s)) continue;
    const candidate = out ? `${out} ${s}` : s;
    if (candidate.length > maxChars) break;
    out = candidate;
    count++;
  }
  return out.trim();
}

/**
 * Map a finding to a coarse topic so we can deduplicate the highlight
 * list across sections (e.g. burden + course_trend.pain_burden →
 * one slot only). This mirrors the App's compact KI-Analyse priority:
 *   1. burden        (Sehr hohe Schmerzlast)
 *   2. medication    (Triptane/Akutmedikation)
 *   3. mecfs         (ME/CFS- und Energie-Signale)
 */
function topicOf(f: NormalizedAnalysisFinding): string {
  const id = (f.id || "").toLowerCase();
  const cat = (f.category || "").toLowerCase();
  const title = (f.title || "").toLowerCase();
  if (cat === "burden" || id.includes("pain_burden") || title.includes("schmerzlast")) return "burden";
  if (cat === "chronification") return "chronification";
  if (cat.startsWith("medication") || id.includes("acute_use") || id.includes("triptan") || title.includes("triptan") || title.includes("akutmedikation")) return "medication";
  if (cat.startsWith("mecfs") || id.includes("mecfs") || title.includes("me/cfs") || title.includes("energie")) return "mecfs";
  if (cat === "weather") return "weather";
  if (cat === "data_quality") return "data_quality";
  return f.id || cat || title;
}

function pickHighlights(findings: NormalizedAnalysisFinding[]): NormalizedAnalysisFinding[] {
  const grouped = groupFindingsBySection(findings);
  const ordered: NormalizedAnalysisFinding[] = [];
  const seen = new Set<string>();
  const push = (arr: NormalizedAnalysisFinding[] | undefined) => {
    for (const f of arr ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      ordered.push(f);
    }
  };
  // strongest first, then chronification / medication if present, then weaker
  push(grouped.strongest);
  push(grouped.course_trend);
  push(grouped.medication);
  push(grouped.mecfs);
  push(grouped.weather);
  push(grouped.weaker);

  const rank: Record<NormalizedAnalysisFinding["evidenceLevel"], number> = {
    high: 3, moderate: 2, low: 1, insufficient: 0,
  };
  const topicPriority: Record<string, number> = {
    burden: 5,
    chronification: 4,
    medication: 3,
    mecfs: 2,
    weather: 1,
    data_quality: 0,
  };
  const sorted = ordered.sort((a, b) => {
    const evDiff = rank[b.evidenceLevel] - rank[a.evidenceLevel];
    if (evDiff !== 0) return evDiff;
    return (topicPriority[topicOf(b)] ?? -1) - (topicPriority[topicOf(a)] ?? -1);
  });

  // Deduplicate by topic — keep the strongest representative per topic
  // so we don't waste a slot on a near-duplicate (e.g. "Sehr hohe
  // Schmerzlast" + "Schmerzlast bleibt ähnlich").
  const seenTopic = new Set<string>();
  const deduped: NormalizedAnalysisFinding[] = [];
  for (const f of sorted) {
    const t = topicOf(f);
    if (seenTopic.has(t)) continue;
    seenTopic.add(t);
    deduped.push(f);
  }
  return deduped
    .slice(0, MAX_HIGHLIGHTS);
}

function safeSummaryFallback(daysAnalyzed: number): string {
  return daysAnalyzed > 0
    ? `Im analysierten ${daysAnalyzed}-Tage-Zeitraum wurden die dokumentierten Daten ausgewertet.`
    : "Im analysierten Zeitraum wurden die dokumentierten Daten ausgewertet.";
}

function safeHighlightLine(raw: string): string {
  const t = truncateSentences(raw, 1, MAX_HIGHLIGHT_LINE_CHARS);
  if (!t || looksFragmented(t)) return "";
  return t;
}

/**
 * PDF-spezifischer Kurzfazit — qualitativ statt zahlenlastig.
 *
 * Die klinische Kernübersicht auf Seite 1 enthält bereits alle Kernzahlen
 * (Kopfschmerztage/30T, Triptan-Tage/30T, Ø Schmerzintensität, Doku-Quote,
 * Donut). Der KI-Kurzfazit darf diese Zahlen nicht 1:1 wiederholen, sondern
 * soll qualitativ einordnen, was klinisch relevant ist.
 *
 * Bewusst NICHT: "An X von Y Tagen wurden Schmerzen dokumentiert."
 */
function buildPdfSummaryText(
  responseJson: Record<string, unknown>,
  findings: NormalizedAnalysisFinding[],
  daysAnalyzed: number,
): string {
  const v21 = (responseJson as any).analysisV21;
  const db: Record<string, unknown> = v21?.data_basis ?? {};
  const painDays = Number(db.pain_days);
  const docDays = Number(db.documented_days);

  const parts: string[] = [];

  // 1) Qualitative Schmerzlast — OHNE Rohzahlen.
  if (isFinite(painDays) && isFinite(docDays) && docDays > 0) {
    const ratio = painDays / docDays;
    if (ratio >= 0.85) {
      parts.push(
        "Die dokumentierten Daten zeigen eine sehr hohe und über den Zeitraum stabile Kopfschmerzlast.",
      );
    } else if (ratio >= 0.6) {
      parts.push("Die Kopfschmerzlast war im analysierten Zeitraum deutlich erhöht.");
    } else if (ratio >= 0.3) {
      parts.push("Die Kopfschmerzlast war im analysierten Zeitraum moderat ausgeprägt.");
    } else {
      parts.push("Die Kopfschmerzlast war im analysierten Zeitraum eher niedrig.");
    }
  }

  // 2) Akutmedikations-Trend — qualitativ, kein Vergleichsfenster.
  const medTrend = findings.find(
    (f) => topicOf(f) === "medication" && (f.category || "").includes("trend"),
  );
  if (medTrend) {
    const t = (medTrend.title || "").toLowerCase();
    if (t.includes("seltener")) {
      parts.push("Die Akutmedikation wurde zuletzt etwas zur\u00FCckhaltender eingesetzt.");
    } else if (t.includes("h\u00E4ufiger")) {
      parts.push("Die Akutmedikation wurde zuletzt etwas h\u00E4ufiger eingesetzt.");
    }
  }

  // 3) ME/CFS-/Energiesignale — kurze qualitative Ergänzung.
  const mecfs = findings.find((f) => topicOf(f) === "mecfs");
  if (mecfs) {
    parts.push(
      "Zus\u00E4tzlich liegen regelm\u00E4\u00DFige Energiesignale vor, die f\u00FCr die Gesamtbelastung relevant sein k\u00F6nnen.",
    );
  }

  if (parts.length === 0) return safeSummaryFallback(daysAnalyzed);
  // Max 3 Sätze – kompakt für unter-60-Sekunden-Lesen.
  return parts.slice(0, 3).join(" ");
}

/**
 * Arztorientierte Highlight-Overrides. Die Roh-Findings können wörtliche
 * Statistik-Sätze enthalten ("28 von 30 Tagen…"). Im PDF wollen wir
 * stattdessen eine kurze klinische Einordnung pro Topic.
 */
function doctorHighlightOverride(
  f: NormalizedAnalysisFinding,
): { title: string; line: string } | null {
  switch (topicOf(f)) {
    case "burden":
      return {
        title: "Hohe Kopfschmerzfrequenz",
        line: "\u00C4rztliche Einordnung im Hinblick auf eine m\u00F6gliche chronische Verlaufsform sinnvoll.",
      };
    case "chronification":
      return {
        title: "Chronifizierungsrisiko",
        line: "\u00C4rztliche Einordnung im Hinblick auf eine m\u00F6gliche chronische Verlaufsform sinnvoll.",
      };
    case "medication":
      return {
        title: "Akutstrategie pr\u00FCfen",
        line: "Die Eintr\u00E4ge deuten auf eine ver\u00E4nderte Akutstrategie hin \u2013 Triptan-/Schmerzmittel-Gebrauch sollte besprochen werden.",
      };
    case "mecfs":
      return {
        title: "ME/CFS- und Energie-Signale",
        line: "Regelm\u00E4\u00DFige Energiesignale k\u00F6nnen f\u00FCr die Gesamtbelastung relevant sein und sollten besprochen werden.",
      };
    default:
      return null;
  }
}

function buildFromV21(responseJson: Record<string, unknown>): AiPdfSummary | null {
  const raw = normalizeAnalysisFindings(responseJson);
  const curated = curateFindingsV22(raw, responseJson);
  const scope = (responseJson.scope as { daysAnalyzed?: number } | undefined) ?? {};
  const days = scope.daysAnalyzed ?? 0;

  // PDF-Kurzfazit: qualitativ, dedupe-frei gegenüber Seite 1.
  // Fallback-Kette: PDF-Text → App-Overview → LLM-summary → safeFallback.
  let summary = sanitizeOutputText(
    truncateSentences(
      buildPdfSummaryText(responseJson, curated.findings, days),
      MAX_SUMMARY_SENTENCES,
      MAX_SUMMARY_CHARS,
    ),
  );
  if (!summary) {
    const overview = buildAnalysisOverviewSummary({
      responseJson,
      findings: curated.findings,
    });
    const fallbackSrc =
      overview || (typeof responseJson.summary === "string" ? responseJson.summary : "");
    summary = sanitizeOutputText(
      truncateSentences(fallbackSrc, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_CHARS),
    );
  }
  if (!summary) summary = safeSummaryFallback(days);

  const top = pickHighlights(curated.findings);
  const highlights = top.map((f) => {
    const override = doctorHighlightOverride(f);
    if (override) {
      return {
        title: sanitizeOutputText(clip(override.title, 80)),
        line: sanitizeOutputText(clip(override.line, MAX_HIGHLIGHT_LINE_CHARS)),
      };
    }
    return {
      title: sanitizeOutputText(clip(f.title, 80)),
      line: sanitizeOutputText(safeHighlightLine(f.summary)),
    };
  });

  const openQuestions = curated.openQuestions
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((q) => sanitizeOutputText(clip(q, 200)));

  if (!summary && highlights.length === 0 && openQuestions.length === 0) return null;

  const meta = (responseJson.meta as { analyzedAt?: string } | undefined) ?? {};

  return {
    summary,
    highlights,
    openQuestions,
    analyzedAt: meta.analyzedAt ?? "",
    daysAnalyzed: days,
  };
}

function buildFromLegacy(responseJson: Record<string, unknown>): AiPdfSummary | null {
  const summaryRaw = typeof responseJson.summary === "string" ? responseJson.summary : "";
  const patterns = Array.isArray((responseJson as any).possiblePatterns)
    ? ((responseJson as any).possiblePatterns as Array<{ title?: string; description?: string; evidenceStrength?: string }>)
    : [];
  if (!summaryRaw && patterns.length === 0) return null;

  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sorted = [...patterns].sort(
    (a, b) => (rank[b.evidenceStrength ?? "low"] ?? 0) - (rank[a.evidenceStrength ?? "low"] ?? 0),
  );

  const highlights = sorted.slice(0, MAX_HIGHLIGHTS).map((p) => ({
    title: sanitizeOutputText(clip(String(p.title ?? ""), 80)),
    line: sanitizeOutputText(safeHighlightLine(String(p.description ?? ""))),
  }));

  const openQuestions = (Array.isArray((responseJson as any).openQuestions)
    ? ((responseJson as any).openQuestions as string[])
    : []
  )
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((q) => sanitizeOutputText(clip(q, 200)));

  const meta = (responseJson.meta as { analyzedAt?: string } | undefined) ?? {};
  const scope = (responseJson.scope as { daysAnalyzed?: number } | undefined) ?? {};
  const days = scope.daysAnalyzed ?? 0;

  let summary = sanitizeOutputText(truncateSentences(summaryRaw, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_CHARS));
  if (!summary) summary = safeSummaryFallback(days);

  return {
    summary,
    highlights,
    openQuestions,
    analyzedAt: meta.analyzedAt ?? "",
    daysAnalyzed: days,
  };
}

/**
 * Build the compact PDF AI summary from a stored `response_json` payload.
 * Returns null if nothing renderable is present.
 */
export function buildAiPdfSummary(responseJson: unknown): AiPdfSummary | null {
  if (!responseJson || typeof responseJson !== "object") return null;
  const rj = responseJson as Record<string, unknown>;
  if (rj.analysisV21) {
    const v21 = buildFromV21(rj);
    if (v21) return v21;
  }
  return buildFromLegacy(rj);
}
