/**
 * Medication History Hook
 * True offset-based append pagination + rolling 7d/30d counts INCLUDING today.
 * List is filtered by global TimeRange (from/to).
 *
 * IMPORTANT: History/Limits use rollingToday (today inclusive) for safety.
 * Statistics use effectiveToday (yesterday) for stable retrospective analysis.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import {
  getMedicationHistory,
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

export function useMedicationHistory(
  medicationName: string | null,
  rangeFrom: string,
  rangeTo: string
) {
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<MedicationHistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const prevKeyRef = useRef<string>("");

  // Reset when medication or range changes
  const currentKey = `${medicationName}|${rangeFrom}|${rangeTo}`;
  if (currentKey !== prevKeyRef.current) {
    prevKeyRef.current = currentKey;
    setOffset(0);
    setAllItems([]);
    setTotalCount(0);
  }

  // Paginated history (loads current page only)
  const historyQuery = useQuery({
    queryKey: ["medication-history", medicationName, rangeFrom, rangeTo, offset],
    queryFn: async () => {
      if (!medicationName) return { items: [], totalCount: 0 };
      const result = await getMedicationHistory(medicationName, rangeFrom, rangeTo, offset, PAGE_SIZE);

      // Append new items (no duplicates)
      setAllItems((prev) => {
        if (offset === 0) return result.items;
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = result.items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
      setTotalCount(result.totalCount);

      return result;
    },
    enabled: !!medicationName,
    staleTime: 30_000,
  });

  // Rolling 7d and 30d counts INCLUDING today (for safety/limits)
  const { today: rollingToday, from7d, from30d } = getRollingRanges();

  const count7dQuery = useQuery({
    queryKey: ["medication-7d-count", medicationName, from7d, rollingToday],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, from7d, rollingToday)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 30_000,
  });

  const count30dQuery = useQuery({
    queryKey: ["medication-30d-count", medicationName, from30d, rollingToday],
    queryFn: () =>
      medicationName
        ? countMedicationIntakesInRange(medicationName, from30d, rollingToday)
        : Promise.resolve(0),
    enabled: !!medicationName,
    staleTime: 30_000,
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
    rollingToday,
    from30d,
    offset,
    rangeFrom,
    rangeTo,
  };
}
