/**
 * Utility for consistent medication limit status calculation
 * Used by both frontend UI and to match Edge Function logic
 *
 * WARNING LOGIC (fixed, not configurable):
 * - safe:     used < limit - 1
 * - warning:  used === limit - 1  (one intake before limit)
 * - reached:  used === limit
 * - exceeded: used > limit
 */

export type LimitStatus = 'safe' | 'warning' | 'reached' | 'exceeded';

/**
 * Calculate the status of a medication limit based on current usage.
 * Uses fixed thresholds (one-before-limit = warning), no percentage config.
 */
export function getLimitStatus(
  currentCount: number,
  limitCount: number,
): LimitStatus {
  if (currentCount > limitCount) return 'exceeded';
  if (currentCount === limitCount) return 'reached';
  if (currentCount === limitCount - 1 && limitCount > 1) return 'warning';
  return 'safe';
}

/**
 * Check if a limit status should show a warning indicator
 */
export function isWarningStatus(status: LimitStatus): boolean {
  return status === 'warning' || status === 'reached' || status === 'exceeded';
}

/**
 * Get human-readable German label for status
 */
export function getStatusLabel(status: LimitStatus): string {
  switch (status) {
    case 'exceeded': return 'Überschritten';
    case 'reached': return 'Erreicht';
    case 'warning': return 'Achtung';
    case 'safe': return 'OK';
  }
}

/** Period type to human-readable German time window */
export function getPeriodTimeWindow(periodType: string): string {
  switch (periodType) {
    case 'day': return 'heute';
    case 'week': return 'den letzten 7 Tagen';
    case 'month': return 'den letzten 30 Tagen';
    default: return periodType;
  }
}

/** Build professional, neutral warning message for a given status */
export function buildLimitMessage(
  status: LimitStatus,
  currentCount: number,
  limitCount: number,
  periodType: string,
  medicationName: string,
): string | null {
  const timeWindow = getPeriodTimeWindow(periodType);
  const periodLabel = periodType === 'day' ? 'pro Tag' : periodType === 'week' ? 'pro Woche' : 'pro Monat';

  switch (status) {
    case 'warning':
      return `Achtung: Du hast ${currentCount} von ${limitCount} Einnahmen in ${timeWindow} dokumentiert. Dein Limit beträgt ${limitCount} ${periodLabel}.`;
    case 'reached':
      return `Hinweis: Du hast dein Limit von ${limitCount} Einnahmen in ${timeWindow} erreicht.`;
    case 'exceeded':
      return `Dein gesetztes Limit von ${limitCount} Einnahmen in ${timeWindow} wurde überschritten. ${medicationName}: ${currentCount} Einnahmen dokumentiert.`;
    default:
      return null;
  }
}
