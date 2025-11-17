export type ReminderType = 'medication' | 'appointment';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderStatus = 'pending' | 'done' | 'missed';

export interface Reminder {
  id: string;
  user_id: string;
  type: ReminderType;
  title: string;
  date_time: string;
  repeat: ReminderRepeat;
  notes: string | null;
  status: ReminderStatus;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateReminderInput {
  type: ReminderType;
  title: string;
  date_time: string;
  repeat?: ReminderRepeat;
  notes?: string;
  notification_enabled?: boolean;
}

export interface UpdateReminderInput {
  type?: ReminderType;
  title?: string;
  date_time?: string;
  repeat?: ReminderRepeat;
  notes?: string;
  status?: ReminderStatus;
  notification_enabled?: boolean;
}
