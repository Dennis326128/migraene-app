import { supabase } from "@/integrations/supabase/client";

export interface QuickPainEventPayload {
  intensity_0_10: number;
  medications: {
    med_id: string;
    dose_mg?: number;
    units?: string;
    was_default?: boolean;
  }[];
  notes?: string;
}

export async function createQuickPainEvent(payload: QuickPainEventPayload): Promise<number> {
  const { data, error } = await supabase.rpc('create_quick_pain_event', {
    p_intensity_0_10: payload.intensity_0_10,
    p_medications: payload.medications,
    p_notes: payload.notes || null
  });

  if (error) {
    console.error('Error creating quick pain event:', error);
    throw error;
  }

  return data;
}

export interface MedEffectPayload {
  event_med_id: number;
  effect_rating_0_4: number;
  pain_before_0_10?: number;
  pain_after_0_10?: number;
  onset_min?: number;
  relief_duration_min?: number;
  side_effects_text?: string;
}

export async function recordMedEffect(payload: MedEffectPayload): Promise<void> {
  const { error } = await supabase.rpc('record_med_effect', {
    p_event_med_id: payload.event_med_id,
    p_effect_rating_0_4: payload.effect_rating_0_4,
    p_pain_before_0_10: payload.pain_before_0_10 || null,
    p_pain_after_0_10: payload.pain_after_0_10 || null,
    p_onset_min: payload.onset_min || null,
    p_relief_duration_min: payload.relief_duration_min || null,
    p_side_effects_text: payload.side_effects_text || null
  });

  if (error) {
    console.error('Error recording medication effect:', error);
    throw error;
  }
}

// Get events with full details
export async function getEvents(): Promise<any[]> {
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      event_meds (
        *,
        user_medications (id, name),
        med_effects (*)
      )
    `)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching events:', error);
    throw error;
  }

  return data || [];
}

// Get pending reminders for effect documentation
export async function getPendingReminders(): Promise<any[]> {
  const { data, error } = await supabase
    .from('reminder_queue')
    .select(`
      *,
      event_meds (
        *,
        user_medications (name),
        events (started_at, intensity_0_10)
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error('Error fetching reminders:', error);
    throw error;
  }

  return data || [];
}