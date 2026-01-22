/**
 * Doctor Share API
 * API calls for the "Mit Arzt teilen" feature
 * 
 * Vereinfachte Version: Jeder Nutzer hat genau EINEN permanenten Code
 */

import { supabase } from "@/lib/supabaseClient";

export interface DoctorShare {
  id: string;
  code: string;
  code_display: string;
  created_at: string;
}

/**
 * Holt den permanenten Arzt-Code des Nutzers.
 * Falls noch keiner existiert, wird serverseitig einer erstellt.
 */
export async function getPermanentDoctorCode(): Promise<DoctorShare | null> {
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

// Legacy exports für Kompatibilität (werden nicht mehr aktiv genutzt)
export async function fetchDoctorShares(): Promise<DoctorShare[]> {
  const code = await getPermanentDoctorCode();
  return code ? [code] : [];
}

export async function fetchActiveDoctorShares(): Promise<DoctorShare[]> {
  return fetchDoctorShares();
}

export async function createDoctorShare(): Promise<DoctorShare> {
  const code = await getPermanentDoctorCode();
  if (!code) throw new Error("Konnte Code nicht erstellen");
  return code;
}

export async function revokeDoctorShare(_shareId: string): Promise<void> {
  // Nicht mehr unterstützt - Code ist permanent
  console.warn("revokeDoctorShare wird nicht mehr unterstützt");
}
