/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Re-export from SSOT — src/lib/weather/computeWeatherAssociation.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

export {
  computeWeatherAssociation,
  type WeatherConfidence,
  type WeatherBucketResult,
  type RelativeRiskResult,
  type WeatherPressureDelta24h,
  type WeatherAbsolutePressure,
  type WeatherCoverageInfo,
  type WeatherAnalysisV2,
  type WeatherDayFeature,
  type WeatherCoverageCounts,
  type ComputeWeatherAssociationOptions,
} from '@/lib/weather/computeWeatherAssociation';

export type { WeatherCoverageCounts as WeatherCoverageCountsAlias } from '@/lib/report-v2/adapters/buildWeatherDayFeatures';
