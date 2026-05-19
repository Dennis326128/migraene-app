/**
 * normalizeAnalysisFindings
 *
 * Unifies findings from three possible sources stored on an `ai_reports`
 * row (or on a live `VoiceAnalysisResult`):
 *
 *  1) `analysisV21.llm_expanded_findings` — preferred, richest.
 *  2) `analysisV21.findings`              — deterministic V2.1 fallback.
 *  3) legacy fields (`possiblePatterns`, `*ContextFindings`) — pre-V2.1.
 *
 * The output is a flat list of `NormalizedAnalysisFinding` plus helpers
 * to group by display section and pick a UI badge variant.
 *
 * Doctor-Share usage filters out findings flagged
 * `should_show_in_doctor_share === false` (V2.1 only — legacy is
 * always shown in App but never reaches the share endpoint).
 */

export type NormalizedEvidenceLevel = "high" | "moderate" | "low" | "insufficient";
export type NormalizedSource = "llm_expanded" | "deterministic" | "legacy";

export interface NormalizedAnalysisFinding {
  id: string;
  category: string;
  /** Human-readable section bucket (de). */
  section: AnalysisSectionKey;
  title: string;
  evidenceLevel: NormalizedEvidenceLevel;
  summary: string;
  reasoning?: string;
  limitations: string[];
  recommendedTrackingNext: string[];
  doctorDiscussionPoints: string[];
  source: NormalizedSource;
  shouldShowInDoctorShare: boolean;
}

export type AnalysisSectionKey =
  | "strongest"
  | "weaker"
  | "medication"
  | "weather"
  | "mecfs"
  | "lifestyle"
  | "symptoms"
  | "time"
  | "interaction"
  | "data_quality"
  | "open_questions"
  | "limits";

export const SECTION_ORDER: AnalysisSectionKey[] = [
  "strongest",
  "weaker",
  "medication",
  "weather",
  "mecfs",
  "lifestyle",
  "symptoms",
  "time",
  "interaction",
  "data_quality",
  "open_questions",
  "limits",
];

export const SECTION_LABEL: Record<AnalysisSectionKey, string> = {
  strongest: "Auffälligste Hinweise",
  weaker: "Weitere mögliche Zusammenhänge",
  medication: "Medikamente & Wirkung",
  weather: "Wetter & Umwelt",
  mecfs: "ME/CFS, Energie & PEM",
  lifestyle: "Schlaf, Stress & Alltag",
  symptoms: "Symptome & Aura",
  time: "Zeitmuster",
  interaction: "Interaktionen",
  data_quality: "Datenqualität",
  open_questions: "Offene Fragen / Arztgespräch",
  limits: "Grenzen der Analyse",
};

const CATEGORY_TO_SECTION: Record<string, AnalysisSectionKey> = {
  burden: "strongest",
  chronification: "strongest",
  medication_use: "medication",
  medication_effect: "medication",
  preventive_course: "medication",
  weather: "weather",
  mecfs_energy_pem: "mecfs",
  sleep: "lifestyle",
  stress_mood: "lifestyle",
  lifestyle_triggers: "lifestyle",
  symptoms_aura: "symptoms",
  cycle_hormonal: "symptoms",
  time_pattern: "time",
  interaction: "interaction",
  data_quality: "data_quality",
  red_flag: "limits",
};

interface NormalizeOptions {
  /** Apply doctor-share filtering (drop findings flagged off). */
  doctorShare?: boolean;
}

export function normalizeAnalysisFindings(
  responseJson: unknown,
  options: NormalizeOptions = {},
): NormalizedAnalysisFinding[] {
  if (!responseJson || typeof responseJson !== "object") return [];
  const rj = responseJson as Record<string, unknown>;
  const v21 = (rj.analysisV21 ?? null) as Record<string, unknown> | null;

  const out: NormalizedAnalysisFinding[] = [];
  const seen = new Set<string>(); // dedup key: category::title-prefix

  const pushIfNew = (f: NormalizedAnalysisFinding) => {
    const key = f.category + "::" + f.title.toLowerCase().slice(0, 80).trim();
    if (seen.has(key)) return;
    if (options.doctorShare && !f.shouldShowInDoctorShare) return;
    seen.add(key);
    out.push(f);
  };

  // 1) LLM expanded
  const expanded = v21 && Array.isArray((v21 as any).llm_expanded_findings)
    ? ((v21 as any).llm_expanded_findings as Array<Record<string, unknown>>)
    : [];
  for (const raw of expanded) {
    const f = mapLLMExpanded(raw);
    if (f) pushIfNew(f);
  }

  // 2) Deterministic V2.1
  const det = v21 && Array.isArray((v21 as any).findings)
    ? ((v21 as any).findings as Array<Record<string, unknown>>)
    : [];
  for (const raw of det) {
    const f = mapDeterministic(raw);
    if (f) pushIfNew(f);
  }

  // 3) Legacy fallback — only when no V2.1 at all
  if (!v21) {
    for (const raw of legacyToNormalized(rj)) pushIfNew(raw);
  }

  return out;
}

export function groupFindingsBySection(
  findings: NormalizedAnalysisFinding[],
): Record<AnalysisSectionKey, NormalizedAnalysisFinding[]> {
  const grouped: Record<AnalysisSectionKey, NormalizedAnalysisFinding[]> = {
    strongest: [], weaker: [], medication: [], weather: [], mecfs: [],
    lifestyle: [], symptoms: [], time: [], interaction: [], data_quality: [],
    open_questions: [], limits: [],
  };
  for (const f of findings) {
    // Promote any high/moderate to "strongest" mirror, demote low/insufficient
    // findings to their topical section. Insufficient stays in data_quality
    // when category is data_quality, otherwise stays in topical section as
    // a "data gap" hint.
    if (f.evidenceLevel === "high" || f.evidenceLevel === "moderate") {
      // Already in topical bucket; also surface under strongest.
      if (f.section !== "strongest") grouped.strongest.push(f);
    }
    if (f.evidenceLevel === "low") {
      grouped.weaker.push(f);
    }
    grouped[f.section].push(f);
  }
  return grouped;
}

export function getEvidenceBadgeVariant(
  level: NormalizedEvidenceLevel,
): { label: string; tone: "strong" | "medium" | "weak" | "gap" } {
  switch (level) {
    case "high": return { label: "deutlicher Hinweis", tone: "strong" };
    case "moderate": return { label: "mehrere Hinweise", tone: "medium" };
    case "low": return { label: "schwacher Hinweis", tone: "weak" };
    case "insufficient":
    default: return { label: "Datenlücke", tone: "gap" };
  }
}

// ───────────────────────── internal mappers ─────────────────────────

function mapLLMExpanded(raw: Record<string, unknown>): NormalizedAnalysisFinding | null {
  const title = strOrEmpty(raw.title);
  const summary = strOrEmpty(raw.summary);
  if (!title || !summary) return null;
  const category = strOrEmpty(raw.category) || "data_quality";
  return {
    id: strOrEmpty(raw.id) || `llm.${category}.${title.slice(0, 16)}`,
    category,
    section: CATEGORY_TO_SECTION[category] ?? "data_quality",
    title,
    evidenceLevel: toEvidence(raw.evidence_level),
    summary,
    reasoning: strOrEmpty(raw.reasoning) || undefined,
    limitations: strArr(raw.limitations),
    recommendedTrackingNext: strArr(raw.recommended_tracking_next),
    doctorDiscussionPoints: strArr(raw.doctor_discussion_points),
    source: "llm_expanded",
    // LLM expanded findings are produced post-consent and may be shared
    // unless category is explicitly red_flag (kept in-app only).
    shouldShowInDoctorShare: category !== "red_flag",
  };
}

function mapDeterministic(raw: Record<string, unknown>): NormalizedAnalysisFinding | null {
  const title = strOrEmpty(raw.title);
  const summary = strOrEmpty(raw.plain_language_summary);
  if (!title || !summary) return null;
  const category = strOrEmpty(raw.category) || "data_quality";
  return {
    id: strOrEmpty(raw.id) || `det.${category}.${title.slice(0, 16)}`,
    category,
    section: CATEGORY_TO_SECTION[category] ?? "data_quality",
    title,
    evidenceLevel: toEvidence(raw.evidence_level),
    summary,
    reasoning: undefined,
    limitations: strArr(raw.limitations),
    recommendedTrackingNext: strArr(raw.recommended_tracking_next),
    doctorDiscussionPoints: strArr(raw.doctor_discussion_points),
    source: "deterministic",
    shouldShowInDoctorShare: (raw as any).should_show_in_doctor_share !== false,
  };
}

function legacyToNormalized(rj: Record<string, unknown>): NormalizedAnalysisFinding[] {
  const out: NormalizedAnalysisFinding[] = [];
  const patterns = Array.isArray(rj.possiblePatterns) ? rj.possiblePatterns as any[] : [];
  for (const p of patterns) {
    if (!p?.title || !p?.description) continue;
    const ev = p.evidenceStrength === "high" ? "high"
      : p.evidenceStrength === "medium" ? "moderate"
      : "low";
    out.push({
      id: `legacy.pattern.${out.length}`,
      category: "lifestyle_triggers",
      section: ev === "low" ? "weaker" : "strongest",
      title: String(p.title),
      evidenceLevel: ev,
      summary: String(p.description),
      limitations: [],
      recommendedTrackingNext: [],
      doctorDiscussionPoints: [],
      source: "legacy",
      shouldShowInDoctorShare: true,
    });
  }
  return out;
}

// ───────────────────────── helpers ─────────────────────────

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function toEvidence(v: unknown): NormalizedEvidenceLevel {
  return v === "high" || v === "moderate" || v === "low" || v === "insufficient"
    ? v
    : "insufficient";
}
