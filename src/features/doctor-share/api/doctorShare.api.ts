/**
 * Doctor Share API
 * API calls for the "Mit Arzt teilen" feature
 */

import { supabase } from "@/lib/supabaseClient";

export interface DoctorShare {
  id: string;
  code: string;
  code_display: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
}

export interface CreateShareResponse {
  id: string;
  code: string;
  expires_at: string;
  created_at: string;
}

/**
 * Erstellt einen neuen Freigabe-Code
 */
export async function createDoctorShare(): Promise<CreateShareResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("create-doctor-share", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);
  
  return data;
}

/**
 * Widerruft einen aktiven Share
 */
export async function revokeDoctorShare(shareId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase.functions.invoke("revoke-doctor-share", {
    body: { share_id: shareId },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);
}

/**
 * Lädt alle Shares des aktuellen Nutzers
 */
export async function fetchDoctorShares(): Promise<DoctorShare[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("doctor_shares")
    .select("id, code, code_display, expires_at, created_at, revoked_at, last_accessed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Lädt nur aktive (nicht abgelaufene, nicht widerrufene) Shares
 */
export async function fetchActiveDoctorShares(): Promise<DoctorShare[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("doctor_shares")
    .select("id, code, code_display, expires_at, created_at, revoked_at, last_accessed_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
