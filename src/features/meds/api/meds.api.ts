import { supabase } from "@/lib/supabaseClient";

// Extended Med type with all BMP fields + structured dosing + intolerance
export type Med = { 
  id: string; 
  name: string; 
  raw_input?: string | null; // Original text as entered/spoken by user
  wirkstoff?: string | null;
  staerke?: string | null;
  darreichungsform?: string | null;
  einheit?: string | null;
  dosis_morgens?: string | null;
  dosis_mittags?: string | null;
  dosis_abends?: string | null;
  dosis_nacht?: string | null;
  dosis_bedarf?: string | null;
  anwendungsgebiet?: string | null;
  hinweise?: string | null;
  art?: string | null;
  is_active?: boolean | null;
  discontinued_at?: string | null;
  // Intolerance fields
  intolerance_flag?: boolean | null;
  intolerance_notes?: string | null;
  intolerance_reason_type?: string | null;
  // New structured fields
  intake_type?: string | null; // 'as_needed' | 'regular'
  strength_value?: string | null;
  strength_unit?: string | null;
  typical_indication?: string | null;
  // As-needed structured dosing
  as_needed_standard_dose?: string | null;
  as_needed_max_per_24h?: number | null;
  as_needed_max_days_per_month?: number | null;
  as_needed_min_interval_hours?: number | null;
  as_needed_notes?: string | null;
  // Regular structured dosing
  regular_weekdays?: string[] | null;
  regular_notes?: string | null;
  // Status
  medication_status?: string | null; // 'active' | 'stopped' | 'intolerant'
  // Effect category for analysis
  effect_category?: string | null;
  // Therapy history dates
  start_date?: string | null;
  end_date?: string | null;
};

export type RecentMed = Med & { use_count: number; last_used: string | null };

export type CreateMedInput = {
  name: string;
  raw_input?: string; // Original text as entered/spoken by user
  wirkstoff?: string;
  staerke?: string;
  darreichungsform?: string;
  einheit?: string;
  dosis_morgens?: string;
  dosis_mittags?: string;
  dosis_abends?: string;
  dosis_nacht?: string;
  dosis_bedarf?: string;
  anwendungsgebiet?: string;
  hinweise?: string;
  art?: string;
  // Intolerance fields
  intolerance_flag?: boolean;
  intolerance_notes?: string;
  intolerance_reason_type?: string;
  // New structured fields
  intake_type?: string;
  strength_value?: string;
  strength_unit?: string;
  typical_indication?: string;
  // As-needed structured dosing
  as_needed_standard_dose?: string;
  as_needed_max_per_24h?: number;
  as_needed_max_days_per_month?: number;
  as_needed_min_interval_hours?: number;
  as_needed_notes?: string;
  // Regular structured dosing
  regular_weekdays?: string[];
  regular_notes?: string;
  // Status
  medication_status?: string;
  // Effect category for analysis
  effect_category?: string;
  // Therapy history dates
  start_date?: string;
  end_date?: string;
};

export type UpdateMedInput = Partial<CreateMedInput> & {
  is_active?: boolean;
  discontinued_at?: string | null;
};

export async function listMeds(): Promise<Med[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Med[];
}

export async function listActiveMeds(): Promise<Med[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("*")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .is("discontinued_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Med[];
}

/**
 * List inactive/discontinued medications
 */
export async function listInactiveMeds(): Promise<Med[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("*")
    .eq("user_id", user.id)
    .or("is_active.eq.false,discontinued_at.not.is.null")
    .order("discontinued_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data || []) as Med[];
}

/**
 * List medications with intolerance flag
 */
export async function listIntoleranceMeds(): Promise<Med[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_medications")
    .select("*")
    .eq("user_id", user.id)
    .eq("intolerance_flag", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Med[];
}

export async function addMed(input: CreateMedInput): Promise<Med> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("Name erforderlich");
  
  const { data, error } = await supabase
    .from("user_medications")
    .insert({ 
      user_id: user.id, 
      name: trimmed,
      raw_input: input.raw_input || null,
      wirkstoff: input.wirkstoff || null,
      staerke: input.staerke || null,
      darreichungsform: input.darreichungsform || "Tablette",
      einheit: input.einheit || "Stueck",
      dosis_morgens: input.dosis_morgens || null,
      dosis_mittags: input.dosis_mittags || null,
      dosis_abends: input.dosis_abends || null,
      dosis_nacht: input.dosis_nacht || null,
      dosis_bedarf: input.dosis_bedarf || null,
      anwendungsgebiet: input.anwendungsgebiet || null,
      hinweise: input.hinweise || null,
      art: input.art || "bedarf",
      is_active: true,
      intolerance_flag: input.intolerance_flag || false,
      intolerance_notes: input.intolerance_notes || null,
      intolerance_reason_type: input.intolerance_reason_type || null,
      // New structured fields
      intake_type: input.intake_type || "as_needed",
      strength_value: input.strength_value || null,
      strength_unit: input.strength_unit || "mg",
      typical_indication: input.typical_indication || null,
      as_needed_standard_dose: input.as_needed_standard_dose || null,
      as_needed_max_per_24h: input.as_needed_max_per_24h || null,
      as_needed_max_days_per_month: input.as_needed_max_days_per_month || null,
      as_needed_min_interval_hours: input.as_needed_min_interval_hours || null,
      as_needed_notes: input.as_needed_notes || null,
      regular_weekdays: input.regular_weekdays || null,
      regular_notes: input.regular_notes || null,
      medication_status: input.medication_status || "active",
      // Therapy history dates
      start_date: input.start_date || null,
      end_date: input.end_date || null,
    } as any)
    .select()
    .single();
    
  if (error) throw error;
  return data as Med;
}

export async function updateMed(id: string, input: UpdateMedInput): Promise<Med> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.wirkstoff !== undefined) updateData.wirkstoff = input.wirkstoff || null;
  if (input.staerke !== undefined) updateData.staerke = input.staerke || null;
  if (input.darreichungsform !== undefined) updateData.darreichungsform = input.darreichungsform || null;
  if (input.einheit !== undefined) updateData.einheit = input.einheit || null;
  if (input.dosis_morgens !== undefined) updateData.dosis_morgens = input.dosis_morgens || null;
  if (input.dosis_mittags !== undefined) updateData.dosis_mittags = input.dosis_mittags || null;
  if (input.dosis_abends !== undefined) updateData.dosis_abends = input.dosis_abends || null;
  if (input.dosis_nacht !== undefined) updateData.dosis_nacht = input.dosis_nacht || null;
  if (input.dosis_bedarf !== undefined) updateData.dosis_bedarf = input.dosis_bedarf || null;
  if (input.anwendungsgebiet !== undefined) updateData.anwendungsgebiet = input.anwendungsgebiet || null;
  if (input.hinweise !== undefined) updateData.hinweise = input.hinweise || null;
  if (input.art !== undefined) updateData.art = input.art || null;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.discontinued_at !== undefined) updateData.discontinued_at = input.discontinued_at;
  // Handle intolerance fields
  if (input.intolerance_flag !== undefined) updateData.intolerance_flag = input.intolerance_flag;
  if (input.intolerance_notes !== undefined) updateData.intolerance_notes = input.intolerance_notes || null;
  if (input.intolerance_reason_type !== undefined) updateData.intolerance_reason_type = input.intolerance_reason_type || null;
  // Handle new structured fields
  if (input.intake_type !== undefined) updateData.intake_type = input.intake_type || null;
  if (input.strength_value !== undefined) updateData.strength_value = input.strength_value || null;
  if (input.strength_unit !== undefined) updateData.strength_unit = input.strength_unit || null;
  if (input.typical_indication !== undefined) updateData.typical_indication = input.typical_indication || null;
  if (input.as_needed_standard_dose !== undefined) updateData.as_needed_standard_dose = input.as_needed_standard_dose || null;
  if (input.as_needed_max_per_24h !== undefined) updateData.as_needed_max_per_24h = input.as_needed_max_per_24h || null;
  if (input.as_needed_max_days_per_month !== undefined) updateData.as_needed_max_days_per_month = input.as_needed_max_days_per_month || null;
  if (input.as_needed_min_interval_hours !== undefined) updateData.as_needed_min_interval_hours = input.as_needed_min_interval_hours || null;
  if (input.as_needed_notes !== undefined) updateData.as_needed_notes = input.as_needed_notes || null;
  if (input.regular_weekdays !== undefined) updateData.regular_weekdays = input.regular_weekdays || null;
  if (input.regular_notes !== undefined) updateData.regular_notes = input.regular_notes || null;
  if (input.medication_status !== undefined) updateData.medication_status = input.medication_status || null;
  if (input.effect_category !== undefined) updateData.effect_category = input.effect_category || null;
  // Handle therapy history dates
  if (input.start_date !== undefined) updateData.start_date = input.start_date || null;
  if (input.end_date !== undefined) updateData.end_date = input.end_date || null;
  
  const { data, error } = await supabase
    .from("user_medications")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Med;
}

export async function deleteMed(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const { error } = await supabase
    .from("user_medications")
    .delete()
    .eq("user_id", user.id)
    .eq("name", name);
  if (error) throw error;
}

export async function deleteMedById(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Kein Nutzer");
  const { error } = await supabase
    .from("user_medications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function discontinueMed(id: string): Promise<Med> {
  return updateMed(id, { 
    is_active: false, 
    discontinued_at: new Date().toISOString(),
    medication_status: "stopped",
  });
}

/**
 * Mark medication as intolerant
 */
export async function markMedAsIntolerant(id: string, notes?: string, reasonType?: string): Promise<Med> {
  return updateMed(id, {
    intolerance_flag: true,
    intolerance_notes: notes || null,
    intolerance_reason_type: reasonType || null,
    is_active: false,
    discontinued_at: new Date().toISOString(),
    medication_status: "intolerant",
  });
}

export async function listRecentMeds(limit: number = 5): Promise<RecentMed[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase.rpc('get_recent_medications', {
    p_user_id: user.id,
    p_limit: limit
  });
  
  if (error) throw error;
  return (data || []).map((d: any) => ({ 
    id: d.id, 
    name: d.name, 
    use_count: d.use_count || 0,
    last_used: d.last_used 
  }));
}