/**
 * medicationUsageOverview
 *
 * Release-Polish: kompakte „Medikamentengebrauch im Zeitraum"-Übersicht
 * aus tatsächlich dokumentierten Daten (Einnahmen + optionale Wirkungs-
 * bewertungen). Erzeugt KEINE Mangel-Aussagen, wenn Wirkungsdaten fehlen –
 * dann wird die Wirkung schlicht weggelassen.
 *
 * Pure, deterministisch, kein I/O.
 */
import type { AnalysisFinding } from "./analysisTypes";

export interface MedicationIntakeLike {
  medication_name: string;
}

export interface MedicationEffectLike {
  med_name: string;
  effect_score: number | null;
  effect_rating: string | null;
  notes?: string | null;
}

export interface MedicationUsageEntry {
  /** Medikamentenname wie dokumentiert. */
  name: string;
  /** Anzahl Einnahmen im Zeitraum. */
  intakeCount: number;
  /** Anzahl Einnahmen mit Wirkungsbewertung. */
  ratedCount: number;
  /** Mittlere Wirkung auf 0–10 Skala, oder null. */
  avgScore: number | null;
  /** Bis zu 2 kurze Notizschnipsel (≤140 Zeichen), dedupliziert. */
  topNotes: string[];
}

/**
 * Backwards-compat: alte Rating-Strings → 0–10 Score.
 * Bewusst dupliziert (kein Import von utils/medicationEffects um diese
 * AI-Schicht reiner zu halten).
 */
function ratingToScore(rating: string | null | undefined): number | null {
  switch (rating) {
    case "none": return 0;
    case "poor": return 2;
    case "moderate": return 5;
    case "good": return 7;
    case "very_good": return 9;
    default: return null;
  }
}

/**
 * Subjektive Dokumentationsformulierung – KEINE medizinische
 * Wirksamkeitsbehauptung, KEINE numerische Skala in der Ausgabe.
 * Spiegelt nur, was Nutzer:innen selbst dokumentiert haben.
 */
function effectQualitative(avg: number): string {
  if (avg <= 1.5) return "subjektiv ohne klare Wirkung beschrieben";
  if (avg <= 3.5) return "subjektiv wenig hilfreich beschrieben";
  if (avg <= 5.5) return "subjektiv gemischt bewertet";
  if (avg <= 7.5) return "subjektiv überwiegend hilfreich bewertet";
  return "subjektiv häufig hilfreich bewertet";
}

/**
 * Sensible / nicht-standardmäßige Substanzen, die NIE als „wirksam",
 * „Therapie" oder „Alternative" beschrieben werden dürfen — nur neutral
 * spiegeln. Generisch, nicht auf Diazepam beschränkt.
 */
const SENSITIVE_SUBSTANCE_RE =
  /\b(diazepam|lorazepam|alprazolam|oxazepam|clonazepam|bromazepam|tavor|valium|tilidin|tramadol|oxycodon|morphin|fentanyl|codein|zolpidem|zopiclon|pregabalin|gabapentin)\b/i;

function isSensitiveSubstance(name: string): boolean {
  return SENSITIVE_SUBSTANCE_RE.test(name);
}

/**
 * Semantische, abstrahierende Kurz-Zusammenfassung roher Freitextnotizen.
 * Wir zeigen die Originalnotizen NIE roh in der Übersicht — sie sind
 * persönlich, mobil schlecht lesbar und enthalten oft halbe Sätze.
 * Stattdessen werden bis zu 2 thematische Kontext-Tags extrahiert und in
 * einen einzigen kurzen Satz verpackt. Keine Pipe-Zeichen, keine Zitate.
 *
 * Liefert null, wenn keine praktisch relevante Kategorie erkennbar ist —
 * dann erscheint einfach KEIN Notizhinweis (kein Mangel-Wording).
 */
function summarizeNotesSemantic(notes: string[]): string | null {
  if (!notes || notes.length === 0) return null;
  const hay = notes.join(" ").toLowerCase();
  const categories: Array<[RegExp, string]> = [
    [/\b(schlaf|geschlafen|m[üu]de|m[üu]digkeit|ruhe|erholung|entspann|hinleg)/, "Schlaf/Erholung"],
    [/\b(verz[öo]gert|sp[äa]ter\s+(?:wirk|hilf|geholf)|erst\s+sp[äa]ter|nicht\s+sofort|brauchte\s+lange)\b/, "verzögerte Wirkung"],
    [/\b(schnell|sofort|rasch|innerhalb\s+(?:weniger|kurzer))\b/, "schnelle Wirkung"],
    [/\b(triptan[-\s]?(zur[üu]ckhalt|vermeid|gespart|gewartet)|kein(?:e[rn]?)?\s+triptan|verzicht\s+auf\s+triptan|ohne\s+triptan|triptan\s+aufgehoben)\b/, "Triptan-Zurückhaltung"],
    [/\b([üu]belkeit|erbrechen|brechreiz|magen)\b/, "Übelkeit/Magen"],
    [/\b(nebenwirk|schwindel|kreislauf|herzklopfen|benommen)\b/, "Nebenwirkungen"],
    [/\b(stress|arbeit|anspann|aufregung)\b/, "Stress"],
    [/\b(wetter|regen|hitze|warm|kalt|gewitter|druck)\b/, "Wetter"],
  ];
  const tags: string[] = [];
  for (const [re, t] of categories) {
    if (re.test(hay) && !tags.includes(t)) tags.push(t);
    if (tags.length >= 2) break;
  }
  if (tags.length === 0) {
    // Themenliste ist nur Safety-/Hilfslayer. Wenn Notizen vorhanden sind,
    // aber kein bekanntes Thema matcht, gehen sie NICHT verloren – wir
    // spiegeln sie neutral, ohne Rohtext oder Zitate auszugeben.
    return "Weitere dokumentierte Beobachtungen zur Wirkung/Verträglichkeit vorhanden.";
  }
  return `Einzelne Notizen erwähnen ${tags.join(" und ")} als Kontext.`;
}

/**
 * Aggregiert Einnahmen + Wirkungsbewertungen pro Medikament.
 * Listet NUR Medikamente, die tatsächlich Einnahmen im Zeitraum haben.
 */
export function aggregateMedicationUsage(
  intakes: MedicationIntakeLike[],
  effects: MedicationEffectLike[] = [],
): MedicationUsageEntry[] {
  const counts = new Map<string, number>();
  for (const i of intakes) {
    const n = (i.medication_name ?? "").trim();
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  type Slot = { scores: number[]; notes: string[]; rated: number };
  const eff = new Map<string, Slot>();
  for (const e of effects) {
    const name = (e.med_name ?? "").trim();
    if (!name) continue;
    if (!eff.has(name)) eff.set(name, { scores: [], notes: [], rated: 0 });
    const s = eff.get(name)!;
    const score = typeof e.effect_score === "number" && isFinite(e.effect_score)
      ? e.effect_score
      : ratingToScore(e.effect_rating ?? null);
    if (score !== null) {
      s.scores.push(score);
      s.rated++;
    }
    const note = (e.notes ?? "").trim();
    if (note) s.notes.push(note.slice(0, 140));
  }
  const out: MedicationUsageEntry[] = [];
  for (const [name, intakeCount] of counts) {
    const slot = eff.get(name);
    const scores = slot?.scores ?? [];
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    const seen = new Set<string>();
    const topNotes = (slot?.notes ?? [])
      .filter((n) => {
        const k = n.toLowerCase().slice(0, 80);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 2);
    out.push({
      name,
      intakeCount,
      ratedCount: slot?.rated ?? 0,
      avgScore: avg,
      topNotes,
    });
  }
  return out.sort(
    (a, b) => b.intakeCount - a.intakeCount || a.name.localeCompare(b.name),
  );
}

/** Zeitraum-passender Titel ohne Mangel-Aussagen. */
export function medicationUsageOverviewTitle(rangeDays: number): string {
  void rangeDays;
  return "Medikamentengebrauch im Zeitraum";
}

/**
 * Eine einzelne Zeile pro Medikament – Wirkung nur dann, wenn bewertet,
 * und IMMER als subjektive Dokumentation formuliert (keine numerische
 * Skala in der Ausgabe, keine Wirksamkeitsbehauptung).
 *
 * Sensible Substanzen (Benzos, Opioide, …) werden generisch neutral
 * aufgeführt – nie als „wirksam" / „sehr gut" o. ä., auch bei hohem
 * subjektivem Score. Freitextnotizen werden NIE roh wiedergegeben,
 * sondern auf einen kurzen Kontext-Hinweis abstrahiert.
 */
export function formatMedicationUsageLine(m: MedicationUsageEntry): string {
  const head: string[] = [
    `${m.name}: ${m.intakeCount} Einnahme${m.intakeCount === 1 ? "" : "n"}`,
  ];
  if (m.avgScore !== null && m.ratedCount > 0) {
    const qual = isSensitiveSubstance(m.name)
      // Sensible Substanz: neutral spiegeln, nie als „sehr wirksam" beschreiben.
      ? (m.avgScore >= 5.5
          ? "subjektiv häufig hilfreich bewertet"
          : "subjektiv gemischt bewertet")
      : effectQualitative(m.avgScore);
    head.push(qual);
  }
  const main = head.join(", ");
  const noteHint = summarizeNotesSemantic(m.topNotes);
  if (!noteHint) return main.endsWith(".") ? main : `${main}.`;
  const mainWithDot = main.endsWith(".") ? main : `${main}.`;
  const hint = noteHint.trim().endsWith(".") ? noteHint.trim() : `${noteHint.trim()}.`;
  return `${mainWithDot} ${hint}`;
}

/** Kompakte Zusammenfassung als mehrzeiliger Text (für LLM-Prompt + UI). */
export function formatMedicationUsageSummary(items: MedicationUsageEntry[]): string {
  if (items.length === 0) return "";
  return items.slice(0, 8).map(formatMedicationUsageLine).join("\n");
}

/**
 * Baut die deterministische "Medikamentengebrauch im Zeitraum"-Karte.
 * Gibt null zurück, wenn nichts dokumentiert ist → dann erscheint
 * auch keine Karte (kein Mangel-Hinweis).
 */
export function buildMedicationUsageOverviewFinding(
  items: MedicationUsageEntry[],
  rangeDays: number,
): AnalysisFinding | null {
  if (items.length === 0) return null;
  const totalIntakes = items.reduce((s, m) => s + m.intakeCount, 0);
  const totalRated = items.reduce((s, m) => s + m.ratedCount, 0);
  const summary = formatMedicationUsageSummary(items);
  return {
    id: "medication.usage_overview",
    category: "medication_use",
    title: medicationUsageOverviewTitle(rangeDays),
    evidence_level: "moderate",
    doctor_relevance: "high",
    patient_relevance: "high",
    direction: "not_applicable",
    time_window: "rolling_month",
    plain_language_summary: summary,
    deterministic_basis: {
      metric_names: ["medication_intake_count", "medication_rated_count", "unique_medications"],
      numerator: totalIntakes,
      denominator: rangeDays,
      comparison_numerator: totalRated,
      comparison_denominator: totalIntakes,
      effect_label: "not_calculated",
      sample_size_label: totalIntakes >= 10 ? "adequate" : totalIntakes >= 3 ? "limited" : "very_limited",
    },
    limitations: [],
    recommended_tracking_next: [],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  };
}
