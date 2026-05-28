/**
 * patternPreAnalysis.ts — Server-side PreAnalysis + Deterministic V2.1 Findings
 *
 * Phase 2 of the App/Shared engine unification. This is the server-side
 * port of `src/lib/voice/analysisEngine.ts → buildAnalysisPromptData` plus
 * `src/lib/ai/buildAnalysisReportV21.ts`.
 *
 * Why a port (not an import): the App pipeline is browser-only (uses the
 * Supabase auth client + UI types). Doctor-Share must run as service-role
 * inside the Edge runtime with an explicit `ownerUserId` filter on every
 * query, no auth context.
 *
 * SSOT rules respected:
 *   - Computes the SAME pre-analysis fields the App sends:
 *     weather / time / mecfs / medication / dataQuality.
 *   - Computes the SAME V2.1 findings (ids, categories, evidence levels).
 *   - ME/CFS: when daysWithMecfs > 0 → NOT "nicht dokumentiert", instead
 *     "Signal vorhanden, PEM-Belastungs-Detail fehlt ggf." (V2.2 curation).
 *   - Voice-Event counts are NEVER converted to a data_quality finding.
 *   - schema_version "2.1", analysis_version "2.2.0".
 *
 * SECURITY:
 *   - Owner-scoped query on `weather_logs` (filter by ownerUserId).
 *   - No PHI / transcripts in logs.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ServerDataset } from "./serverAnalysisDataset.ts";
import { computeTrendAnalysis, type TrendDayRecord, type TrendResult } from "./trendAnalysis.ts";
import { computeDocumentationSummary } from "./documentationSummary.ts";


// ─────────────────────────────────────────────────────────────────────────
// Types (mirrors src/lib/voice/analysisEngine.ts PreAnalysis)
// ─────────────────────────────────────────────────────────────────────────

export interface PreAnalysis {
  weather: {
    daysWithData: number;
    pressureDropDays: number;
    pressureRiseDays: number;
    painOnDropDays: number;
    painOnRiseDays: number;
    painOnStableDays: number;
    stableDays: number;
    pressureMin: number | null;
    pressureMax: number | null;
    tempMin: number | null;
    tempMax: number | null;
    note: string;
  };
  time: {
    topWeekday: string | null;
    topWeekdayShare: number;
    topPhase: string | null;
    topPhaseShare: number;
    weekdayCount: number;
    weekendCount: number;
    withTime: number;
    note: string;
  };
  mecfs: {
    daysWithMecfs: number;
    contextNoteCount: number;
    note: string;
  };
  medication: {
    intakeCount: number;
    highPainEntries: number;
    highPainWithMed: number;
    highPainWithoutMed: number;
    note: string;
  };
  dataQuality: {
    painEntries: number;
    voiceEvents: number;
    weatherDays: number;
    rangeDays: number;
    note: string;
  };
}

export type EvidenceLevel = "high" | "moderate" | "low" | "insufficient";
export type FindingCategory =
  | "burden" | "chronification" | "medication_use" | "medication_effect"
  | "preventive_course" | "symptoms_aura" | "weather" | "mecfs_energy_pem"
  | "sleep" | "stress_mood" | "lifestyle_triggers" | "time_pattern"
  | "cycle_hormonal" | "interaction" | "data_quality" | "red_flag";

export interface AnalysisFinding {
  id: string;
  category: FindingCategory;
  title: string;
  evidence_level: EvidenceLevel;
  doctor_relevance: "high" | "medium" | "low";
  patient_relevance: "high" | "medium" | "low";
  direction: "increased" | "decreased" | "mixed" | "unclear" | "not_applicable";
  time_window: string;
  plain_language_summary: string;
  deterministic_basis: Record<string, unknown>;
  limitations: string[];
  recommended_tracking_next: string[];
  doctor_discussion_points: string[];
  should_show_in_doctor_share: boolean;
}

export interface AnalysisReportV21 {
  schema_version: "2.1";
  analysis_version: string;
  period: { from: string; to: string; timezone: string; days_total: number };
  data_basis: {
    documented_days: number;
    pain_days: number | null;
    migraine_like_days: number | null;
    medication_intake_days: number | null;
    weather_days: number | null;
    lifestyle_factor_days: number | null;
    mecfs_energy_days: number | null;
    effect_rating_count: number | null;
    private_notes_excluded: boolean;
  };
  clinical_caution: { no_diagnosis: true; emergency_disclaimer: string; uncertainty_policy: string };
  findings: AnalysisFinding[];
  section_map: Record<string, string[]>;
}

const NO_DIAGNOSIS = "Diese Analyse ersetzt keine ärztliche Beurteilung. Sie liefert Hypothesen aus dokumentierten Daten – keine Diagnosen.";
const EMERGENCY = "Bei plötzlich neuartigen, sehr starken oder anhaltenden Beschwerden bitte ärztliche Hilfe in Anspruch nehmen.";
const UNCERTAINTY = "Findings werden nur als 'high' oder 'moderate' eingestuft, wenn ausreichend Vergleichstage und Effektstärke vorliegen. Sonst 'low' oder 'insufficient'.";

// ─────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "–";
}
function coverageRate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}
function sampleSizeLabel(n: number): "adequate" | "limited" | "very_limited" | "none" {
  if (n === 0) return "none";
  if (n < 3) return "very_limited";
  if (n < 10) return "limited";
  return "adequate";
}

// ─────────────────────────────────────────────────────────────────────────
// buildPatternPreAnalysis
// ─────────────────────────────────────────────────────────────────────────

export async function buildPatternPreAnalysis(
  supabase: SupabaseClient,
  ownerUserId: string,
  dataset: ServerDataset,
): Promise<PreAnalysis> {
  const { painEntries, medIntakes, contextNoteCount } = dataset.raw;
  const rangeDays = dataset.meta.totalDays;

  // --- Time aggregates ---
  const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const phaseOf = (h: number) =>
    h < 6 ? "Nacht" : h < 12 ? "Morgen" : h < 18 ? "Mittag/Nachmittag" : "Abend";
  const wdCount = new Map<string, number>();
  const phaseCount = new Map<string, number>();
  let weekday = 0, weekend = 0, withTime = 0;
  for (const p of painEntries) {
    if (!p.selected_date) continue;
    const d = new Date(p.selected_date + "T00:00:00");
    const wd = WD[d.getDay()];
    wdCount.set(wd, (wdCount.get(wd) ?? 0) + 1);
    if (d.getDay() === 0 || d.getDay() === 6) weekend++; else weekday++;
    if (p.selected_time) {
      const h = parseInt(p.selected_time.slice(0, 2), 10);
      if (Number.isFinite(h)) {
        phaseCount.set(phaseOf(h), (phaseCount.get(phaseOf(h)) ?? 0) + 1);
        withTime++;
      }
    }
  }
  const wdSorted = Array.from(wdCount.entries()).sort((a, b) => b[1] - a[1]);
  const phaseSorted = Array.from(phaseCount.entries()).sort((a, b) => b[1] - a[1]);
  const totalWd = wdSorted.reduce((s, [, v]) => s + v, 0);

  // --- Weather (owner-scoped) ---
  // weather_logs is per-user; service role MUST filter by user_id.
  let weatherRows: Array<{
    snapshot_date: string | null;
    pressure_mb: number | null;
    pressure_change_24h: number | null;
    temperature_c: number | null;
  }> = [];
  try {
    const { data } = await supabase
      .from("weather_logs")
      .select("snapshot_date,pressure_mb,pressure_change_24h,temperature_c")
      .eq("user_id", ownerUserId)
      .gte("snapshot_date", dataset.fromDate)
      .lte("snapshot_date", dataset.toDate)
      .order("snapshot_date", { ascending: true })
      .limit(400);
    weatherRows = (data ?? []) as typeof weatherRows;
  } catch (e) {
    console.warn("[patternPreAnalysis] weather fetch failed (non-fatal):", e);
  }

  const painDates = new Set(
    painEntries
      .filter((p) => p.selected_date && p.pain_level && p.pain_level !== "-")
      .map((p) => p.selected_date as string),
  );
  const byDay = new Map<string, typeof weatherRows[number]>();
  for (const r of weatherRows) {
    if (!r.snapshot_date) continue;
    // Normalise + drop rows outside window so we never count 31 of 30.
    const key = String(r.snapshot_date).slice(0, 10);
    if (key < dataset.fromDate || key > dataset.toDate) continue;
    if (!byDay.has(key)) byDay.set(key, r);
  }
  let dropDays = 0, riseDays = 0, stableDays = 0;
  let painOnDrop = 0, painOnRise = 0, painOnStable = 0;
  const pressVals: number[] = [], tempVals: number[] = [];
  for (const [day, r] of byDay) {
    if (r.pressure_mb != null) pressVals.push(r.pressure_mb);
    if (r.temperature_c != null) tempVals.push(r.temperature_c);
    const dp = r.pressure_change_24h;
    if (dp == null) continue;
    const isPain = painDates.has(day);
    if (dp <= -3) { dropDays++; if (isPain) painOnDrop++; }
    else if (dp >= 3) { riseDays++; if (isPain) painOnRise++; }
    else { stableDays++; if (isPain) painOnStable++; }
  }
  // Hard cap to total range days (defensive).
  const weatherDaysCapped = Math.min(byDay.size, rangeDays);


  // --- Medication (high-pain coverage) ---
  let highPain = 0, highPainMed = 0;
  for (const p of painEntries) {
    const lvl = typeof p.pain_level === "string" && /^\d+$/.test(p.pain_level)
      ? parseInt(p.pain_level, 10) : null;
    if (lvl != null && lvl >= 7) {
      highPain++;
      if (Array.isArray(p.medications) && p.medications.length > 0) highPainMed++;
    }
  }

  // --- ME/CFS coverage (uses score from pain_entries — same source as App) ---
  const daysWithMecfs = dataset.meta.daysWithMecfs;

  // --- V2.2 ME/CFS note rule ---
  const mecfsNote = daysWithMecfs > 0
    ? `${daysWithMecfs} Tage mit ME/CFS-/Energie-Signal dokumentiert. Tagesfaktoren-Einträge: ${contextNoteCount}. PEM-/Belastungsdetails ggf. unvollständig.`
    : `Keine ME/CFS-/PEM-Daten im Zeitraum dokumentiert. Tagesfaktoren-Einträge: ${contextNoteCount}.`;

  const pre: PreAnalysis = {
    weather: {
      daysWithData: weatherDaysCapped,
      pressureDropDays: dropDays,
      pressureRiseDays: riseDays,
      stableDays,
      painOnDropDays: painOnDrop,
      painOnRiseDays: painOnRise,
      painOnStableDays: painOnStable,
      pressureMin: pressVals.length ? Math.min(...pressVals) : null,
      pressureMax: pressVals.length ? Math.max(...pressVals) : null,
      tempMin: tempVals.length ? Math.min(...tempVals) : null,
      tempMax: tempVals.length ? Math.max(...tempVals) : null,
      note: weatherDaysCapped === 0
        ? "Keine Wetterdaten im Zeitraum vorhanden."
        : `Wetterabdeckung ${weatherDaysCapped}/${rangeDays} Tage. Druckabfall (Δ24h ≤ -3 hPa): ${dropDays} Tage, davon ${painOnDrop} mit Schmerz (${pct(painOnDrop, dropDays)}). Druckanstieg (≥ +3 hPa): ${riseDays} Tage, ${painOnRise} mit Schmerz (${pct(painOnRise, riseDays)}). Stabil: ${stableDays} Tage, ${painOnStable} mit Schmerz (${pct(painOnStable, stableDays)}).`,
    },

    time: {
      topWeekday: wdSorted[0]?.[0] ?? null,
      topWeekdayShare: totalWd > 0 ? (wdSorted[0]?.[1] ?? 0) / totalWd : 0,
      topPhase: phaseSorted[0]?.[0] ?? null,
      topPhaseShare: withTime > 0 ? (phaseSorted[0]?.[1] ?? 0) / withTime : 0,
      weekdayCount: weekday,
      weekendCount: weekend,
      withTime,
      note: phaseSorted[0]
        ? `Häufigster Wochentag: ${wdSorted[0][0]} (${wdSorted[0][1]}/${totalWd}). Häufigste Tagesphase: ${phaseSorted[0][0]} (${phaseSorted[0][1]}/${withTime}).`
        : `Wochentag-Verteilung erfasst (n=${totalWd}). Uhrzeitdaten nur für ${withTime} Einträge.`,
    },
    mecfs: { daysWithMecfs, contextNoteCount, note: mecfsNote },
    medication: {
      intakeCount: medIntakes.length,
      highPainEntries: highPain,
      highPainWithMed: highPainMed,
      highPainWithoutMed: highPain - highPainMed,
      note: highPain > 0
        ? `Schmerz ≥ 7: ${highPain} Einträge, davon mit dokumentiertem Akutmedikament: ${highPainMed} (${pct(highPainMed, highPain)}). Ohne Medikament: ${highPain - highPainMed}. Insgesamt ${medIntakes.length} Medikamenteneinnahmen erfasst.`
        : `Keine Einträge mit Schmerz ≥ 7 im Zeitraum. Insgesamt ${medIntakes.length} Medikamenteneinnahmen erfasst.`,
    },
    dataQuality: {
      painEntries: dataset.meta.painEntryCount,
      voiceEvents: dataset.meta.voiceEventCount,
      weatherDays: weatherDaysCapped,
      rangeDays,
      // V2.2 curation: do NOT use voiceEvents as a data-quality finding key;
      // we just report it here for completeness.
      note: `${dataset.meta.painEntryCount} Schmerzeinträge über ${rangeDays} Tage. Wetterdaten: ${weatherDaysCapped}/${rangeDays} Tage. Tagesfaktoren: ${contextNoteCount} Einträge.`,
    },
  };


  return pre;
}

// ─────────────────────────────────────────────────────────────────────────
// buildDeterministicFindings — server port of buildAnalysisReportV21
// ─────────────────────────────────────────────────────────────────────────

export interface DeterministicFindingsInput {
  pre: PreAnalysis;
  meta: ServerDataset["meta"];
  fromISO: string;
  toISO: string;
  /** Doctor-Share strips private free-text; this flag is recorded in
   *  data_basis.private_notes_excluded for transparency. */
  privateNotesExcluded: boolean;
}

export function buildDeterministicFindings(
  input: DeterministicFindingsInput,
): AnalysisReportV21 {
  const { pre, meta, fromISO, toISO, privateNotesExcluded } = input;
  const daysTotal = meta.totalDays;
  const findings: AnalysisFinding[] = [];

  // 1. data_quality.weather_coverage
  const weatherDays = pre.weather.daysWithData;
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
    plain_language_summary: weatherCov >= 0.5
      ? `Für ${weatherDays} von ${daysTotal} Tagen liegen Wetterdaten vor.`
      : `Für Wetterzusammenhänge liegt keine ausreichende Datenbasis vor (${weatherDays}/${daysTotal} Tage).`,
    deterministic_basis: {
      metric_names: ["weather_days", "days_total", "weather_coverage_rate"],
      numerator: weatherDays, denominator: daysTotal, coverage_rate: weatherCov,
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(weatherDays),
    },
    limitations: ["Wettervariablen erlauben keine sichere kausale Aussage."],
    recommended_tracking_next: ["Wetterdaten weiter automatisch erfassen."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // 2. data_quality.diary_coverage (V2.2: pain entries only — voice events excluded)
  const documentedDays = Math.min(daysTotal, meta.painEntryCount);
  const docCov = coverageRate(documentedDays, daysTotal);
  findings.push({
    id: "data_quality.diary_coverage",
    category: "data_quality",
    title: "Dokumentations-Abdeckung",
    evidence_level: docCov >= 0.5 ? "low" : "insufficient",
    doctor_relevance: "medium",
    patient_relevance: "high",
    direction: "not_applicable",
    time_window: "not_applicable",
    plain_language_summary: `Im Zeitraum sind ${meta.painEntryCount} Schmerzeinträge dokumentiert (${daysTotal} Tage Range).`,
    deterministic_basis: {
      metric_names: ["pain_entries", "days_total"],
      numerator: documentedDays, denominator: daysTotal, coverage_rate: docCov,
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(documentedDays),
    },
    limitations: ["Lückenhafte Dokumentation kann Muster verzerren."],
    recommended_tracking_next: ["Möglichst täglich kurz dokumentieren – auch beschwerdefreie Tage."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // 3. burden.pain_days_share
  const painDays = meta.daysWithPain;
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
      numerator: painDays, denominator: daysTotal, coverage_rate: docCov,
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(painDays),
    },
    limitations: ["Ohne vollständige Dokumentation kann die tatsächliche Last höher oder niedriger sein."],
    recommended_tracking_next: ["Auch leichte Kopfschmerztage erfassen."],
    doctor_discussion_points: painRate >= 0.5
      ? ["Hoher Anteil an Kopfschmerztagen – ärztlich zu prüfender Bereich (kein Diagnose-Hinweis)."]
      : [],
    should_show_in_doctor_share: true,
  });

  // 4. medication.acute_intakes
  const intakeCount = pre.medication.intakeCount;
  findings.push({
    id: "medication.acute_intakes",
    category: "medication_use",
    title: "Akutmedikation – Einnahmen im Zeitraum",
    evidence_level: intakeCount >= 3 ? "low" : "insufficient",
    doctor_relevance: "high",
    patient_relevance: "high",
    direction: "not_applicable",
    time_window: "rolling_month",
    plain_language_summary: `${intakeCount} dokumentierte Medikamenteneinnahmen. ${pre.medication.note}`.trim(),
    deterministic_basis: {
      metric_names: ["medication_intake_count", "high_pain_with_med", "high_pain_without_med"],
      numerator: intakeCount, denominator: daysTotal,
      comparison_numerator: pre.medication.highPainWithMed,
      comparison_denominator: pre.medication.highPainEntries,
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(intakeCount),
    },
    limitations: ["Keine Aussage zu MOH ohne längeren, vollständig dokumentierten Zeitraum."],
    recommended_tracking_next: ["Einnahmezeitpunkt relativ zum Schmerzbeginn erfassen."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // 5. weather.pressure_drop (V2.2: warn when no pain-free comparison days)
  const dropDays = pre.weather.pressureDropDays;
  const painOnDrop = pre.weather.painOnDropDays;
  const stableDaysW = pre.weather.stableDays;
  const painOnStable = pre.weather.painOnStableDays;
  const noComparison = stableDaysW === 0 || (stableDaysW > 0 && painOnStable / stableDaysW >= 0.9);
  const weatherEvidence: EvidenceLevel = (dropDays >= 3 && stableDaysW >= 3 && !noComparison) ? "low" : "insufficient";
  findings.push({
    id: "weather.pressure_drop",
    category: "weather",
    title: "Druckabfall (Δ24h ≤ −3 hPa) und Schmerztage",
    evidence_level: weatherEvidence,
    doctor_relevance: "medium",
    patient_relevance: "medium",
    direction: "unclear",
    time_window: "same_day",
    plain_language_summary: weatherEvidence === "insufficient"
      ? "Zu wenige schmerzfreie Vergleichstage, um einen Zusammenhang mit Druckabfall verlässlich zu beurteilen."
      : `An Tagen mit deutlichem Druckabfall: ${painOnDrop}/${dropDays} mit Schmerz vs. ${painOnStable}/${stableDaysW} an stabilen Tagen.`,
    deterministic_basis: {
      metric_names: ["pressure_drop_days", "pain_on_drop_days", "stable_days", "pain_on_stable_days"],
      numerator: painOnDrop, denominator: dropDays,
      comparison_numerator: painOnStable, comparison_denominator: stableDaysW,
      effect_label: "not_calculated", coverage_rate: weatherCov,
      sample_size_label: sampleSizeLabel(dropDays + stableDaysW),
    },
    limitations: [
      "Wetter ist mehrdimensional; einzelne Variablen sind selten alleinige Auslöser.",
      noComparison ? "Es fehlen schmerzfreie Vergleichstage." : "",
    ].filter(Boolean),
    recommended_tracking_next: ["Weiter dokumentieren – auch beschwerdefreie Tage mit Druckabfall."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // 6. mecfs.energy_coverage — V2.2 rule: signal-present ≠ data gap
  const mecfsDays = pre.mecfs.daysWithMecfs;
  const mecfsCov = coverageRate(mecfsDays, daysTotal);
  findings.push({
    id: "mecfs.energy_coverage",
    category: "mecfs_energy_pem",
    title: mecfsDays > 0 ? "ME/CFS-/Energiesignal vorhanden" : "ME/CFS-/Energie-Dokumentation",
    evidence_level: mecfsDays >= 5 ? "low" : (mecfsDays > 0 ? "low" : "insufficient"),
    doctor_relevance: "medium",
    patient_relevance: "medium",
    direction: "not_applicable",
    time_window: "rolling_month",
    plain_language_summary: mecfsDays > 0
      ? `${mecfsDays} Tage mit Energie-/ME-CFS-Signal dokumentiert. Tagesfaktoren-Einträge: ${pre.mecfs.contextNoteCount}. PEM-/Belastungsdetails ggf. unvollständig.`
      : "Keine ausreichenden ME/CFS-/PEM-Daten im Zeitraum dokumentiert.",
    deterministic_basis: {
      metric_names: ["days_with_mecfs", "context_note_count", "days_total"],
      numerator: mecfsDays, denominator: daysTotal, coverage_rate: mecfsCov,
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(mecfsDays),
    },
    limitations: mecfsDays > 0
      ? ["PEM-Detaildaten (Belastung/Erholung) fehlen ggf., daher kein zuverlässiger T+1/T+2-Vergleich."]
      : ["Ohne tägliche Energie-Dokumentation sind PEM-Muster nicht zuverlässig erkennbar."],
    recommended_tracking_next: ["Täglich Energie-Level und Belastung kurz festhalten."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // 7. time_pattern.weekday_phase
  const withTime = pre.time.withTime;
  const topWeekdayShare = pre.time.topWeekdayShare;
  const topPhaseShare = pre.time.topPhaseShare;
  findings.push({
    id: "time_pattern.weekday_phase",
    category: "time_pattern",
    title: "Tagesphase/Wochentag-Häufungen",
    evidence_level: withTime >= 3 && (topWeekdayShare >= 0.3 || topPhaseShare >= 0.4) ? "low" : "insufficient",
    doctor_relevance: "low",
    patient_relevance: "medium",
    direction: (topWeekdayShare >= 0.3 || topPhaseShare >= 0.4) ? "increased" : "unclear",
    time_window: "course_phase",
    plain_language_summary: withTime === 0
      ? "Keine Uhrzeitdaten verfügbar – Zeitmuster nicht beurteilbar."
      : `Top-Wochentag: ${pre.time.topWeekday ?? "—"} (${Math.round(topWeekdayShare * 100)}%); Top-Phase: ${pre.time.topPhase ?? "—"} (${Math.round(topPhaseShare * 100)}%); Einträge mit Uhrzeit: ${withTime}.`,
    deterministic_basis: {
      metric_names: ["top_weekday_share", "top_phase_share", "with_time"],
      numerator: withTime, denominator: Math.max(1, meta.painEntryCount),
      effect_label: "not_calculated", sample_size_label: sampleSizeLabel(withTime),
    },
    limitations: ["Wenige Einträge mit Uhrzeit erlauben keine sichere Aussage."],
    recommended_tracking_next: ["Beim Erfassen die ungefähre Uhrzeit angeben."],
    doctor_discussion_points: [],
    should_show_in_doctor_share: true,
  });

  // Section map
  const ids = (cats: FindingCategory[]) => findings.filter((f) => cats.includes(f.category)).map((f) => f.id);
  const strongest = findings.filter((f) => f.evidence_level === "high" || f.evidence_level === "moderate").map((f) => f.id);
  const weaker = findings.filter((f) => f.evidence_level === "low").map((f) => f.id);

  return {
    schema_version: "2.1",
    analysis_version: "2.2.0",
    period: { from: fromISO, to: toISO, timezone: "Europe/Berlin", days_total: daysTotal },
    data_basis: {
      documented_days: documentedDays,
      pain_days: painDays,
      migraine_like_days: null,
      medication_intake_days: intakeCount > 0 ? intakeCount : null,
      weather_days: weatherDays,
      lifestyle_factor_days: pre.mecfs.contextNoteCount ?? null,
      mecfs_energy_days: mecfsDays,
      effect_rating_count: null,
      private_notes_excluded: privateNotesExcluded,
    },
    clinical_caution: {
      no_diagnosis: true,
      emergency_disclaimer: `${NO_DIAGNOSIS} ${EMERGENCY}`,
      uncertainty_policy: UNCERTAINTY,
    },
    findings,
    section_map: {
      summary: findings.slice(0, 3).map((f) => f.id),
      strongest_findings: strongest,
      weaker_findings: weaker,
      burden_course: ids(["burden", "chronification"]),
      medication: ids(["medication_use", "medication_effect", "preventive_course"]),
      weather_environment: ids(["weather"]),
      mecfs_energy: ids(["mecfs_energy_pem"]),
      symptoms_aura: ids(["symptoms_aura"]),
      lifestyle_time_patterns: ids(["lifestyle_triggers", "time_pattern", "sleep", "stress_mood"]),
      data_quality: ids(["data_quality"]),
      open_questions: [],
      red_flags: ids(["red_flag"]),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Section-map merger for LLM-expanded findings
// ─────────────────────────────────────────────────────────────────────────

const CAT_TO_SECTION: Record<string, string> = {
  burden: "burden_course", chronification: "burden_course",
  medication_use: "medication", medication_effect: "medication", preventive_course: "medication",
  weather: "weather_environment",
  mecfs_energy_pem: "mecfs_energy",
  symptoms_aura: "symptoms_aura",
  sleep: "lifestyle_time_patterns", stress_mood: "lifestyle_time_patterns",
  lifestyle_triggers: "lifestyle_time_patterns", time_pattern: "lifestyle_time_patterns",
  interaction: "lifestyle_time_patterns",
  data_quality: "data_quality",
  red_flag: "red_flags",
  cycle_hormonal: "symptoms_aura",
};

export function mergeExpandedFindingsIntoReport(
  report: AnalysisReportV21,
  expanded: Array<Record<string, unknown>>,
  options: { excludeRedFlags?: boolean } = {},
): AnalysisReportV21 {
  const filtered = options.excludeRedFlags
    ? expanded.filter((f) => f.category !== "red_flag")
    : expanded;
  for (const f of filtered) {
    const id = typeof f.id === "string" ? f.id : "";
    const cat = typeof f.category === "string" ? f.category : "";
    if (!id || !cat) continue;
    const section = CAT_TO_SECTION[cat];
    if (section && Array.isArray(report.section_map[section])) {
      report.section_map[section].push(id);
    }
    const lvl = f.evidence_level;
    if (lvl === "high" || lvl === "moderate") report.section_map.strongest_findings.push(id);
    else if (lvl === "low") report.section_map.weaker_findings.push(id);
  }
  (report as any).llm_expanded_findings = filtered;
  return report;
}
