import { useMemo } from 'react';
import { useActiveReminders } from './useReminders';
import { isPast, isToday, addHours, isBefore } from 'date-fns';
import type { Reminder } from '@/types/reminder.types';

/**
 * Hook to get the badge count for active reminders
 * Counts all pending reminders that are due (overdue or today/now)
 */
export const useReminderBadgeCount = () => {
  const { data: activeReminders = [], isLoading } = useActiveReminders();
  
  const badgeCount = useMemo(() => {
    return activeReminders.filter(r => {
      const reminderDate = new Date(r.date_time);
      // Count pending + overdue
      return r.status === 'pending' && isPast(reminderDate);
    }).length + activeReminders.filter(r => {
      const reminderDate = new Date(r.date_time);
      // Also count reminders due today that haven't happened yet
      return r.status === 'pending' && isToday(reminderDate) && !isPast(reminderDate);
    }).length;
  }, [activeReminders]);

  // Actually, simplify: count all pending reminders (they're all relevant)
  const totalPendingCount = useMemo(() => {
    return activeReminders.filter(r => r.status === 'pending').length;
  }, [activeReminders]);

  return {
    count: totalPendingCount,
    isLoading,
  };
};

/**
 * Hook to get important reminders due in the next 24 hours
 * For appointments and critical/monthly medications
 */
export const useUpcoming24hWarnings = () => {
  const { data: activeReminders = [], isLoading } = useActiveReminders();
  
  const upcomingImportant = useMemo(() => {
    const now = new Date();
    const in24h = addHours(now, 24);
    
    return activeReminders.filter((r: Reminder) => {
      const reminderDate = new Date(r.date_time);
      
      // Only pending reminders in the next 24 hours
      if (r.status !== 'pending') return false;
      if (isPast(reminderDate)) return false;
      if (!isBefore(reminderDate, in24h)) return false;
      
      // Appointments are always important
      if (r.type === 'appointment') return true;
      
      // Medications: check notes for hints of importance (Ajovy, prophylaxis, etc.)
      // In a real implementation, we'd have a dedicated field for this
      if (r.type === 'medication') {
        const titleLower = r.title.toLowerCase();
        const notesLower = (r.notes || '').toLowerCase();
        const combinedText = `${titleLower} ${notesLower}`;
        
        // Check for indicators of important/monthly medications
        const importantKeywords = [
          'ajovy', 'emgality', 'aimovig', 'fremanezumab', 'galcanezumab', 'erenumab',
          'prophylaxe', 'vorbeugung', 'monatlich', 'quarterly', 'quartal',
          'botox', 'onabotulinumtoxin'
        ];
        
        return importantKeywords.some(kw => combinedText.includes(kw));
      }
      
      return false;
    });
  }, [activeReminders]);

  return {
    reminders: upcomingImportant,
    count: upcomingImportant.length,
    isLoading,
  };
};
