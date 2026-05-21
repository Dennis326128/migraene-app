/**
 * generateAnalysisReportText
 *
 * Produces the human-readable copy/paste text of a pattern-analysis result.
 *
 *  - When `responseJson.analysisV21` exists, builds the V2.1 report from the
 *    same normalized findings the App UI uses (no duplicated topical text,
 *    no private fields, no legacy sections).
 *  - Otherwise falls back to a minimal legacy renderer that mirrors the
 *    previous in-component formatter (kept compatible with old reports).
 *
 * Pure function — no I/O. Safe for client, server, and tests.
 */

import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  extractOpenQuestions,
  type NormalizedAnalysisFinding,
  type AnalysisSectionKey,
} from "./normalizeAnalysisFindings";

const EVIDENCE_LABEL = {
  high: "starker Hinweis",
  moderate: "mehrere Hinweise",
  low: "schwacher Hinweis",
  insufficient: "Datenlücke",
} as const;

const SECTION_TITLES: Array<{ key: AnalysisSectionKey | "open_questions" | "limits"; title: string; alwaysShow?: boolean }> = [
  { key: "strongest", title: "Wichtigste Hinweise" },
  { key: "medication", title: "Medikamente & Wirkung" },
  { key: "weather", title: "Wetter & Umwelt" },
  { key: "mecfs", title: "ME/CFS, Energie & PEM" },
  { key: "lifestyle", title: "Schlaf, Stress & Alltag" },
  { key: "symptoms", title: "Symptome & Aura" },
  { key: "time", title: "Zeitmuster" },
  { key: "interaction", title: "Interaktionen" },
  { key: "weaker", title: "Weitere mögliche Zusammenhänge" },
  { key: "data_quality", title: "Datenqualität", alwaysShow: true },
  { key: "open_questions", title: "Offene Fragen für Ärzt:innen" },
  { key: "limits", title: "Grenzen der Analyse", alwaysShow: true },
];

export function generateAnalysisReportText(responseJson: unknown): string {
  if (!responseJson || typeof responseJson !== "object") return "";
  const rj = responseJson as Record<string, unknown>;
  if (rj.analysisV21) return buildV21Report(rj);
  return buildLegacyReport(rj);
}

// ───────────────────────────── V2.1 ─────────────────────────────

function buildV21Report(rj: Record<string, unknown>): string {
  const v21 = rj.analysisV21 as Record<string, unknown>;
  const findings = normalizeAnalysisFindings(rj);
  const grouped = groupFindingsBySection(findings);
  const openQuestions = extractOpenQuestions(findings);

  const lines: string[] = [];
  lines.push("KI-Analyse – keine Diagnose");
  lines.push("");

  // 1. Kurzfazit
  const summary = typeof rj.summary === "string" ? rj.summary.trim() : "";
  if (summary) {
    lines.push("1. Kurzfazit");
    lines.push(summary);
    lines.push("");
  }

  // 2–N: Findings sections + open questions + limits
  let idx = summary ? 2 : 1;
  for (const sec of SECTION_TITLES) {
    if (sec.key === "open_questions") {
      if (openQuestions.length === 0 && !sec.alwaysShow) continue;
      lines.push(`${idx}. ${sec.title}`);
      if (openQuestions.length === 0) {
        lines.push("Keine offenen Fragen aus der Analyse abgeleitet.");
      } else {
        for (const q of openQuestions) lines.push(`• ${q}`);
      }
      lines.push("");
      idx++;
      continue;
    }

    const items = dedupItems(grouped[sec.key as AnalysisSectionKey] ?? []);
    if (items.length === 0 && !sec.alwaysShow) continue;
    lines.push(`${idx}. ${sec.title}`);
    if (items.length === 0) {
      lines.push("Keine Auffälligkeiten oder Datenlücken dokumentiert.");
    } else {
      for (const f of items) appendFinding(lines, f);
    }
    lines.push("");
    idx++;
  }

  // Final caution
  const caution = v21.clinical_caution as Record<string, unknown> | undefined;
  const disclaimer = (caution?.emergency_disclaimer as string | undefined)?.trim();
  lines.push("---");
  lines.push(disclaimer || "Hinweis: mögliche Zusammenhänge – keine medizinische Diagnose.");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function appendFinding(lines: string[], f: NormalizedAnalysisFinding): void {
  const evidence = EVIDENCE_LABEL[f.evidenceLevel];
  const isGap = f.evidenceLevel === "insufficient";
  const prefix = isGap ? "Datenlücke" : evidence;
  lines.push(`• ${f.title} (${prefix})`);
  lines.push(`  ${f.summary}`);
  if (f.reasoning && f.reasoning !== f.summary) {
    lines.push(`  ${f.reasoning}`);
  }
  for (const l of f.limitations) lines.push(`  – ${l}`);
  if (f.recommendedTrackingNext.length > 0) {
    lines.push(`  Nächste Dokumentation: ${f.recommendedTrackingNext.join(" · ")}`);
  }
}

function dedupItems(items: NormalizedAnalysisFinding[]): NormalizedAnalysisFinding[] {
  const seen = new Set<string>();
  const out: NormalizedAnalysisFinding[] = [];
  for (const f of items) {
    const key = f.category + "::" + f.title.toLowerCase().slice(0, 80).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// ─────────────────────────── Legacy ───────────────────────────

function buildLegacyReport(rj: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("Mögliche Migräne-Zusammenhänge");
  const summary = typeof rj.summary === "string" ? rj.summary : "";
  const scope = (rj as any).scope?.daysAnalyzed;
  if (typeof scope === "number") lines.push(`Analysezeitraum: ${scope} Tage`);
  lines.push("");

  if (summary) {
    lines.push("Einordnung");
    lines.push(summary);
    lines.push("");
  }

  const patterns = Array.isArray((rj as any).possiblePatterns) ? (rj as any).possiblePatterns : [];
  if (patterns.length > 0) {
    lines.push("Auffälligste Hinweise");
    for (const p of patterns) {
      if (!p?.title || !p?.description) continue;
      const ev = p.evidenceStrength === "high" ? "starker Hinweis"
        : p.evidenceStrength === "medium" ? "mehrere Hinweise"
        : "schwacher Hinweis";
      lines.push(`• ${p.title} (${ev})`);
      lines.push(`  ${p.description}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("Hinweis: Mögliche Zusammenhänge – keine medizinische Diagnose.");
  return lines.join("\n");
}
