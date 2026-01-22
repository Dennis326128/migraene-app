/**
 * Doctor Share Hooks
 * React Query hooks for the "Mit Arzt teilen" feature
 * 
 * Vereinfachte Version: Ein permanenter Code pro Nutzer
 */

import { useQuery } from "@tanstack/react-query";
import {
  getPermanentDoctorCode,
  type DoctorShare,
} from "../api/doctorShare.api";

const QUERY_KEY = ["doctor-code"];

/**
 * Haupthook: Holt den permanenten Arzt-Code des Nutzers
 */
export function usePermanentDoctorCode() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getPermanentDoctorCode,
    staleTime: 1000 * 60 * 60, // 1 Stunde - Code ändert sich nie
  });
}

// Legacy hooks für Kompatibilität
export function useDoctorShares() {
  return usePermanentDoctorCode();
}

export function useActiveDoctorShares() {
  return usePermanentDoctorCode();
}

// Diese Hooks sind nicht mehr nötig, aber für Kompatibilität behalten
export function useCreateDoctorShare() {
  return {
    mutate: () => console.warn("useCreateDoctorShare nicht mehr unterstützt"),
    isPending: false,
  };
}

export function useRevokeDoctorShare() {
  return {
    mutate: () => console.warn("useRevokeDoctorShare nicht mehr unterstützt"),
    isPending: false,
  };
}

// Re-export types
export type { DoctorShare };
