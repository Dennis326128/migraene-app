import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface CriticalReminder {
  id: string;
  title: string;
  date_time: string;
  medications: string[] | null;
  notes: string | null;
  status: string;
  last_popup_date: string | null;
}

/**
 * Hook to manage critical monthly medication reminders popup
 * Shows popup once per day for pending monthly medication reminders
 */
export function useCriticalReminderPopup() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Fetch critical reminders that need popup today
  const { data: criticalReminders = [], isLoading } = useQuery({
    queryKey: ['critical-reminders-popup', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      // Get pending monthly medication reminders that are due
      const { data, error } = await supabase
        .from('reminders')
        .select('id, title, date_time, medications, notes, status, last_popup_date')
        .eq('user_id', user.id)
        .eq('type', 'medication')
        .eq('repeat', 'monthly')
        .eq('status', 'pending')
        .lte('date_time', new Date().toISOString())
        .order('date_time', { ascending: true });
      
      if (error) {
        console.error('Error fetching critical reminders:', error);
        return [];
      }
      
      // Filter to reminders that haven't shown popup today
      return (data || []).filter(r => 
        r.last_popup_date !== today
      ) as CriticalReminder[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
  
  // Mark reminder as done
  const markAsDone = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({ 
          status: 'done',
          last_popup_date: today,
          updated_at: new Date().toISOString()
        })
        .eq('id', reminderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['critical-reminders-popup'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
    },
  });
  
  // Snooze for today (mark popup as shown but keep pending)
  const snoozeForToday = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({ 
          last_popup_date: today,
          updated_at: new Date().toISOString()
        })
        .eq('id', reminderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical-reminders-popup'] });
    },
  });
  
  // Cancel/delete reminder
  const cancelReminder = useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await supabase
        .from('reminders')
        .update({ 
          status: 'cancelled',
          last_popup_date: today,
          updated_at: new Date().toISOString()
        })
        .eq('id', reminderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['critical-reminders-popup'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-badge'] });
    },
  });
  
  // Snooze all displayed reminders (used when closing popup)
  const snoozeAll = useCallback(async () => {
    for (const reminder of criticalReminders) {
      await snoozeForToday.mutateAsync(reminder.id);
    }
  }, [criticalReminders, snoozeForToday]);
  
  return {
    criticalReminders,
    isLoading,
    hasReminders: criticalReminders.length > 0,
    markAsDone: markAsDone.mutate as typeof markAsDone.mutate,
    snoozeForToday: snoozeForToday.mutate as typeof snoozeForToday.mutate,
    cancelReminder: cancelReminder.mutate as typeof cancelReminder.mutate,
    snoozeAll,
    isUpdating: markAsDone.isPending || snoozeForToday.isPending || cancelReminder.isPending,
  };
}

