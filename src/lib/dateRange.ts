/**
 * Shared date range calculation for time range presets.
 * 
 * NOW delegates to the central rangeResolver for consistency.
 * Kept for backwards compatibility with existing imports.
 */
import type { TimeRangePreset } from '@/components/PainApp/TimeRangeButtons';
import { computeRawRange } from '@/lib/dateRange/rangeResolver';

export function computeDateRange(
  timeRange: TimeRangePreset,
  opts?: {
    customFrom?: string;
    customTo?: string;
    firstEntryDate?: string | null;
  }
): { from: string; to: string } {
  return computeRawRange(timeRange, opts);
}
