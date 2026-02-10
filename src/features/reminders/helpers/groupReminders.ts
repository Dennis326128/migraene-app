import { format, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Reminder } from '@/types/reminder.types';

/**
 * A grouped reminder represents one "series" in the list.
 * For non-repeating reminders, it's just a wrapper around a single reminder.
 * For repeating reminders with multiple times/day, it merges them into one entry.
 */
export interface GroupedReminder {
  /** The "lead" reminder (the one with the next due date_time) */
  reminder: Reminder;
  /** All reminders in this group (for multi-time daily reminders) */
  allReminders: Reminder[];
  /** Next due date_time across all reminders in this group */
  nextOccurrence: Date;
  /** Human-readable frequency label */
  frequencyLabel: string;
  /** Number of times per day (for daily reminders with multiple times) */
  timesPerDay: number;
  /** Whether this is a recurring reminder */
  isRecurring: boolean;
}

/**
 * Build a grouping key for reminders that should be shown as one entry.
 * Repeating reminders with the same title+type+repeat are grouped.
 * Non-repeating reminders are never grouped.
 */
function getGroupKey(reminder: Reminder): string {
  if (reminder.repeat === 'none') {
    // Non-repeating: unique per reminder
    return `single_${reminder.id}`;
  }
  // Group by title + type + repeat pattern
  return `series_${reminder.type}_${reminder.repeat}_${reminder.title}`;
}

/**
 * Build a human-readable frequency label.
 */
function buildFrequencyLabel(repeat: string, timesPerDay: number): string {
  switch (repeat) {
    case 'daily':
      return timesPerDay > 1 ? `Täglich · ${timesPerDay}× pro Tag` : 'Täglich';
    case 'weekly':
      return 'Wöchentlich';
    case 'monthly':
      return 'Monatlich';
    case 'weekdays':
      return 'Werktags';
    default:
      return '';
  }
}

/**
 * Format the "next occurrence" line for a grouped reminder.
 */
export function formatNextOccurrence(date: Date, type: string): string {
  const time = format(date, 'HH:mm', { locale: de });

  let dateLabel: string;
  if (isToday(date)) {
    dateLabel = 'heute';
  } else if (isTomorrow(date)) {
    dateLabel = 'morgen';
  } else {
    dateLabel = format(date, 'EEE, dd.MM.', { locale: de });
  }

  const actionVerb = type === 'medication' ? 'Nächste Einnahme' : 'Nächster Termin';
  return `${actionVerb}: ${dateLabel}, ${time} Uhr`;
}

/**
 * Group a flat list of reminders into series-based entries.
 * Each recurring reminder appears exactly once.
 * Non-repeating reminders remain as individual entries.
 */
export function groupReminders(reminders: Reminder[]): GroupedReminder[] {
  const groups = new Map<string, Reminder[]>();

  for (const reminder of reminders) {
    const key = getGroupKey(reminder);
    const existing = groups.get(key);
    if (existing) {
      existing.push(reminder);
    } else {
      groups.set(key, [reminder]);
    }
  }

  const result: GroupedReminder[] = [];
  const now = new Date();

  for (const [, groupReminders] of groups) {
    // Sort by date_time ascending to find the next due
    const sorted = [...groupReminders].sort(
      (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
    );

    // Find the next future occurrence, or fallback to the earliest (overdue)
    const nextFuture = sorted.find(r => new Date(r.date_time) >= now);
    const lead = nextFuture || sorted[0];
    const nextOccurrence = new Date(lead.date_time);
    const isRecurring = lead.repeat !== 'none';
    const timesPerDay = isRecurring && lead.repeat === 'daily' ? sorted.length : 1;

    result.push({
      reminder: lead,
      allReminders: sorted,
      nextOccurrence,
      frequencyLabel: isRecurring ? buildFrequencyLabel(lead.repeat, timesPerDay) : '',
      timesPerDay,
      isRecurring,
    });
  }

  // Sort grouped results by next occurrence
  result.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());

  return result;
}
