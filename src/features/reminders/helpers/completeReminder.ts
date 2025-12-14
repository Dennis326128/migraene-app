import { supabase } from '@/integrations/supabase/client';
import { addDays, addWeeks, addMonths, format } from 'date-fns';
import type { Reminder } from '@/types/reminder.types';

/**
 * Central helper for completing a reminder
 * Handles repeat logic correctly:
 * - repeat='none': mark as done
 * - repeat='daily'|'weekly'|'monthly': reschedule to next occurrence
 */
export async function completeReminderInDb(reminder: Reminder): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd');

  if (reminder.repeat === 'none') {
    // Non-repeating: mark as done
    const { error } = await supabase
      .from('reminders')
      .update({
        status: 'done',
        last_popup_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    if (error) throw error;
  } else {
    // Repeating: reschedule to next occurrence
    const currentDateTime = new Date(reminder.date_time);
    let nextDateTime: Date;

    switch (reminder.repeat) {
      case 'daily':
        nextDateTime = addDays(currentDateTime, 1);
        break;
      case 'weekly':
        nextDateTime = addWeeks(currentDateTime, 1);
        break;
      case 'monthly':
        nextDateTime = addMonths(currentDateTime, 1);
        break;
      default:
        nextDateTime = addDays(currentDateTime, 1);
    }

    // Ensure next date_time is in the future
    const now = new Date();
    while (nextDateTime <= now) {
      switch (reminder.repeat) {
        case 'daily':
          nextDateTime = addDays(nextDateTime, 1);
          break;
        case 'weekly':
          nextDateTime = addWeeks(nextDateTime, 1);
          break;
        case 'monthly':
          nextDateTime = addMonths(nextDateTime, 1);
          break;
        default:
          nextDateTime = addDays(nextDateTime, 1);
      }
    }

    const { error } = await supabase
      .from('reminders')
      .update({
        date_time: nextDateTime.toISOString(),
        status: 'pending',
        last_popup_date: null, // Reset so it can show again at next occurrence
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    if (error) throw error;
  }
}

/**
 * Get next occurrence date for a repeating reminder
 */
export function getNextOccurrence(
  currentDateTime: Date,
  repeat: 'daily' | 'weekly' | 'monthly'
): Date {
  switch (repeat) {
    case 'daily':
      return addDays(currentDateTime, 1);
    case 'weekly':
      return addWeeks(currentDateTime, 1);
    case 'monthly':
      return addMonths(currentDateTime, 1);
    default:
      return addDays(currentDateTime, 1);
  }
}
