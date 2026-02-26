/**
 * Doctor Share Hooks
 * React Query hooks for the "Per Code teilen" feature
 *
 * Logik: is_active + expires_at
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDoctorShareStatus,
  activateDoctorShare,
  deactivateDoctorShare,
} from "../api/doctorShare.api";
import type { DoctorShareStatus } from "../api/types";

const QUERY_KEY = ["doctor-share-status"];

/**
 * Haupthook: Holt den Status des Arzt-Codes (inkl. Freigabe-Status)
 */
export function useDoctorShareStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getDoctorShareStatus,
    staleTime: 1000 * 30,
  });
}

/**
 * Aktiviert die Freigabe (Default 24h)
 */
export function useActivateDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => activateDoctorShare(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Beendet die Freigabe sofort (Toggle OFF)
 */
export function useDeactivateDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateDoctorShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// Legacy alias
export const useRevokeDoctorShare = useDeactivateDoctorShare;

// Legacy-Hooks für Kompatibilität
export function usePermanentDoctorCode() {
  return useDoctorShareStatus();
}

export function useDoctorShares() {
  return useDoctorShareStatus();
}

export function useActiveDoctorShares() {
  return useDoctorShareStatus();
}

export function useCreateDoctorShare() {
  return useActivateDoctorShare();
}

// Re-export types
export type { DoctorShareStatus };
export type DoctorShare = DoctorShareStatus;
