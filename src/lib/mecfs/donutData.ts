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
 * Determine whether an entry has an explicit ME/CFS documentation.
 *
 * "Documented" means the user actively set a value (including 'none'/0).
 * "Undocumented" means the field was never touched (null/undefined).
 *
 * NOTE: DB defaults are score=0, level='none'. Within the ME/CFS tracking
 * range (after mecfs_tracking_started_at), these defaults represent a valid
 * user choice. Entries outside the range are pre-filtered and never reach here.
 */
function hasMeCfsDocumentation(entry: PainEntry): boolean {
  // Explicit null/undefined check – score=0 is a VALID documented value ('keine')
  return entry.me_cfs_severity_score !== null && entry.me_cfs_severity_score !== undefined;
}

/**
 * Build daily MAX score map from entries.
 *
 * Returns two maps:
 *  - maxScores: date → highest ME/CFS score for documented entries
 *  - hasEntry: set of dates that have any entry (documented or not)
 *
 * A day is "documented" if at least one entry on that day has an explicit
 * ME/CFS value (including score=0 / level='none').
 */
function buildDailyMaps(entries: PainEntry[]): {
  maxScores: Map<string, number>;
  datesWithEntries: Set<string>;
} {
  const maxScores = new Map<string, number>();
  const datesWithEntries = new Set<string>();

  for (const e of entries) {
    const date = e.selected_date || e.timestamp_created?.split('T')[0];
    if (!date) continue;

    datesWithEntries.add(date);

    if (hasMeCfsDocumentation(e)) {
      const score = e.me_cfs_severity_score!;
      maxScores.set(date, Math.max(maxScores.get(date) ?? 0, score));
    }
  }

  return { maxScores, datesWithEntries };
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

  const { maxScores, datesWithEntries } = buildDailyMaps(rangeEntries);
  const allDates = allDatesInRange(mecfsStart, mecfsEnd);

  const dist: Record<MeCfsDonutSegment, number> = {
    undocumented: 0,
    none: 0,
    mild: 0,
    moderate: 0,
    severe: 0,
  };

  // Classify each calendar day:
  // - Has ME/CFS score in maxScores → documented (none/mild/moderate/severe)
  // - Has entries but no ME/CFS score → undocumented (entries exist but ME/CFS not set)
  // - No entries at all → undocumented (no data for that day)
  for (const date of allDates) {
    const score = maxScores.get(date);
    if (score !== undefined) {
      // Documented: user set ME/CFS value (including score=0 = 'keine')
      if (score === 0) {
        dist.none++;
      } else {
        dist[scoreToLevel(score)]++;
      }
    } else {
      // No explicit ME/CFS documentation for this day
      dist.undocumented++;
    }
  }

  const documentedDays = maxScores.size;
  const scores: number[] = Array.from(maxScores.values());
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
