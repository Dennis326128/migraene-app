import type { EvidenceLevel } from "./analysisTypes";

export function classifyEvidence(params: {
  exposedEvents?: number;
  comparisonEvents?: number;
  coverageRate?: number;
  effectStrength?: "strong" | "moderate" | "weak" | "none" | "not_calculated";
  minimumEvents?: number;
}): EvidenceLevel {
  const exposed = params.exposedEvents ?? 0;
  const comparison = params.comparisonEvents ?? 0;
  const coverage = params.coverageRate ?? 0;
  const effect = params.effectStrength ?? "not_calculated";
  const minimum = params.minimumEvents ?? 3;

  if (exposed < minimum || coverage < 0.3 || effect === "not_calculated") {
    return "insufficient";
  }
  if (
    exposed >= 10 &&
    comparison >= 10 &&
    coverage >= 0.7 &&
    effect === "strong"
  ) {
    return "high";
  }
  if (
    exposed >= 6 &&
    comparison >= 6 &&
    coverage >= 0.5 &&
    (effect === "strong" || effect === "moderate")
  ) {
    return "moderate";
  }
  if (exposed >= minimum && coverage >= 0.3 && effect !== "none") {
    return "low";
  }
  return "insufficient";
}

export function effectStrengthFromRateDifference(
  diffPercentagePoints: number,
): "strong" | "moderate" | "weak" | "none" {
  const abs = Math.abs(diffPercentagePoints);
  if (abs >= 30) return "strong";
  if (abs >= 15) return "moderate";
  if (abs >= 5) return "weak";
  return "none";
}

export function safeRate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

export function coverageRate(coveredDays: number, totalDays: number): number {
  if (!totalDays || totalDays <= 0) return 0;
  return coveredDays / totalDays;
}

export function sampleSizeLabel(
  n: number,
): "adequate" | "limited" | "very_limited" | "none" {
  if (n <= 0) return "none";
  if (n < 5) return "very_limited";
  if (n < 15) return "limited";
  return "adequate";
}
