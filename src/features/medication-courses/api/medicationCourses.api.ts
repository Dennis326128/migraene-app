import { supabase } from "@/lib/supabaseClient";

export type MedicationCourseType = "prophylaxe" | "akut" | "sonstige";
export type BaselineDaysRange = "<5" | "5-10" | "11-15" | "16-20" | ">20" | "unknown";
export type ImpairmentLevel = "wenig" | "mittel" | "stark" | "unknown";
export type DiscontinuationReason = "keine_wirkung" | "nebenwirkungen" | "migraene_gebessert" | "kinderwunsch" | "andere";

export interface MedicationCourse {
  id: string;
  user_id: string;
  medication_name: string;
  // New: Reference to user_medications
  medication_id?: string | null;
  type: MedicationCourseType;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  dose_text: string | null;
  baseline_migraine_days: BaselineDaysRange | null;
  baseline_acute_med_days: BaselineDaysRange | null;
  baseline_triptan_doses_per_month: number | null;
  baseline_impairment_level: ImpairmentLevel | null;
  subjective_effectiveness: number | null;
  side_effects_text: string | null;
  had_side_effects: boolean | null;
  discontinuation_reason: DiscontinuationReason | null;
  discontinuation_details: string | null;
  note_for_physician: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateMedicationCourseInput = Omit<MedicationCourse, "id" | "user_id" | "created_at" | "updated_at">;
export type UpdateMedicationCourseInput = Partial<CreateMedicationCourseInput>;

/**
 * Fetch all medication courses for the current user
 */
export async function getMedicationCourses(): Promise<MedicationCourse[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data as MedicationCourse[]) ?? [];
}

/**
 * Fetch active medication courses only
 */
export async function getActiveMedicationCourses(): Promise<MedicationCourse[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data as MedicationCourse[]) ?? [];
}

/**
 * Fetch medication courses by type
 */
export async function getMedicationCoursesByType(type: MedicationCourseType): Promise<MedicationCourse[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", type)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data as MedicationCourse[]) ?? [];
}

/**
 * Fetch medication courses for a specific medication (by medication_id)
 */
export async function getMedicationCoursesByMedId(medicationId: string): Promise<MedicationCourse[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .select("*")
    .eq("user_id", user.id)
    .eq("medication_id", medicationId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return (data as MedicationCourse[]) ?? [];
}

/**
 * Create a new medication course
 */
export async function createMedicationCourse(input: CreateMedicationCourseInput): Promise<MedicationCourse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .insert({
      ...input,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MedicationCourse;
}

/**
 * Update an existing medication course
 */
export async function updateMedicationCourse(id: string, input: UpdateMedicationCourseInput): Promise<MedicationCourse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .update(input)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data as MedicationCourse;
}

/**
 * Delete a medication course
 */
export async function deleteMedicationCourse(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { error } = await supabase
    .from("medication_courses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

/**
 * Get a single medication course by ID
 */
export async function getMedicationCourseById(id: string): Promise<MedicationCourse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const { data, error } = await supabase
    .from("medication_courses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data as MedicationCourse | null;
}
