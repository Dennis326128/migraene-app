/**
 * analysisOutputPolicy — Single Source of Truth for what may be shown
 * in any analysis output (UI highlights, detailed UI sections, copied
 * report, doctor share, open questions).
 *
 * Everything that is rendered or copied MUST pass through `applyOutputPolicy`
 * (for findings/openQuestions) and/or `sanitizeOutputText` (for free-form
 * narrative text). The policy is deterministic, pure, and category-aware.
 *
 * It exists so a stale stored finding, an LLM hallucination, an old report
 * or a deterministic helper can never leak banned wording back into the
 * user-facing surface area.
 *
 * High-level rules (see project spec):
 *  - never show weather coverage counts ("X von Y Tagen liegen Wetterdaten")
 *    or recommendations to "collect more weather data"
 *  - never show voice/Sprach-event quality complaints
 *  - never show "Mangel an schmerzfreien Vergleichstagen" or
 *    "auch beschwerdefreie Tage dokumentieren"
 *  - never show pauschale "Datenlage unzureichend" / "Mangel an Dokumentation"
 *    style complaints when a friendly documentation summary is present
 *  - never show diagnostic phrasing ("Diagnose", "bereits bestehende
 *    chronische Migräne", …) — the safety rewrite layer in curateFindingsV22
 *    softens this; this policy is the last-line guard.
 *
 * Notes:
 *  - This module intentionally has no React/Supabase imports.
 *  - For free-form narrative we drop full sentences that match a ban
 *    pattern. Findings are dropped whole when title or the bulk of the
 *    summary is banned.
 */

import type { NormalizedAnalysisFinding } from "./normalizeAnalysisFindings";

// ─────────────────────────── Banned patterns ───────────────────────────

/** Always-forbidden phrases regardless of category. */
const BAN_ALWAYS: RegExp[] = [
  // Weather coverage statements
  /Wetterdaten[\s-]?Abdeckung/i,
  /Für\s+\d+\s+von\s+\d+\s+Tagen\s+liegen\s+Wetterdaten/i,
  /Wetterdaten\s+(?:lagen|liegen)\s+für\s+\d+\s+von\s+\d+\s+Tagen/i,
  /Wetterdaten\s+weiter\s+automatisch\s+(?:erfassen|sammeln)/i,
  // Voice / Sprach-events
  /\bSprach[-\s]?(?:ereignis|ereignissen?|notiz|notizen|events?)\b/i,
  /\bVoice[-\s]?(?:Event|Events|Notiz|Notizen|Eintr[aä]g\w*)\b/i,
  /(?:mehr\s+)?Sprach(?:notizen|ereignisse)\s+(?:nutzen|aufnehmen|erfassen)/i,
  // "Schmerzfreie Vergleichstage" pressure
  /Mangel\s+an\s+schmerzfreien/i,
  /fehlend[ae]?\s+schmerzfreie/i,
  /(?:zu\s+wenige?\s+|fast\s+keine\s+)?schmerzfreie\s+Vergleichstage/i,
  /(?:auch\s+)?(?:beschwerde|schmerz)freie\s+Tage\s+(?:zu\s+)?dokumentieren/i,
  // Hard diagnose wording (defense in depth; safety rewrites should already
  // have neutralised these)
  /\bbereits\s+bestehende[rn]?\s+chronische[rn]?\s+Migräne\b/i,
  /\bKriterium\s+für\s+(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/i,
  /\b(?:deutet|spricht)\s+(?:stark\s+)?(?:auf|für)\s+(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/i,
  // Medication timing / effect documentation pressure
  /Medikamenten[-\s]?Einsatzzeitpunkt/i,
  /Einnahmezeitpunkt\s+relativ\s+zum\s+Schmerzbeginn/i,
  /Zeitpunkt\s+der\s+Medikamenteneinnahme/i,
  /\bSchmerzbeginn\b/i,
  /innerhalb\s+der\s+ersten\s+Stunde/i,
  /Wirkung\s+nach\s+1\s+und\s+2\s+Stunden/i,
  /Wirkung\s+nach\s+1\/2\s+Stunden/i,
  /Schmerzreduktion\s+in\s+%/i,
  /(?:fehlende|mangelnde)\s+Dokumentation\s+der\s+Medikamentenwirkung/i,
  /Wirksamkeit\s+der\s+Medikamente\s+nach\s+Einnahme\s+bewerten/i,
  // Technical / process wording must never leak into user-visible text.
  /\bdeterministisch(?:e[rnms]?)?\b/i,
  /\bVoranalyse\b/i,
  /\bDie\s+Analyse\s+zeigt\b/i,
  // Release-Polish: Diazepam darf NIE als Migränetherapie / Triptan-Alternative
  // / „wirksam" / „sehr gut" / „gezielt eingesetzt" beschrieben werden.
  // Sicherheitsnetz unabhängig von LLM-/Legacy-Inhalten.
  /\bDiazepam\b[^.]{0,80}\b(?:hohe?\s+Wirksamkeit|sehr\s+gut|wirkt\s+(?:sehr\s+)?gut|ist\s+wirksam|wirksam(?:e[rsn]?)?)\b/i,
  /\bDiazepam\b[^.]{0,80}\bAlternative\s+zu\s+Triptan/i,
  /\b(?:gezielter?\s+Einsatz|Einsatz)\s+(?:von\s+)?Diazepam\b[^.]{0,80}\bMigr[äa]ne/i,
  /\bDiazepam\b[^.]{0,80}\bMigr[äa]ne(?:behandlung|management|therapie)\b/i,
  /\bDiazepam\b[^.]{0,80}\bzur\s+Migr[äa]nebehandlung\s+geeignet\b/i,
];

/**
 * Soft bans — generic uncertainty / "we'd need more data" boilerplate
 * (Release-Polish). These add no practical value and contradict the
 * "einfach dokumentieren" product goal.
 *
 * Important difference vs BAN_ALWAYS:
 *   - sentences containing these phrases are DROPPED by sanitizeOutputText
 *   - list items containing them are DROPPED by sanitizeFinding
 *   - but a whole finding card is NOT dropped just because the soft phrase
 *     appears in its summary (we still want to keep e.g. a Triptan card,
 *     just without the unnecessary "Gründe nicht aus dem Datensatz" tail).
 */
const BAN_SOFT: RegExp[] = [
  /ohne\s+vollständige\s+Dokumentation/i,
  /fehlende\s+vollständige\s+Dokumentation/i,
  /Verläufe\s+brauchen\s+längere\s+Zeiträume/i,
  /Medikamenten[-\s]?Trend\s+allein/i,
  /Wirksamkeit\s+wird\s+hier\s+nicht\s+bewertet/i,
  /keine\s+Informationen\s+zur\s+Wirksamkeit/i,
  /\bWirksamkeit\s+fehlt\b/i,
  /nicht\s+aus\s+dem\s+Datensatz\s+ersichtlich/i,
  /nicht\s+explizit\s+dokumentiert/i,
  /\bDatenlage\s+erschwert\b/i,
  // Release-Polish (Medikation): keine Mangel-/Pflichtformulierungen
  /Wirk(?:samkeit|ung)[^.]{0,40}nicht\s+detailliert\s+beschrieben/i,
  /Wirk(?:samkeit|ung)\s+kann\s+nicht\s+beurteilt\s+werden/i,
  /Informationen\s+zur\s+zeitlichen\s+Abfolge[^.]{0,40}fehl/i,
  /zeitliche\s+Abfolge\s+der\s+Medikamentenwirkung[^.]{0,40}fehl/i,
  /Dosis\s+und\s+Wirksamkeit\s+(?:überprüfen|prüfen|bewerten)/i,
  /Wirkung\s+(?:bewerten|dokumentieren)\b/i,
  /(?:Wirkung|Wirksamkeit)\s+nach\s+\d+\s*(?:h|Stunden?)\s*(?:bewerten|dokumentieren)?/i,
  /(?:fehlende|keine)\s+Wirkungsdaten/i,
  /\bInformationen\s+fehlen\b/i,
  /\bDokumentiere\s+(?:die\s+)?Wirkung\b/i,
  /\bDokumentiere\s+(?:den\s+)?Einnahmezeitpunkt\b/i,
  /\bDokumentiere\s+(?:die\s+)?Dosis\b/i,
  /\bDokumentiere\s+(?:die\s+)?zeitliche\s+Abfolge\b/i,
  // Release-Polish (Summary): keine "wären zusätzliche Angaben hilfreich" mehr.
  /w[äa]ren\s+zus[äa]tzliche\s+Angaben[^.]{0,120}hilfreich/i,
  /f[üu]r\s+feinere\s+Zusammenh[äa]nge[^.]{0,120}(?:hilfreich|n[öo]tig|erforderlich)/i,
  // Final release polish: generische Einschränkungen ohne Nutzwert.
  /nicht\s+systematisch\s+erfasst/i,
  /nicht\s+immer\s+pr[äa]zise\s+dokumentiert/i,
  /fehl(?:en|t)\s+zur\s+weiteren\s+Absicherung/i,
  /keine\s+detaillierten\s+Schlafdaten/i,
  /Wirk(?:ung|samkeit)\s+nicht\s+detailliert/i,
  /zeitliche\s+Abfolge/i,
  /Tagesfaktoren\s+fehl(?:en|t)/i,
  /detaillierte\s+PEM[-\s]?Daten\s+fehl(?:en|t)/i,
  /nicht\s+eindeutig\s+beweisbar/i,
  /kann\s+nicht\s+umfassend\s+bewertet\s+werden/i,
  /nicht\s+umfassend\s+bewertet\s+werden/i,
];


/** Forbidden only in data_quality findings when a friendly summary exists. */
const BAN_NEGATIVE_DQ: RegExp[] = [
  /\bunzureichende?\s+Dokumentation\b/i,
  /\bMangel\s+an\s+Dokumentation\b/i,
  /\bmacht\s+(?:die\s+)?Analyse\s+unmöglich\b/i,
  /\bDatenlage\s+(?:ist\s+)?ungenügend\b/i,
  /\bDaten\s+nicht\s+ausreichend\b/i,
  /\bTagesfaktoren\s+(?:fehl|kaum|unzureich)/i,
  /\bPEM[-\s]?Daten\s+(?:fehl|unzureich|kaum|mangel)/i,
  /\bMangel\s+an\s+detaillierten\s+PEM/i,
  /\bBelastungs[-\s]?Daten\s+fehlen\b/i,
  /\bSchlaf\s*\/?\s*Stress\s+(?:wird|werden)\s+nicht\s+konsequent/i,
  /\b(?:Schlaf|Stress|Energie)\s+(?:wird|werden)\s+nicht\s+(?:konsequent\s+)?dokumentiert\b/i,
];

/** Technical raw tokens that must never appear in user-visible text. */
const STRIP_TECHNICAL_TOKENS: RegExp[] = [
  /\bdeterministic_finding\b/gi,
  /\bdeterministic\b/gi,
  /\bllm_expanded_findings?\b/gi,
  /\bmedication_use\b/gi,
  /\bmedication_effect\b/gi,
  /\bmecfs_energy_pem\b/gi,
  /\bcourse_trend\b/gi,
  /\bmedication_trend\b/gi,
  /\bmecfs_energy_trend\b/gi,
  /\bdata_quality\b/gi,
  // Bare snake_case identifier with at least one underscore segment
  // (e.g. "medication.diary_coverage", "weather.pressure_drop") — anchored
  // to require a dot AND an underscore to avoid matching natural prose.
  /\b[a-z]{3,}(?:_[a-z0-9]+)+(?:\.[a-z0-9_]+)+\b/g,
  /\b[a-z]{3,}\.[a-z]{3,}(?:_[a-z0-9_]+)+\b/g,
];

export const POLICY_BANNED_PATTERNS = BAN_ALWAYS;

// ─────────────────────────── Text sanitation ───────────────────────────

/**
 * Drops sentences that match any banned pattern. Used as a last-line
 * guard for narrative text (overview summary, copied report).
 */
export function sanitizeOutputText(text: string | null | undefined): string {
  if (!text) return "";
  // Split into sentences but keep the trailing punctuation.
  const parts = text.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => {
    const trimmed = s.trim();
    if (!trimmed) return false;
    for (const re of BAN_ALWAYS) if (re.test(trimmed)) return false;
    for (const re of BAN_SOFT) if (re.test(trimmed)) return false;
    return true;
  });
  const STRIP_RE_LIST = STRIP_TECHNICAL_TOKENS;
  let joined = kept.join(" ");
  // Defensively fix any leaked "X von Y Tagen" weather-coverage phrase.
  joined = joined.replace(
    /Wetterdaten\s+(?:lagen|liegen)\s+für\s+\d+\s+von\s+\d+\s+Tagen\s+vor\.?/gi,
    "",
  );
  for (const re of STRIP_RE_LIST) joined = joined.replace(re, "");
  return joined.replace(/\s{2,}/g, " ").trim();
}

/** Returns true if any HARD-banned phrase appears anywhere in the text. */
export function hasBannedText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const re of BAN_ALWAYS) if (re.test(text)) return true;
  return false;
}

/** Returns true if any soft-banned (boilerplate) phrase appears anywhere. */
export function hasSoftBannedText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const re of BAN_SOFT) if (re.test(text)) return true;
  return false;
}


// ─────────────────────────── Finding policy ───────────────────────────

function findingIsBanned(f: NormalizedAnalysisFinding): boolean {
  const hay = `${f.title}\n${f.summary}`;
  if (hasBannedText(hay)) return true;
  // Special: synthetic "Wetterabdeckung" cards (title or id) are always banned
  if (/wetterabdeckung|weather[_\s-]?coverage/i.test(f.title + " " + f.id)) return true;
  return false;
}

function sanitizeFinding(f: NormalizedAnalysisFinding): NormalizedAnalysisFinding {
  // Drop banned sentences from each text field; if a list item is fully
  // banned (hard OR soft), drop it entirely.
  const keepLine = (s: string) => !!s && !hasBannedText(s) && !hasSoftBannedText(s);
  const cleanSummary = sanitizeOutputText(f.summary);
  return {
    ...f,
    summary: cleanSummary || (hasBannedText(f.summary) || hasSoftBannedText(f.summary) ? "" : f.summary),
    reasoning: f.reasoning ? sanitizeOutputText(f.reasoning) || undefined : undefined,
    limitations: f.limitations.map((l) => sanitizeOutputText(l)).filter(keepLine),
    recommendedTrackingNext: f.recommendedTrackingNext
      .map((l) => sanitizeOutputText(l))
      .filter(keepLine),
    doctorDiscussionPoints: f.doctorDiscussionPoints
      .map((q) => sanitizeOutputText(q))
      .filter(keepLine),
  };
}

export interface PolicyInputs {
  /** True when a friendly "Gute Dokumentationsgrundlage" card is present. */
  hasFriendlyDocSummary?: boolean;
}

export interface PolicyResult {
  findings: NormalizedAnalysisFinding[];
  openQuestions: string[];
  removed: Array<{ id: string; reason: string }>;
}

/**
 * Final filter applied to the curated set right before rendering.
 * Drops banned findings, sanitises remaining text, and removes banned
 * open questions.
 */
export function applyOutputPolicy(
  findings: NormalizedAnalysisFinding[],
  openQuestions: string[],
  inputs: PolicyInputs = {},
): PolicyResult {
  const removed: Array<{ id: string; reason: string }> = [];
  const out: NormalizedAnalysisFinding[] = [];
  for (const raw of findings) {
    if (findingIsBanned(raw)) {
      removed.push({ id: raw.id, reason: "policy_banned_content" });
      continue;
    }
    if (!sanitizeOutputText(raw.summary) && hasSoftBannedText(`${raw.title} ${raw.summary}`)) {
      removed.push({ id: raw.id, reason: "policy_soft_only_content" });
      continue;
    }
    if (
      inputs.hasFriendlyDocSummary &&
      raw.category === "data_quality" &&
      raw.id !== "data_quality.diary_coverage" &&
      BAN_NEGATIVE_DQ.some((re) => re.test(`${raw.title} ${raw.summary}`))
    ) {
      removed.push({ id: raw.id, reason: "policy_dq_negative_when_friendly_summary" });
      continue;
    }
    out.push(sanitizeFinding(raw));
  }
  const cleanQuestions = openQuestions
    .map((q) => sanitizeOutputText(q))
    .filter((q) => !!q && !hasBannedText(q));
  return { findings: out, openQuestions: cleanQuestions, removed };
}
