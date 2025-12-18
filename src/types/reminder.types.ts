export type ReminderType = 'medication' | 'appointment' | 'todo';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderStatus = 'pending' | 'processing' | 'done' | 'missed' | 'cancelled' | 'completed' | 'failed';
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';
export type FollowUpIntervalUnit = 'weeks' | 'months';

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
  // Actual DB field for notification offsets (array of minutes)
  notify_offsets_minutes?: number[] | null;
  // Future-ready fields for push notifications
  pre_notify_offset_minutes?: number | null;
  notification_channels?: NotificationChannels | null;
  // Follow-up appointment fields
  follow_up_enabled?: boolean;
  follow_up_interval_value?: number | null;
  follow_up_interval_unit?: FollowUpIntervalUnit | null;
  next_follow_up_date?: string | null;
  series_id?: string | null;
  // Snooze fields
  snoozed_until?: string | null;
  snooze_count?: number;
  // Timestamps
  last_popup_date?: string | null;
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
  // Follow-up fields
  follow_up_enabled?: boolean;
  follow_up_interval_value?: number;
  follow_up_interval_unit?: FollowUpIntervalUnit;
  next_follow_up_date?: string;
  series_id?: string;
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
  // Follow-up fields
  follow_up_enabled?: boolean;
  follow_up_interval_value?: number;
  follow_up_interval_unit?: FollowUpIntervalUnit;
  next_follow_up_date?: string;
  series_id?: string;
}

// Prefill data for creating a new reminder from existing data
export interface ReminderPrefill {
  type: ReminderType;
  title: string;
  notes?: string;
  notification_enabled?: boolean;
  medications?: string[];
  repeat?: ReminderRepeat;
  // Follow-up fields
  follow_up_enabled?: boolean;
  follow_up_interval_value?: number;
  follow_up_interval_unit?: FollowUpIntervalUnit;
  series_id?: string;
  // Optional prefilled date (for follow-up suggestions)
  prefill_date?: string;
}
