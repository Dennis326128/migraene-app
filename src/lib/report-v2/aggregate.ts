/**
 * ═══════════════════════════════════════════════════════════════════════════
 * computeMiaryReport — SSOT Aggregation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Reine Funktion. Kein I/O. Keine DB. Keine Date-Bibliothek.
 * Nimmt vorbereitete Entries + Range entgegen und liefert MiaryReportV2.
 */

import type {
  ComputeReportInput,
  MiaryReportV2,
  DayCountRecord,
  MeCfsSeverity,
} from './types';
import { isHeadacheDay, isTreatmentDay, computeMeCfsMax, computeMohRiskFlag } from './definitions';
import { normalizeOptions, clampRange } from './normalize';
import { buildCharts } from './charts';

/**
 * Primary SSOT aggregation function.
 * 
 * IMPORTANT: totalDaysInRange is derived from distinct dates in entries.
 * For full calendar-range coverage, the caller must supply all days
 * (including undocumented days with documented=false).
 * See README.md for details.
 */
export function computeMiaryReport(input: ComputeReportInput): MiaryReportV2 {
  const range = clampRange(input.range);
  const options = normalizeOptions(input.options);
  const { entries } = input;

  // ─── Group entries by day ──────────────────────────────────────────
  const dayMap = new Map<string, {
    documented: boolean;
    painMax: number | null;
    acuteMedUsed: boolean;
    triptanUsed: boolean;
    meCfsLevels: Array<MeCfsSeverity | null | undefined>;
    medications: Array<{ medicationId: string; name: string; effect?: number | null }>;
  }>();

  for (const entry of entries) {
    const existing = dayMap.get(entry.dateISO);
    if (!existing) {
      dayMap.set(entry.dateISO, {
        documented: entry.documented,
        painMax: entry.painMax,
        acuteMedUsed: entry.acuteMedUsed,
        triptanUsed: entry.triptanUsed,
        meCfsLevels: entry.meCfsLevels ? [...entry.meCfsLevels] : [],
        medications: entry.medications ? [...entry.medications] : [],
      });
    } else {
      // Merge: multiple entries on same day
      if (entry.documented) existing.documented = true;
      if (entry.painMax !== null) {
        existing.painMax = existing.painMax !== null
          ? Math.max(existing.painMax, entry.painMax)
          : entry.painMax;
      }
      if (entry.acuteMedUsed) existing.acuteMedUsed = true;
      if (entry.triptanUsed) existing.triptanUsed = true;
      if (entry.meCfsLevels) {
        existing.meCfsLevels.push(...entry.meCfsLevels);
      }
      if (entry.medications) {
        existing.medications.push(...entry.medications);
      }
    }
  }

  // ─── Build day-level records ───────────────────────────────────────
  const countsByDay: DayCountRecord[] = [];
  let documentedDays = 0;
  let headacheDays = 0;
  let treatmentDays = 0;
  let triptanDays = 0;
  let acuteMedDays = 0;
  let painSum = 0;
  let painCount = 0;
  let maxPain: number | null = null;

  for (const [dateISO, day] of dayMap) {
    const headache = isHeadacheDay(day.painMax);
    const treatment = isTreatmentDay(day.acuteMedUsed);
    const meCfsMax = day.meCfsLevels.length > 0
      ? computeMeCfsMax(day.meCfsLevels)
      : null;

    countsByDay.push({
      dateISO,
      documented: day.documented,
      headache,
      treatment,
      painMax: day.painMax,
      meCfsMax,
    });

    if (day.documented) {
      documentedDays++;
      if (headache) {
        headacheDays++;
        if (day.painMax !== null && day.painMax > 0) {
          painSum += day.painMax;
          painCount++;
          if (maxPain === null || day.painMax > maxPain) {
            maxPain = day.painMax;
          }
        }
      }
      if (treatment) treatmentDays++;
      if (day.acuteMedUsed) acuteMedDays++;
      if (day.triptanUsed) triptanDays++;
    }
  }

  const totalDaysInRange = dayMap.size;
  const undocumentedDays = totalDaysInRange - documentedDays;

  // ─── KPIs ──────────────────────────────────────────────────────────
  const avgPain = painCount > 0
    ? Math.round((painSum / painCount) * 10) / 10
    : null;

  const mohRiskFlag = computeMohRiskFlag(
    { triptanDays, acuteMedDays, headacheDays },
    totalDaysInRange
  );

  const kpis = {
    headacheDays,
    treatmentDays,
    avgPain,
    maxPain,
    triptanDays,
    acuteMedDays,
    preventiveMedActive: false, // must be set by caller context
    mohRiskFlag,
  };

  // ─── Charts ────────────────────────────────────────────────────────
  const charts = buildCharts({
    countsByDay,
    documentedDays,
    undocumentedDays,
    headacheDays,
    entries,
    options,
  });

  // ─── Sort raw countsByDay ──────────────────────────────────────────
  countsByDay.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  return {
    meta: {
      generatedAtISO: new Date().toISOString(),
      range,
      basis: {
        totalDaysInRange,
        documentedDays,
        undocumentedDays,
      },
    },
    kpis,
    charts,
    raw: { countsByDay },
  };
}
