import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPatientData,
  upsertPatientData,
  getDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  type PatientData,
  type Doctor
} from "../api/account.api";

export function usePatientData() {
  return useQuery<PatientData | null>({
    queryKey: ["patient_data"],
    queryFn: getPatientData,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertPatientData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertPatientData,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient_data"] }),
  });
}

export function useDoctors() {
  return useQuery<Doctor[]>({
    queryKey: ["doctors"],
    queryFn: getDoctors,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDoctor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useUpdateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Doctor> }) =>
      updateDoctor(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useDeleteDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDoctor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export type { PatientData, Doctor };
