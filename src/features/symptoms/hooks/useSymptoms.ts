import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSymptomCatalog, listEntrySymptoms, setEntrySymptoms } from "../api/symptoms.api";

export function useSymptomCatalog() {
  return useQuery({
    queryKey: ["symptom_catalog"],
    queryFn: listSymptomCatalog,
    staleTime: 60 * 60 * 1000, // 1h
  });
}

export function useEntrySymptoms(entryId: number | null) {
  return useQuery({
    queryKey: ["entry_symptoms", entryId],
    queryFn: () => listEntrySymptoms(entryId as number),
    enabled: !!entryId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetEntrySymptoms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, symptomIds }: { entryId: number; symptomIds: string[] }) =>
      setEntrySymptoms(entryId, symptomIds),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entry_symptoms", vars.entryId] });
    },
  });
}