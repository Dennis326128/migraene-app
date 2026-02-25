/**
 * ═══════════════════════════════════════════════════════════════════════════
 * buildAnalysisV2 — Orchestrator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Assembles the full AnalysisV2 object from SSOT inputs.
 * Phase 1: Core + MOH + Coverage + MeCFS + minimal Findings.
 * Weather & Prophylaxis are placeholders (null).
 *
 * Pure function. No DB, no I/O, no side effects.
 */

import type {
  AnalysisV2,
  Finding,
  InsightsForLLM,
  ConfidenceLevel,
  WeatherDayFeature,
} from "./types.ts";
import { ANALYSIS_V2_VERSION } from "./types.ts";
import { ANALYSIS_DEFINITIONS } from "./definitions.ts";
import { computeCoreMetrics, type CoreMetricsInput } from "./coreMetrics.ts";
import { computeMOH } from "./moh.ts";
import { computeCoverage, type CoverageInput } from "./coverage.ts";
import { computeMecfsSummary, type MeCfsInput } from "./mecfs.ts";
import { computeWeatherAssociation } from "./weatherAssociation.ts";

// ─── Input ───────────────────────────────────────────────────────────────

export interface BuildAnalysisV2Input {
  range: {
    startISO: string;
    endISO: string;
    timezone: string;
    totalDaysInRange: number;
  };
  /** SSOT day-level records (from computeMiaryReport().raw.countsByDay) */
  countsByDay: CoreMetricsInput["countsByDay"];
  /** Optional: pre-counted intake totals */
  totalIntakesAcute?: number | null;
  totalIntakesTriptan?: number | null;
  /** Optional: ME/CFS day-level data */
  mecfsData?: MeCfsInput["dayMeCfsLevels"] | null;
  /** Optional: weather day features for association analysis */
  weatherDayFeatures?: WeatherDayFeature[] | null;
  /** Optional: weather days available count */
  weatherDaysAvailable?: number | null;
  /** Optional: notes days count */
  notesDaysWithAnyText?: number | null;
  /** Optional: prophylaxis injection count */
  prophylaxisInjectionEvents?: number | null;
  prophylaxisCyclesInRange?: number | null;
}

// ─── Build ───────────────────────────────────────────────────────────────

export function buildAnalysisV2(input: BuildAnalysisV2Input): AnalysisV2 {
  const { range } = input;

  // 1. Core Metrics
  const core = computeCoreMetrics({
    daysInRange: range.totalDaysInRange,
    countsByDay: input.countsByDay,
    totalIntakesAcute: input.totalIntakesAcute,
    totalIntakesTriptan: input.totalIntakesTriptan,
  });

  // 2. MOH
  const moh = computeMOH(core);

  // 3. Coverage
  const coverageInput: CoverageInput = {
    daysInRange: range.totalDaysInRange,
    documentedDays: core.documentedDays,
    weatherDaysAvailable: input.weatherDaysAvailable,
    mecfsDaysDocumented: input.mecfsData
      ? input.mecfsData.filter((d) => d.meCfsMax != null).length
      : null,
    prophylaxisInjectionEvents: input.prophylaxisInjectionEvents,
    prophylaxisCyclesInRange: input.prophylaxisCyclesInRange,
  };
  const coverage = computeCoverage(coverageInput);

  // 4. ME/CFS (if data provided)
  const mecfs = input.mecfsData
    ? computeMecfsSummary({
        daysInRange: range.totalDaysInRange,
        dayMeCfsLevels: input.mecfsData,
      })
    : null;

  // 5. Weather Association (Phase 3)
  const weather = input.weatherDayFeatures?.length
    ? computeWeatherAssociation(input.weatherDayFeatures)
    : null;

  // 6. Build Findings for LLM
  const insightsForLLM = buildInsights(core, moh, coverage, mecfs, weather);

  // 7. Assemble
  const diaryCoverage = coverage.diary.ratio;
  const mecfsDaysDocumented = mecfs?.documentedDaysMecfs ?? null;
  const mecfsCoverage = coverage.mecfs?.ratio ?? null;

  return {
    version: ANALYSIS_V2_VERSION,
    definitions: ANALYSIS_DEFINITIONS,
    basis: {
      range: {
        startISO: range.startISO,
        endISO: range.endISO,
        timezone: range.timezone,
        totalDaysInRange: range.totalDaysInRange,
      },
      documentedDays: core.documentedDays,
      diaryCoverage,
      weatherDays: input.weatherDaysAvailable ?? null,
      weatherCoverage: coverage.weather?.ratio ?? null,
      mecfsDaysDocumented,
      mecfsCoverage,
      notesDaysWithAnyText: input.notesDaysWithAnyText ?? null,
    },
    coreMetrics: core,
    moh,
    coverage,
    mecfs,
    weather,
    prophylaxis: null, // Phase 3 (prophylaxis TBD)
    insightsForLLM,
  };
}

// ─── Findings Builder ────────────────────────────────────────────────────

function buildInsights(
  core: ReturnType<typeof computeCoreMetrics>,
  moh: ReturnType<typeof computeMOH>,
  coverage: ReturnType<typeof computeCoverage>,
  mecfs: ReturnType<typeof computeMecfsSummary> | null,
  weather: ReturnType<typeof computeWeatherAssociation> | null
): InsightsForLLM {
  const findings: Finding[] = [];

  const baseDiary = {
    nDays: core.documentedDays,
    coverage: core.daysInRange > 0 ? core.documentedDays / core.daysInRange : 0,
  };

  // Coverage finding
  const coverageConfidence: ConfidenceLevel =
    baseDiary.coverage >= 0.8 ? "high" : baseDiary.coverage >= 0.6 ? "medium" : "low";

  findings.push({
    id: "coverage_diary",
    category: "Coverage",
    title: "Dokumentationsabdeckung",
    statement: `${core.documentedDays} von ${core.daysInRange} Tagen dokumentiert (${Math.round(baseDiary.coverage * 100)}%).`,
    metricsUsed: ["core.documentedDays", "core.daysInRange", "coverage.diary.ratio"],
    basis: baseDiary,
    confidence: coverageConfidence,
  });

  // Core headache summary
  findings.push({
    id: "core_headache_summary",
    category: "Core",
    title: "Kopfschmerztage",
    statement: `${core.headacheDays} Kopfschmerztage in ${core.daysInRange} Kalendertagen` +
      (core.avgPainOnHeadacheDays != null
        ? ` (Ø Intensität ${core.avgPainOnHeadacheDays}, max ${core.maxPain}).`
        : "."),
    metricsUsed: [
      "core.headacheDays",
      "core.daysInRange",
      "core.avgPainOnHeadacheDays",
      "core.maxPain",
    ],
    basis: baseDiary,
    confidence: coverageConfidence,
  });

  // MOH finding (if threshold crossed)
  if (moh.riskLevel !== "none") {
    findings.push({
      id: "moh_risk",
      category: "MOH",
      title: "MÜK-Risiko",
      statement: moh.rationale,
      metricsUsed: [
        "moh.triggers.acuteMedDaysPer30",
        "moh.triggers.triptanDaysPer30",
        "core.acuteMedDays",
        "core.triptanDays",
      ],
      basis: baseDiary,
      confidence: moh.confidence,
    });
  }

  // ME/CFS guardrail finding
  if (mecfs && !mecfs.guardrail.ok) {
    findings.push({
      id: "mecfs_guardrail",
      category: "MeCFS",
      title: "ME/CFS-Datenbasis",
      statement:
        mecfs.guardrail.reason === "NO_DATA"
          ? "Keine ME/CFS-Dokumentation im Zeitraum vorhanden."
          : `ME/CFS nur an ${mecfs.documentedDaysMecfs} Tagen dokumentiert. Mindestens 20 Tage für belastbare Auswertung empfohlen.`,
      metricsUsed: ["mecfs.documentedDaysMecfs", "mecfs.guardrail.reason"],
      basis: {
        nDays: mecfs.documentedDaysMecfs,
        coverage:
          mecfs.totalDaysInRange > 0
            ? mecfs.documentedDaysMecfs / mecfs.totalDaysInRange
            : 0,
      },
      confidence: "low",
      limitations: ["Keine Hochrechnung bei unzureichender Datenbasis."],
    });
  }

  // Weather association finding (Phase 3)
  if (weather && weather.pressureDelta24h.enabled) {
    const delta = weather.pressureDelta24h;
    const stableBucket = delta.buckets.find((b) => b.label.includes("Stabil"));
    const dropBuckets = delta.buckets.filter(
      (b) => !b.label.includes("Stabil") && b.nDays >= 5
    );
    const strongestDrop = dropBuckets.length > 0 ? dropBuckets[0] : null;

    let statement = `Wetter-Kopfschmerz-Assoziation auf Basis von ${weather.coverage.daysWithDelta24h} Tagen mit Δ24h-Daten.`;
    if (strongestDrop && stableBucket && stableBucket.nDays >= 5) {
      const dropPct = Math.round(strongestDrop.headacheRate * 100);
      const stablePct = Math.round(stableBucket.headacheRate * 100);
      statement += ` ${strongestDrop.label}: Kopfschmerzrate ${dropPct}% vs. ${stablePct}% bei stabilem Druck.`;
    }
    if (delta.relativeRisk?.rr != null) {
      statement += ` Relatives Risiko: ${delta.relativeRisk.rr}×.`;
    }

    findings.push({
      id: "weather_pressure_delta",
      category: "Weather",
      title: "Luftdruck & Kopfschmerz",
      statement,
      metricsUsed: [
        "weather.coverage.daysWithDelta24h",
        "weather.pressureDelta24h.buckets",
        "weather.pressureDelta24h.relativeRisk",
      ],
      basis: {
        nDays: weather.coverage.daysWithDelta24h,
        coverage: weather.coverage.ratioDelta24h,
      },
      confidence: delta.confidence === "high" ? "high" : delta.confidence === "medium" ? "medium" : "low",
      limitations: [
        weather.disclaimer,
        ...delta.notes,
      ],
    });
  }

  return {
    findings,
    doNotDo: [
      "Do not recalculate any counts from raw data — use only the provided metrics.",
      "Do not extrapolate ME/CFS severity when guardrail.ok is false.",
      "Do not claim weather causality — only associations with stated confidence.",
      "Do not infer migraine days — migraineDays is null because no diagnostic flag exists.",
      "Do not use alarmist language — use 'orientierender Hinweis' and 'keine Diagnose'.",
      "Do not invent weather statistics — use only the pre-computed buckets and relative risk values.",
    ],
  };
}
