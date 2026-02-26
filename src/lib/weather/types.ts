/**
 * SSOT types for weather–headache analysis.
 */

export type WeatherConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export type WeatherJoinReason =
  | 'entry-weather-id-hit'
  | 'entry-weather-id-miss'
  | 'entry-weather-id-miss->snapshot'
  | 'snapshot-by-date'
  | 'none';

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
  absDiff: number;
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
  daysWithEntryWeather?: number;
  daysWithSnapshotWeather?: number;
  daysWithNoWeather?: number;
}

export interface WeatherAnalysisV2 {
  coverage: WeatherCoverageInfo;
  pressureDelta24h: WeatherPressureDelta24h;
  absolutePressure: WeatherAbsolutePressure | null;
  disclaimer: string;
}

export interface WeatherDayFeature {
  date: string;
  documented: boolean;
  painMax: number;
  hadHeadache: boolean;
  hadAcuteMed: boolean;
  pressureMb: number | null;
  pressureChange24h: number | null;
  temperatureC: number | null;
  humidity: number | null;
  weatherCoverage: 'entry' | 'snapshot' | 'none';
  /** Debug-only: reason for weather join. Not shown in UI. */
  weatherJoinReason?: WeatherJoinReason;
}

export interface WeatherCoverageCounts {
  daysWithEntryWeather: number;
  daysWithSnapshotWeather: number;
  daysWithNoWeather: number;
}

export interface ComputeWeatherAssociationOptions {
  coverageCounts?: WeatherCoverageCounts;
}
