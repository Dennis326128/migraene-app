/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AnalysisV2 — SSOT Contract for Clinical Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure types. No DB imports, no UI labels, no side effects.
 * Compatible with both browser (React) and Deno (Edge Functions).
 *
 * Every metric in the physician core block is DAY-BASED (calendar day counts).
 * "Entries" / "intakes" are only for detail tables / timing charts.
 */

// ─── Version ─────────────────────────────────────────────────────────────

export const ANALYSIS_V2_VERSION = "2.0.0";

// ─── Confidence ──────────────────────────────────────────────────────────

export type ConfidenceLevel = "low" | "medium" | "high";

// ─── Definitions (transparency for clinicians) ──────────────────────────

export interface AnalysisDefinitions {
  version: string;
  rules: {
    calendarDaysInRange: string;
    documentedDay: string;
    headacheDay: string;
    acuteMedDay: string;
    triptanDay: string;
    intake: string;
    entry: string;
  };
  note: string;
}

// ─── Coverage ────────────────────────────────────────────────────────────

export interface CoverageModule {
  available: number;
  total: number;
  ratio: number;
}

export interface CoverageWarning {
  module: string;
  message: string;
  ratio: number;
}

export interface AnalysisCoverage {
  diary: CoverageModule;
  weather: CoverageModule | null;
  mecfs: CoverageModule | null;
  prophylaxis: {
    injectionEventsCount: number;
    cyclesInRange: number;
    preWindowCoverage: number | null;
    postWindowCoverage: number | null;
  } | null;
  warnings: CoverageWarning[];
}

// ─── Core Metrics (day-based, deterministic) ─────────────────────────────

export interface CoreMetricsV2 {
  daysInRange: number;
  documentedDays: number;
  undocumentedDays: number;
  headacheDays: number;
  avgPainOnHeadacheDays: number | null;
  medianPainOnHeadacheDays: number | null;
  maxPain: number | null;
  acuteMedDays: number;
  triptanDays: number;
  /** Absolute intake counts (if available from data) */
  totalIntakesAcute: number | null;
  totalIntakesTriptan: number | null;
  /** Explicitly null — no migraine flag exists in the data model */
  migraineDays: null;
}

// ─── MOH Analysis ────────────────────────────────────────────────────────

export type MOHRiskLevel = "none" | "possible" | "likely";

export interface MOHTriggers {
  acuteMedDaysPer30: number;
  triptanDaysPer30: number;
  thresholds: {
    acuteMedDaysPerMonth: number;
    triptanDaysPerMonth: number;
  };
}

export interface MOHAnalysisV2 {
  riskLevel: MOHRiskLevel;
  triggers: MOHTriggers;
  rationale: string;
  confidence: ConfidenceLevel;
}

// ─── ME/CFS Summary ─────────────────────────────────────────────────────

export type MeCfsGuardrailReason = "TOO_FEW_DAYS" | "NO_DATA";

export interface MeCfsGuardrail {
  ok: boolean;
  reason?: MeCfsGuardrailReason;
}

export interface MeCfsSegment {
  key: "none" | "mild" | "moderate" | "severe" | "undocumented";
  days: number;
}

export interface MeCfsSummaryV2 {
  segments: MeCfsSegment[];
  documentedDaysMecfs: number;
  totalDaysInRange: number;
  guardrail: MeCfsGuardrail;
  /** No extrapolation flag — always true in V2 */
  noExtrapolation: true;
}

// ─── Findings (for LLM and clinical display) ─────────────────────────────

export type FindingCategory =
  | "Core"
  | "MOH"
  | "Coverage"
  | "MeCFS"
  | "Weather"
  | "Prophylaxis"
  | "MedicationEffect"
  | "Notes";

export interface Finding {
  id: string;
  category: FindingCategory;
  title: string;
  statement: string;
  metricsUsed: string[];
  basis: {
    nDays: number;
    coverage: number;
  };
  confidence: ConfidenceLevel;
  limitations?: string[];
}

export interface InsightsForLLM {
  findings: Finding[];
  doNotDo: string[];
}

// ─── Weather Day Feature (input for weather association) ─────────────────

export interface WeatherDayFeature {
  date: string;
  /** Whether this day was documented in the diary (entry exists) */
  documented: boolean;
  painMax: number;
  hadHeadache: boolean;
  hadAcuteMed: boolean;
  pressureMb: number | null;
  pressureChange24h: number | null;
  temperatureC: number | null;
  humidity: number | null;
  weatherCoverage: "entry" | "snapshot" | "none";
}

// ─── Weather Association Analysis ────────────────────────────────────────

export type WeatherConfidence = "high" | "medium" | "low" | "insufficient";

export interface WeatherBucketResult {
  label: string;
  nDays: number;
  headacheRate: number;
  meanPainMax: number | null;
  acuteMedRate: number;
}

export interface RelativeRiskResult {
  referenceLabel: string;
  compareLabel: string;
  rr: number | null;
  absDiff: number | null;
}

export interface WeatherPressureDelta24h {
  enabled: boolean;
  confidence: WeatherConfidence;
  buckets: WeatherBucketResult[];
  relativeRisk: RelativeRiskResult | null;
  notes: string[];
}

export interface WeatherAbsolutePressure {
  enabled: boolean;
  confidence: WeatherConfidence;
  buckets: WeatherBucketResult[];
  notes: string[];
}

export interface WeatherCoverageInfo {
  daysDocumented: number;
  daysWithWeather: number;
  daysWithDelta24h: number;
  ratioWeather: number;
  ratioDelta24h: number;
  /** Days where weather came from entry-linked weather_id */
  daysWithEntryWeather?: number;
  /** Days where weather came from snapshot fallback */
  daysWithSnapshotWeather?: number;
  /** Documented days with no weather data at all */
  daysWithNoWeather?: number;
}

export interface WeatherAnalysisV2 {
  coverage: WeatherCoverageInfo;
  pressureDelta24h: WeatherPressureDelta24h;
  absolutePressure: WeatherAbsolutePressure | null;
  disclaimer: string;
}

// ─── Prophylaxis (Phase 3 placeholder) ──────────────────────────────────

export interface ProphylaxisAnalysisV2 {
  courses: unknown[];
  injectionsDetected: unknown[];
  analysis: Record<string, unknown> | null;
  limitations: string[];
}

// ─── Full AnalysisV2 Contract ────────────────────────────────────────────

export interface AnalysisV2 {
  version: string;
  definitions: AnalysisDefinitions;
  basis: {
    range: {
      startISO: string;
      endISO: string;
      timezone: string;
      totalDaysInRange: number;
    };
    documentedDays: number;
    diaryCoverage: number;
    weatherDays: number | null;
    weatherCoverage: number | null;
    mecfsDaysDocumented: number | null;
    mecfsCoverage: number | null;
    notesDaysWithAnyText: number | null;
  };
  coreMetrics: CoreMetricsV2;
  moh: MOHAnalysisV2;
  coverage: AnalysisCoverage;
  mecfs: MeCfsSummaryV2 | null;
  weather: WeatherAnalysisV2 | null;
  prophylaxis: ProphylaxisAnalysisV2 | null;
  insightsForLLM: InsightsForLLM;
}
