import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  listMeds, 
  listActiveMeds,
  addMed, 
  updateMed,
  deleteMed, 
  deleteMedById,
  discontinueMed,
  listRecentMeds, 
  type Med, 
  type CreateMedInput,
  type UpdateMedInput
} from "../api/meds.api";

const MED_QUERY_KEY = ["user_medications"];
const RECENT_MED_QUERY_KEY = ["recent_medications"];

export function useMeds() {
  return useQuery<Med[]>({
    queryKey: MED_QUERY_KEY,
    queryFn: listMeds,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveMeds() {
  return useQuery<Med[]>({
    queryKey: [...MED_QUERY_KEY, "active"],
    queryFn: listActiveMeds,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecentMeds(limit: number = 5) {
  return useQuery({
    queryKey: [...RECENT_MED_QUERY_KEY, limit],
    queryFn: () => listRecentMeds(limit),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAddMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | CreateMedInput) => {
      const medInput: CreateMedInput = typeof input === "string" 
        ? { name: input } 
        : input;
      return addMed(medInput);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RECENT_MED_QUERY_KEY });
    },
  });
}

export function useUpdateMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMedInput }) => updateMed(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RECENT_MED_QUERY_KEY });
    },
  });
}

export function useDeleteMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMed,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RECENT_MED_QUERY_KEY });
    },
  });
}

export function useDeleteMedById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMedById,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MED_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RECENT_MED_QUERY_KEY });
    },
  });
}

export function useDiscontinueMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: discontinueMed,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MED_QUERY_KEY });
    },
  });
}

// Re-export types
export type { Med, CreateMedInput, UpdateMedInput };
