/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Berlin DateKey Helpers — Timezone-safe calendar-day operations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT: All date keys are 'YYYY-MM-DD' in Europe/Berlin timezone.
 * Uses pure Gregorian ordinal arithmetic — NO Date.getTime(), NO 24h math.
 * DST-proof, device-TZ-independent for addBerlinDays / diffBerlinDays.
 */

const TZ = 'Europe/Berlin';

// ─── Internal: Gregorian calendar helpers (Howard Hinnant civil algorithm) ───

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  const table = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeapYear(y)) return 29;
  return table[m];
}

function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid dateKey format: ${dateKey}`);
  }
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  const d = Number(dateKey.slice(8, 10));
  if (m < 1 || m > 12) {
    throw new Error(`Invalid month in dateKey: ${dateKey}`);
  }
  if (d < 1 || d > daysInMonth(y, m)) {
    throw new Error(`Invalid day in dateKey: ${dateKey}`);
  }
  return { y, m, d };
}

/**
 * Convert civil date to days since epoch (Howard Hinnant algorithm).
 * Timezone-free, deterministic, reversible.
 */
function civilToDays(y: number, m: number, d: number): number {
  const yr = m <= 2 ? y - 1 : y;
  const era = Math.floor(yr >= 0 ? yr : yr - 399) / 400 | 0;
  const yoe = yr - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Convert days since epoch back to civil date.
 */
function daysToCivil(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz >= 0 ? zz : zz - 146096) / 146097 | 0;
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y0 = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = y0 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

function dateKeyToOrdinal(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return civilToDays(y, m, d);
}

function ordinalToDateKey(ordinal: number): string {
  const { y, m, d } = daysToCivil(ordinal);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
 * Pure ordinal arithmetic — DST-proof, device-TZ-independent.
 */
export function addBerlinDays(dateKey: string, n: number): string {
  return ordinalToDateKey(dateKeyToOrdinal(dateKey) + n);
}

/**
 * Calculate difference in calendar days between two dateKeys.
 * Returns positive if b is after a.
 * Pure ordinal arithmetic — DST-proof, device-TZ-independent.
 */
export function diffBerlinDays(a: string, b: string): number {
  return dateKeyToOrdinal(b) - dateKeyToOrdinal(a);
}

/**
 * Check if a dateKey falls within a range [start, end] inclusive.
 */
export function isInRange(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}
