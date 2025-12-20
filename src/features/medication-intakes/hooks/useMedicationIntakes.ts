/**
 * Medication Intakes Hooks
 * React Query hooks for medication intake operations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIntakesForEntry,
  getIntakesForEntries,
  createIntake,
  createIntakes,
  updateIntakeDose,
  deleteIntake,
  syncIntakesForEntry,
  getMedicationUsageStats,
  type MedicationIntake,
  type CreateIntakeInput,
} from "../api/medicationIntakes.api";

/**
 * Fetch medication intakes for a single entry
 */
export function useEntryIntakes(entryId: number | null) {
  return useQuery({
    queryKey: ["medication-intakes", "entry", entryId],
    queryFn: () => (entryId ? getIntakesForEntry(entryId) : []),
    enabled: !!entryId,
    staleTime: 30_000,
  });
}

/**
 * Fetch medication intakes for multiple entries
 */
export function useEntriesIntakes(entryIds: number[]) {
  return useQuery({
    queryKey: ["medication-intakes", "entries", entryIds.sort().join(",")],
    queryFn: () => getIntakesForEntries(entryIds),
    enabled: entryIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Create a single medication intake
 */
export function useCreateIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIntake,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["medication-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

/**
 * Create multiple medication intakes
 */
export function useCreateIntakes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIntakes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medication-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

/**
 * Update a medication intake's dose
 */
export function useUpdateIntakeDose() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ intakeId, doseQuarters }: { intakeId: string; doseQuarters: number }) =>
      updateIntakeDose(intakeId, doseQuarters),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medication-intakes"] });
    },
  });
}

/**
 * Delete a medication intake
 */
export function useDeleteIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteIntake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medication-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

/**
 * Sync intakes for an entry (creates/updates/deletes as needed)
 */
export function useSyncIntakes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entryId,
      medications,
    }: {
      entryId: number;
      medications: Array<{ name: string; doseQuarters?: number; medicationId?: string }>;
    }) => syncIntakesForEntry(entryId, medications),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medication-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

/**
 * Get medication usage statistics with dose info
 */
export function useMedicationUsageStats(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["medication-usage-stats", fromDate, toDate],
    queryFn: () => getMedicationUsageStats(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    staleTime: 60_000,
  });
}

/**
 * Helper hook to get intake map by medication name for an entry
 */
export function useIntakesByMedName(entryId: number | null) {
  const { data: intakes = [] } = useEntryIntakes(entryId);
  
  const intakeMap = new Map<string, MedicationIntake>();
  intakes.forEach(intake => {
    intakeMap.set(intake.medication_name, intake);
  });
  
  return intakeMap;
}
