/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Core Metrics V2 — Deterministic, Day-Based KPIs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Input: SSOT DayCountRecord[] (already aggregated per day).
 * Output: CoreMetricsV2 (all day-based, no estimation, no extrapolation).
 *
 * Pure function. No DB, no I/O, no side effects.
 */

import type { CoreMetricsV2 } from "./types.ts";

// ─── Input Shape ─────────────────────────────────────────────────────────

export interface CoreMetricsInput {
  daysInRange: number;
  countsByDay: ReadonlyArray<{
    documented: boolean;
    headache: boolean;
    painMax: number | null;
    acuteMedUsed?: boolean;
    triptanUsed?: boolean;
  }>;
  /** Optional: pre-counted intake totals (from medication_intakes table) */
  totalIntakesAcute?: number | null;
  totalIntakesTriptan?: number | null;
}

// ─── Compute ─────────────────────────────────────────────────────────────

export function computeCoreMetrics(input: CoreMetricsInput): CoreMetricsV2 {
  const { countsByDay, daysInRange } = input;

  let documentedDays = 0;
  let headacheDays = 0;
  let acuteMedDays = 0;
  let triptanDays = 0;
  let maxPain: number | null = null;

  const headachePainValues: number[] = [];

  for (const day of countsByDay) {
    if (day.documented) {
      documentedDays++;
    }
    if (day.headache) {
      headacheDays++;
      if (day.painMax !== null && Number.isFinite(day.painMax) && day.painMax > 0) {
        headachePainValues.push(day.painMax);
        if (maxPain === null || day.painMax > maxPain) {
          maxPain = day.painMax;
        }
      }
    }
    if (day.acuteMedUsed === true) {
      acuteMedDays++;
    }
    if (day.triptanUsed === true) {
      triptanDays++;
    }
  }

  const undocumentedDays = Math.max(0, daysInRange - documentedDays);

  // Average pain on headache days
  let avgPainOnHeadacheDays: number | null = null;
  if (headachePainValues.length > 0) {
    const sum = headachePainValues.reduce((a, b) => a + b, 0);
    avgPainOnHeadacheDays =
      Math.round((sum / headachePainValues.length) * 10) / 10;
  }

  // Median pain on headache days
  let medianPainOnHeadacheDays: number | null = null;
  if (headachePainValues.length > 0) {
    const sorted = [...headachePainValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianPainOnHeadacheDays =
      sorted.length % 2 === 0
        ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
        : sorted[mid];
  }

  return {
    daysInRange,
    documentedDays,
    undocumentedDays,
    headacheDays,
    avgPainOnHeadacheDays,
    medianPainOnHeadacheDays,
    maxPain,
    acuteMedDays,
    triptanDays,
    totalIntakesAcute: input.totalIntakesAcute ?? null,
    totalIntakesTriptan: input.totalIntakesTriptan ?? null,
    migraineDays: null,
  };
}
