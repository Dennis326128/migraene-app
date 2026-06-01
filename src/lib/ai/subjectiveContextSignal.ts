/**
 * subjectiveContextSignal
 *
 * Heuristic to decide whether a finding is grounded in *actively
 * documented user observations* (free notes, structured user comments,
 * medication remarks, ME/CFS comments, lifestyle observations …) or
 * whether it stems only from *automatically collected* data (weather
 * APIs, time-of-day buckets, pressure deltas, etc.).
 *
 * Pure & deterministic. Used by curation to gate which findings may
 * surface as highlights or doctor questions.
 *
 * Intentionally generic — not a closed keyword list. Looks for three
 * families of cues:
 *   (a) verbs of user reporting     ("dokumentiert", "berichtet", …)
 *   (b) artifact references         ("Notiz", "Eintrag", "Kommentar", …)
 *   (c) subjective experience nouns ("Hitze", "Stress", "Termin",
 *       "Sport", "Schlaf", "Ruhe", "Vermeidung", "Belastung", …)
 *
 * A finding counts as "subjective" if it carries cues from family (a)
 * or (b), OR if it carries a sufficiently specific cue from family (c)
 * (i.e. naming a concrete subjective situation, not just a sensor).
 */
import type { NormalizedAnalysisFinding } from "./normalizeAnalysisFindings";

const REPORT_VERB_RE =
  /\b(dokumentiert|erw[äa]hnt|notiert|berichtet|beschrieben|angeg(?:eben|eben)|festgehalten|geschildert|geschrieben|markiert|vermerkt|aktiv\s+(?:angegeben|dokumentiert))\b/i;

const ARTIFACT_RE =
  /\b(notiz|notizen|eintrag|eintr[äa]ge|kommentar|kommentare|tagebuch|freitext|nutzerangabe|nutzerangaben|nutzer(?:in)?\s+(?:hat|gibt|nennt|erw[äa]hnt)|patient(?:in)?\s+(?:hat|gibt|nennt|erw[äa]hnt))\b/i;

/**
 * Concrete subjective experience cues. Kept open-ended (not exhaustive)
 * and grouped so we can extend without rewriting consumers.
 */
const SUBJECTIVE_CUE_RE =
  /\b(hitze|warm|hei[ßs]|k[äa]lte|kalt|gewitter|schw[üu]le|f[öo]hn|wetterwechsel|druckgef[üu]hl|wetterf[üu]hlig|sturm|regen|sonne|licht|l[äa]rm|geruch|stress|hektik|streit|termin|arbeit|alltag|reise|fahrt|sport|laufen|gelaufen|bewegung|aktivit[äa]t|[üu]berlastung|belastung|[üu]berforder|anstrengung|pem|crash|erschöpf|m[üu]de|m[üu]digkeit|energie|ruhe|pause|erholung|entspann|schlaf|schlecht\s+geschlafen|wenig\s+schlaf|durchschlafen|vermeid|verzicht|kein(?:e|en)?\s+triptan|ohne\s+triptan|gegessen|fasten|hunger|dehydr|trinken|wasser|hormon|menstruation|periode|zyklus|linderung|verschlechter|verbesser|hilft|hat\s+geholfen|trigger\s+notiert|trotz\s+schmerzen?)\b/i;

const PRESSURE_ONLY_RE =
  /\b(luftdruck|druck(?:[äa]nderung|abfall|anstieg|delta)|temperatur(?:wert|delta|abfall|anstieg)?\s*°?c?|barometer|hpa)\b/i;

export interface RawEvidenceLike {
  /** Optional concatenated user-text basis (notes, comments) for stronger signal. */
  userText?: string | null;
}

/**
 * Heuristic — see file header.
 *
 * @param f The finding being inspected.
 * @param ev Optional raw evidence (free-text notes etc.) the finding was built from.
 */
export function hasUserObservedContextSignal(
  f: Pick<NormalizedAnalysisFinding, "title" | "summary" | "reasoning"> &
    Partial<Pick<NormalizedAnalysisFinding, "limitations">>,
  ev?: RawEvidenceLike,
): boolean {
  const hay = [
    f.title,
    f.summary,
    f.reasoning ?? "",
    ...(f.limitations ?? []),
    ev?.userText ?? "",
  ]
    .join(" \n ")
    .toLowerCase();

  if (!hay.trim()) return false;
  if (REPORT_VERB_RE.test(hay)) return true;
  if (ARTIFACT_RE.test(hay)) return true;
  if (SUBJECTIVE_CUE_RE.test(hay)) return true;
  return false;
}

/**
 * True when the finding looks like it was built purely from automatic /
 * sensor-style data (weather API, pressure, time-of-day, weekday) with
 * no subjective user observation attached.
 */
export function isAutomaticOnlySignal(
  f: Pick<NormalizedAnalysisFinding, "title" | "summary" | "reasoning" | "category"> &
    Partial<Pick<NormalizedAnalysisFinding, "limitations">>,
  ev?: RawEvidenceLike,
): boolean {
  if (hasUserObservedContextSignal(f, ev)) return false;
  if (f.category === "weather" || f.category === "time_pattern") return true;
  const hay = `${f.title} ${f.summary} ${f.reasoning ?? ""}`.toLowerCase();
  return PRESSURE_ONLY_RE.test(hay);
}

export const __SUBJECTIVE_INTERNALS = {
  REPORT_VERB_RE,
  ARTIFACT_RE,
  SUBJECTIVE_CUE_RE,
  PRESSURE_ONLY_RE,
};
