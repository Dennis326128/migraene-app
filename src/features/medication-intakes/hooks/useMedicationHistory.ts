/**
 * Medication History Hook
 * Paginated intake history with 30-day count (effectiveToday-based)
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  getMedicationHistory,
  countMedicationIntakesInRange,
  type MedicationHistoryEntry,
} from "../api/medicationHistory.api";
import { yesterdayStr } from "@/lib/dateRange/rangeResolver";
import { subDays, format } from "date-fns";

const PAGE_SIZE = 10;

/**
 * Get the last-30-completed-days range (effectiveToday - 29 → effectiveToday).
 */
function getLast30DaysRange() {
  const effective = yesterdayStr();
  const fromDate = format(subDays(new Date(effective + "T00:00:00"), 29), "yyyy-MM-dd");
  return { from: fromDate, to: effective };
}

export function useMedicationHistory(medicationName: string | null) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  // Reset when medication changes
  const resetPagination = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
  }, []);

  // Paginated history
  const historyQuery = useQuery({
    queryKey: ["medication-history", medicationName, visibleCount],
    queryFn: () =>
      medicationName
        ? getMedicationHistory(medicationName, 0, visibleCount)
        : Promise.resolve({ items: [], totalCount: 0 }),
    enabled: !!medicationName,
    staleTime: 30_000,
  });

  // 30-day count (independent of pagination)
  const { from: last30From, to: last30To } = getLast30DaysRange();

  const countQuery = useQuery({
    queryKey: ["medication-30d-count", medicationName, last30From, last30To],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, last30From, last30To)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 60_000,
  });

  const items = historyQuery.data?.items ?? [];
  const totalCount = historyQuery.data?.totalCount ?? 0;
  const hasMore = items.length < totalCount;

  return {
    items,
    totalCount,
    hasMore,
    loadMore,
    resetPagination,
    isLoading: historyQuery.isLoading,
    last30DaysCount: countQuery.data ?? 0,
    last30From,
    last30To,
    effectiveToday: last30To,
    visibleCount,
  };
}
