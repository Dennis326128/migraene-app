/**
 * Hook: useMedicationSummary
 * Provides aggregated medication overview (last intake, 7d/30d counts).
 * Cached with React Query, keyed by effectiveToday.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchMedicationSummaries, getSummaryRanges } from "../api/medicationSummary.api";

export function useMedicationSummary() {
  const { effectiveToday } = getSummaryRanges();

  return useQuery({
    queryKey: ["medication-summary", effectiveToday],
    queryFn: fetchMedicationSummaries,
    staleTime: 120_000,
  });
}
