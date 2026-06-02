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

function clip(text: string, maxChars: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function truncateSentences(text: string, maxSentences: number, maxChars: number): string {
  if (!text) return "";
  const parts = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  return clip(parts.slice(0, maxSentences).join(" ").trim(), maxChars);
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

function buildFromV21(responseJson: Record<string, unknown>): AiPdfSummary | null {
  const raw = normalizeAnalysisFindings(responseJson);
  const curated = curateFindingsV22(raw, responseJson);
  const overview = buildAnalysisOverviewSummary({
    responseJson,
    findings: curated.findings,
  });
  const summarySource = overview || (typeof responseJson.summary === "string" ? responseJson.summary : "");
  const summary = sanitizeOutputText(truncateSentences(summarySource, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_CHARS));

  const top = pickHighlights(curated.findings);
  const highlights = top.map((f) => ({
    title: sanitizeOutputText(clip(f.title, 80)),
    line: sanitizeOutputText(truncateSentences(f.summary, 1, MAX_HIGHLIGHT_LINE_CHARS)),
  }));

  const openQuestions = curated.openQuestions
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((q) => sanitizeOutputText(clip(q, 200)));

  if (!summary && highlights.length === 0 && openQuestions.length === 0) return null;

  const meta = (responseJson.meta as { analyzedAt?: string } | undefined) ?? {};
  const scope = (responseJson.scope as { daysAnalyzed?: number } | undefined) ?? {};

  return {
    summary,
    highlights,
    openQuestions,
    analyzedAt: meta.analyzedAt ?? "",
    daysAnalyzed: scope.daysAnalyzed ?? 0,
  };
}

function buildFromLegacy(responseJson: Record<string, unknown>): AiPdfSummary | null {
  const summary = typeof responseJson.summary === "string" ? responseJson.summary : "";
  const patterns = Array.isArray((responseJson as any).possiblePatterns)
    ? ((responseJson as any).possiblePatterns as Array<{ title?: string; description?: string; evidenceStrength?: string }>)
    : [];
  if (!summary && patterns.length === 0) return null;

  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sorted = [...patterns].sort(
    (a, b) => (rank[b.evidenceStrength ?? "low"] ?? 0) - (rank[a.evidenceStrength ?? "low"] ?? 0),
  );

  const highlights = sorted.slice(0, MAX_HIGHLIGHTS).map((p) => ({
    title: sanitizeOutputText(clip(String(p.title ?? ""), 80)),
    line: sanitizeOutputText(truncateSentences(String(p.description ?? ""), 1, MAX_HIGHLIGHT_LINE_CHARS)),
  }));

  const openQuestions = (Array.isArray((responseJson as any).openQuestions)
    ? ((responseJson as any).openQuestions as string[])
    : []
  )
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((q) => sanitizeOutputText(clip(q, 200)));

  const meta = (responseJson.meta as { analyzedAt?: string } | undefined) ?? {};
  const scope = (responseJson.scope as { daysAnalyzed?: number } | undefined) ?? {};

  return {
    summary: sanitizeOutputText(truncateSentences(summary, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_CHARS)),
    highlights,
    openQuestions,
    analyzedAt: meta.analyzedAt ?? "",
    daysAnalyzed: scope.daysAnalyzed ?? 0,
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
