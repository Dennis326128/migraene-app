import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getUnratedMedicationEntries, 
  createMedicationEffect, 
  createMedicationEffects,
  getMedicationEffects,
  getRecentMedicationsWithEffects,
  getMedicationEffectsForPeriod,
  type MedicationEffectPayload 
} from "../api/medicationEffects.api";

export function useUnratedMedicationEntries() {
  return useQuery({
    queryKey: ["unratedMedicationEntries"],
    queryFn: getUnratedMedicationEntries,
  });
}

export function useCreateMedicationEffect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMedicationEffect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["medicationEffects"] });
    },
  });
}

export function useCreateMedicationEffects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMedicationEffects,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["medicationEffects"] });
    },
  });
}

export function useMedicationEffects(entryId: number) {
  return useQuery({
    queryKey: ["medicationEffects", entryId],
    queryFn: () => getMedicationEffects(entryId),
    enabled: !!entryId,
  });
}

export function useRecentMedicationsWithEffects(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["recentMedicationsWithEffects", limit, offset],
    queryFn: () => getRecentMedicationsWithEffects(limit, offset),
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

export function useMedicationEffectsForEntries(entryIds: number[]) {
  return useQuery({
    queryKey: ["medicationEffectsForEntries", entryIds],
    queryFn: () => getMedicationEffectsForPeriod(entryIds),
    enabled: entryIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}