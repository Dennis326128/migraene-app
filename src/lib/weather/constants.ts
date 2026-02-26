/**
 * SSOT constants for weather–headache analysis.
 * Thresholds, labels, and disclaimer — shared by UI, PDF, and LLM.
 */

// ─── Thresholds ─────────────────────────────────────────────────────────

export const MIN_DAYS_FOR_STATEMENT = 20;
export const MIN_DAYS_PER_BUCKET = 5;
export const HIGH_CONFIDENCE_DAYS = 60;
export const MEDIUM_CONFIDENCE_DAYS = 30;
export const MIN_DAYS_ABSOLUTE_PRESSURE = 60;
export const DELTA_STRONG_DROP = -8;
export const DELTA_MODERATE_DROP = -3;
export const PRESSURE_LOW = 1005;
export const PRESSURE_HIGH = 1025;

/** Minimum days in at least one bucket for confounding hint to fire */
export const MIN_DAYS_CONFOUNDING_HINT = 20;

// ─── Labels ─────────────────────────────────────────────────────────────

export const PRESSURE_DELTA_BUCKET_LABELS = {
  strongDrop: `Starker Abfall (\u2264 ${DELTA_STRONG_DROP} hPa)`,
  moderateDrop: `Moderater Abfall (${DELTA_STRONG_DROP} bis ${DELTA_MODERATE_DROP} hPa)`,
  stableOrRise: `Stabil / Anstieg (> ${DELTA_MODERATE_DROP} hPa)`,
} as const;

export const ABS_PRESSURE_BUCKET_LABELS = {
  low: `Tiefdruck (< ${PRESSURE_LOW} hPa)`,
  normal: `Normal (${PRESSURE_LOW}\u2013${PRESSURE_HIGH} hPa)`,
  high: `Hochdruck (> ${PRESSURE_HIGH} hPa)`,
} as const;

// ─── Disclaimer ─────────────────────────────────────────────────────────

export const WEATHER_DISCLAIMER =
  "Orientierender Hinweis basierend auf Ihrer Dokumentation. Zusammenhang \u2260 Ursache. Keine Diagnose.";
