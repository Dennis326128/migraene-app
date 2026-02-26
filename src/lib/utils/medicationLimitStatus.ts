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

/** Period type to window days number */
export function getPeriodWindowDays(periodType: string): number {
  switch (periodType) {
    case 'day': return 1;
    case 'week': return 7;
    case 'month': return 30;
    default: return 30;
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

/**
 * Structured limit message for rendering as two separate paragraphs.
 * SSOT for all 3 states: warning, reached, exceeded.
 *
 * Variables: {limit}, {windowDays}, {medName}, {count}, {remaining}, {ratioText}
 */
export interface LimitMessageParts {
  title: string;
  statusLine: string;
  detailLine: string;
}

export function buildLimitMessageParts(
  status: LimitStatus,
  currentCount: number,
  limitCount: number,
  periodType: string,
  medicationName: string,
): LimitMessageParts | null {
  const timeWindow = getPeriodTimeWindow(periodType);
  const windowDays = getPeriodWindowDays(periodType);
  const ratioText = `${currentCount}/${limitCount}`;
  const remaining = Math.max(0, limitCount - currentCount);

  switch (status) {
    case 'warning':
      return {
        title: 'Limit bald erreicht',
        statusLine: `Du hast ${ratioText} Einnahmen in den letzten ${windowDays} Tagen dokumentiert.`,
        detailLine: `Noch ${remaining} bis zu deinem Limit von ${limitCount}.`,
      };
    case 'reached':
      return {
        title: 'Limit erreicht',
        statusLine: `Du hast dein Limit von ${limitCount} Einnahmen in ${timeWindow} erreicht.`,
        detailLine: `${medicationName}: ${currentCount} Einnahmen dokumentiert.`,
      };
    case 'exceeded':
      return {
        title: 'Limit überschritten',
        statusLine: `Dein gesetztes Limit von ${limitCount} Einnahmen in ${timeWindow} wurde überschritten.`,
        detailLine: `${medicationName}: ${currentCount} Einnahmen dokumentiert.`,
      };
    default:
      return null;
  }
}

/** @deprecated Use buildLimitMessageParts for structured rendering. */
export function buildLimitMessage(
  status: LimitStatus,
  currentCount: number,
  limitCount: number,
  periodType: string,
  medicationName: string,
): string | null {
  const parts = buildLimitMessageParts(status, currentCount, limitCount, periodType, medicationName);
  if (!parts) return null;
  return `${parts.statusLine} ${parts.detailLine}`;
}
