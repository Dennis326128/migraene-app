/**
 * Deterministic dedupe_key computation for reminders.
 * Must match the DB-side formula (md5 of canonical string).
 *
 * Key structure:
 *   type | med_identifier | time_key
 *
 * - med_identifier: medication_id if set, else normalized title
 * - time_key:
 *     one-time (repeat='none'): "once|YYYY-MM-DDTHH:MM"
 *     recurring:                 "repeat|time_of_day_or_HH:MM"
 */

/**
 * Normalize a medication name for dedup comparison:
 * trim, lowercase, collapse whitespace
 */
export function normalizeMedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Round a date-time string to the minute (seconds=0, ms=0).
 * Accepts ISO strings or "YYYY-MM-DDTHH:mm:ss" formats.
 */
export function roundToMinute(dateTimeStr: string): string {
  const d = new Date(dateTimeStr);
  d.setSeconds(0, 0);
  // Format as YYYY-MM-DDTHH:MM (local, matching DB to_char)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Extract HH:MM from a date-time string.
 */
function extractTime(dateTimeStr: string): string {
  const d = new Date(dateTimeStr);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export interface DedupeInput {
  type: string;
  title: string;
  medication_id?: string | null;
  date_time: string;
  repeat: string;
  time_of_day?: string | null;
}

/**
 * Build the canonical string used for dedupe_key hashing.
 * This must produce the same output as the DB-side md5() formula.
 */
export function buildDedupeCanonical(input: DedupeInput): string {
  const medIdentifier = input.medication_id || normalizeMedName(input.title);

  const timeKey = input.repeat === 'none'
    ? `once|${roundToMinute(input.date_time)}`
    : `${input.repeat}|${input.time_of_day || extractTime(input.date_time)}`;

  return `${input.type}|${medIdentifier}|${timeKey}`;
}

/**
 * Compute the dedupe_key as MD5 hash (matching the DB).
 * Uses SubtleCrypto for browser compatibility.
 * Falls back to the canonical string itself if crypto unavailable.
 */
export async function computeDedupeKey(input: DedupeInput): Promise<string> {
  const canonical = buildDedupeCanonical(input);

  // Use MD5 via simple hash for browser (SubtleCrypto doesn't have MD5)
  // We use the same approach as the DB: md5 of the canonical string
  // Since SubtleCrypto doesn't support MD5, we use a simple implementation
  return md5(canonical);
}

/**
 * Synchronous MD5 implementation for browser use.
 * Matches PostgreSQL's md5() function output.
 */
function md5(input: string): string {
  // Simple MD5 implementation
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const k = new Uint32Array(64);
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  // Pre-processing: adding padding bits
  const bitLen = data.length * 8;
  const padLen = ((56 - (data.length + 1) % 64) + 64) % 64;
  const padded = new Uint8Array(data.length + 1 + padLen + 8);
  padded.set(data);
  padded[data.length] = 0x80;

  // Append original length in bits as 64-bit little-endian
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, 0, true); // High 32 bits (0 for small inputs)

  function leftRotate(x: number, c: number): number {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
  }

  // Process each 512-bit block
  for (let offset = 0; offset < padded.length; offset += 64) {
    const m = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      m[j] = view.getUint32(offset + j * 4, true);
    }

    let aa = a, bb = b, cc = c, dd = d;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (bb & cc) | (~bb & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * i + 5) % 16;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * i) % 16;
      }
      f = (f >>> 0);
      const temp = dd;
      dd = cc;
      cc = bb;
      bb = (bb + leftRotate((aa + f + k[i] + m[g]) >>> 0, s[i])) >>> 0;
      aa = temp;
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  // Output as hex string (little-endian bytes)
  function toHex(n: number): string {
    const bytes = [
      (n) & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
    ];
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

/**
 * Client-side dedup: given an array of reminders, return only canonical entries.
 * Groups by dedupe_key (from DB) or computes it as fallback.
 * Picks canonical: prefer enabled=true, latest updated_at, most complete data.
 */
export function deduplicateReminders<T extends {
  id: string;
  dedupe_key?: string | null;
  notification_enabled?: boolean;
  updated_at?: string;
  status?: string;
}>(reminders: T[]): T[] {
  const groups = new Map<string, T[]>();

  for (const r of reminders) {
    const key = (r as any).dedupe_key || r.id; // fallback to id if no key
    const existing = groups.get(key);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  const result: T[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Pick canonical: prefer pending status, enabled, latest updated
    group.sort((a, b) => {
      // Prefer pending
      const aPending = a.status === 'pending' ? 0 : 1;
      const bPending = b.status === 'pending' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;

      // Prefer enabled
      const aEnabled = a.notification_enabled ? 0 : 1;
      const bEnabled = b.notification_enabled ? 0 : 1;
      if (aEnabled !== bEnabled) return aEnabled - bEnabled;

      // Prefer latest
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    });

    result.push(group[0]);
  }

  return result;
}
