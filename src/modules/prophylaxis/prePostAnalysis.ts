/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Pre/Post Window Analysis — Compares metrics around dose events
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uses DayFeatures (from SSOT DayCountRecords) to compute stats
 * for configurable windows before and after each injection.
 */

import type {
  DoseEvent,
  ProphylaxisDayFeature,
  WindowStats,
  DoseComparison,
  ProphylaxisAnalysis,
  DoseConfidence,
  EvidenceSource,
} from './types';
import { addBerlinDays } from './dateKeyHelpers';

// ─── Configuration ──────────────────────────────────────────────────────

export interface WindowConfig {
  preWindowDays: number;   // default: 7
  postWindowDays: number;  // default: 7
}

const DEFAULT_CONFIG: WindowConfig = {
  preWindowDays: 7,
  postWindowDays: 7,
};

// ─── Compute stats for a date range ─────────────────────────────────────

function computeWindowStats(
  dayFeatures: Map<string, ProphylaxisDayFeature>,
  startDateKey: string,
  endDateKey: string,
  windowDays: number,
): WindowStats {
  const features: ProphylaxisDayFeature[] = [];

  let current = startDateKey;
  while (current <= endDateKey) {
    const f = dayFeatures.get(current);
    if (f) {
      features.push(f);
    }
    current = addBerlinDays(current, 1);
  }

  const documentedDays = features.filter(f => f.documented).length;
  const documentedFeatures = features.filter(f => f.documented);

  const headacheDays = documentedFeatures.filter(f => f.hadHeadache).length;
  const acuteMedDays = documentedFeatures.filter(f => f.acuteMedTaken).length;
  const acuteMedCountSum = documentedFeatures.reduce((sum, f) => sum + f.acuteMedCount, 0);
  const severeDays = documentedFeatures.filter(f => f.painMax !== null && f.painMax >= 7).length;

  // Intensity stats (only days with pain)
  const painValues = documentedFeatures
    .filter(f => f.painMax !== null && f.painMax > 0)
    .map(f => f.painMax!);

  let intensityMean: number | null = null;
  let intensityMedian: number | null = null;
  let intensityMax: number | null = null;

  if (painValues.length > 0) {
    intensityMean = Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10;
    intensityMax = Math.max(...painValues);

    const sorted = [...painValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    intensityMedian = sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
      : sorted[mid];
  }

  const coverage = windowDays > 0 ? documentedDays / windowDays : 0;
  const headacheRate = documentedDays > 0 ? headacheDays / documentedDays : 0;
  const acuteMedRate = documentedDays > 0 ? acuteMedDays / documentedDays : 0;

  return {
    windowDays,
    documentedDays,
    coverage: Math.round(coverage * 100) / 100,
    headacheDays,
    headacheRate: Math.round(headacheRate * 100) / 100,
    intensityMean,
    intensityMedian,
    intensityMax,
    acuteMedDays,
    acuteMedRate: Math.round(acuteMedRate * 100) / 100,
    acuteMedCountSum,
    severeDays,
  };
}

// ─── Compare single dose event ──────────────────────────────────────────

export function compareDoseEvent(
  doseEvent: DoseEvent,
  dayFeatures: Map<string, ProphylaxisDayFeature>,
  config: WindowConfig = DEFAULT_CONFIG,
): DoseComparison {
  const preStart = addBerlinDays(doseEvent.dateKeyBerlin, -config.preWindowDays);
  const preEnd = addBerlinDays(doseEvent.dateKeyBerlin, -1);
  const postStart = addBerlinDays(doseEvent.dateKeyBerlin, 1);
  const postEnd = addBerlinDays(doseEvent.dateKeyBerlin, config.postWindowDays);

  const pre = computeWindowStats(dayFeatures, preStart, preEnd, config.preWindowDays);
  const post = computeWindowStats(dayFeatures, postStart, postEnd, config.postWindowDays);

  const deltaHeadacheRate = Math.round((post.headacheRate - pre.headacheRate) * 100) / 100;
  const deltaIntensityMean =
    pre.intensityMean !== null && post.intensityMean !== null
      ? Math.round((post.intensityMean - pre.intensityMean) * 10) / 10
      : null;
  const deltaAcuteMedRate = Math.round((post.acuteMedRate - pre.acuteMedRate) * 100) / 100;

  return {
    doseEvent,
    pre,
    post,
    delta: {
      headacheRate: deltaHeadacheRate,
      intensityMean: deltaIntensityMean,
      acuteMedRate: deltaAcuteMedRate,
    },
  };
}

// ─── Full Prophylaxis Analysis ──────────────────────────────────────────

export function computeProphylaxisAnalysis(
  doseEvents: DoseEvent[],
  dayFeatures: Map<string, ProphylaxisDayFeature>,
  config: WindowConfig = DEFAULT_CONFIG,
): ProphylaxisAnalysis {
  if (doseEvents.length === 0) {
    return {
      drug: 'other',
      doseEvents: [],
      comparisons: [],
      aggregate: null,
      evidenceSummary: {
        countDoseEvents: 0,
        primarySourcesDistribution: {},
        bestConfidence: null,
        worstConfidence: null,
      },
    };
  }

  const drug = doseEvents[0].drug;
  const comparisons = doseEvents.map(de => compareDoseEvent(de, dayFeatures, config));

  // Aggregate deltas
  let aggregate: ProphylaxisAnalysis['aggregate'] = null;
  if (comparisons.length > 0) {
    const deltaHRs = comparisons.map(c => c.delta.headacheRate);
    const deltaIMs = comparisons.map(c => c.delta.intensityMean).filter((v): v is number => v !== null);
    const deltaAMRs = comparisons.map(c => c.delta.acuteMedRate);

    aggregate = {
      avgDeltaHeadacheRate: deltaHRs.length > 0
        ? Math.round((deltaHRs.reduce((a, b) => a + b, 0) / deltaHRs.length) * 100) / 100
        : null,
      avgDeltaIntensityMean: deltaIMs.length > 0
        ? Math.round((deltaIMs.reduce((a, b) => a + b, 0) / deltaIMs.length) * 10) / 10
        : null,
      avgDeltaAcuteMedRate: deltaAMRs.length > 0
        ? Math.round((deltaAMRs.reduce((a, b) => a + b, 0) / deltaAMRs.length) * 100) / 100
        : null,
    };
  }

  // Evidence summary
  const confidences = doseEvents.map(de => de.confidence);
  const sourceDistribution: Partial<Record<EvidenceSource, number>> = {};
  for (const de of doseEvents) {
    sourceDistribution[de.primarySource] = (sourceDistribution[de.primarySource] ?? 0) + 1;
  }

  return {
    drug,
    doseEvents,
    comparisons,
    aggregate,
    evidenceSummary: {
      countDoseEvents: doseEvents.length,
      primarySourcesDistribution: sourceDistribution,
      bestConfidence: confidences.length > 0
        ? Math.max(...confidences) as DoseConfidence
        : null,
      worstConfidence: confidences.length > 0
        ? Math.min(...confidences) as DoseConfidence
        : null,
    },
  };
}
