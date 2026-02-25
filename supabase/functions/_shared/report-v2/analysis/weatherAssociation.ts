/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Weather Association Analysis V2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deterministic, clinically interpretable weather–headache association.
 * No LLM. No p-hacking. Max 3 core factors.
 *
 * Pure function. No DB, no I/O, no side effects. Isomorphic (Browser + Deno).
 *
 * pressure_change_24h was historically NULL for hourly-archive weather logs
 * because the external API does not provide it for historical data.
 * Since the fetch-weather-hybrid fix (2026-02), new logs compute Δ server-side.
 * A backfill script can retroactively fill older records.
 */

import type {
  WeatherDayFeature,
  WeatherAnalysisV2,
  WeatherConfidence,
  WeatherBucketResult,
  WeatherPressureDelta24h,
  WeatherAbsolutePressure,
  WeatherCoverageInfo,
  RelativeRiskResult,
} from "./types.ts";

// ─── Constants ──────────────────────────────────────────────────────────

/** Minimum paired days (documented + Δ present) for any statement */
export const MIN_DAYS_FOR_STATEMENT = 20;
/** Minimum days per bucket to include in analysis */
export const MIN_DAYS_PER_BUCKET = 5;
/** High confidence threshold */
export const HIGH_CONFIDENCE_DAYS = 60;
/** Medium confidence threshold */
export const MEDIUM_CONFIDENCE_DAYS = 30;
/** Minimum documented+weather days for absolute pressure analysis */
export const MIN_DAYS_ABSOLUTE_PRESSURE = 60;

/** Pressure delta bucket thresholds (hPa) */
export const DELTA_STRONG_DROP = -8;
export const DELTA_MODERATE_DROP = -3;

/** Absolute pressure thresholds (hPa) */
export const PRESSURE_LOW = 1005;
export const PRESSURE_HIGH = 1025;

export const WEATHER_DISCLAIMER =
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

function buildBucket(
  label: string,
  days: WeatherDayFeature[]
): WeatherBucketResult {
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
  if (
    reference.nDays < MIN_DAYS_PER_BUCKET ||
    compare.nDays < MIN_DAYS_PER_BUCKET
  ) {
    return null;
  }
  if (reference.headacheRate === 0) {
    // Cannot compute RR with 0 reference rate
    return {
      referenceLabel: reference.label,
      compareLabel: compare.label,
      rr: null,
      absDiff: round2(compare.headacheRate - reference.headacheRate),
    };
  }
  return {
    referenceLabel: reference.label,
    compareLabel: compare.label,
    rr: round2(compare.headacheRate / reference.headacheRate),
    absDiff: round2(compare.headacheRate - reference.headacheRate),
  };
}

// ─── Main Analysis ──────────────────────────────────────────────────────

export function computeWeatherAssociation(
  features: WeatherDayFeature[]
): WeatherAnalysisV2 {
  // 1. Coverage
  const documented = features.filter((f) => f.weatherCoverage !== "none");
  const daysDocumented = features.length;
  const daysWithWeather = features.filter(
    (f) => f.pressureMb != null || f.temperatureC != null
  ).length;
  const daysWithDelta = features.filter(
    (f) => f.pressureChange24h != null
  ).length;

  const coverage: WeatherCoverageInfo = {
    daysDocumented,
    daysWithWeather,
    daysWithDelta24h: daysWithDelta,
    ratioWeather: daysDocumented > 0 ? round2(daysWithWeather / daysDocumented) : 0,
    ratioDelta24h: daysDocumented > 0 ? round2(daysWithDelta / daysDocumented) : 0,
  };

  // 2. Primary: Pressure Delta 24h
  const pressureDelta24h = analyzePressureDelta(features, coverage);

  // 3. Secondary: Absolute Pressure (only if enough data)
  const absolutePressure = analyzeAbsolutePressure(features);

  return {
    coverage,
    pressureDelta24h,
    absolutePressure,
    disclaimer: WEATHER_DISCLAIMER,
  };
}

// ─── Pressure Delta 24h ─────────────────────────────────────────────────

function analyzePressureDelta(
  features: WeatherDayFeature[],
  coverage: WeatherCoverageInfo
): WeatherPressureDelta24h {
  const notes: string[] = [];

  // Filter to days with both documentation and Δ value
  const paired = features.filter((f) => f.pressureChange24h != null);
  const confidence = determineConfidence(paired.length);

  if (confidence === "insufficient") {
    if (paired.length === 0) {
      notes.push("Keine Δ24h-Daten vorhanden.");
    } else {
      notes.push(
        `Nur ${paired.length} Tage mit Δ24h-Daten. Mindestens ${MIN_DAYS_FOR_STATEMENT} benötigt.`
      );
    }
    return {
      enabled: false,
      confidence,
      buckets: [],
      relativeRisk: null,
      notes,
    };
  }

  // Assign to buckets
  const strongDrop = paired.filter(
    (f) => f.pressureChange24h! <= DELTA_STRONG_DROP
  );
  const moderateDrop = paired.filter(
    (f) =>
      f.pressureChange24h! > DELTA_STRONG_DROP &&
      f.pressureChange24h! <= DELTA_MODERATE_DROP
  );
  const stableOrRise = paired.filter(
    (f) => f.pressureChange24h! > DELTA_MODERATE_DROP
  );

  const bucketA = buildBucket("Starker Abfall (≤ −8 hPa)", strongDrop);
  const bucketB = buildBucket("Moderater Abfall (−8 bis −3 hPa)", moderateDrop);
  const bucketC = buildBucket("Stabil / Anstieg (> −3 hPa)", stableOrRise);

  const buckets = [bucketA, bucketB, bucketC];

  // Note small buckets
  for (const b of buckets) {
    if (b.nDays > 0 && b.nDays < MIN_DAYS_PER_BUCKET) {
      notes.push(`${b.label}: nur ${b.nDays} Tage (< ${MIN_DAYS_PER_BUCKET}), eingeschränkte Aussagekraft.`);
    }
  }

  // Relative Risk: compare strongest available drop bucket vs stable
  let relativeRisk: RelativeRiskResult | null = null;
  if (bucketC.nDays >= MIN_DAYS_PER_BUCKET) {
    // Prefer bucket A (strong drop), fall back to B (moderate drop)
    const compareBucket =
      bucketA.nDays >= MIN_DAYS_PER_BUCKET ? bucketA : bucketB;
    if (compareBucket.nDays >= MIN_DAYS_PER_BUCKET) {
      relativeRisk = computeRelativeRisk(bucketC, compareBucket);
    }
  }

  // Coverage transparency
  if (coverage.ratioDelta24h < 0.5) {
    notes.push(
      "Δ24h derzeit nur bei einem Teil der Tage verfügbar. Aussagekraft kann eingeschränkt sein."
    );
  }

  // Medication confounder hint
  const acuteMedRates = buckets
    .filter((b) => b.nDays >= MIN_DAYS_PER_BUCKET)
    .map((b) => b.acuteMedRate);
  if (acuteMedRates.length >= 2) {
    const maxRate = Math.max(...acuteMedRates);
    const minRate = Math.min(...acuteMedRates);
    if (maxRate - minRate > 0.2) {
      notes.push(
        "Akutmedikationsrate variiert zwischen Druckgruppen. Medikation kann die Schmerzintensität beeinflussen."
      );
    }
  }

  return {
    enabled: true,
    confidence,
    buckets,
    relativeRisk,
    notes,
  };
}

// ─── Absolute Pressure ──────────────────────────────────────────────────

function analyzeAbsolutePressure(
  features: WeatherDayFeature[]
): WeatherAbsolutePressure | null {
  const paired = features.filter((f) => f.pressureMb != null);

  if (paired.length < MIN_DAYS_ABSOLUTE_PRESSURE) {
    return null;
  }

  const notes: string[] = [];
  const confidence = determineConfidence(paired.length);

  const low = paired.filter((f) => f.pressureMb! < PRESSURE_LOW);
  const normal = paired.filter(
    (f) => f.pressureMb! >= PRESSURE_LOW && f.pressureMb! <= PRESSURE_HIGH
  );
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
