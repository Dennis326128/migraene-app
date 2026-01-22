/**
 * Doctor Share Hooks
 * React Query hooks for the "Mit Arzt teilen" feature
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchDoctorShares,
  fetchActiveDoctorShares,
  createDoctorShare,
  revokeDoctorShare,
  type DoctorShare,
} from "../api/doctorShare.api";
import { toast } from "sonner";

const QUERY_KEY = ["doctor-shares"];

export function useDoctorShares() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDoctorShares,
  });
}

export function useActiveDoctorShares() {
  return useQuery({
    queryKey: [...QUERY_KEY, "active"],
    queryFn: fetchActiveDoctorShares,
  });
}

export function useCreateDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDoctorShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Freigabe erstellt");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Freigabe konnte nicht erstellt werden");
    },
  });
}

export function useRevokeDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeDoctorShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Freigabe beendet");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Freigabe konnte nicht beendet werden");
    },
  });
}

// Re-export types
export type { DoctorShare };
