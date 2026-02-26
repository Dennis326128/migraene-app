/**
 * Doctor Share API
 * API calls for the "Per Code teilen" feature
 *
 * Logik:
 * - Code ist permanent (1 pro Patient)
 * - is_active + expires_at steuern die zeitliche Freigabe
 * - activate setzt is_active=true + expires_at (Default 24h)
 * - deactivate setzt is_active=false
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
 * Idempotent: Erstellt Code automatisch falls noch keiner existiert
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
 * Aktiviert die Freigabe (Default: 24h)
 */
export async function activateDoctorShare(options?: {
  ttlMinutes?: number;
  defaultRange?: string;
}): Promise<ActivateShareResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const body: Record<string, unknown> = { action: "activate" };
  if (options?.ttlMinutes) body.ttl_minutes = options.ttlMinutes;
  if (options?.defaultRange) body.default_range = options.defaultRange;

  const { data, error } = await supabase.functions.invoke("activate-doctor-share", {
    method: "POST",
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);

  return data;
}

/**
 * Beendet die Freigabe sofort (Toggle OFF)
 */
export async function deactivateDoctorShare(): Promise<ActivateShareResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("activate-doctor-share", {
    body: { action: "deactivate" },
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

// Alias for backward compat
export const revokeDoctorShare = deactivateDoctorShare;
