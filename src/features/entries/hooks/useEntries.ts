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
    staleTime: 30_000, // 30 seconds - data considered fresh
    gcTime: 5 * 60_000, // 5 minutes cache time
    refetchOnMount: "always", // Refetch when stale and mounting
    refetchOnWindowFocus: false, // Prevent focus refetch spam
  });
}