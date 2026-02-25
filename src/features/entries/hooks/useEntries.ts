import { useQuery } from "@tanstack/react-query";
import { listEntries, type ListParams } from "../api/entries.api";

/**
 * Optimized entries hook with sensible caching
 * - staleTime: 30s - prevents excessive refetching
 * - gcTime: 5min - keeps data in cache for quick navigation
 */
export function useEntries(params: ListParams = {}) {
  return useQuery({
    queryKey: ["entries", params],
    queryFn: () => listEntries(params),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}