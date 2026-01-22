/**
 * Doctor Share API
 * API calls for the "Mit Arzt teilen" feature
 * 
 * NEU: 24h-Freigabe-Fenster Logik
 * - Code ist permanent
 * - share_active_until = temporäres Freigabe-Fenster (24h)
 */

import { supabase } from "@/lib/supabaseClient";
import type { 
  DoctorShareStatus, 
  ActivateShareResult 
} from "./types";

// Re-export types
export type { DoctorShareStatus, ActivateShareResult };

/**
 * Holt den Status des Arzt-Codes (inkl. Freigabe-Status)
 */
export async function getDoctorShareStatus(): Promise<DoctorShareStatus | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("get-permanent-doctor-code", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);
  
  return data;
}

/**
 * Aktiviert die 24h-Freigabe
 */
export async function activateDoctorShare(): Promise<ActivateShareResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("activate-doctor-share", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);
  
  return data;
}

/**
 * Beendet die Freigabe sofort
 */
export async function revokeDoctorShare(): Promise<ActivateShareResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("activate-doctor-share", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);
  
  return data;
}

// Legacy-Exports für Kompatibilität
export type DoctorShare = DoctorShareStatus;

export async function getPermanentDoctorCode(): Promise<DoctorShareStatus | null> {
  return getDoctorShareStatus();
}

export async function fetchDoctorShares(): Promise<DoctorShareStatus[]> {
  const status = await getDoctorShareStatus();
  return status ? [status] : [];
}

export async function fetchActiveDoctorShares(): Promise<DoctorShareStatus[]> {
  return fetchDoctorShares();
}

export async function createDoctorShare(): Promise<DoctorShareStatus> {
  const status = await getDoctorShareStatus();
  if (!status) throw new Error("Konnte Code nicht erstellen");
  return status;
}
