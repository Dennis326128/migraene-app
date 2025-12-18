/**
 * Utility for consistent medication limit status calculation
 * Used by both frontend UI and to match Edge Function logic
 */

export type LimitStatus = 'safe' | 'warning' | 'reached' | 'exceeded';

/**
 * Calculate the status of a medication limit based on current usage
 * @param currentCount - Current number of uses
 * @param limitCount - Maximum allowed uses
 * @param warningThresholdPct - Percentage at which to show warning (default 80%)
 * @returns LimitStatus - 'safe' | 'warning' | 'reached' | 'exceeded'
 */
export function getLimitStatus(
  currentCount: number,
  limitCount: number,
  warningThresholdPct: number = 80
): LimitStatus {
  if (currentCount > limitCount) return 'exceeded';
  if (currentCount === limitCount) return 'reached';
  
  const percentage = (currentCount / limitCount) * 100;
  if (percentage >= warningThresholdPct) return 'warning';
  
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
    case 'warning': return 'Warnung';
    case 'safe': return 'OK';
  }
}
