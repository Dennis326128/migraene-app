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
  return ordered
    .sort((a, b) => rank[b.evidenceLevel] - rank[a.evidenceLevel])
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

function buildFromV21(responseJson: Record<string, unknown>): AiPdfSummary | null {
  const raw = normalizeAnalysisFindings(responseJson);
  const curated = curateFindingsV22(raw, responseJson);
  const overview = buildAnalysisOverviewSummary({
    responseJson,
    findings: curated.findings,
  });
  const summarySource = overview || (typeof responseJson.summary === "string" ? responseJson.summary : "");
  const scope = (responseJson.scope as { daysAnalyzed?: number } | undefined) ?? {};
  const days = scope.daysAnalyzed ?? 0;

  let summary = sanitizeOutputText(truncateSentences(summarySource, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_CHARS));
  if (!summary) summary = safeSummaryFallback(days);

  const top = pickHighlights(curated.findings);
  const highlights = top.map((f) => ({
    title: sanitizeOutputText(clip(f.title, 80)),
    line: sanitizeOutputText(safeHighlightLine(f.summary)),
  }));

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
