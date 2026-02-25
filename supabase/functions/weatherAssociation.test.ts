/**
 * Unit tests for weatherAssociation.ts
 * Covers: bucket assignment, headache rates, RR, guardrails, confidence, documented filter
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeWeatherAssociation } from "./_shared/report-v2/analysis/weatherAssociation.ts";
import type { WeatherDayFeature } from "./_shared/report-v2/analysis/types.ts";

// ─── Helpers ────────────────────────────────────────────────────────────

function makeDay(
  date: string,
  overrides: Partial<WeatherDayFeature> = {}
): WeatherDayFeature {
  return {
    date,
    documented: true,
    painMax: 0,
    hadHeadache: false,
    hadAcuteMed: false,
    pressureMb: 1013,
    pressureChange24h: 0,
    temperatureC: 20,
    humidity: 60,
    weatherCoverage: "entry",
    ...overrides,
  };
}

function makeDays(
  count: number,
  overrides: Partial<WeatherDayFeature> = {}
): WeatherDayFeature[] {
  return Array.from({ length: count }, (_, i) =>
    makeDay(`2026-01-${String(i + 1).padStart(2, "0")}`, overrides)
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────

Deno.test("insufficient data returns disabled analysis", () => {
  const features = makeDays(10); // < 20
  const result = computeWeatherAssociation(features);

  assertEquals(result.pressureDelta24h.enabled, false);
  assertEquals(result.pressureDelta24h.confidence, "insufficient");
  assertEquals(result.pressureDelta24h.buckets.length, 0);
});

Deno.test("empty features returns disabled analysis", () => {
  const result = computeWeatherAssociation([]);

  assertEquals(result.pressureDelta24h.enabled, false);
  assertEquals(result.coverage.daysDocumented, 0);
});

Deno.test("bucket assignment: strong drop, moderate drop, stable", () => {
  const features: WeatherDayFeature[] = [
    // 10 strong drops with headache
    ...makeDays(10, { pressureChange24h: -10, hadHeadache: true, painMax: 7 }),
    // 10 moderate drops, 5 with headache
    ...makeDays(5, { pressureChange24h: -5, hadHeadache: true, painMax: 5 }),
    ...makeDays(5, { pressureChange24h: -4, hadHeadache: false }),
    // 20 stable, 4 with headache
    ...makeDays(4, { pressureChange24h: 0, hadHeadache: true, painMax: 3 }),
    ...makeDays(16, { pressureChange24h: 2, hadHeadache: false }),
  ];

  const result = computeWeatherAssociation(features);

  assertEquals(result.pressureDelta24h.enabled, true);
  assertEquals(result.pressureDelta24h.buckets.length, 3);

  const [bucketA, bucketB, bucketC] = result.pressureDelta24h.buckets;

  // Strong drop: 10 days, all headache
  assertEquals(bucketA.nDays, 10);
  assertEquals(bucketA.headacheRate, 1.0);

  // Moderate: 10 days, 5 headache
  assertEquals(bucketB.nDays, 10);
  assertEquals(bucketB.headacheRate, 0.5);

  // Stable: 20 days, 4 headache
  assertEquals(bucketC.nDays, 20);
  assertEquals(bucketC.headacheRate, 0.2);
});

Deno.test("relative risk calculation", () => {
  const features: WeatherDayFeature[] = [
    // 10 strong drops: 8 headache
    ...makeDays(8, { pressureChange24h: -10, hadHeadache: true, painMax: 7 }),
    ...makeDays(2, { pressureChange24h: -9, hadHeadache: false }),
    // 30 stable: 6 headache
    ...makeDays(6, { pressureChange24h: 1, hadHeadache: true, painMax: 4 }),
    ...makeDays(24, { pressureChange24h: 2, hadHeadache: false }),
  ];

  const result = computeWeatherAssociation(features);

  assertExists(result.pressureDelta24h.relativeRisk);
  const rr = result.pressureDelta24h.relativeRisk!;

  // Strong drop rate: 0.8, stable rate: 0.2
  // RR = 0.8 / 0.2 = 4.0
  assertEquals(rr.rr, 4.0);
  assertEquals(rr.absDiff, 0.6);
});

Deno.test("confidence levels: high >= 60, medium >= 30, low >= 20", () => {
  const high = computeWeatherAssociation(makeDays(60));
  assertEquals(high.pressureDelta24h.confidence, "high");

  const medium = computeWeatherAssociation(makeDays(35));
  assertEquals(medium.pressureDelta24h.confidence, "medium");

  const low = computeWeatherAssociation(makeDays(22));
  assertEquals(low.pressureDelta24h.confidence, "low");

  const insufficient = computeWeatherAssociation(makeDays(15));
  assertEquals(insufficient.pressureDelta24h.confidence, "insufficient");
});

Deno.test("null pressureChange24h days excluded from delta analysis", () => {
  const features: WeatherDayFeature[] = [
    ...makeDays(15, { pressureChange24h: null }), // no delta
    ...makeDays(10, { pressureChange24h: 0 }),     // only 10 with delta
  ];

  const result = computeWeatherAssociation(features);

  assertEquals(result.coverage.daysWithDelta24h, 10);
  assertEquals(result.pressureDelta24h.confidence, "insufficient");
});

Deno.test("absolute pressure analysis only with >= 60 days", () => {
  const few = computeWeatherAssociation(makeDays(40));
  assertEquals(few.absolutePressure, null);

  const enough = computeWeatherAssociation(makeDays(65));
  assertExists(enough.absolutePressure);
  assertEquals(enough.absolutePressure!.enabled, true);
  assertEquals(enough.absolutePressure!.buckets.length, 3);
});

Deno.test("coverage ratios based on documented days only", () => {
  const features: WeatherDayFeature[] = [
    ...makeDays(20, { documented: true, pressureMb: 1013, pressureChange24h: -2 }),
    ...makeDays(10, { documented: true, pressureMb: null, pressureChange24h: null, temperatureC: null, humidity: null, weatherCoverage: "none" }),
    ...makeDays(5, { documented: false, pressureMb: 1013, pressureChange24h: -1 }), // undocumented → excluded
  ];

  const result = computeWeatherAssociation(features);

  // Only 30 documented days count (not 35)
  assertEquals(result.coverage.daysDocumented, 30);
  assertEquals(result.coverage.daysWithWeather, 20);
  assertEquals(result.coverage.daysWithDelta24h, 20);
  // 20/30 ≈ 0.67
  assertEquals(result.coverage.ratioWeather, 0.67);
  assertEquals(result.coverage.ratioDelta24h, 0.67);
});

Deno.test("undocumented days are excluded from analysis entirely", () => {
  const features: WeatherDayFeature[] = [
    // 15 documented with delta
    ...makeDays(15, { documented: true, pressureChange24h: -10, hadHeadache: true, painMax: 7 }),
    // 20 undocumented with delta (should NOT count)
    ...makeDays(20, { documented: false, pressureChange24h: -10, hadHeadache: true, painMax: 7 }),
  ];

  const result = computeWeatherAssociation(features);

  // Only 15 documented days → insufficient
  assertEquals(result.coverage.daysDocumented, 15);
  assertEquals(result.pressureDelta24h.confidence, "insufficient");
  assertEquals(result.pressureDelta24h.enabled, false);
});

Deno.test("meanPainMax only from headache days", () => {
  const features: WeatherDayFeature[] = [
    ...makeDays(5, { pressureChange24h: -10, hadHeadache: true, painMax: 8 }),
    ...makeDays(5, { pressureChange24h: -10, hadHeadache: true, painMax: 6 }),
    ...makeDays(5, { pressureChange24h: -10, hadHeadache: false, painMax: 0 }),
    ...makeDays(15, { pressureChange24h: 0, hadHeadache: false }),
  ];

  const result = computeWeatherAssociation(features);
  const strongBucket = result.pressureDelta24h.buckets[0];

  assertEquals(strongBucket.nDays, 15);
  assertEquals(strongBucket.meanPainMax, 7.0); // (8*5 + 6*5) / 10 = 7
});

Deno.test("acuteMedRate tracked per bucket", () => {
  const features: WeatherDayFeature[] = [
    ...makeDays(10, { pressureChange24h: -10, hadAcuteMed: true }),
    ...makeDays(20, { pressureChange24h: 0, hadAcuteMed: false }),
  ];

  const result = computeWeatherAssociation(features);

  assertEquals(result.pressureDelta24h.buckets[0].acuteMedRate, 1.0);
  assertEquals(result.pressureDelta24h.buckets[2].acuteMedRate, 0);
});

Deno.test("disclaimer always present", () => {
  const result = computeWeatherAssociation(makeDays(5));
  assertEquals(
    result.disclaimer,
    "Orientierender Hinweis basierend auf Ihrer Dokumentation. Zusammenhang ≠ Ursache. Keine Diagnose."
  );
});

Deno.test("zero headache rate in reference: RR is null, absDiff computed", () => {
  const features: WeatherDayFeature[] = [
    ...makeDays(10, { pressureChange24h: -10, hadHeadache: true, painMax: 5 }),
    ...makeDays(20, { pressureChange24h: 0, hadHeadache: false }),
  ];

  const result = computeWeatherAssociation(features);
  const rr = result.pressureDelta24h.relativeRisk;

  assertExists(rr);
  assertEquals(rr!.rr, null); // cannot divide by 0
  assertEquals(rr!.absDiff, 1.0); // 1.0 - 0.0
});

// ─── Integration: buildWeatherDayFeatures-like mock → non-insufficient ──

Deno.test("integration: realistic mixed data produces enabled analysis", () => {
  const features: WeatherDayFeature[] = [
    // 15 days strong drop, 12 headache
    ...makeDays(12, { documented: true, pressureChange24h: -10, hadHeadache: true, painMax: 8, hadAcuteMed: true }),
    ...makeDays(3, { documented: true, pressureChange24h: -9, hadHeadache: false }),
    // 10 days moderate drop, 4 headache
    ...makeDays(4, { documented: true, pressureChange24h: -5, hadHeadache: true, painMax: 5 }),
    ...makeDays(6, { documented: true, pressureChange24h: -4, hadHeadache: false }),
    // 25 days stable, 5 headache
    ...makeDays(5, { documented: true, pressureChange24h: 1, hadHeadache: true, painMax: 3 }),
    ...makeDays(20, { documented: true, pressureChange24h: 2, hadHeadache: false }),
  ];

  const result = computeWeatherAssociation(features);

  assertEquals(result.pressureDelta24h.enabled, true);
  assertEquals(result.pressureDelta24h.confidence, "medium"); // 50 days
  assertEquals(result.coverage.daysDocumented, 50);

  // RR should exist
  assertExists(result.pressureDelta24h.relativeRisk);
  const rr = result.pressureDelta24h.relativeRisk!;
  // Strong drop: 12/15 = 0.8, Stable: 5/25 = 0.2, RR = 4.0
  assertEquals(rr.rr, 4.0);
});
