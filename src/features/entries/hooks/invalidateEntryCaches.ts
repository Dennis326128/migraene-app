import type { QueryClient } from "@tanstack/react-query";

/**
 * Central invalidator for every cache derived from `pain_entries`.
 *
 * Call this after any mutation that inserts / updates / deletes a
 * pain entry (manual, voice, backfill, medication intake sync, effects, …)
 * so that dependent views — Calendar, Timeline, Reports, Stats — refresh
 * immediately instead of waiting for staleTime to elapse.
 */
export const ENTRY_DEPENDENT_QUERY_KEYS = [
  ["entries"],
  ["calendar-entries"],
  ["first-entry-date"],
  ["pain-entries-count"],
  ["missing-weather"],
  ["filtered-entries"],
  ["allEntriesForReport"],
  ["entriesCount"],
  ["pain_entries"],
] as const;

export function invalidateEntryCaches(qc: QueryClient): void {
  for (const key of ENTRY_DEPENDENT_QUERY_KEYS) {
    qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
  }
}
