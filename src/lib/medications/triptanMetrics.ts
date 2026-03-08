/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SSOT: Triptan Metrics
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Central utility for all triptan counting across the app.
 * ALL screens, reports, PDFs, and exports MUST use this function.
 *
 * Two distinct metrics:
 * 1. triptanDays       — Number of distinct calendar days with ≥1 triptan intake
 * 2. triptanIntakes    — Total number of individual triptan intakes
 *
 * These MUST NOT be confused. Labels:
 * - "Triptantage" / "Tage mit Triptan-Einnahme"  → triptanDays
 * - "Triptan-Einnahmen" / "Einnahmen gesamt"      → triptanIntakes
 */

import { isTriptan } from './isTriptan';

export interface TriptanMetrics {
  /** Number of distinct calendar days with ≥1 triptan intake */
  triptanDays: number;
  /** Total number of individual triptan intakes (can be >1 per day) */
  triptanIntakes: number;
  /** Set of dates (YYYY-MM-DD) with triptan use */
  triptanDates: Set<string>;
  /** Breakdown by medication name */
  byMedication: Map<string, { intakes: number; days: Set<string> }>;
}

interface EntryForTriptanMetrics {
  selected_date?: string | null;
  timestamp_created?: string | null;
  medications?: string[] | null;
}

/**
 * Extract the calendar date (YYYY-MM-DD) from an entry.
 */
function getDateKey(entry: EntryForTriptanMetrics): string | null {
  return entry.selected_date || entry.timestamp_created?.split('T')[0] || null;
}

/**
 * Compute triptan metrics from a list of entries.
 *
 * @param entries - Pain entries (already filtered to desired date range)
 * @returns TriptanMetrics with both day-count and intake-count
 */
export function computeTriptanMetrics(entries: EntryForTriptanMetrics[]): TriptanMetrics {
  const triptanDates = new Set<string>();
  let triptanIntakes = 0;
  const byMedication = new Map<string, { intakes: number; days: Set<string> }>();

  for (const entry of entries) {
    const dateKey = getDateKey(entry);
    if (!entry.medications?.length) continue;

    for (const med of entry.medications) {
      if (!isTriptan(med)) continue;

      triptanIntakes++;
      if (dateKey) triptanDates.add(dateKey);

      // Per-medication breakdown
      const existing = byMedication.get(med);
      if (existing) {
        existing.intakes++;
        if (dateKey) existing.days.add(dateKey);
      } else {
        const days = new Set<string>();
        if (dateKey) days.add(dateKey);
        byMedication.set(med, { intakes: 1, days });
      }
    }
  }

  return {
    triptanDays: triptanDates.size,
    triptanIntakes,
    triptanDates,
    byMedication,
  };
}

/**
 * Normalize triptan metrics to a 30-day basis.
 *
 * @param metrics - Raw metrics from computeTriptanMetrics
 * @param daysInRange - Total calendar days in the evaluated range
 */
export function normalizeTriptanPer30(
  metrics: Pick<TriptanMetrics, 'triptanDays' | 'triptanIntakes'>,
  daysInRange: number,
): { triptanDaysPer30: number; triptanIntakesPer30: number } {
  if (daysInRange <= 0) {
    return { triptanDaysPer30: 0, triptanIntakesPer30: 0 };
  }
  return {
    triptanDaysPer30: Math.round((metrics.triptanDays / daysInRange) * 30 * 10) / 10,
    triptanIntakesPer30: Math.round((metrics.triptanIntakes / daysInRange) * 30 * 10) / 10,
  };
}

/**
 * Debug log for triptan metrics (only in DEV mode).
 */
export function logTriptanMetricsDebug(
  metrics: TriptanMetrics,
  context: string,
  daysInRange?: number,
): void {
  if (import.meta.env?.PROD) return;

  const medBreakdown = Array.from(metrics.byMedication.entries())
    .map(([name, data]) => `  ${name}: ${data.intakes}× (${data.days.size} Tage)`)
    .join('\n');

  console.debug(
    `[TriptanMetrics:${context}]\n` +
    `  Einnahmen gesamt: ${metrics.triptanIntakes}\n` +
    `  Tage mit Einnahme: ${metrics.triptanDays}\n` +
    (daysInRange ? `  Zeitraum: ${daysInRange} Tage\n` : '') +
    (medBreakdown ? `  Aufschlüsselung:\n${medBreakdown}` : ''),
  );
}
