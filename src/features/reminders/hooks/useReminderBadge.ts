import { useMemo } from 'react';
import { useActiveReminders } from './useReminders';
import { getAttentionCount, getLocalNow } from '../helpers/attention';

/**
 * Hook to get the badge count for active reminders
 * Uses centralized attention logic - only counts reminders that need action NOW
 */
export const useReminderBadgeCount = () => {
  const { data: activeReminders = [], isLoading } = useActiveReminders();
  
  const count = useMemo(() => {
    const now = getLocalNow();
    return getAttentionCount(activeReminders, now);
  }, [activeReminders]);

  return {
    count,
    isLoading,
  };
};

/**
 * Hook to get important upcoming reminders (for warning banner)
 * Deprecated in favor of central attention logic, but kept for backwards compatibility
 */
export const useUpcoming24hWarnings = () => {
  const { data: activeReminders = [], isLoading } = useActiveReminders();
  
  const upcomingImportant = useMemo(() => {
    // This is now handled by the central attention logic in DueRemindersSheet
    // Return empty for now - the DueRemindersSheet handles this
    return [];
  }, [activeReminders]);

  return {
    reminders: upcomingImportant,
    count: upcomingImportant.length,
    isLoading,
  };
};
