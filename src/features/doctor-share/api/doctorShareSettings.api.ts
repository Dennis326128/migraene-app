/**
 * Doctor Share Settings API
 * API für die Freigabe-Einstellungen (Zeitraum, Notizen, KI-Analyse)
 */

import { supabase } from "@/lib/supabaseClient";

export interface DoctorShareSettings {
  id: string;
  share_id: string;
  range_preset: '1m' | '3m' | '6m' | '12m' | 'custom';
  custom_from: string | null;
  custom_to: string | null;
  include_entry_notes: boolean;
  include_context_notes: boolean;
  include_ai_analysis: boolean;
  allow_ai_generate: boolean;
  share_day_factors: boolean;
  ai_analysis_generated_at: string | null;
  generated_report_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShareSettingsInput {
  share_id: string;
  range_preset?: '1m' | '3m' | '6m' | '12m' | 'custom';
  custom_from?: string | null;
  custom_to?: string | null;
  include_entry_notes?: boolean;
  include_context_notes?: boolean;
  include_ai_analysis?: boolean;
  allow_ai_generate?: boolean;
  share_day_factors?: boolean;
}

export interface UpdateShareSettingsInput {
  range_preset?: '1m' | '3m' | '6m' | '12m' | 'custom';
  custom_from?: string | null;
  custom_to?: string | null;
  include_entry_notes?: boolean;
  include_context_notes?: boolean;
  include_ai_analysis?: boolean;
  allow_ai_generate?: boolean;
  share_day_factors?: boolean;
  generated_report_id?: string | null;
  ai_analysis_generated_at?: string | null;
}

/**
 * Holt die Settings für einen Share
 */
export async function getShareSettings(shareId: string): Promise<DoctorShareSettings | null> {
  const { data, error } = await supabase
    .from('doctor_share_settings')
    .select('*')
    .eq('share_id', shareId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching share settings:', error);
    throw error;
  }

  return data as DoctorShareSettings | null;
}

/**
 * Erstellt oder aktualisiert Settings für einen Share
 */
export async function upsertShareSettings(
  shareId: string, 
  settings: UpdateShareSettingsInput
): Promise<DoctorShareSettings> {
  const { data, error } = await supabase
    .from('doctor_share_settings')
    .upsert({
      share_id: shareId,
      ...settings,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'share_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting share settings:', error);
    throw error;
  }

  return data as DoctorShareSettings;
}

/**
 * Erstellt initiale Settings für einen neuen Share
 */
export async function createShareSettings(
  input: CreateShareSettingsInput
): Promise<DoctorShareSettings> {
  const { data, error } = await supabase
    .from('doctor_share_settings')
    .insert({
      share_id: input.share_id,
      range_preset: input.range_preset || '3m',
      custom_from: input.custom_from || null,
      custom_to: input.custom_to || null,
      include_entry_notes: input.include_entry_notes ?? false,
      include_context_notes: input.include_context_notes ?? false,
      include_ai_analysis: input.include_ai_analysis ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating share settings:', error);
    throw error;
  }

  return data as DoctorShareSettings;
}

/**
 * Verlinkt einen generierten Report mit dem Share
 */
export async function linkReportToShare(
  shareId: string,
  reportId: string
): Promise<void> {
  const { error } = await supabase
    .from('doctor_share_settings')
    .update({
      generated_report_id: reportId,
      updated_at: new Date().toISOString(),
    })
    .eq('share_id', shareId);

  if (error) {
    console.error('Error linking report to share:', error);
    throw error;
  }
}
