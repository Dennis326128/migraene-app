/**
 * medicationUsageOverview (server mirror)
 *
 * Identische Logik wie src/lib/ai/medicationUsageOverview.ts. Server-Variante
 * lädt aus Doctor-Share-Sicht KEINE Freitext-Notizen, daher hier ohne
 * topNotes-Pfad (notes optional, default leer).
 */
import type { AnalysisFinding } from "./patternPreAnalysis.ts";

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
  name: string;
  intakeCount: number;
  ratedCount: number;
  avgScore: number | null;
  topNotes: string[];
}

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

function effectQualitative(avg: number): string {
  if (avg <= 1.5) return "subjektiv ohne klare Wirkung beschrieben";
  if (avg <= 3.5) return "subjektiv gering wirksam beschrieben";
  if (avg <= 5.5) return "subjektiv gemischt bewertet";
  if (avg <= 7.5) return "subjektiv überwiegend hilfreich bewertet";
  return "subjektiv häufig hilfreich bewertet";
}

function isDiazepam(name: string): boolean {
  return /\bdiazepam\b/i.test(name);
}

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
  type Slot = { scores: number[]; rated: number };
  const eff = new Map<string, Slot>();
  for (const e of effects) {
    const name = (e.med_name ?? "").trim();
    if (!name) continue;
    if (!eff.has(name)) eff.set(name, { scores: [], rated: 0 });
    const s = eff.get(name)!;
    const score = typeof e.effect_score === "number" && isFinite(e.effect_score)
      ? e.effect_score
      : ratingToScore(e.effect_rating ?? null);
    if (score !== null) { s.scores.push(score); s.rated++; }
  }
  const out: MedicationUsageEntry[] = [];
  for (const [name, intakeCount] of counts) {
    const slot = eff.get(name);
    const scores = slot?.scores ?? [];
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    out.push({ name, intakeCount, ratedCount: slot?.rated ?? 0, avgScore: avg, topNotes: [] });
  }
  return out.sort(
    (a, b) => b.intakeCount - a.intakeCount || a.name.localeCompare(b.name),
  );
}

export function medicationUsageOverviewTitle(rangeDays: number): string {
  void rangeDays;
  return "Medikamentengebrauch im Zeitraum";
}

export function formatMedicationUsageLine(m: MedicationUsageEntry): string {
  const parts: string[] = [
    `${m.name}: ${m.intakeCount} Einnahme${m.intakeCount === 1 ? "" : "n"}`,
  ];
  if (m.avgScore !== null && m.ratedCount > 0) {
    const qual = isDiazepam(m.name)
      ? (m.avgScore >= 5.5
          ? "subjektiv häufig hilfreich bewertet"
          : "subjektiv gemischt bewertet")
      : effectQualitative(m.avgScore);
    parts.push(qual);
  }
  return parts.join(", ");
}

export function formatMedicationUsageSummary(items: MedicationUsageEntry[]): string {
  if (items.length === 0) return "";
  return items.slice(0, 8).map(formatMedicationUsageLine).join("\n");
}

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
