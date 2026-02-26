/**
 * ═══════════════════════════════════════════════════════════════════════════
 * computeWeatherAssociation — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deterministic, clinically interpretable weather–headache association.
 * Pure function. No DB, no I/O, no side effects. Isomorphic (Browser + Deno).
 *
 * IMPORTANT: Only documented days (documented=true) are used as analysis basis.
 */

import type {
  WeatherDayFeature,
  WeatherBucketResult,
  RelativeRiskResult,
  WeatherPressureDelta24h,
  WeatherAbsolutePressure,
  WeatherCoverageInfo,
  WeatherAnalysisV2,
  ComputeWeatherAssociationOptions,
  WeatherConfidence,
} from './types';

import {
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

import { hasAnyWeatherValue, hasDelta } from './coverage';

// Re-export everything so existing imports from this file keep working
export * from './types';
export * from './constants';
export { hasAnyWeatherValue, hasDelta } from './coverage';
export { fmtPct, fmtPain, fmtRR, fmtAbsDiff } from './format';

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
    meanPainMax: nDays > 0 ? mean(painValues) : null,
    acuteMedRate: nDays > 0 ? round2(acuteMedDays / nDays) : 0,
  };
}

/**
 * Compute relative risk. absDiff is ALWAYS compare.headacheRate - reference.headacheRate.
 * rr is null when reference.headacheRate === 0 (division by zero).
 */
function computeRelativeRisk(
  reference: WeatherBucketResult,
  compare: WeatherBucketResult
): RelativeRiskResult | null {
  if (reference.nDays < MIN_DAYS_PER_BUCKET || compare.nDays < MIN_DAYS_PER_BUCKET) return null;
  const absDiff = round2(compare.headacheRate - reference.headacheRate);
  if (reference.headacheRate === 0) {
    return { referenceLabel: reference.label, compareLabel: compare.label, rr: null, absDiff };
  }
  return {
    referenceLabel: reference.label,
    compareLabel: compare.label,
    rr: round2(compare.headacheRate / reference.headacheRate),
    absDiff,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────

export function computeWeatherAssociation(
  features: WeatherDayFeature[],
  options?: ComputeWeatherAssociationOptions
): WeatherAnalysisV2 {
  const documented = features.filter((f) => f.documented);
  const daysDocumented = documented.length;
  const daysWithWeather = documented.filter(hasAnyWeatherValue).length;
  const daysWithDelta = documented.filter(hasDelta).length;

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
  const paired = documentedDays.filter(hasDelta);
  const confidence = determineConfidence(paired.length);

  if (confidence === "insufficient") {
    if (paired.length === 0) notes.push("Keine \u039424h-Daten vorhanden.");
    else notes.push(`Nur ${paired.length} Tage mit \u039424h-Daten. Mindestens ${MIN_DAYS_FOR_STATEMENT} ben\u00f6tigt.`);
    return { enabled: false, confidence, buckets: [], relativeRisk: null, notes };
  }

  const strongDrop = paired.filter((f) => f.pressureChange24h! <= DELTA_STRONG_DROP);
  const moderateDrop = paired.filter((f) => f.pressureChange24h! > DELTA_STRONG_DROP && f.pressureChange24h! <= DELTA_MODERATE_DROP);
  const stableOrRise = paired.filter((f) => f.pressureChange24h! > DELTA_MODERATE_DROP);

  const bucketA = buildBucket(PRESSURE_DELTA_BUCKET_LABELS.strongDrop, strongDrop);
  const bucketB = buildBucket(PRESSURE_DELTA_BUCKET_LABELS.moderateDrop, moderateDrop);
  const bucketC = buildBucket(PRESSURE_DELTA_BUCKET_LABELS.stableOrRise, stableOrRise);
  const buckets = [bucketA, bucketB, bucketC];

  for (const b of buckets) {
    if (b.nDays > 0 && b.nDays < MIN_DAYS_PER_BUCKET) {
      notes.push(`${b.label}: nur ${b.nDays} Tage (< ${MIN_DAYS_PER_BUCKET}), eingeschr\u00e4nkte Aussagekraft.`);
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
    notes.push("\u039424h derzeit nur bei einem Teil der Tage verf\u00fcgbar. Aussagekraft kann eingeschr\u00e4nkt sein.");
  }

  // Confounding hint: only if at least 2 buckets with MIN_DAYS_PER_BUCKET AND at least 1 with MIN_DAYS_CONFOUNDING_HINT
  const qualifiedBuckets = buckets.filter((b) => b.nDays >= MIN_DAYS_PER_BUCKET);
  const hasLargeBucket = buckets.some((b) => b.nDays >= MIN_DAYS_CONFOUNDING_HINT);
  if (qualifiedBuckets.length >= 2 && hasLargeBucket) {
    const acuteMedRates = qualifiedBuckets.map((b) => b.acuteMedRate);
    if (Math.max(...acuteMedRates) - Math.min(...acuteMedRates) > 0.2) {
      notes.push("Akutmedikation unterscheidet sich zwischen Gruppen; das kann die beobachtete Schmerzintensit\u00e4t beeinflussen.");
    }
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
    buildBucket(ABS_PRESSURE_BUCKET_LABELS.low, low),
    buildBucket(ABS_PRESSURE_BUCKET_LABELS.normal, normal),
    buildBucket(ABS_PRESSURE_BUCKET_LABELS.high, high),
  ];

  for (const b of buckets) {
    if (b.nDays > 0 && b.nDays < MIN_DAYS_PER_BUCKET) {
      notes.push(`${b.label}: nur ${b.nDays} Tage, eingeschr\u00e4nkte Aussagekraft.`);
    }
  }

  return { enabled: true, confidence, buckets, notes };
}
