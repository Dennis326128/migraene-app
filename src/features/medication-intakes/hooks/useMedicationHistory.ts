/**
 * Medication History Hook
 * True offset-based append pagination + 30-day count (effectiveToday-based)
 * List is filtered by global TimeRange (from/to).
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
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

  // 30-day count (independent of pagination & TimeRange)
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
    last30DaysCount: countQuery.data ?? 0,
    last30From,
    last30To,
    effectiveToday: last30To,
    offset,
    rangeFrom,
    rangeTo,
  };
}
