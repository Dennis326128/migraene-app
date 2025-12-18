import { useMemo } from 'react';
import { useReminders } from './useReminders';
import type { Reminder } from '@/types/reminder.types';
import type { Med } from '@/features/meds/hooks/useMeds';

export interface MedicationReminderStatus {
  hasReminder: boolean;
  isActive: boolean;
  reminderCount: number;
  reminders: Reminder[];
  nextTriggerDate: Date | null;
  isIntervalMed: boolean;
  repeatType: string | null;
}

/**
 * Hook to get reminder status for a specific medication.
 * Works with both medication ID matching and name matching.
 * Does NOT filter by time-of-day to support interval meds like Ajovy.
 */
export function useMedicationReminderStatus(med: Med | null): MedicationReminderStatus {
  const { data: allReminders = [] } = useReminders();
  
  return useMemo(() => {
    if (!med) {
      return {
        hasReminder: false,
        isActive: false,
        reminderCount: 0,
        reminders: [],
        nextTriggerDate: null,
        isIntervalMed: false,
        repeatType: null,
      };
    }
    
    // Find reminders for this medication
    // Match by: medications array containing med name OR medication_id (if we add that field later)
    const medicationReminders = allReminders.filter(r => {
      if (r.type !== 'medication') return false;
      
      // Match by medication name in the medications array
      if (r.medications?.includes(med.name)) return true;
      
      // Also match if title contains the medication name (fallback)
      if (r.title.toLowerCase().includes(med.name.toLowerCase())) return true;
      
      return false;
    });
    
    // Filter for active/pending reminders
    const activeReminders = medicationReminders.filter(r => 
      r.status === 'pending' || r.status === 'processing'
    );
    
    // Determine if this is an interval medication (monthly, weekly - not daily)
    const isIntervalMed = activeReminders.some(r => 
      r.repeat === 'monthly' || r.repeat === 'weekly'
    ) || med.intake_type === 'regular' && (
      med.art === 'prophylaxe' || 
      med.name.toLowerCase().includes('ajovy') ||
      med.name.toLowerCase().includes('aimovig') ||
      med.name.toLowerCase().includes('emgality')
    );
    
    // Get next trigger date (closest upcoming reminder)
    let nextTriggerDate: Date | null = null;
    if (activeReminders.length > 0) {
      const now = new Date();
      const upcomingReminders = activeReminders
        .map(r => new Date(r.date_time))
        .filter(d => d >= now)
        .sort((a, b) => a.getTime() - b.getTime());
      
      if (upcomingReminders.length > 0) {
        nextTriggerDate = upcomingReminders[0];
      } else if (activeReminders.length > 0) {
        // If all reminders are in the past (will be rescheduled), use the most recent one
        const mostRecent = activeReminders
          .map(r => new Date(r.date_time))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        nextTriggerDate = mostRecent;
      }
    }
    
    // Get the repeat type from the first active reminder
    const repeatType = activeReminders.length > 0 ? activeReminders[0].repeat : null;
    
    return {
      hasReminder: medicationReminders.length > 0,
      isActive: activeReminders.length > 0,
      reminderCount: activeReminders.length,
      reminders: activeReminders,
      nextTriggerDate,
      isIntervalMed,
      repeatType,
    };
  }, [allReminders, med]);
}

/**
 * Hook to get reminder status for multiple medications at once.
 * More efficient than calling useMedicationReminderStatus multiple times.
 */
export function useMedicationsReminderMap(meds: Med[]): Map<string, MedicationReminderStatus> {
  const { data: allReminders = [] } = useReminders();
  
  return useMemo(() => {
    const statusMap = new Map<string, MedicationReminderStatus>();
    
    for (const med of meds) {
      // Find reminders for this medication
      const medicationReminders = allReminders.filter(r => {
        if (r.type !== 'medication') return false;
        if (r.medications?.includes(med.name)) return true;
        if (r.title.toLowerCase().includes(med.name.toLowerCase())) return true;
        return false;
      });
      
      const activeReminders = medicationReminders.filter(r => 
        r.status === 'pending' || r.status === 'processing'
      );
      
      const isIntervalMed = activeReminders.some(r => 
        r.repeat === 'monthly' || r.repeat === 'weekly'
      ) || med.intake_type === 'regular' && (
        med.art === 'prophylaxe' || 
        med.name.toLowerCase().includes('ajovy') ||
        med.name.toLowerCase().includes('aimovig') ||
        med.name.toLowerCase().includes('emgality')
      );
      
      let nextTriggerDate: Date | null = null;
      if (activeReminders.length > 0) {
        const now = new Date();
        const upcomingReminders = activeReminders
          .map(r => new Date(r.date_time))
          .filter(d => d >= now)
          .sort((a, b) => a.getTime() - b.getTime());
        
        if (upcomingReminders.length > 0) {
          nextTriggerDate = upcomingReminders[0];
        } else if (activeReminders.length > 0) {
          const mostRecent = activeReminders
            .map(r => new Date(r.date_time))
            .sort((a, b) => b.getTime() - a.getTime())[0];
          nextTriggerDate = mostRecent;
        }
      }
      
      const repeatType = activeReminders.length > 0 ? activeReminders[0].repeat : null;
      
      statusMap.set(med.id, {
        hasReminder: medicationReminders.length > 0,
        isActive: activeReminders.length > 0,
        reminderCount: activeReminders.length,
        reminders: activeReminders,
        nextTriggerDate,
        isIntervalMed,
        repeatType,
      });
    }
    
    return statusMap;
  }, [allReminders, meds]);
}
