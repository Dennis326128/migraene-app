/**
 * SSOT Hook: useHeadacheTreatmentDays
 * 
 * Central React hook for headache & treatment day distribution.
 * All screens MUST use this hook instead of computing their own buckets.
 */

import { useMemo } from 'react';
import { useEntries } from '@/features/entries/hooks/useEntries';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import {
  computeHeadacheTreatmentDayDistribution,
  type HeadacheTreatmentDayResult,
} from './computeHeadacheTreatmentDayDistribution';

interface UseHeadacheTreatmentDaysResult {
  data: HeadacheTreatmentDayResult | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Provides the headache/treatment day distribution for the current global time range.
 * Uses the SSOT computation. No caller should compute this separately.
 */
export function useHeadacheTreatmentDays(): UseHeadacheTreatmentDaysResult {
  const { from, to, timeRange } = useTimeRange();
  const entriesLimit = timeRange === 'all' ? 5000 : 1000;
  const { data: allEntries = [], isLoading, error } = useEntries({ limit: entriesLimit });

  const data = useMemo(() => {
    if (!from || !to || allEntries.length === 0) return null;
    return computeHeadacheTreatmentDayDistribution(from, to, allEntries);
  }, [from, to, allEntries]);

  return { data, isLoading, error: error as Error | null };
}
