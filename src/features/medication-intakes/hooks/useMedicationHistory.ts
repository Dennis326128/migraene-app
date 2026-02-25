/**
 * Medication History Hook
 * 
 * LIST: Shows latest N intakes (no date range filter) — always consistent.
 * COUNTS: Rolling 7d/30d INCLUDING today (safety mode for limits).
 * 
 * IMPORTANT: The list is NOT coupled to the global TimeRange.
 * This prevents the bug where counts show "4×" but the list shows "no entries".
 * 
 * STATE RESET: Uses useEffect (not render-scope setState) to avoid
 * React warnings and ensure deterministic behavior on navigation/remount.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import {
  getMedicationHistoryLatest,
  countMedicationIntakesInRange,
  type MedicationHistoryEntry,
} from "../api/medicationHistory.api";
import { todayStr } from "@/lib/dateRange/rangeResolver";
import { subDays, format } from "date-fns";

const PAGE_SIZE = 10;

/**
 * Rolling today-based ranges (includes today for safety/limits).
 */
function getRollingRanges() {
  const today = todayStr();
  const from7d = format(subDays(new Date(today + "T00:00:00"), 6), "yyyy-MM-dd");
  const from30d = format(subDays(new Date(today + "T00:00:00"), 29), "yyyy-MM-dd");
  return { today, from7d, from30d };
}

/**
 * Hook for medication history view.
 * - List: latest N intakes (no date range), paginated
 * - Counts: rolling 7d/30d incl. today
 */
export function useMedicationHistory(medicationName: string | null) {
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<MedicationHistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Reset pagination when medication changes — in useEffect, NOT render scope
  useEffect(() => {
    setOffset(0);
    setAllItems([]);
    setTotalCount(0);
  }, [medicationName]);

  // Paginated history — latest N, NO date range filter
  const historyQuery = useQuery({
    queryKey: ["medication-history-latest", medicationName, offset],
    queryFn: async () => {
      if (!medicationName) return { items: [], totalCount: 0 };
      const result = await getMedicationHistoryLatest(medicationName, offset, PAGE_SIZE);
      return result;
    },
    enabled: !!medicationName,
    staleTime: 60_000,
    gcTime: 5 * 60_000, // Keep cache for 5 min to survive navigation
    refetchOnWindowFocus: false,
    // Keep previous data visible while refetching to prevent empty flashes
    placeholderData: (prev) => prev,
  });

  // Sync query result into accumulated items state
  useEffect(() => {
    if (!historyQuery.data) return;
    const result = historyQuery.data;

    setTotalCount(result.totalCount);
    setAllItems((prev) => {
      if (offset === 0) return result.items;
      const existingIds = new Set(prev.map((i) => i.id));
      const newItems = result.items.filter((i) => !existingIds.has(i.id));
      return [...prev, ...newItems];
    });
  }, [historyQuery.data, offset]);

  // Rolling 7d and 30d counts INCLUDING today (for safety/limits)
  const { today: rollingToday, from7d, from30d } = getRollingRanges();

  const count7dQuery = useQuery({
    queryKey: ["medication-7d-count", medicationName, from7d, rollingToday],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, from7d, rollingToday)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const count30dQuery = useQuery({
    queryKey: ["medication-30d-count", medicationName, from30d, rollingToday],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, from30d, rollingToday)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Count today only (for day-period limits)
  const countTodayQuery = useQuery({
    queryKey: ["medication-today-count", medicationName, rollingToday],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, rollingToday, rollingToday)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const hasMore = allItems.length < totalCount;

  return {
    items: allItems,
    totalCount,
    hasMore,
    loadMore,
    isLoading: historyQuery.isLoading,
    isFetchingMore: historyQuery.isFetching && offset > 0,
    /** Rolling 7d count INCLUDING today */
    rolling7dCount: count7dQuery.data ?? 0,
    /** Rolling 30d count INCLUDING today */
    rolling30dCount: count30dQuery.data ?? 0,
    /** Today-only count (for day-period limits) */
    rollingTodayCount: countTodayQuery.data ?? 0,
    rollingToday,
    from30d,
    offset,
  };
}
