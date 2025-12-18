import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, isBefore } from 'date-fns';
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
 * Supports snooze with snoozed_until field
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

      // Filter: 
      // 1. last_popup_date != today (spam protection)
      // 2. snoozed_until is null or in the past
      const filtered = needsAttention.filter(r => {
        // Skip if already shown today
        if (r.last_popup_date === today) return false;
        
        // Check snooze: if snoozed_until exists and is in the future, skip
        if (r.snoozed_until) {
          const snoozedUntil = new Date(r.snoozed_until);
          if (snoozedUntil > now) return false;
        }
        
        return true;
      });

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

  // NEW: Snooze until a specific time
  const snoozeUntilMutation = useMutation({
    mutationFn: async ({ reminderId, until }: { reminderId: string; until: Date }) => {
      const { data: existing, error: fetchError } = await supabase
        .from('reminders')
        .select('snooze_count')
        .eq('id', reminderId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const newSnoozeCount = ((existing?.snooze_count as number) || 0) + 1;
      
      const { error } = await supabase
        .from('reminders')
        .update({
          snoozed_until: until.toISOString(),
          snooze_count: newSnoozeCount,
          last_popup_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
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

  // Wrapper for snooze until
  const snoozeReminderUntil = useCallback((reminderId: string, until: Date) => {
    snoozeUntilMutation.mutate({ reminderId, until });
  }, [snoozeUntilMutation]);

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
    snoozeReminderUntil,
    cancelReminder: cancelReminderMutation.mutate,
    snoozeAll,
    isUpdating:
      completeReminderMutation.isPending ||
      snoozeReminderMutation.isPending ||
      snoozeUntilMutation.isPending ||
      cancelReminderMutation.isPending,
  };
}
