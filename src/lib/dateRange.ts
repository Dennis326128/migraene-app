/**
 * Shared date range calculation for time range presets.
 * 
 * Rules:
 * - Today is EXCLUDED from all preset ranges
 * - 1m = 30 days, 3m = 90 days, 6m = 180 days, 12m = 365 days
 * - end = yesterday, start = end - (days - 1) → totalDays = days exactly
 * - "all" and "custom" follow different logic
 */
import { startOfDay, subDays } from 'date-fns';
import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';

/** Fixed day counts per preset (no calendar month arithmetic) */
const PRESET_DAYS: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '12m': 365,
};

export function computeDateRange(
  timeRange: TimeRangePreset,
  opts?: {
    customFrom?: string;
    customTo?: string;
    firstEntryDate?: string | null;
  }
): { from: string; to: string } {
  const today = startOfDay(new Date());
  const todayStr = today.toISOString().split('T')[0];

  if (timeRange === 'custom') {
    if (opts?.customFrom && opts?.customTo) {
      return { from: opts.customFrom, to: opts.customTo };
    }
    // Fallback: last 90 days excluding today
    const end = subDays(today, 1);
    const start = subDays(end, 89);
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    };
  }

  if (timeRange === 'all') {
    // "all" = from first entry (or 5y fallback) to yesterday
    const end = subDays(today, 1);
    const fallback = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
    return {
      from: opts?.firstEntryDate || fallback.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    };
  }

  // Preset: fixed day count, excluding today
  const days = PRESET_DAYS[timeRange] ?? 90;
  const end = subDays(today, 1); // yesterday
  const start = subDays(end, days - 1); // so that (end - start + 1) === days

  return {
    from: start.toISOString().split('T')[0],
    to: end.toISOString().split('T')[0],
  };
}
