import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getEntryMedications, 
  createEntryMedication, 
  updateEntryMedication, 
  deleteEntryMedication,
  getLastEntryDefaults
} from "../api/entryMedications.api";
import type { CreateEntryMedicationPayload } from "@/types/entryMedications";

export function useEntryMedications(entryId?: number) {
  return useQuery({
    queryKey: ["entry-medications", entryId],
    queryFn: () => entryId ? getEntryMedications(entryId) : Promise.resolve([]),
    enabled: !!entryId,
  });
}

export function useCreateEntryMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEntryMedicationPayload) => createEntryMedication(payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["entry-medications", variables.entry_id] });
    },
  });
}

export function useUpdateEntryMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateEntryMedicationPayload> }) => 
      updateEntryMedication(id, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["entry-medications", data.entry_id] });
    },
  });
}

export function useDeleteEntryMedication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntryMedication(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entry-medications"] });
    },
  });
}

export function useLastEntryDefaults() {
  return useQuery({
    queryKey: ["last-entry-defaults"],
    queryFn: getLastEntryDefaults,
  });
}