import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getUnratedMedicationEntries, 
  createMedicationEffect, 
  createMedicationEffects,
  updateMedicationEffect,
  getMedicationEffects,
  getRecentMedicationsWithEffects,
  getMedicationEffectsForPeriod,
  getRatedMedicationEntries,
  deleteMedicationFromEntry,
  restoreMedicationToEntry,
  type MedicationEffectPayload,
  type MedicationEffectUpdatePayload
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
      qc.invalidateQueries({ queryKey: ["ratedMedicationEntries"] });
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
      qc.invalidateQueries({ queryKey: ["ratedMedicationEntries"] });
    },
  });
}

export function useUpdateMedicationEffect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ effectId, payload }: { effectId: string; payload: MedicationEffectUpdatePayload }) => 
      updateMedicationEffect(effectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medicationEffects"] });
      qc.invalidateQueries({ queryKey: ["ratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["recentMedicationsWithEffects"] });
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

export function useRatedMedicationEntries(limit = 30, offset = 0) {
  return useQuery({
    queryKey: ["ratedMedicationEntries", limit, offset],
    queryFn: () => getRatedMedicationEntries(limit, offset),
    staleTime: 1 * 60 * 1000,
  });
}

export function useDeleteMedicationFromEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, medName }: { entryId: number; medName: string }) => 
      deleteMedicationFromEntry(entryId, medName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["medicationEffects"] });
      qc.invalidateQueries({ queryKey: ["ratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

export function useRestoreMedicationToEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, medName }: { entryId: number; medName: string }) => 
      restoreMedicationToEntry(entryId, medName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["medicationEffects"] });
      qc.invalidateQueries({ queryKey: ["ratedMedicationEntries"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}