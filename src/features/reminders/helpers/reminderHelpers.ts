import { addWeeks, addMonths, format } from 'date-fns';
import type { Reminder, CreateReminderInput } from '@/types/reminder.types';

/**
 * Centralized helper functions for reminder operations
 */

export interface ReminderFormState {
  type: 'medication' | 'appointment' | 'todo';
  title: string;
  date: string;
  times: string[];
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  notes: string;
  notification_enabled: boolean;
  status?: string;
  medications?: string[];
  time_of_day?: string;
  // Follow-up fields
  follow_up_enabled?: boolean;
  follow_up_interval_value?: number;
  follow_up_interval_unit?: 'weeks' | 'months';
  series_id?: string;
}

export interface CloneOptions {
  clearDateTime?: boolean;
  prefillDate?: string;
  preserveSeriesId?: boolean;
}

/**
 * Build a DB payload from form state
 */
export function buildReminderPayload(
  formState: ReminderFormState,
  mode: 'create' | 'update'
): CreateReminderInput {
  const dateTime = `${formState.date}T${formState.times[0] || '09:00'}:00`;
  
  // Calculate next_follow_up_date if enabled
  let next_follow_up_date: string | null = null;
  if (
    formState.type === 'appointment' &&
    formState.follow_up_enabled &&
    formState.follow_up_interval_value &&
    formState.follow_up_interval_unit &&
    formState.date
  ) {
    const baseDate = new Date(formState.date);
    const nextDate = formState.follow_up_interval_unit === 'weeks'
      ? addWeeks(baseDate, formState.follow_up_interval_value)
      : addMonths(baseDate, formState.follow_up_interval_value);
    next_follow_up_date = format(nextDate, 'yyyy-MM-dd');
  }

  const payload: CreateReminderInput = {
    type: formState.type,
    title: formState.title,
    date_time: dateTime,
    repeat: formState.repeat,
    notes: formState.notes || undefined,
    notification_enabled: formState.notification_enabled,
  };

  // Medication-specific fields
  if (formState.type === 'medication' && formState.medications?.length) {
    payload.medications = formState.medications;
  }
  if (formState.time_of_day) {
    payload.time_of_day = formState.time_of_day as any;
  }

  // Appointment-specific follow-up fields
  if (formState.type === 'appointment') {
    (payload as any).follow_up_enabled = formState.follow_up_enabled || false;
    (payload as any).follow_up_interval_value = formState.follow_up_interval_value || null;
    (payload as any).follow_up_interval_unit = formState.follow_up_interval_unit || null;
    (payload as any).next_follow_up_date = next_follow_up_date;
    if (formState.series_id) {
      (payload as any).series_id = formState.series_id;
    }
  }

  return payload;
}

/**
 * Clone a reminder for creating a new one (e.g., follow-up)
 * Returns a partial form state ready for the create form
 */
export function cloneReminderForCreate(
  source: Reminder | ReminderFormState,
  options: CloneOptions = {}
): Partial<ReminderFormState> {
  const {
    clearDateTime = true,
    prefillDate,
    preserveSeriesId = true,
  } = options;

  // Determine if source is a Reminder or FormState
  const isDbReminder = 'id' in source && 'date_time' in source;

  let cloned: Partial<ReminderFormState>;

  if (isDbReminder) {
    const reminder = source as Reminder;
    cloned = {
      type: reminder.type,
      title: reminder.title,
      notes: reminder.notes || '',
      notification_enabled: reminder.notification_enabled,
      repeat: reminder.type === 'appointment' ? 'none' : reminder.repeat, // Reset repeat for appointments
      medications: reminder.medications || [],
      time_of_day: reminder.time_of_day || undefined,
      // Follow-up fields
      follow_up_enabled: (reminder as any).follow_up_enabled || false,
      follow_up_interval_value: (reminder as any).follow_up_interval_value,
      follow_up_interval_unit: (reminder as any).follow_up_interval_unit,
    };
    
    if (preserveSeriesId) {
      // Use existing series_id or the reminder's own id as series_id
      cloned.series_id = (reminder as any).series_id || reminder.id;
    }
  } else {
    const formState = source as ReminderFormState;
    cloned = {
      type: formState.type,
      title: formState.title,
      notes: formState.notes || '',
      notification_enabled: formState.notification_enabled,
      repeat: formState.type === 'appointment' ? 'none' : formState.repeat,
      medications: formState.medications || [],
      time_of_day: formState.time_of_day,
      follow_up_enabled: formState.follow_up_enabled,
      follow_up_interval_value: formState.follow_up_interval_value,
      follow_up_interval_unit: formState.follow_up_interval_unit,
      series_id: preserveSeriesId ? formState.series_id : undefined,
    };
  }

  // Handle date/time
  if (clearDateTime) {
    cloned.date = prefillDate || '';
    cloned.times = [];
  } else if (isDbReminder) {
    const reminder = source as Reminder;
    cloned.date = format(new Date(reminder.date_time), 'yyyy-MM-dd');
    cloned.times = [format(new Date(reminder.date_time), 'HH:mm')];
  }

  return cloned;
}

/**
 * Generate a new series_id for first-time follow-up appointments
 */
export function generateSeriesId(): string {
  return crypto.randomUUID();
}

/**
 * Check if a reminder has follow-up configured and is an appointment
 */
export function hasFollowUpConfigured(reminder: Reminder): boolean {
  return (
    reminder.type === 'appointment' &&
    (reminder as any).follow_up_enabled === true &&
    (reminder as any).next_follow_up_date != null
  );
}

/**
 * Format follow-up date for display
 */
export function formatFollowUpDate(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, 'dd.MM.yyyy');
}
