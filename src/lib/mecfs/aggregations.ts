/**
 * ME/CFS aggregation utilities for future analytics/charts.
 * Ready to use once UI is built.
 */

import { type MeCfsSeverityLevel, scoreToLevel } from './constants';

interface MeCfsEntry {
  selected_date?: string | null;
  me_cfs_severity_score?: number | null;
}

/** Count entries by severity level */
export function countBySeverityLevel(entries: MeCfsEntry[]): Record<MeCfsSeverityLevel, number> {
  const counts: Record<MeCfsSeverityLevel, number> = {
    none: 0,
    mild: 0,
    moderate: 0,
    severe: 0,
  };

  for (const e of entries) {
    const score = e.me_cfs_severity_score ?? 0;
    const level = scoreToLevel(score);
    counts[level]++;
  }

  return counts;
}

/** Average ME/CFS score across entries */
export function averageScore(entries: MeCfsEntry[]): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce((acc, e) => acc + (e.me_cfs_severity_score ?? 0), 0);
  return Math.round((sum / entries.length) * 10) / 10;
}

/** Max ME/CFS score across entries */
export function maxScore(entries: MeCfsEntry[]): number {
  if (entries.length === 0) return 0;
  return Math.max(...entries.map(e => e.me_cfs_severity_score ?? 0));
}

/** Count days with severity score above threshold */
export function daysWithSeverityAbove(entries: MeCfsEntry[], threshold: number): number {
  const daysAbove = new Set<string>();
  for (const e of entries) {
    if ((e.me_cfs_severity_score ?? 0) > threshold && e.selected_date) {
      daysAbove.add(e.selected_date);
    }
  }
  return daysAbove.size;
}

/** Time series data for charting */
export function toTimeSeries(entries: MeCfsEntry[]): Array<{ date: string; meCfsSeverityScore: number }> {
  return entries
    .filter(e => e.selected_date)
    .map(e => ({
      date: e.selected_date!,
      meCfsSeverityScore: e.me_cfs_severity_score ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
