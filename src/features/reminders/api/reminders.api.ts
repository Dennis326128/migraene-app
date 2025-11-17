import { supabase } from '@/lib/supabaseClient';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';

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

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        ...input,
      })
      .select()
      .single();

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
};
