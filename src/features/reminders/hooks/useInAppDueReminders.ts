import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import type { Reminder } from '@/types/reminder.types';
import { 
  isReminderAttentionNeeded, 
  getReminderAttentionLevel,
  getLocalNow,
  type AttentionLevel,
} from '../helpers/attention';
import { completeReminderInDb } from '../helpers/completeReminder';

export interface DueReminder extends Reminder {
  isOverdue: boolean;
  attentionLevel: AttentionLevel;
}

/**
 * In-app reminder check hook
 * Triggers on app start and visibility change
 * Uses centralized attention logic + last_popup_date for spam protection
 */
export function useInAppDueReminders() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [sheetOpen, setSheetOpen] = useState(false);
  const initialCheckDone = useRef(false);

  // Fetch all pending reminders, then filter using central attention logic
  const { data: dueReminders = [], isLoading, refetch } = useQuery({
    queryKey: ['due-reminders', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Fetch all pending reminders (we'll filter client-side with attention logic)
      // Include reminders from past week to catch overdue ones
      const weekAgo = addDays(new Date(), -7);
      const weekAhead = addDays(new Date(), 7);

      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'scheduled'])
        .eq('notification_enabled', true)
        .gte('date_time', weekAgo.toISOString())
        .lte('date_time', weekAhead.toISOString())
        .order('date_time', { ascending: true });

      if (error) {
        console.error('Error fetching due reminders:', error);
        return [];
      }

      const now = getLocalNow();
      
      // Filter using central attention logic
      const needsAttention = (data || []).filter(r => 
        isReminderAttentionNeeded(r as Reminder, now)
      );

      // Filter: only show if last_popup_date != today (spam protection)
      const filtered = needsAttention.filter(r => r.last_popup_date !== today);

      // Add attention level to each reminder
      return filtered.map(r => ({
        ...r,
        attentionLevel: getReminderAttentionLevel(r as Reminder, now),
        isOverdue: getReminderAttentionLevel(r as Reminder, now) === 'overdue',
      })) as DueReminder[];
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  });

  // Check reminders on mount (once)
  useEffect(() => {
    if (!isLoading && !initialCheckDone.current && dueReminders.length > 0) {
      initialCheckDone.current = true;
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

  // Mark reminder as done (uses centralized completeReminderInDb)
  const completeReminderMutation = useMutation({
    mutationFn: async (reminder: DueReminder) => {
      await completeReminderInDb(reminder);
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
