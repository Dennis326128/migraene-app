import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Reminder } from '@/types/reminder.types';

/**
 * Hook to toggle all reminders for a medication on/off.
 * If any reminder is active (notification_enabled=true), turns all off.
 * If all are inactive, turns all on.
 */
export function useToggleMedicationReminders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      reminders, 
      currentlyActive 
    }: { 
      reminders: Reminder[]; 
      currentlyActive: boolean;
    }) => {
      if (reminders.length === 0) {
        throw new Error('Keine Erinnerungen zum Umschalten vorhanden');
      }

      const reminderIds = reminders.map(r => r.id);
      const newStatus = !currentlyActive;

      // Update all reminders for this medication
      const { error } = await supabase
        .from('reminders')
        .update({ notification_enabled: newStatus })
        .in('id', reminderIds);

      if (error) throw error;

      return { newStatus, count: reminderIds.length };
    },
    onSuccess: ({ newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      
      // Short, friendly feedback without toast title
      toast.success(newStatus ? 'Erinnerung aktiviert' : 'Erinnerung pausiert');
    },
    onError: (error) => {
      console.error('Error toggling reminders:', error);
      toast.error('Erinnerung konnte nicht geändert werden');
    },
  });
}
