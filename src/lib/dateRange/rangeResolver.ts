/**
 * Central range resolver — Single Source of Truth for time range logic.
 *
 * Rules:
 * - effectiveStart ≥ firstEntryDate (no data before first entry)
 * - effectiveEnd ≤ today (no future dates)
 * - Dynamic presets based on documentationSpanDays
 * - "Seit Beginn" replaces "Alle"
 */

import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';

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
 * Get today as YYYY-MM-DD (local time).
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
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
 * Clamp a user-selected range to [firstEntryDate, today].
 */
export function resolveEffectiveRange(
  selectedStart: string,
  selectedEnd: string,
  _firstEntryDate: string | null
): EffectiveRange {
  const today = todayStr();
  let start = selectedStart;
  let end = selectedEnd;
  let wasClamped = false;

  // Do NOT clamp start to firstEntryDate — days before first entry count as pain-free.

  if (end > today) {
    end = today;
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
 */
export function computeRawRange(
  preset: TimeRangePreset,
  opts?: {
    customFrom?: string;
    customTo?: string;
    firstEntryDate?: string | null;
  }
): { from: string; to: string } {
  const today = todayStr();

  if (preset === 'custom') {
    return {
      from: opts?.customFrom || today,
      to: opts?.customTo || today,
    };
  }

  if (preset === 'all') {
    return {
      from: opts?.firstEntryDate || today,
      to: today,
    };
  }

  // Fixed day presets
  const days = PRESET_DAYS[preset] ?? 90;
  const endDate = new Date();
  const startDate = new Date();
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
 * Priority: 3m → 1m → all
 */
export function getDefaultPreset(documentationSpanDays: number): TimeRangePreset {
  if (documentationSpanDays >= 90) return '3m';
  if (documentationSpanDays >= 30) return '1m';
  return 'all';
}
