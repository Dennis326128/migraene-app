/**
 * curateFindingsV22
 *
 * V2.2 curation pass that runs on top of the normalized V2.1 findings.
 * Pure, deterministic, no I/O.
 *
 * Goals:
 *  - reduce redundancy (chronification > burden, medication_use > triptan
 *    interaction, single-source weather + time pattern),
 *  - hide Voice-event data-quality noise by default,
 *  - rewrite medically unsafe diagnostic phrasing,
 *  - split ME/CFS-"not documented" gap into "PEM details missing" when
 *    ME/CFS scores/levels exist on many days,
 *  - merge & cap data-quality findings,
 *  - cap open questions to the 5 most relevant topics.
 *
 * Bestehende Reports profitieren von der Curation, weil sie nur das
 * Rendering ändert. Eine neue Analyse ist nicht zwingend nötig.
 */
import type { NormalizedAnalysisFinding } from "./normalizeAnalysisFindings";

export interface CurateOptions {
  /** If true, do NOT hide Voice-event data_quality cards. */
  showVoiceQualityNotes?: boolean;
}

export interface CuratedResult {
  findings: NormalizedAnalysisFinding[];
  openQuestions: string[];
  /** Diagnostic: ids of suppressed findings + reason. */
  suppressed: Array<{ id: string; reason: string }>;
}

const MAX_DATA_QUALITY = 3;
const MAX_OPEN_QUESTIONS = 5;
const MAX_STRONGEST = 4;
const MAX_WEAKER = 5;

const SAFETY_REWRITES: Array<[RegExp, string]> = [
  // "erfüllt/erfüllen (die) Kriterien (für|einer|der) chronische(r|n) Migräne"
  [/\berf(?:üllt|üllen)\s+(?:die\s+)?Kriterien(?:\s+(?:für|einer|der))?\s+(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/gi,
    "liegen in einem Bereich, der ärztlich im Hinblick auf chronische Migräne geprüft werden sollte"],
  [/\berf(?:üllt|üllen)\s+(?:die\s+)?Kriterien\b/gi,
    "liegen in einem Bereich, der ärztlich geprüft werden sollte"],
  [/\b(?:ist|sind)\s+chronische\s+Migräne\b/gi,
    "ist vereinbar mit einem Muster, das ärztlich eingeordnet werden sollte"],
  [/\b(?:mögliche\s+)?Diagnose\s+(?:der\s+|einer\s+)?chronische[rn]?\s+Migräne\b/gi,
    "ärztlich abzuklärender Hinweis auf chronische Migräne"],
  [/\bchronische\s+Migräne\s+diagnostiz\w*/gi,
    "ärztlich auf chronische Migräne zu prüfen"],
  // strip misleading "100% Korrelation" wording
  [/\b100\s?%?\s*(?:Korrelation|Übereinstimmung|Trefferquote)\b/gi,
    "auffällige Häufung (Vergleichsbasis schwach)"],
];

function rewriteSafety(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const [re, repl] of SAFETY_REWRITES) out = out.replace(re, repl);
  return out;
}

function applySafetyRewrites(f: NormalizedAnalysisFinding): NormalizedAnalysisFinding {
  return {
    ...f,
    title: rewriteSafety(f.title) ?? f.title,
    summary: rewriteSafety(f.summary) ?? f.summary,
    reasoning: rewriteSafety(f.reasoning),
    limitations: f.limitations.map((l) => rewriteSafety(l) ?? l),
    recommendedTrackingNext: f.recommendedTrackingNext.map((l) => rewriteSafety(l) ?? l),
    doctorDiscussionPoints: f.doctorDiscussionPoints.map((q) => rewriteSafety(q) ?? q),
  };
}

const isVoiceQualityNoise = (f: NormalizedAnalysisFinding): boolean => {
  if (f.category !== "data_quality") return false;
  const hay = (f.title + " " + f.summary).toLowerCase();
  return /\bvoice[\s-]?event|sprach[\s-]?event|voice[\s-]?eintr/i.test(hay);
};

const isTriptanMention = (f: NormalizedAnalysisFinding): boolean => {
  const hay = (f.title + " " + f.summary + " " + (f.reasoning ?? "")).toLowerCase();
  return /triptan/.test(hay);
};

const isWeatherFinding = (f: NormalizedAnalysisFinding) => f.category === "weather";
const isTimePattern = (f: NormalizedAnalysisFinding) => f.category === "time_pattern";
const isBurden = (f: NormalizedAnalysisFinding) => f.category === "burden";
const isChronification = (f: NormalizedAnalysisFinding) => f.category === "chronification";
const isMedUse = (f: NormalizedAnalysisFinding) => f.category === "medication_use";
const isInteraction = (f: NormalizedAnalysisFinding) => f.category === "interaction";

const evidenceRank: Record<NormalizedAnalysisFinding["evidenceLevel"], number> = {
  high: 3, moderate: 2, low: 1, insufficient: 0,
};

function pickBest<T extends NormalizedAnalysisFinding>(items: T[]): T | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])[0];
}

/**
 * Returns ME/CFS day count from the V2.1 data_basis if present.
 * Used to decide whether "ME/CFS nicht dokumentiert" should be rewritten
 * to a PEM-details gap.
 */
function getMecfsDays(responseJson: unknown): number {
  if (!responseJson || typeof responseJson !== "object") return 0;
  const v21 = (responseJson as any).analysisV21;
  const d = v21?.data_basis?.mecfs_energy_days;
  return typeof d === "number" && isFinite(d) ? d : 0;
}

function rewriteMecfsGap(
  f: NormalizedAnalysisFinding,
  mecfsDays: number,
): NormalizedAnalysisFinding {
  if (f.category !== "mecfs_energy_pem") return f;
  if (f.evidenceLevel !== "insufficient") return f;
  if (mecfsDays < 10) return f;
  const txt = (f.title + " " + f.summary).toLowerCase();
  if (!/nicht\s+(?:ausreichend\s+)?dokumentiert|keine\s+ausreichend/i.test(txt)) return f;
  return {
    ...f,
    title: "Belastungs-/PEM-Details fehlen",
    summary:
      `ME/CFS-/Energiesignale liegen an ${mecfsDays} Tagen vor. ` +
      `Für eine PEM-Auswertung fehlen jedoch detaillierte Belastungs- und Erholungsangaben über 24–72 Stunden.`,
    evidenceLevel: "low",
  };
}

export function curateFindingsV22(
  findings: NormalizedAnalysisFinding[],
  responseJson?: unknown,
  options: CurateOptions = {},
): CuratedResult {
  const suppressed: Array<{ id: string; reason: string }> = [];
  const mecfsDays = getMecfsDays(responseJson);

  // 1) Safety rewrite + ME/CFS gap rewrite (always first, so later checks see new text)
  let curated = findings
    .map(applySafetyRewrites)
    .map((f) => rewriteMecfsGap(f, mecfsDays));

  // 2) Voice noise suppression
  if (!options.showVoiceQualityNotes) {
    curated = curated.filter((f) => {
      if (isVoiceQualityNoise(f)) {
        suppressed.push({ id: f.id, reason: "voice_quality_noise" });
        return false;
      }
      return true;
    });
  }

  // 3) Chronification > Burden — drop low-evidence burden if chronification (high/mod) exists
  const hasStrongChronification = curated.some(
    (f) => isChronification(f) && (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  if (hasStrongChronification) {
    curated = curated.filter((f) => {
      if (isBurden(f) && (f.evidenceLevel === "low" || f.evidenceLevel === "moderate")) {
        suppressed.push({ id: f.id, reason: "burden_dedup_by_chronification" });
        return false;
      }
      return true;
    });
  }

  // 4) Medication use > Triptan interaction
  const hasStrongTriptanMedUse = curated.some(
    (f) => isMedUse(f) && isTriptanMention(f) &&
      (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  if (hasStrongTriptanMedUse) {
    curated = curated.filter((f) => {
      if (isInteraction(f) && isTriptanMention(f)) {
        suppressed.push({ id: f.id, reason: "interaction_dedup_by_medication_use" });
        return false;
      }
      return true;
    });
  }

  // 5) Weather single-source — keep best, drop rest
  const weatherItems = curated.filter(isWeatherFinding);
  if (weatherItems.length > 1) {
    const best = pickBest(weatherItems);
    curated = curated.filter((f) => {
      if (!isWeatherFinding(f) || f.id === best?.id) return true;
      suppressed.push({ id: f.id, reason: "weather_single_source" });
      return false;
    });
  }

  // 6) Time pattern single-source
  const timeItems = curated.filter(isTimePattern);
  if (timeItems.length > 1) {
    const best = pickBest(timeItems);
    curated = curated.filter((f) => {
      if (!isTimePattern(f) || f.id === best?.id) return true;
      suppressed.push({ id: f.id, reason: "time_pattern_single_source" });
      return false;
    });
  }

  // 7) Data-quality merge & cap (3): rank by evidence, keep top 3, drop the rest
  const dqAll = curated.filter((f) => f.category === "data_quality");
  if (dqAll.length > MAX_DATA_QUALITY) {
    const keep = new Set(
      [...dqAll]
        .sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])
        .slice(0, MAX_DATA_QUALITY)
        .map((f) => f.id),
    );
    curated = curated.filter((f) => {
      if (f.category !== "data_quality") return true;
      if (keep.has(f.id)) return true;
      suppressed.push({ id: f.id, reason: "data_quality_cap" });
      return false;
    });
  }

  // 8) Open questions: deduplicated + cap to 5, no data_quality items
  const seen = new Set<string>();
  const openQuestions: string[] = [];
  // Priority: high → moderate → low → insufficient
  const prioritized = [...curated].sort(
    (a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel],
  );
  for (const f of prioritized) {
    if (f.category === "data_quality") continue;
    for (const q of f.doctorDiscussionPoints) {
      const k = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      openQuestions.push(q);
      if (openQuestions.length >= MAX_OPEN_QUESTIONS) break;
    }
    if (openQuestions.length >= MAX_OPEN_QUESTIONS) break;
  }

  return { findings: curated, openQuestions, suppressed };
}

/**
 * Apply per-section display caps (strongest 4 / weaker 5) on top of the
 * already-grouped sections. Other sections stay uncapped — they are the
 * "Geprüfte Bereiche" cards and are expected to be compact already.
 */
export function applySectionCaps<T extends { evidenceLevel: NormalizedAnalysisFinding["evidenceLevel"] }>(
  section: "strongest" | "weaker" | "data_quality" | string,
  items: T[],
): T[] {
  const cap =
    section === "strongest" ? MAX_STRONGEST
    : section === "weaker" ? MAX_WEAKER
    : section === "data_quality" ? MAX_DATA_QUALITY
    : null;
  if (cap == null || items.length <= cap) return items;
  return [...items]
    .sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])
    .slice(0, cap);
}

export const __V22_INTERNALS = {
  MAX_DATA_QUALITY, MAX_OPEN_QUESTIONS, MAX_STRONGEST, MAX_WEAKER,
};
