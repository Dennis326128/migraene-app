/**
 * ME/CFS Donut Data Builder
 * 
 * Calendar-day basis between mecfsStart and mecfsEnd.
 * Each day is classified as:
 *   - "undocumented": no entries that day
 *   - "none": entries exist, MAX score == 0
 *   - "mild" / "moderate" / "severe": entries with MAX score > 0
 */
import { scoreToLevel, type MeCfsSeverityLevel } from './constants';
import type { PainEntry } from '@/types/painApp';
import { daysBetweenInclusive } from '@/lib/dateRange/rangeResolver';

export type MeCfsDonutSegment = MeCfsSeverityLevel | 'undocumented';

export interface MeCfsDonutData {
  /** Total calendar days in mecfs range */
  calendarDays: number;
  /** Days with at least one entry */
  documentedDays: number;
  /** Distribution by segment */
  distribution: Record<MeCfsDonutSegment, number>;
  /** Average daily MAX score (only documented days) */
  avgDailyMax: number;
  /** IQR p25 */
  p25: number;
  /** IQR p75 */
  p75: number;
  /** Days with burden (score > 0) */
  daysWithBurden: number;
  /** Burden per 30 days (extrapolated from documented days) */
  burdenPer30: number;
  /** Whether all documented days have score 0 */
  allDocumentedZero: boolean;
  /** Whether there are any documented days */
  hasDocumentation: boolean;
}

/**
 * Build daily MAX score map from entries.
 */
function dailyMaxMap(entries: PainEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const date = e.selected_date || e.timestamp_created?.split('T')[0];
    if (!date) continue;
    const score = e.me_cfs_severity_score ?? 0;
    map.set(date, Math.max(map.get(date) ?? 0, score));
  }
  return map;
}

/**
 * Generate all dates (YYYY-MM-DD) between start and end inclusive.
 */
function allDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (d <= endD) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Build ME/CFS donut data for a given mecfs range.
 * 
 * @param entries - All pain entries (will be filtered to mecfs range internally)
 * @param mecfsStart - Start date (YYYY-MM-DD), already clamped to tracking start
 * @param mecfsEnd - End date (YYYY-MM-DD)
 */
export function buildMecfsDonutData(
  entries: PainEntry[],
  mecfsStart: string,
  mecfsEnd: string,
): MeCfsDonutData {
  const calendarDays = daysBetweenInclusive(mecfsStart, mecfsEnd);

  // Filter entries to mecfs range
  const rangeEntries = entries.filter(e => {
    const d = e.selected_date || e.timestamp_created?.split('T')[0];
    return d && d >= mecfsStart && d <= mecfsEnd;
  });

  const maxMap = dailyMaxMap(rangeEntries);
  const allDates = allDatesInRange(mecfsStart, mecfsEnd);

  const dist: Record<MeCfsDonutSegment, number> = {
    undocumented: 0,
    none: 0,
    mild: 0,
    moderate: 0,
    severe: 0,
  };

  for (const date of allDates) {
    const score = maxMap.get(date);
    if (score === undefined) {
      dist.undocumented++;
    } else if (score === 0) {
      dist.none++;
    } else {
      dist[scoreToLevel(score)]++;
    }
  }

  const documentedDays = maxMap.size;
  const scores = Array.from(maxMap.values());
  const daysWithBurden = scores.filter(s => s > 0).length;
  const avgDailyMax = documentedDays > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / documentedDays) * 10) / 10
    : 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const p25 = Math.round(percentile(sorted, 25) * 10) / 10;
  const p75 = Math.round(percentile(sorted, 75) * 10) / 10;
  const burdenPer30 = documentedDays > 0
    ? Math.round(((daysWithBurden / documentedDays) * 30) * 10) / 10
    : 0;

  return {
    calendarDays,
    documentedDays,
    distribution: dist,
    avgDailyMax,
    p25,
    p75,
    daysWithBurden,
    burdenPer30,
    allDocumentedZero: documentedDays > 0 && daysWithBurden === 0,
    hasDocumentation: documentedDays > 0,
  };
}
