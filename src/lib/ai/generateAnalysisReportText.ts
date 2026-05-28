/**
 * generateAnalysisReportText
 *
 * V2.2 stark gekürzter Bericht aus den kuratierten Findings.
 *
 *  - max 3 "Wichtigste Hinweise"
 *  - max 3 Medikamenten-Punkte, ME/CFS max 1, Schlaf/Stress/Alltag max 2,
 *    Datenqualität max 3, Interaktionen nur bei high-evidence
 *  - pro Finding: Titel, Evidenz, 1–2 Sätze, optional 1 Einschränkung,
 *    optional 1 Dokumentationshinweis. Kein reasoning, keine
 *    doctor_discussion_points pro Karte (die landen separat unter
 *    "Offene Fragen für Ärzt:innen", gekappt auf 5).
 *  - "Grenzen der Analyse" enthält IMMER nur den ruhigen Standardtext.
 *  - Leere Sektionen werden komplett weggelassen (kein
 *    "Keine Auffälligkeiten oder Datenlücken dokumentiert.")
 *  - Legacy-Reports werden weiterhin vom Legacy-Renderer ausgegeben.
 */

import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  type NormalizedAnalysisFinding,
  type AnalysisSectionKey,
} from "./normalizeAnalysisFindings";
import { curateFindingsV22 } from "./curateFindingsV22";
import { buildAnalysisOverviewSummary } from "./buildAnalysisOverviewSummary";

const EVIDENCE_LABEL = {
  high: "starker Hinweis",
  moderate: "mehrere Hinweise",
  low: "schwacher Hinweis",
  insufficient: "Datenlücke",
} as const;

const evidenceRank: Record<NormalizedAnalysisFinding["evidenceLevel"], number> = {
  high: 3, moderate: 2, low: 1, insufficient: 0,
};

/** Pro-Sektion harte Caps für den Bericht (Anzeige weiter unverändert). */
const REPORT_SECTION_CAPS: Partial<Record<AnalysisSectionKey, number>> = {
  strongest: 3,
  course_trend: 2,
  weaker: 3,
  medication: 3,
  weather: 1,
  mecfs: 1,
  lifestyle: 2,
  symptoms: 1,
  time: 1,
  interaction: 2,
  data_quality: 1,
};

const SECTION_TITLES: Array<{ key: AnalysisSectionKey; title: string }> = [
  { key: "strongest", title: "Wichtigste Hinweise" },
  { key: "course_trend", title: "Verlauf & Veränderung" },
  { key: "medication", title: "Medikamente & Wirkung" },
  { key: "weather", title: "Wetter & Umwelt" },
  { key: "mecfs", title: "ME/CFS, Energie & PEM" },
  { key: "lifestyle", title: "Schlaf, Stress & Alltag" },
  { key: "symptoms", title: "Symptome & Aura" },
  { key: "time", title: "Zeitmuster" },
  { key: "interaction", title: "Interaktionen" },
  { key: "weaker", title: "Weitere mögliche Zusammenhänge" },
  { key: "data_quality", title: "Dokumentationsfazit" },
];

const LIMITS_DISCLAIMER =
  "Diese Analyse ersetzt keine ärztliche Beurteilung. Sie zeigt Hinweise " +
  "aus dokumentierten Daten und keine Diagnosen. Besonders Wetter-, " +
  "Trigger- und PEM-Zusammenhänge bleiben eingeschränkt, wenn " +
  "Vergleichstage oder Detaildaten fehlen.";

export function generateAnalysisReportText(responseJson: unknown): string {
  if (!responseJson || typeof responseJson !== "object") return "";
  const rj = responseJson as Record<string, unknown>;
  if (rj.analysisV21) return buildV21Report(rj);
  return buildLegacyReport(rj);
}

// ───────────────────────────── V2.2 ─────────────────────────────

function buildV21Report(rj: Record<string, unknown>): string {
  const raw = normalizeAnalysisFindings(rj);
  const curated = curateFindingsV22(raw, rj);
  const grouped = groupFindingsBySection(curated.findings);
  const openQuestions = curated.openQuestions.slice(0, 5);

  const lines: string[] = [];
  lines.push("KI-Analyse – keine Diagnose");
  lines.push("");

  let idx = 1;

  // 1. Zusammenfassung (deterministischer Fließtext, max. 5–7 Sätze)
  const overview = buildAnalysisOverviewSummary({ responseJson: rj, findings: curated.findings });
  if (overview) {
    lines.push(`${idx}. Zusammenfassung`);
    lines.push(overview);
    lines.push("");
    idx++;
  }

  // 1b. Optionales LLM-Kurzfazit (nur falls separat geliefert)
  const summary = typeof rj.summary === "string" ? rj.summary.trim() : "";
  if (summary && !overview) {
    lines.push(`${idx}. Kurzfazit`);
    lines.push(truncateSentences(summary, 3, 360));
    lines.push("");
    idx++;
  }

  // 2..N: Findings sections — nur ausgeben wenn Items vorhanden
  for (const sec of SECTION_TITLES) {
    let items = dedupItems(grouped[sec.key] ?? []);

    // Interaktionen nur, wenn wirklich starker Hinweis dabei ist.
    if (sec.key === "interaction") {
      const hasStrong = items.some((f) => f.evidenceLevel === "high");
      if (!hasStrong) items = [];
    }

    // Cap pro Sektion
    const cap = REPORT_SECTION_CAPS[sec.key];
    if (typeof cap === "number" && items.length > cap) {
      items = [...items]
        .sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])
        .slice(0, cap);
    }

    if (items.length === 0) continue;

    lines.push(`${idx}. ${sec.title}`);
    for (const f of items) appendFinding(lines, f);
    lines.push("");
    idx++;
  }

  // Offene Fragen (max 5) — nur ausgeben wenn vorhanden
  if (openQuestions.length > 0) {
    lines.push(`${idx}. Offene Fragen für Ärzt:innen`);
    for (const q of openQuestions) lines.push(`• ${q}`);
    lines.push("");
    idx++;
  }

  // Grenzen der Analyse — IMMER nur Standardtext, nie Findings auflisten
  lines.push(`${idx}. Grenzen der Analyse`);
  lines.push(LIMITS_DISCLAIMER);
  lines.push("");

  lines.push("---");
  lines.push("Hinweis: mögliche Zusammenhänge – keine medizinische Diagnose.");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function appendFinding(lines: string[], f: NormalizedAnalysisFinding): void {
  const evidence = EVIDENCE_LABEL[f.evidenceLevel];
  lines.push(`• ${f.title} (${evidence})`);
  lines.push(`  ${truncateSentences(f.summary, 2, 240)}`);
  if (f.limitations[0]) lines.push(`  – Einschränkung: ${f.limitations[0]}`);
  if (f.recommendedTrackingNext[0]) {
    lines.push(`  – Nächste Dokumentation: ${f.recommendedTrackingNext[0]}`);
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

function truncateSentences(text: string, maxSentences: number, maxChars: number): string {
  if (!text) return "";
  const parts = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  let out = parts.slice(0, maxSentences).join(" ").trim();
  if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + "…";
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
