/**
 * buildCourseTrendFindings — emits "Verlauf & Veränderung" findings
 * from a deterministic TrendResult. Pure, no I/O.
 *
 * Mirrored 1:1 in supabase/functions/_shared/buildCourseTrendFindings.ts.
 */

import type { TrendResult } from "./trendAnalysis";
import type { AnalysisFinding } from "./analysisTypes";

function sample(n: number): "adequate" | "limited" | "very_limited" | "none" {
  if (n === 0) return "none";
  if (n < 3) return "very_limited";
  if (n < 10) return "limited";
  return "adequate";
}

function evidenceForTrend(documentedDays: number): AnalysisFinding["evidence_level"] {
  if (documentedDays >= 14) return "moderate";
  if (documentedDays >= 7) return "low";
  return "insufficient";
}

export function buildCourseTrendFindings(
  trend: TrendResult | null,
): AnalysisFinding[] {
  if (!trend) return [];
  const out: AnalysisFinding[] = [];
  const { recent, previous, metrics, hasEnoughData, triptanStrategyNote, triptanSignalPresent } = trend;

  // Always emit a "Verlauf & Veränderung" headline finding so the section
  // shows up even when data is short.
  const headLabel =
    !hasEnoughData ? "Verlauf: zu kurzer Vergleichszeitraum"
    : metrics.headache.label === "decreased" ? "Schmerztage zuletzt seltener"
    : metrics.headache.label === "increased" ? "Schmerztage zuletzt häufiger"
    : metrics.headache.label === "stable" ? "Schmerzlast bleibt ähnlich"
    : "Schmerzlast bleibt insgesamt hoch";

  const headSummary = trend.plainLanguage[0] ??
    "Für eine belastbare Trendbewertung ist der Zeitraum zu kurz.";

  out.push({
    id: "course_trend.pain_burden",
    category: "course_trend",
    title: headLabel,
    evidence_level: hasEnoughData ? evidenceForTrend(recent.documentedDays) : "insufficient",
    doctor_relevance: "high",
    patient_relevance: "high",
    direction:
      metrics.headache.label === "increased" ? "increased"
      : metrics.headache.label === "decreased" ? "decreased"
      : metrics.headache.label === "stable" ? "not_applicable"
      : "unclear",
    time_window: "course_phase",
    plain_language_summary: headSummary,
    deterministic_basis: {
      metric_names: ["headache_days_recent", "headache_days_previous", "severe_days_recent", "severe_days_previous"],
      numerator: recent.headacheDays,
      denominator: Math.max(1, recent.documentedDays),
      comparison_numerator: previous.headacheDays,
      comparison_denominator: Math.max(1, previous.documentedDays),
      effect_label: "not_calculated",
      sample_size_label: sample(recent.documentedDays + previous.documentedDays),
    },
    limitations: hasEnoughData
      ? ["Verläufe brauchen längere Zeiträume, um wirklich stabil zu sein."]
      : ["Für einen belastbaren Vergleich werden mindestens zwei dokumentierte Wochen benötigt."],
    recommended_tracking_next: ["Weiter regelmäßig dokumentieren – auch beschwerdefreie Tage."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // Medication trend (only when we actually have any acute med signal in either window).
  const anyMed = recent.medDays + previous.medDays > 0 || triptanSignalPresent;
  if (anyMed) {
    const medSummary = [
      trend.plainLanguage[1],
      triptanStrategyNote ?? null,
    ].filter(Boolean).join(" ");
    const direction: AnalysisFinding["direction"] =
      metrics.med.label === "increased" ? "increased"
      : metrics.med.label === "decreased" ? "decreased"
      : "unclear";
    out.push({
      id: "medication_trend.acute_use",
      category: "medication_trend",
      title: triptanStrategyNote
        ? "Triptan-Einnahmen seltener, Schmerzlast unverändert"
        : metrics.med.label === "decreased" ? "Akutmedikation zuletzt seltener"
        : metrics.med.label === "increased" ? "Akutmedikation zuletzt häufiger"
        : "Akutmedikation im Verlauf stabil",
      evidence_level: hasEnoughData ? evidenceForTrend(recent.documentedDays) : "insufficient",
      doctor_relevance: "high",
      patient_relevance: "high",
      direction,
      time_window: "course_phase",
      plain_language_summary: medSummary ||
        "Verlauf der Akutmedikation: nicht eindeutig genug für eine klare Aussage.",
      deterministic_basis: {
        metric_names: ["med_days_recent", "med_days_previous", "triptan_days_recent", "triptan_days_previous"],
        numerator: recent.medDays,
        denominator: Math.max(1, recent.documentedDays),
        comparison_numerator: previous.medDays,
        comparison_denominator: Math.max(1, previous.documentedDays),
        effect_label: "not_calculated",
        sample_size_label: sample(recent.medDays + previous.medDays),
      },
      limitations: triptanStrategyNote
        ? ["Weniger Triptane bei gleichbleibender Schmerzlast kann auf bewusste Zurückhaltung oder fehlende Wirksamkeit hindeuten – ärztlich zu klären."]
        : ["Medikamenten-Trend allein erlaubt keine Aussage zur Wirksamkeit."],
      recommended_tracking_next: ["Wirksamkeit der Akutmedikation pro Einnahme kurz bewerten."],
      doctor_discussion_points: triptanStrategyNote
        ? ["Veränderte Akutstrategie besprechen – wann Triptan, wann nicht?"]
        : [],
      should_show_in_doctor_share: true,
    });
  }

  // ME/CFS / energy trend — only when signal exists in at least one window.
  if (recent.mecfsDays + previous.mecfsDays > 0) {
    out.push({
      id: "mecfs_energy_trend.signals",
      category: "mecfs_energy_trend",
      title:
        metrics.mecfs.label === "decreased" ? "ME/CFS-/Energiesignale zuletzt seltener"
        : metrics.mecfs.label === "increased" ? "ME/CFS-/Energiesignale zuletzt häufiger"
        : "ME/CFS-/Energiesignale im Verlauf stabil",
      evidence_level: hasEnoughData ? "low" : "insufficient",
      doctor_relevance: "medium",
      patient_relevance: "high",
      direction:
        metrics.mecfs.label === "increased" ? "increased"
        : metrics.mecfs.label === "decreased" ? "decreased"
        : "unclear",
      time_window: "course_phase",
      plain_language_summary: trend.plainLanguage[2] ??
        "ME/CFS-/Energie-Verlauf konnte nicht klar bewertet werden.",
      deterministic_basis: {
        metric_names: ["mecfs_days_recent", "mecfs_days_previous"],
        numerator: recent.mecfsDays,
        denominator: Math.max(1, recent.documentedDays),
        comparison_numerator: previous.mecfsDays,
        comparison_denominator: Math.max(1, previous.documentedDays),
        effect_label: "not_calculated",
        sample_size_label: sample(recent.mecfsDays + previous.mecfsDays),
      },
      limitations: ["Belastungs-/Erholungsdetails (PEM) sind für klare Aussagen zusätzlich nötig."],
      recommended_tracking_next: ["Täglich kurz Energie-Level festhalten."],
      doctor_discussion_points: [],
      should_show_in_doctor_share: true,
    });
  }

  return out;
}
