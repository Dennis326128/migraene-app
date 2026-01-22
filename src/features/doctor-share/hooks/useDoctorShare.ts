/**
 * Doctor Share Hooks
 * React Query hooks for the "Mit Arzt teilen" feature
 * 
 * NEU: 24h-Freigabe-Fenster Logik
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDoctorShareStatus,
  activateDoctorShare,
  revokeDoctorShare,
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
    staleTime: 1000 * 30, // 30 Sekunden - Freigabe-Status kann sich ändern
  });
}

/**
 * Aktiviert die 24h-Freigabe
 */
export function useActivateDoctorShare() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: activateDoctorShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Beendet die Freigabe sofort
 */
export function useRevokeDoctorShare() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: revokeDoctorShare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

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
