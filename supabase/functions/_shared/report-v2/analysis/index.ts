/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Analysis V2 — Public API
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Types
export type {
  AnalysisV2,
  AnalysisDefinitions,
  AnalysisCoverage,
  CoverageModule,
  CoverageWarning,
  CoreMetricsV2,
  MOHAnalysisV2,
  MOHRiskLevel,
  MOHTriggers,
  MeCfsSummaryV2,
  MeCfsSegment,
  MeCfsGuardrail,
  MeCfsGuardrailReason,
  InsightsForLLM,
  Finding,
  FindingCategory,
  ConfidenceLevel,
  WeatherAnalysisV2,
  WeatherDayFeature,
  WeatherConfidence,
  WeatherBucketResult,
  WeatherPressureDelta24h,
  WeatherAbsolutePressure,
  WeatherCoverageInfo,
  RelativeRiskResult,
  ProphylaxisAnalysisV2,
} from "./types.ts";

export { ANALYSIS_V2_VERSION } from "./types.ts";

// Definitions & Thresholds
export {
  ANALYSIS_DEFINITIONS,
  TRIPTAN_DAYS_THRESHOLD,
  ACUTE_MED_DAYS_THRESHOLD,
  ME_CFS_MIN_DAYS_FOR_INFERENCE,
  LOW_DIARY_COVERAGE_THRESHOLD,
  LOW_WEATHER_COVERAGE_THRESHOLD,
} from "./definitions.ts";

// Compute functions
export { computeCoreMetrics } from "./coreMetrics.ts";
export type { CoreMetricsInput } from "./coreMetrics.ts";

export { computeMOH } from "./moh.ts";

export { computeCoverage } from "./coverage.ts";
export type { CoverageInput } from "./coverage.ts";

export { computeMecfsSummary } from "./mecfs.ts";
export type { MeCfsInput } from "./mecfs.ts";

// Weather Association
export { computeWeatherAssociation } from "./weatherAssociation.ts";
export {
  MIN_DAYS_FOR_STATEMENT,
  MIN_DAYS_PER_BUCKET,
  DELTA_STRONG_DROP,
  DELTA_MODERATE_DROP,
  PRESSURE_LOW,
  PRESSURE_HIGH,
  WEATHER_DISCLAIMER,
} from "./weatherAssociation.ts";

// Orchestrator
export { buildAnalysisV2 } from "./buildAnalysisV2.ts";
export type { BuildAnalysisV2Input } from "./buildAnalysisV2.ts";
