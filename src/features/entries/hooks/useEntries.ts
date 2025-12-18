import { useQuery } from "@tanstack/react-query";
import { listEntries, type ListParams } from "../api/entries.api";

export function useEntries(params: ListParams = {}) {
  return useQuery({
    queryKey: ["entries", params],
    queryFn: () => listEntries(params),
    staleTime: 0, // Daten sofort als stale markieren
    refetchOnMount: true, // Bei Mount neu laden falls stale
  });
}