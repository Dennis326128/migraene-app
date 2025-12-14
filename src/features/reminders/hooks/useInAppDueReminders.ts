import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import type { Reminder } from '@/types/reminder.types';

export interface DueReminder extends Reminder {
  isOverdue: boolean;
}

/**
 * In-app reminder check hook
 * Triggers on app start and visibility change
 * Uses last_popup_date to prevent spam
 */
export function useInAppDueReminders() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [hasCheckedThisSession, setHasCheckedThisSession] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const initialCheckDone = useRef(false);

  // Fetch due reminders (overdue + next 24h)
  const { data: dueReminders = [], isLoading, refetch } = useQuery({
    queryKey: ['due-reminders', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const now = new Date();
      const in24h = addDays(now, 1);

      // Get pending reminders that are due (overdue or within next 24h)
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'scheduled'])
        .eq('notification_enabled', true)
        .lte('date_time', in24h.toISOString())
        .order('date_time', { ascending: true });

      if (error) {
        console.error('Error fetching due reminders:', error);
        return [];
      }

      // Filter: only show if last_popup_date != today
      const filtered = (data || []).filter(r => r.last_popup_date !== today);

      // Mark as overdue or not
      return filtered.map(r => ({
        ...r,
        isOverdue: new Date(r.date_time) < now,
      })) as DueReminder[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Check reminders on mount (once)
  useEffect(() => {
    if (!isLoading && !initialCheckDone.current && dueReminders.length > 0) {
      initialCheckDone.current = true;
      setHasCheckedThisSession(true);
      setSheetOpen(true);
    }
  }, [isLoading, dueReminders.length]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sheetOpen) {
        // Refetch and show if there are due reminders not shown today
        refetch().then(result => {
          if (result.data && result.data.length > 0) {
            setSheetOpen(true);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetch, sheetOpen]);

  // Mark reminder as done (handles repeat logic)
  const completeReminderMutation = useMutation({
    mutationFn: async (reminder: DueReminder) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
    },
  });

  // Snooze for today (mark popup as shown but keep pending)
  const snoozeReminderMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({
          last_popup_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
    },
  });

  // Cancel reminder
  const cancelReminderMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({
          status: 'cancelled',
          last_popup_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
    },
  });

  // Snooze all displayed reminders (used when closing sheet)
  const snoozeAll = useCallback(async () => {
    for (const reminder of dueReminders) {
      await snoozeReminderMutation.mutateAsync(reminder.id);
    }
  }, [dueReminders, snoozeReminderMutation]);

  const closeSheet = useCallback(async () => {
    await snoozeAll();
    setSheetOpen(false);
  }, [snoozeAll]);

  // Split reminders into overdue and upcoming
  const overdueReminders = dueReminders.filter(r => r.isOverdue);
  const upcomingReminders = dueReminders.filter(r => !r.isOverdue);

  return {
    dueReminders,
    overdueReminders,
    upcomingReminders,
    isLoading,
    hasDueReminders: dueReminders.length > 0,
    sheetOpen,
    setSheetOpen,
    closeSheet,
    completeReminder: completeReminderMutation.mutate,
    snoozeReminder: snoozeReminderMutation.mutate,
    cancelReminder: cancelReminderMutation.mutate,
    snoozeAll,
    isUpdating:
      completeReminderMutation.isPending ||
      snoozeReminderMutation.isPending ||
      cancelReminderMutation.isPending,
  };
}
