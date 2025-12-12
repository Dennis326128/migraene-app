export type ReminderType = 'medication' | 'appointment';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderStatus = 'pending' | 'done' | 'missed' | 'cancelled';
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';

// Notification channels for future push notification support
export interface NotificationChannels {
  in_app?: boolean;
  push?: boolean;
  email?: boolean;
}

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
  medications?: string[];
  time_of_day?: TimeOfDay | null;
  // Future-ready fields for push notifications
  pre_notify_offset_minutes?: number | null;
  notification_channels?: NotificationChannels | null;
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
  medications?: string[];
  time_of_day?: TimeOfDay;
  pre_notify_offset_minutes?: number;
  notification_channels?: NotificationChannels;
}

export interface UpdateReminderInput {
  type?: ReminderType;
  title?: string;
  date_time?: string;
  repeat?: ReminderRepeat;
  notes?: string;
  status?: ReminderStatus;
  notification_enabled?: boolean;
  medications?: string[];
  time_of_day?: TimeOfDay;
  pre_notify_offset_minutes?: number;
  notification_channels?: NotificationChannels;
}
