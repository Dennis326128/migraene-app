/**
 * Central range resolver — Single Source of Truth for time range logic.
 *
 * Rules:
 * - effectiveStart ≥ firstEntryDate (no data before first entry)
 * - effectiveEnd ≤ today (no future dates)
 * - Dynamic presets based on documentationSpanDays
 * - "Seit Beginn" replaces "Alle"
 *
 * IMPORTANT: todayStr()/yesterdayStr() use Berlin timezone (Europe/Berlin)
 * to ensure calendar-day correctness for medical data. Never use UTC split.
 */

import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';
import { berlinDateToday } from '@/lib/tz';

/** Fixed day counts per preset */
const PRESET_DAYS: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '12m': 365,
};

/**
 * Days between two YYYY-MM-DD dates, inclusive.
 */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

/**
 * Get today as YYYY-MM-DD in Berlin timezone.
 * Uses berlinDateToday() as SSOT — ensures correctness between midnight
 * and 2am Berlin time when UTC date would be the previous day.
 */
export function todayStr(): string {
  return berlinDateToday();
}

/**
 * Get yesterday as YYYY-MM-DD in Berlin timezone.
 * Used as the effective end date for all presets — today is not yet complete.
 */
export function yesterdayStr(): string {
  const today = berlinDateToday();
  const d = new Date(today + 'T12:00:00'); // noon to avoid DST edge cases
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * How many calendar days of documentation the user has (span-based, legacy).
 * @deprecated Use computeConsecutiveDocumentedDays for preset availability.
 */
export function getDocumentationSpanDays(firstEntryDate: string | null): number {
  if (!firstEntryDate) return 0;
  return daysBetweenInclusive(firstEntryDate, todayStr());
}

/**
 * Compute the number of consecutively documented days counting backwards
 * from lastDocDate. A day is "documented" if it exists in the Set.
 */
export function computeConsecutiveDocumentedDays(
  documentedDatesSet: Set<string>,
  lastDocDate: string | null
): number {
  if (!lastDocDate || documentedDatesSet.size === 0) return 0;
  
  let count = 0;
  const cursor = new Date(lastDocDate + 'T00:00:00');
  if (isNaN(cursor.getTime())) return 0;

  while (true) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (!documentedDatesSet.has(dateStr)) break;
    count++;
    cursor.setDate(cursor.getDate() - 1);
    // Safety: don't loop more than 400 days
    if (count > 400) break;
  }

  return count;
}

/**
 * Return the list of presets the user should see, based on documentation span.
 *
 * Order: [Seit Beginn, ...conditionalPresets, Benutzerdefiniert]
 */
export function getAvailablePresets(
  documentationSpanDays: number
): { key: TimeRangePreset; label: string }[] {
  const result: { key: TimeRangePreset; label: string }[] = [
    { key: 'all', label: 'Seit Beginn' },
  ];

  if (documentationSpanDays >= 30)  result.push({ key: '1m',  label: '1 Monat' });
  if (documentationSpanDays >= 90)  result.push({ key: '3m',  label: '3 Monate' });
  if (documentationSpanDays >= 180) result.push({ key: '6m',  label: '6 Monate' });
  if (documentationSpanDays >= 365) result.push({ key: '12m', label: '12 Monate' });

  result.push({ key: 'custom', label: 'Benutzerdefiniert' });

  return result;
}

export interface EffectiveRange {
  effectiveStart: string;
  effectiveEnd: string;
  effectiveDays: number;
  wasClamped: boolean;
}

/**
 * Clamp a user-selected range to [_, effectiveToday].
 * effectiveToday = yesterday (today is not yet complete).
 */
export function resolveEffectiveRange(
  selectedStart: string,
  selectedEnd: string,
  _firstEntryDate: string | null
): EffectiveRange {
  const effective = yesterdayStr();
  let start = selectedStart;
  let end = selectedEnd;
  let wasClamped = false;

  // Clamp end to yesterday (today not complete)
  if (end > effective) {
    end = effective;
    wasClamped = true;
  }

  // Ensure start ≤ end
  if (start > end) {
    start = end;
    wasClamped = true;
  }

  return {
    effectiveStart: start,
    effectiveEnd: end,
    effectiveDays: daysBetweenInclusive(start, end),
    wasClamped,
  };
}

/**
 * Compute raw start/end for a preset (before clamping).
 * All presets end at yesterday (effectiveToday), not today.
 */
export function computeRawRange(
  preset: TimeRangePreset,
  opts?: {
    customFrom?: string;
    customTo?: string;
    firstEntryDate?: string | null;
  }
): { from: string; to: string } {
  const effective = yesterdayStr();

  if (preset === 'custom') {
    return {
      from: opts?.customFrom || effective,
      to: opts?.customTo || effective,
    };
  }

  if (preset === 'all') {
    return {
      from: opts?.firstEntryDate || effective,
      to: effective,
    };
  }

  // Fixed day presets: end at yesterday, count backwards
  const days = PRESET_DAYS[preset] ?? 90;
  const endDate = new Date(effective + 'T00:00:00');
  const startDate = new Date(effective + 'T00:00:00');
  startDate.setDate(startDate.getDate() - (days - 1));

  return {
    from: startDate.toISOString().split('T')[0],
    to: endDate.toISOString().split('T')[0],
  };
}

/**
 * Full pipeline: compute raw range, then clamp to effective range.
 */
export function computeEffectiveDateRange(
  preset: TimeRangePreset,
  firstEntryDate: string | null,
  opts?: {
    customFrom?: string;
    customTo?: string;
  }
): EffectiveRange & { from: string; to: string } {
  const raw = computeRawRange(preset, {
    customFrom: opts?.customFrom,
    customTo: opts?.customTo,
    firstEntryDate,
  });

  const eff = resolveEffectiveRange(raw.from, raw.to, firstEntryDate);

  return {
    from: eff.effectiveStart,
    to: eff.effectiveEnd,
    ...eff,
  };
}

/**
 * Get the set of documented dates (YYYY-MM-DD) in a range.
 */
export function getDocumentedDays(
  entries: Array<{ selected_date?: string | null; timestamp_created?: string | null }>,
  effectiveStart: string,
  effectiveEnd: string
): Set<string> {
  const days = new Set<string>();
  for (const e of entries) {
    const d = e.selected_date || e.timestamp_created?.split('T')[0];
    if (d && d >= effectiveStart && d <= effectiveEnd) {
      days.add(d);
    }
  }
  return days;
}

/**
 * Validate a preset: if the user's selected preset requires more data than available,
 * fall back to 'all' (Seit Beginn).
 */
export function validatePreset(
  preset: TimeRangePreset,
  documentationSpanDays: number
): TimeRangePreset {
  if (preset === 'all' || preset === 'custom') return preset;
  const requiredDays = PRESET_DAYS[preset];
  if (!requiredDays) return preset;
  if (documentationSpanDays < requiredDays) return getDefaultPreset(documentationSpanDays);
  return preset;
}

/**
 * Determine the best default preset based on documentation span.
 * Priority: 1m → all
 */
export function getDefaultPreset(documentationSpanDays: number): TimeRangePreset {
  if (documentationSpanDays >= 30) return '1m';
  return 'all';
}
