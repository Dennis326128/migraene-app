import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getUnratedMedicationEntries, 
  createMedicationEffect, 
  createMedicationEffects,
  getMedicationEffects,
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