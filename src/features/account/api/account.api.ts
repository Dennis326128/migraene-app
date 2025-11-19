import { supabase } from "@/lib/supabaseClient";

export type PatientData = {
  id?: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  street?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
  date_of_birth?: string;
  created_at?: string;
  updated_at?: string;
};

export type Doctor = {
  id?: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  specialty?: string;
  street?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
};

// Patient Data
export async function getPatientData(): Promise<PatientData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data } = await supabase
    .from("patient_data")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  
  return (data as PatientData) ?? null;
}

export async function upsertPatientData(patch: Partial<PatientData>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  
  const payload = { user_id: user.id, ...patch };
  const { error } = await supabase
    .from("patient_data")
    .upsert(payload, { onConflict: "user_id" });
  
  if (error) throw error;
}

// Doctors
export async function getDoctors(): Promise<Doctor[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data } = await supabase
    .from("doctors")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  
  return (data as Doctor[]) || [];
}

export async function createDoctor(doctor: Omit<Doctor, "id" | "user_id" | "created_at" | "updated_at">): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  
  const payload = { user_id: user.id, ...doctor };
  const { error } = await supabase.from("doctors").insert(payload);
  if (error) throw error;
}

export async function updateDoctor(id: string, updates: Partial<Doctor>): Promise<void> {
  const { error } = await supabase
    .from("doctors")
    .update(updates)
    .eq("id", id);
  
  if (error) throw error;
}

export async function deleteDoctor(id: string): Promise<void> {
  const { error } = await supabase
    .from("doctors")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}
