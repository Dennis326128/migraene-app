/**
 * SSOT format helpers for weather statistics — used by UI + PDF.
 */

/** Format rate as percentage string, e.g. 0.234 → "23%" */
export function fmtPct(rate: number | null | undefined): string {
  if (rate == null) return '\u2013';
  return `${Math.round(rate * 100)}%`;
}

/** Format mean pain, e.g. 3.456 → "3.5" or null → "–" */
export function fmtPain(mean: number | null | undefined): string {
  if (mean == null) return '\u2013';
  return mean.toFixed(1);
}

/** Format relative risk, e.g. 2.34 → "2.3×" or null → "–" */
export function fmtRR(rr: number | null | undefined): string {
  if (rr == null) return '\u2013';
  return `${rr.toFixed(1)}\u00d7`;
}

/** Format absolute difference in percentage points, e.g. 0.15 → "+15 pp" */
export function fmtAbsDiff(absDiff: number | null | undefined): string {
  if (absDiff == null) return '\u2013';
  const pp = Math.round(absDiff * 100);
  return `${pp > 0 ? '+' : ''}${pp} pp`;
}
