/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Berlin DateKey Helpers — Timezone-safe calendar-day operations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT: All date keys are 'YYYY-MM-DD' in Europe/Berlin timezone.
 * NEVER uses 24h arithmetic — always calendar-day based.
 */

const TZ = 'Europe/Berlin';

/**
 * Convert a UTC ISO string or Date to Berlin calendar day 'YYYY-MM-DD'.
 */
export function berlinDateKeyFromUtc(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Extract Berlin time label 'HH:mm' from a UTC ISO string or Date.
 */
export function berlinTimeLabelFromUtc(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find(p => p.type === 'hour')!.value;
  const minute = parts.find(p => p.type === 'minute')!.value;
  return `${hour}:${minute}`;
}

/**
 * Add n calendar days to a Berlin dateKey.
 * Uses Date arithmetic on the dateKey string directly — no 24h math.
 */
export function addBerlinDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate difference in calendar days between two dateKeys.
 * Returns positive if b is after a.
 */
export function diffBerlinDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const dateA = new Date(ay, am - 1, ad);
  const dateB = new Date(by, bm - 1, bd);
  return Math.round((dateB.getTime() - dateA.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Check if a dateKey falls within a range [start, end] inclusive.
 */
export function isInRange(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}
