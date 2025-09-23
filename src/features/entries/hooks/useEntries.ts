import { useQuery } from "@tanstack/react-query";
import { listEntries, type ListParams } from "../api/entries.api";

export function useEntries(params: ListParams = {}) {
  return useQuery({
    queryKey: ["entries", params],
    queryFn: () => listEntries(params),
  });
}