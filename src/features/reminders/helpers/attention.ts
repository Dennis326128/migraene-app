import { isBefore, isAfter, startOfDay, addMinutes, addHours, setHours, setMinutes, isEqual } from 'date-fns';
import type { Reminder } from '@/types/reminder.types';

/**
 * Attention levels for reminders
 * - 'none': not yet relevant (future, no notification needed)
 * - 'upcoming': in pre-notification window (for appointments with offsets)
 * - 'due': at or past the reminder time
 * - 'overdue': significantly past the reminder time
 */
export type AttentionLevel = 'none' | 'upcoming' | 'due' | 'overdue';

/**
 * Default notification offsets for appointments (in minutes)
 * 1 day (1440 min) and 2 hours (120 min) before
 */
export const DEFAULT_APPOINTMENT_OFFSETS = [1440, 120];

/**
 * Get current local time
 */
export function getLocalNow(): Date {
  return new Date();
}

/**
 * Get local date from reminder date_time
 */
export function getReminderLocalDate(reminder: Reminder): Date {
  return new Date(reminder.date_time);
}

/**
 * Get the time (in local date) when attention should start for a reminder
 * This is the earliest point where the reminder becomes relevant for badge/notification
 */
export function getEarliestAttentionStart(reminder: Reminder): Date {
  const reminderDate = getReminderLocalDate(reminder);
  
  // For appointments with notification offsets, start at earliest offset
  if (reminder.type === 'appointment') {
    const offsets = (reminder as any).notify_offsets_minutes as number[] | null;
    const effectiveOffsets = offsets && offsets.length > 0 ? offsets : DEFAULT_APPOINTMENT_OFFSETS;
    
    // Get max offset (furthest in advance)
    const maxOffset = Math.max(...effectiveOffsets);
    return addMinutes(reminderDate, -maxOffset);
  }
  
  // For monthly medications: start at 08:00 on the due date
  if (reminder.type === 'medication' && reminder.repeat === 'monthly') {
    const dueDate = startOfDay(reminderDate);
    return setMinutes(setHours(dueDate, 8), 0);
  }
  
  // For other medications (daily/weekly/none): start at exact time
  return reminderDate;
}

/**
 * Central function to determine the attention level for a reminder
 * This is the SINGLE SOURCE OF TRUTH for badge counts and notification visibility
 */
export function getReminderAttentionLevel(reminder: Reminder, now: Date = getLocalNow()): AttentionLevel {
  // Only pending + notification_enabled reminders are relevant
  if (reminder.status !== 'pending' || !reminder.notification_enabled) {
    return 'none';
  }
  
  const reminderDate = getReminderLocalDate(reminder);
  const attentionStart = getEarliestAttentionStart(reminder);
  
  // Check if we're before the attention window
  if (isBefore(now, attentionStart)) {
    return 'none';
  }
  
  // Check if past due time
  if (isAfter(now, reminderDate) || isEqual(now, reminderDate)) {
    // More than 1 hour past = overdue
    const overdueThreshold = addHours(reminderDate, 1);
    return isAfter(now, overdueThreshold) ? 'overdue' : 'due';
  }
  
  // Between attentionStart and reminderDate = upcoming
  return 'upcoming';
}

/**
 * Check if a reminder needs attention (for badge count)
 */
export function isReminderAttentionNeeded(reminder: Reminder, now: Date = getLocalNow()): boolean {
  const level = getReminderAttentionLevel(reminder, now);
  return level !== 'none';
}

/**
 * Check if a reminder is overdue
 */
export function isReminderOverdue(reminder: Reminder, now: Date = getLocalNow()): boolean {
  const level = getReminderAttentionLevel(reminder, now);
  return level === 'overdue' || level === 'due';
}

/**
 * Filter reminders to only those needing attention
 */
export function filterAttentionReminders(reminders: Reminder[], now: Date = getLocalNow()): Reminder[] {
  return reminders.filter(r => isReminderAttentionNeeded(r, now));
}

/**
 * Get count of reminders needing attention
 */
export function getAttentionCount(reminders: Reminder[], now: Date = getLocalNow()): number {
  return filterAttentionReminders(reminders, now).length;
}

/**
 * Available notification offset presets (in minutes) for the UI
 */
export const NOTIFY_OFFSET_PRESETS = [
  { value: 0, label: 'Zur Terminzeit' },
  { value: 15, label: '15 Min vorher' },
  { value: 60, label: '1 Std vorher' },
  { value: 120, label: '2 Std vorher' },
  { value: 1440, label: '1 Tag vorher' },
  { value: 2880, label: '2 Tage vorher' },
  { value: 10080, label: '1 Woche vorher' },
] as const;

/**
 * Format notify offsets for display (e.g., "1 Tag vorher, 2 Std vorher")
 */
export function formatNotifyOffsets(offsets: number[] | null | undefined): string {
  if (!offsets || offsets.length === 0) {
    return 'Keine';
  }
  
  const sorted = [...offsets].sort((a, b) => b - a); // Descending
  const labels = sorted.map(offset => {
    const preset = NOTIFY_OFFSET_PRESETS.find(p => p.value === offset);
    if (preset) return preset.label;
    
    // Format custom values
    if (offset < 60) return `${offset} Min vorher`;
    if (offset < 1440) return `${Math.round(offset / 60)} Std vorher`;
    return `${Math.round(offset / 1440)} Tag(e) vorher`;
  });
  
  return labels.join(', ');
}
