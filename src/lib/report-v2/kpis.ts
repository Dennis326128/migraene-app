/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KPI Computation (extracted for testability)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ReportKPIsV2, DayCountRecord } from './types';
import { computeMohRiskFlag } from './definitions';

export interface KpiInput {
  countsByDay: DayCountRecord[];
  totalDaysInRange: number;
  preventiveMedActive: boolean;
}

/**
 * Computes all KPIs from day-level records.
 */
export function computeKPIs(input: KpiInput): ReportKPIsV2 {
  const { countsByDay, totalDaysInRange, preventiveMedActive } = input;

  let headacheDays = 0;
  let treatmentDays = 0;
  let triptanDays = 0;
  let acuteMedDays = 0;
  let painSum = 0;
  let painCount = 0;
  let maxPain: number | null = null;

  for (const day of countsByDay) {
    if (!day.documented) continue;

    if (day.headache) {
      headacheDays++;
      if (day.painMax !== null && day.painMax > 0) {
        painSum += day.painMax;
        painCount++;
        if (maxPain === null || day.painMax > maxPain) {
          maxPain = day.painMax;
        }
      }
    }

    if (day.treatment) {
      treatmentDays++;
      acuteMedDays++;
    }

    // triptanDays is tracked separately in countsByDay via aggregate
    // We re-derive from the record; aggregate sets treatment=true for acuteMed
    // For triptan we need the raw flag — stored outside countsByDay.
    // WORKAROUND: We count triptan from the passed-in countsByDay which
    // doesn't have a triptan field. So we handle this in aggregate.ts
    // and pass triptanDays directly. This function is for the remaining KPIs.
  }

  const avgPain = painCount > 0
    ? Math.round((painSum / painCount) * 10) / 10
    : null;

  // triptanDays will be overridden by aggregate — placeholder 0
  const mohRiskFlag = computeMohRiskFlag(
    { triptanDays: 0, acuteMedDays, headacheDays },
    totalDaysInRange
  );

  return {
    headacheDays,
    treatmentDays,
    avgPain,
    maxPain,
    triptanDays: 0, // overridden in aggregate
    acuteMedDays,
    preventiveMedActive,
    mohRiskFlag,
  };
}
