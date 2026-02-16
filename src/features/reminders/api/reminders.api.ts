import { supabase } from '@/lib/supabaseClient';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';
import { computeDedupeKey, type DedupeInput } from '../helpers/dedupeKey';

/**
 * Build DedupeInput from a CreateReminderInput
 */
function toDedupeInput(input: CreateReminderInput): DedupeInput {
  return {
    type: input.type,
    title: input.title,
    medication_id: (input as any).medication_id || undefined,
    date_time: input.date_time,
    repeat: input.repeat || 'none',
    time_of_day: input.time_of_day || undefined,
  };
}

export const remindersApi = {
  async getAll(): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .order('date_time', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getToday(): Promise<Reminder[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .gte('date_time', today.toISOString())
      .lt('date_time', tomorrow.toISOString())
      .order('date_time', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getUpcoming(): Promise<Reminder[]> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .gte('date_time', tomorrow.toISOString())
      .order('date_time', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getPast(): Promise<Reminder[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .lt('date_time', today.toISOString())
      .order('date_time', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getActive(): Promise<Reminder[]> {
    // FIXED: Show ALL pending reminders, including overdue ones
    // Previously filtered by date_time >= now, which hid overdue reminders
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .in('status', ['pending', 'scheduled'])
      .order('date_time', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getHistory(): Promise<Reminder[]> {
    // Show reminders that are done, cancelled, missed, or skipped
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .in('status', ['done', 'cancelled', 'missed', 'skipped'])
      .order('date_time', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Reminder | null> {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(input: CreateReminderInput): Promise<Reminder> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const dedupe_key = await computeDedupeKey(toDedupeInput(input));

    const { data, error } = await supabase
      .from('reminders')
      .upsert(
        {
          user_id: user.id,
          dedupe_key,
          ...input,
        },
        { onConflict: 'user_id,dedupe_key' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async createMultiple(inputs: CreateReminderInput[]): Promise<Reminder[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const reminders = await Promise.all(
      inputs.map(async (input) => {
        const dedupe_key = await computeDedupeKey(toDedupeInput(input));
        return {
          user_id: user.id,
          dedupe_key,
          ...input,
        };
      })
    );

    const { data, error } = await supabase
      .from('reminders')
      .upsert(reminders, { onConflict: 'user_id,dedupe_key' })
      .select();

    if (error) throw error;
    return data;
  },

  async update(id: string, input: UpdateReminderInput): Promise<Reminder> {
    const { data, error } = await supabase
      .from('reminders')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async markAsDone(id: string): Promise<Reminder> {
    return this.update(id, { status: 'done' });
  },

  async markAsMissed(id: string): Promise<Reminder> {
    return this.update(id, { status: 'missed' });
  },

  /**
   * Toggle notification_enabled for ALL active reminders (global mute/unmute)
   */
  async toggleAllNotifications(enabled: boolean): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reminders')
      .update({ notification_enabled: enabled })
      .eq('user_id', user.id)
      .in('status', ['pending', 'scheduled'])
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  },
};
