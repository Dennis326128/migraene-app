/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Input Normalization & Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Reine Funktionen. Keine Date-Bibliotheken. Nur String-Checks.
 */

import type { ReportOptions, ReportRange } from './types';

const DEFAULT_OPTIONS: ReportOptions = {
  includeMeCfs: true,
  includeSymptoms: true,
  includeMedications: true,
  includeTimeOfDay: true,
  includeWeather: true,
};

/**
 * Fills missing options with defaults (all true).
 */
export function normalizeOptions(options?: Partial<ReportOptions>): ReportOptions {
  if (!options) return { ...DEFAULT_OPTIONS };
  return {
    includeMeCfs: options.includeMeCfs ?? DEFAULT_OPTIONS.includeMeCfs,
    includeSymptoms: options.includeSymptoms ?? DEFAULT_OPTIONS.includeSymptoms,
    includeMedications: options.includeMedications ?? DEFAULT_OPTIONS.includeMedications,
    includeTimeOfDay: options.includeTimeOfDay ?? DEFAULT_OPTIONS.includeTimeOfDay,
    includeWeather: options.includeWeather ?? DEFAULT_OPTIONS.includeWeather,
  };
}

/**
 * Validates and clamps range: ensures startISO <= endISO (lexicographic).
 * No date library needed — YYYY-MM-DD sorts lexicographically.
 */
export function clampRange(range: ReportRange): ReportRange {
  if (range.startISO > range.endISO) {
    return { ...range, startISO: range.endISO, endISO: range.startISO };
  }
  return range;
}
