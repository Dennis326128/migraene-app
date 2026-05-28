/**
 * buildAnalysisReportV21
 *
 * Deterministic builder that turns the existing PreAnalysis + meta into
 * an `AnalysisReportV21`. No LLM, no diagnoses. Findings always present
 * (use `evidence_level: "insufficient"` when data missing).
 */

import type { PreAnalysis } from "@/lib/voice/analysisEngine";
import {
  ANALYSIS_V21_SCHEMA,
  ANALYSIS_V21_VERSION,
  type AnalysisFinding,
  type AnalysisReportV21,
} from "./analysisTypes";
import {
  classifyEvidence,
  coverageRate,
  effectStrengthFromRateDifference,
  sampleSizeLabel,
} from "./evidence";
import { computeDocumentationSummary } from "./documentationSummary";
import {
  computeTrendAnalysis,
  type TrendDayRecord,
} from "./trendAnalysis";
import { buildCourseTrendFindings } from "./buildCourseTrendFindings";

export interface BuildReportV21Input {
  fromISO: string;
  toISO: string;
  timezone?: string;
  daysTotal: number;
  preAnalysis: PreAnalysis;
  meta: {
    totalDays: number;
    voiceEventCount: number;
    painEntryCount: number;
    medicationIntakeCount: number;
    daysWithPain: number;
    daysWithMecfs: number;
  };
  /** Optional deterministic trend day records → "Verlauf & Veränderung". */
  trendDays?: TrendDayRecord[];
}

const NO_DIAGNOSIS_DISCLAIMER =
  "Diese Analyse ersetzt keine ärztliche Beurteilung. Sie liefert Hypothesen aus dokumentierten Daten – keine Diagnosen.";
const EMERGENCY_DISCLAIMER =
  "Bei plötzlich neuartigen, sehr starken oder anhaltenden Beschwerden bitte ärztliche Hilfe in Anspruch nehmen.";
const UNCERTAINTY_POLICY =
  "Findings werden nur als 'high' oder 'moderate' eingestuft, wenn ausreichend Vergleichstage und Effektstärke vorliegen. Sonst 'low' oder 'insufficient'.";

export function buildAnalysisReportV21(input: BuildReportV21Input): AnalysisReportV21 {
  const { preAnalysis: pre, meta, daysTotal } = input;
  const findings: AnalysisFinding[] = [];

  // ── 1. Datenqualität: Wetterabdeckung ────────────────────────────
  const weatherDays = pre.weather.daysWithData ?? 0;
  const weatherCov = coverageRate(weatherDays, daysTotal);
  findings.push({
    id: "data_quality.weather_coverage",
    category: "data_quality",
    title: "Wetterdaten-Abdeckung",
    evidence_level: weatherCov >= 0.5 ? "low" : "insufficient",
    doctor_relevance: "medium",
    patient_relevance: "medium",
    direction: "not_applicable",
    time_window: "not_applicable",
    plain_language_summary:
      weatherCov >= 0.5
        ? `Für ${weatherDays} von ${daysTotal} Tagen liegen Wetterdaten vor. Wetterhinweise sollten vorsichtig interpretiert werden.`
        : `Für Wetterzusammenhänge liegt keine ausreichende Datenbasis vor (${weatherDays}/${daysTotal} Tage).`,
    deterministic_basis: {
      metric_names: ["weather_days", "days_total", "weather_coverage_rate"],
      numerator: weatherDays,
      denominator: daysTotal,
      coverage_rate: weatherCov,
      effect_label: "not_calculated",
      sample_size_label: sampleSizeLabel(weatherDays),
    },
    limitations: [
      "Wettervariablen erlauben keine sichere kausale Aussage.",
    ],
    recommended_tracking_next: [
      "Wetterdaten weiter automatisch erfassen.",
    ],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 2. Dokumentationsfazit (freundlich, kein "Mangel") ───────────
  const documentedDays = Math.min(daysTotal, meta.painEntryCount + meta.voiceEventCount);
  const docCov = coverageRate(documentedDays, daysTotal);
  const docSummary = computeDocumentationSummary({
    rangeDays: daysTotal,
    anyEntryDays: Math.min(daysTotal, meta.painEntryCount),
    painDays: meta.daysWithPain,
    medDays: meta.medicationIntakeCount > 0 ? Math.min(daysTotal, meta.medicationIntakeCount) : 0,
    mecfsDays: meta.daysWithMecfs,
    contextNoteCount: pre.mecfs.contextNoteCount ?? 0,
    effectRatingCount: 0,
    weatherDaysCapped: pre.weather.daysWithData ?? 0,
  });
  findings.push({
    id: "data_quality.diary_coverage",
    category: "data_quality",
    title: "Dokumentationsfazit",
    evidence_level: docSummary.tone === "good" ? "moderate" : docSummary.tone === "solid" ? "low" : "insufficient",
    doctor_relevance: "medium",
    patient_relevance: "high",
    direction: "not_applicable",
    time_window: "not_applicable",
    plain_language_summary: docSummary.plainText,
    deterministic_basis: {
      metric_names: ["any_entry_days", "days_total"],
      numerator: documentedDays,
      denominator: daysTotal,
      coverage_rate: docSummary.coverage,
      effect_label: "not_calculated",
      sample_size_label: sampleSizeLabel(documentedDays),
    },
    limitations: docSummary.detailHints,
    recommended_tracking_next: docSummary.tone === "good"
      ? ["Aktuelle Dokumentationsroutine beibehalten."]
      : ["Möglichst täglich kurz dokumentieren – auch beschwerdefreie Tage."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 3. Krankheitslast ────────────────────────────────────────────
  const painDays = meta.daysWithPain ?? 0;
  const painRate = coverageRate(painDays, daysTotal);
  findings.push({
    id: "burden.pain_days_share",
    category: "burden",
    title: "Schmerztage im Zeitraum",
    evidence_level: painDays >= 3 ? "low" : "insufficient",
    doctor_relevance: "high",
    patient_relevance: "high",
    direction: painRate >= 0.4 ? "increased" : "unclear",
    time_window: "rolling_month",
    plain_language_summary: `${painDays} dokumentierte Schmerztage von ${daysTotal} Tagen (${Math.round(painRate * 100)}%).`,
    deterministic_basis: {
      metric_names: ["days_with_pain", "days_total"],
      numerator: painDays,
      denominator: daysTotal,
      coverage_rate: docCov,
      effect_label: "not_calculated",
      sample_size_label: sampleSizeLabel(painDays),
    },
    limitations: ["Ohne vollständige Dokumentation kann die tatsächliche Last höher oder niedriger sein."],
    recommended_tracking_next: ["Auch leichte Kopfschmerztage erfassen."],
    doctor_discussion_points:
      painRate >= 0.5
        ? ["Hoher Anteil an Kopfschmerztagen – Chronifizierungsrisiko mit Ärztin/Arzt besprechen."]
        : [],
    should_show_in_doctor_share: true,
  });

  // ── 4. Medikamentennutzung ───────────────────────────────────────
  const intakeCount = pre.medication.intakeCount ?? 0;
  const acuteEvidence: AnalysisFinding["evidence_level"] = intakeCount >= 3 ? "low" : "insufficient";
  findings.push({
    id: "medication.acute_intakes",
    category: "medication_use",
    title: "Akutmedikation – Einnahmen im Zeitraum",
    evidence_level: acuteEvidence,
    doctor_relevance: "high",
    patient_relevance: "high",
    direction: "not_applicable",
    time_window: "rolling_month",
    plain_language_summary: `${intakeCount} dokumentierte Medikamenteneinnahmen. ${pre.medication.note ?? ""}`.trim(),
    deterministic_basis: {
      metric_names: ["medication_intake_count", "high_pain_with_med", "high_pain_without_med"],
      numerator: intakeCount,
      denominator: daysTotal,
      comparison_numerator: pre.medication.highPainWithMed,
      comparison_denominator: pre.medication.highPainEntries,
      effect_label: "not_calculated",
      sample_size_label: sampleSizeLabel(intakeCount),
    },
    limitations: [
      "Keine Aussage zu MOH ohne längeren, vollständig dokumentierten Zeitraum.",
      "Wirksamkeit wird hier nicht bewertet.",
    ],
    recommended_tracking_next: ["Einnahmezeitpunkt relativ zum Schmerzbeginn erfassen."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 5. Wetter-Hinweis (Druckabfall) — empathisch bei hoher Schmerzlast ──
  const dropDays = pre.weather.pressureDropDays ?? 0;
  const painOnDrop = pre.weather.painOnDropDays ?? 0;
  const stableDays = pre.weather.stableDays ?? 0;
  const painOnStable = pre.weather.painOnStableDays ?? 0;
  const rateDrop = dropDays > 0 ? painOnDrop / dropDays : 0;
  const rateStable = stableDays > 0 ? painOnStable / stableDays : 0;
  const diffPP = (rateDrop - rateStable) * 100;
  const effect = effectStrengthFromRateDifference(diffPP);
  const highPainBlock = painRate >= 0.85;
  const weatherFindingEvidence = highPainBlock
    ? "insufficient"
    : classifyEvidence({
        exposedEvents: dropDays,
        comparisonEvents: stableDays,
        coverageRate: weatherCov,
        effectStrength: dropDays >= 3 && stableDays >= 3 ? effect : "not_calculated",
      });
  const weatherSummary = highPainBlock
    ? "Die Wetteranalyse bleibt vorsichtig, weil der Zeitraum fast durchgehend schmerzbelastet war. Wetter kann ein möglicher Verstärkungsfaktor sein, ein klarer Auslöser lässt sich daraus nicht ableiten."
    : weatherFindingEvidence === "insufficient"
      ? "Es liegen zu wenige Vergleichstage vor, um einen Zusammenhang mit Druckabfall verlässlich zu beurteilen."
      : `An Tagen mit deutlichem Druckabfall: ${painOnDrop}/${dropDays} mit Schmerz vs. ${painOnStable}/${stableDays} an stabilen Tagen.`;
  findings.push({
    id: "weather.pressure_drop",
    category: "weather",
    title: "Druckabfall (Δ24h ≤ −3 hPa) und Schmerztage",
    evidence_level: weatherFindingEvidence,
    doctor_relevance: "medium",
    patient_relevance: "medium",
    direction: highPainBlock ? "unclear" : (diffPP > 5 ? "increased" : diffPP < -5 ? "decreased" : "unclear"),
    time_window: "same_day",
    plain_language_summary: weatherSummary,
    deterministic_basis: {
      metric_names: ["pressure_drop_days", "pain_on_drop_days", "stable_days", "pain_on_stable_days"],
      numerator: painOnDrop,
      denominator: dropDays,
      comparison_numerator: painOnStable,
      comparison_denominator: stableDays,
      effect_label: dropDays >= 3 && stableDays >= 3 ? effect : "not_calculated",
      coverage_rate: weatherCov,
      sample_size_label: sampleSizeLabel(dropDays + stableDays),
    },
    limitations: [
      "Wetter ist mehrdimensional; einzelne Variablen sind selten alleinige Auslöser.",
    ],
    recommended_tracking_next: [
      highPainBlock
        ? "Subjektive Wetterempfindungen wie Hitze, Gewitter, Druckgefühl oder Wetterwechsel kurz notieren."
        : "Weiter dokumentieren – auch beschwerdefreie Tage mit Druckabfall.",
    ],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 6. ME/CFS-/Energie-Coverage ──────────────────────────────────
  const mecfsDays = pre.mecfs.daysWithMecfs ?? 0;
  const mecfsCov = coverageRate(mecfsDays, daysTotal);
  findings.push({
    id: "mecfs.energy_coverage",
    category: "mecfs_energy_pem",
    title: "ME/CFS-/Energie-Dokumentation",
    evidence_level: mecfsDays >= 5 ? "low" : "insufficient",
    doctor_relevance: "medium",
    patient_relevance: "medium",
    direction: "not_applicable",
    time_window: "rolling_month",
    plain_language_summary:
      mecfsDays > 0
        ? `${mecfsDays} Tage mit Energie-/ME-CFS-Signal dokumentiert. Tagesfaktoren-Einträge: ${pre.mecfs.contextNoteCount}.`
        : "Keine ausreichenden ME/CFS-/PEM-Daten im Zeitraum dokumentiert.",
    deterministic_basis: {
      metric_names: ["days_with_mecfs", "context_note_count", "days_total"],
      numerator: mecfsDays,
      denominator: daysTotal,
      coverage_rate: mecfsCov,
      effect_label: "not_calculated",
      sample_size_label: sampleSizeLabel(mecfsDays),
    },
    limitations: ["Ohne tägliche Energie-Dokumentation sind PEM-Muster (T+1/T+2) nicht zuverlässig erkennbar."],
    recommended_tracking_next: ["Täglich Energie-Level und Belastung kurz festhalten."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 7. Zeitmuster (Wochentag/Phase) ──────────────────────────────
  const withTime = pre.time.withTime ?? 0;
  const topWeekdayShare = pre.time.topWeekdayShare ?? 0;
  const topPhaseShare = pre.time.topPhaseShare ?? 0;
  const timeEffect: "strong" | "moderate" | "weak" | "none" =
    topWeekdayShare >= 0.4 || topPhaseShare >= 0.5
      ? "moderate"
      : topWeekdayShare >= 0.3 || topPhaseShare >= 0.4
      ? "weak"
      : "none";
  const timeEvidence = classifyEvidence({
    exposedEvents: withTime,
    comparisonEvents: withTime,
    coverageRate: coverageRate(withTime, Math.max(1, meta.painEntryCount)),
    effectStrength: withTime >= 3 ? timeEffect : "not_calculated",
  });
  findings.push({
    id: "time_pattern.weekday_phase",
    category: "time_pattern",
    title: "Tagesphase/Wochentag-Häufungen",
    evidence_level: timeEvidence,
    doctor_relevance: "low",
    patient_relevance: "medium",
    direction: timeEffect === "none" ? "unclear" : "increased",
    time_window: "course_phase",
    plain_language_summary:
      withTime === 0
        ? "Keine Uhrzeitdaten verfügbar – Zeitmuster nicht beurteilbar."
        : `Top-Wochentag: ${pre.time.topWeekday ?? "—"} (${Math.round(topWeekdayShare * 100)}%); Top-Phase: ${pre.time.topPhase ?? "—"} (${Math.round(topPhaseShare * 100)}%); Einträge mit Uhrzeit: ${withTime}.`,
    deterministic_basis: {
      metric_names: ["top_weekday_share", "top_phase_share", "with_time"],
      numerator: withTime,
      denominator: Math.max(1, meta.painEntryCount),
      effect_label: withTime >= 3 ? timeEffect : "not_calculated",
      sample_size_label: sampleSizeLabel(withTime),
    },
    limitations: ["Wenige Einträge mit Uhrzeit erlauben keine sichere Aussage."],
    recommended_tracking_next: ["Beim Erfassen die ungefähre Uhrzeit angeben."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // ── 8. Verlauf & Veränderung — deterministic trend findings ──────
  if (input.trendDays && input.trendDays.length > 0) {
    try {
      const trend = computeTrendAnalysis(input.trendDays);
      for (const tf of buildCourseTrendFindings(trend)) findings.push(tf);
    } catch (e) {
      // non-fatal
      if (typeof console !== "undefined") console.warn("[buildAnalysisReportV21] trend emit failed:", e);
    }
  }

  // ── Section map ──────────────────────────────────────────────────
  const ids = (cats: AnalysisFinding["category"][]) =>
    findings.filter((f) => cats.includes(f.category)).map((f) => f.id);

  const strongest = findings
    .filter((f) => f.evidence_level === "high" || f.evidence_level === "moderate")
    .map((f) => f.id);
  const weaker = findings.filter((f) => f.evidence_level === "low").map((f) => f.id);

  const report: AnalysisReportV21 = {
    schema_version: ANALYSIS_V21_SCHEMA,
    analysis_version: ANALYSIS_V21_VERSION,
    period: {
      from: input.fromISO,
      to: input.toISO,
      timezone: input.timezone ?? "Europe/Berlin",
      days_total: daysTotal,
    },
    data_basis: {
      documented_days: documentedDays,
      pain_days: painDays,
      migraine_like_days: null,
      medication_intake_days: intakeCount > 0 ? intakeCount : null,
      weather_days: weatherDays,
      lifestyle_factor_days: pre.mecfs.contextNoteCount ?? null,
      mecfs_energy_days: mecfsDays,
      effect_rating_count: null,
      private_notes_excluded: true,
    },
    clinical_caution: {
      no_diagnosis: true,
      emergency_disclaimer: `${NO_DIAGNOSIS_DISCLAIMER} ${EMERGENCY_DISCLAIMER}`,
      uncertainty_policy: UNCERTAINTY_POLICY,
    },
    findings,
    section_map: {
      summary: findings.slice(0, 3).map((f) => f.id),
      strongest_findings: strongest,
      weaker_findings: weaker,
      burden_course: ids(["burden", "chronification"]),
      course_trend: ids(["course_trend", "medication_trend", "mecfs_energy_trend"]),
      medication: ids(["medication_use", "medication_effect", "preventive_course"]),
      weather_environment: ids(["weather"]),
      mecfs_energy: ids(["mecfs_energy_pem"]),
      symptoms_aura: ids(["symptoms_aura"]),
      lifestyle_time_patterns: ids(["lifestyle_triggers", "time_pattern", "sleep", "stress_mood"]),
      data_quality: ids(["data_quality"]),
      open_questions: [],
      red_flags: ids(["red_flag"]),
    } as AnalysisReportV21["section_map"],
  };

  return report;
}

