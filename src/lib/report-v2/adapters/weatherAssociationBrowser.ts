/**
 * ═══════════════════════════════════════════════════════════════════════════
 * @deprecated — Use computeWeatherAssociation from weatherAssociation.ts
 *
 * This file re-exports the SSOT weatherAssociation module for browser use.
 * No separate computation logic. Single Source of Truth.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type { WeatherDayFeature } from './buildWeatherDayFeatures';

export type { WeatherCoverageCounts } from './buildWeatherDayFeatures';

// ─── Types (re-exported for consumers) ──────────────────────────────────

export type WeatherConfidence = 'high' | 'medium' | 'low' | 'insufficient';

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

import type { WeatherDayFeature } from './buildWeatherDayFeatures';
import type { WeatherCoverageCounts } from './buildWeatherDayFeatures';

// ─── Constants ──────────────────────────────────────────────────────────

const MIN_DAYS_FOR_STATEMENT = 20;
const MIN_DAYS_PER_BUCKET = 5;
const HIGH_CONFIDENCE_DAYS = 60;
const MEDIUM_CONFIDENCE_DAYS = 30;
const MIN_DAYS_ABSOLUTE_PRESSURE = 60;
const DELTA_STRONG_DROP = -8;
const DELTA_MODERATE_DROP = -3;
const PRESSURE_LOW = 1005;
const PRESSURE_HIGH = 1025;

const WEATHER_DISCLAIMER =
  "Orientierender Hinweis basierend auf Ihrer Dokumentation. Zusammenhang ≠ Ursache. Keine Diagnose.";

// ─── Helpers ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

function determineConfidence(nDays: number): WeatherConfidence {
  if (nDays >= HIGH_CONFIDENCE_DAYS) return "high";
  if (nDays >= MEDIUM_CONFIDENCE_DAYS) return "medium";
  if (nDays >= MIN_DAYS_FOR_STATEMENT) return "low";
  return "insufficient";
}

function buildBucket(label: string, days: WeatherDayFeature[]): WeatherBucketResult {
  const nDays = days.length;
  const headacheDays = days.filter((d) => d.hadHeadache).length;
  const acuteMedDays = days.filter((d) => d.hadAcuteMed).length;
  const painValues = days.filter((d) => d.hadHeadache).map((d) => d.painMax);
  return {
    label,
    nDays,
    headacheRate: nDays > 0 ? round2(headacheDays / nDays) : 0,
    meanPainMax: mean(painValues),
    acuteMedRate: nDays > 0 ? round2(acuteMedDays / nDays) : 0,
  };
}

function computeRelativeRisk(
  reference: WeatherBucketResult,
  compare: WeatherBucketResult
): RelativeRiskResult | null {
  if (reference.nDays < MIN_DAYS_PER_BUCKET || compare.nDays < MIN_DAYS_PER_BUCKET) return null;
  if (reference.headacheRate === 0) {
    return { referenceLabel: reference.label, compareLabel: compare.label, rr: null, absDiff: round2(compare.headacheRate) };
  }
  return {
    referenceLabel: reference.label,
    compareLabel: compare.label,
    rr: round2(compare.headacheRate / reference.headacheRate),
    absDiff: round2(compare.headacheRate - reference.headacheRate),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────

export interface ComputeWeatherAssociationOptions {
  coverageCounts?: WeatherCoverageCounts;
}

export function computeWeatherAssociation(
  features: WeatherDayFeature[],
  options?: ComputeWeatherAssociationOptions
): WeatherAnalysisV2 {
  const documented = features.filter((f) => f.documented);
  const daysDocumented = documented.length;
  const daysWithWeather = documented.filter(
    (f) => f.pressureMb != null || f.temperatureC != null || f.humidity != null || f.pressureChange24h != null
  ).length;
  const daysWithDelta = documented.filter((f) => f.pressureChange24h != null).length;

  // Coverage counts: from options or compute from features.weatherCoverage
  let entryCount = 0;
  let snapshotCount = 0;
  let noneCount = 0;

  if (options?.coverageCounts) {
    entryCount = options.coverageCounts.daysWithEntryWeather;
    snapshotCount = options.coverageCounts.daysWithSnapshotWeather;
    noneCount = options.coverageCounts.daysWithNoWeather;
  } else {
    for (const f of documented) {
      if (f.weatherCoverage === 'entry') entryCount++;
      else if (f.weatherCoverage === 'snapshot') snapshotCount++;
      else noneCount++;
    }
  }

  const coverage: WeatherCoverageInfo = {
    daysDocumented,
    daysWithWeather,
    daysWithDelta24h: daysWithDelta,
    ratioWeather: daysDocumented > 0 ? round2(daysWithWeather / daysDocumented) : 0,
    ratioDelta24h: daysDocumented > 0 ? round2(daysWithDelta / daysDocumented) : 0,
    daysWithEntryWeather: entryCount,
    daysWithSnapshotWeather: snapshotCount,
    daysWithNoWeather: noneCount,
  };

  const pressureDelta24h = analyzePressureDelta(documented, coverage);
  const absolutePressure = analyzeAbsolutePressure(documented);

  return { coverage, pressureDelta24h, absolutePressure, disclaimer: WEATHER_DISCLAIMER };
}

function analyzePressureDelta(documentedDays: WeatherDayFeature[], coverage: WeatherCoverageInfo): WeatherPressureDelta24h {
  const notes: string[] = [];
  const paired = documentedDays.filter((f) => f.pressureChange24h != null);
  const confidence = determineConfidence(paired.length);

  if (confidence === "insufficient") {
    if (paired.length === 0) notes.push("Keine Δ24h-Daten vorhanden.");
    else notes.push(`Nur ${paired.length} Tage mit Δ24h-Daten. Mindestens ${MIN_DAYS_FOR_STATEMENT} benötigt.`);
    return { enabled: false, confidence, buckets: [], relativeRisk: null, notes };
  }

  const strongDrop = paired.filter((f) => f.pressureChange24h! <= DELTA_STRONG_DROP);
  const moderateDrop = paired.filter((f) => f.pressureChange24h! > DELTA_STRONG_DROP && f.pressureChange24h! <= DELTA_MODERATE_DROP);
  const stableOrRise = paired.filter((f) => f.pressureChange24h! > DELTA_MODERATE_DROP);

  const bucketA = buildBucket("Starker Abfall (≤ −8 hPa)", strongDrop);
  const bucketB = buildBucket("Moderater Abfall (−8 bis −3 hPa)", moderateDrop);
  const bucketC = buildBucket("Stabil / Anstieg (> −3 hPa)", stableOrRise);
  const buckets = [bucketA, bucketB, bucketC];

  for (const b of buckets) {
    if (b.nDays > 0 && b.nDays < MIN_DAYS_PER_BUCKET) {
      notes.push(`${b.label}: nur ${b.nDays} Tage (< ${MIN_DAYS_PER_BUCKET}), eingeschränkte Aussagekraft.`);
    }
  }

  let relativeRisk: RelativeRiskResult | null = null;
  if (bucketC.nDays >= MIN_DAYS_PER_BUCKET) {
    const compareBucket = bucketA.nDays >= MIN_DAYS_PER_BUCKET ? bucketA : bucketB;
    if (compareBucket.nDays >= MIN_DAYS_PER_BUCKET) {
      relativeRisk = computeRelativeRisk(bucketC, compareBucket);
    }
  }

  if (coverage.ratioDelta24h < 0.5) {
    notes.push("Δ24h derzeit nur bei einem Teil der Tage verfügbar. Aussagekraft kann eingeschränkt sein.");
  }

  const acuteMedRates = buckets.filter((b) => b.nDays >= MIN_DAYS_PER_BUCKET).map((b) => b.acuteMedRate);
  if (acuteMedRates.length >= 2 && Math.max(...acuteMedRates) - Math.min(...acuteMedRates) > 0.2) {
    notes.push("Akutmedikationsrate variiert zwischen Druckgruppen. Medikation kann die Schmerzintensität beeinflussen.");
  }

  return { enabled: true, confidence, buckets, relativeRisk, notes };
}

function analyzeAbsolutePressure(documentedDays: WeatherDayFeature[]): WeatherAbsolutePressure | null {
  const paired = documentedDays.filter((f) => f.pressureMb != null);
  if (paired.length < MIN_DAYS_ABSOLUTE_PRESSURE) return null;

  const notes: string[] = [];
  const confidence = determineConfidence(paired.length);

  const low = paired.filter((f) => f.pressureMb! < PRESSURE_LOW);
  const normal = paired.filter((f) => f.pressureMb! >= PRESSURE_LOW && f.pressureMb! <= PRESSURE_HIGH);
  const high = paired.filter((f) => f.pressureMb! > PRESSURE_HIGH);

  const buckets = [
    buildBucket(`Tiefdruck (< ${PRESSURE_LOW} hPa)`, low),
    buildBucket(`Normal (${PRESSURE_LOW}–${PRESSURE_HIGH} hPa)`, normal),
    buildBucket(`Hochdruck (> ${PRESSURE_HIGH} hPa)`, high),
  ];

  for (const b of buckets) {
    if (b.nDays > 0 && b.nDays < MIN_DAYS_PER_BUCKET) {
      notes.push(`${b.label}: nur ${b.nDays} Tage, eingeschränkte Aussagekraft.`);
    }
  }

  return { enabled: true, confidence, buckets, notes };
}
