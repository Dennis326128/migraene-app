import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMeds, addMed, deleteMed } from "../api/meds.api";

export function useMeds() {
  return useQuery({ queryKey: ["meds"], queryFn: listMeds, staleTime: 10 * 60 * 1000 });
}

export function useAddMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addMed(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meds"] }); },
  });
}

export function useDeleteMed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteMed(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meds"] }); },
  });
}