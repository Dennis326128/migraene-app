/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Analysis Definitions & Thresholds
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SINGLE SOURCE OF TRUTH for counting rules and clinical thresholds.
 * Every definition is a plain string for clinical transparency.
 * Every threshold is an exported constant for deterministic checks.
 */

import type { AnalysisDefinitions } from "./types.ts";

// ─── Thresholds (constants) ──────────────────────────────────────────────

/** MOH: Triptan days per 30 calendar days triggering "likely" */
export const TRIPTAN_DAYS_THRESHOLD = 10;

/** MOH: Acute medication days per 30 calendar days triggering "likely" */
export const ACUTE_MED_DAYS_THRESHOLD = 10;

/** ME/CFS: Minimum documented days required for any inference */
export const ME_CFS_MIN_DAYS_FOR_INFERENCE = 20;

/** Coverage: Below this diary coverage ratio, emit a warning */
export const LOW_DIARY_COVERAGE_THRESHOLD = 0.6;

/** Coverage: Below this weather coverage ratio, restrict weather analysis */
export const LOW_WEATHER_COVERAGE_THRESHOLD = 0.5;

// ─── Definitions Object ─────────────────────────────────────────────────

export const ANALYSIS_DEFINITIONS: AnalysisDefinitions = {
  version: "2.0.0",
  rules: {
    calendarDaysInRange:
      "Number of calendar days between startISO and endISO (inclusive).",
    documentedDay:
      "A calendar day with at least one diary entry (regardless of pain level or content).",
    headacheDay:
      "A calendar day where the maximum pain intensity > 0.",
    acuteMedDay:
      "A calendar day with at least one acute medication intake recorded.",
    triptanDay:
      "A calendar day with at least one triptan intake recorded.",
    intake:
      "One recorded dose/tablet/injection. Multiple intakes per day are counted individually.",
    entry:
      "One diary entry/episode. Multiple entries per day are possible; entries are used for detail tables only.",
  },
  note:
    "The physician core block uses exclusively day-based counts. Intakes and entries are supplementary detail metrics.",
};
