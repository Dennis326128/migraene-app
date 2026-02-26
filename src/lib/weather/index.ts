/**
 * Barrel export for weather analysis SSOT module.
 */

// Types
export type {
  WeatherConfidence,
  WeatherJoinReason,
  WeatherBucketResult,
  RelativeRiskResult,
  WeatherPressureDelta24h,
  WeatherAbsolutePressure,
  WeatherCoverageInfo,
  WeatherAnalysisV2,
  WeatherDayFeature,
  WeatherCoverageCounts,
  ComputeWeatherAssociationOptions,
} from './types';

// Constants
export {
  MIN_DAYS_FOR_STATEMENT,
  MIN_DAYS_PER_BUCKET,
  HIGH_CONFIDENCE_DAYS,
  MEDIUM_CONFIDENCE_DAYS,
  MIN_DAYS_ABSOLUTE_PRESSURE,
  DELTA_STRONG_DROP,
  DELTA_MODERATE_DROP,
  PRESSURE_LOW,
  PRESSURE_HIGH,
  MIN_DAYS_CONFOUNDING_HINT,
  PRESSURE_DELTA_BUCKET_LABELS,
  ABS_PRESSURE_BUCKET_LABELS,
  WEATHER_DISCLAIMER,
} from './constants';

// Coverage helpers
export { hasAnyWeatherValue, hasDelta } from './coverage';

// Format helpers
export { fmtPct, fmtPain, fmtRR, fmtAbsDiff } from './format';

// Core computation
export { computeWeatherAssociation } from './computeWeatherAssociation';
