import { useMemo } from 'react';
import { useReminders } from './useReminders';
import type { Reminder } from '@/types/reminder.types';
import type { Med } from '@/features/meds/hooks/useMeds';
import type { MedicationCourse } from '@/features/medication-courses';

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
 * Helper to calculate reminder status from a medication name
 */
function calculateReminderStatus(
  allReminders: Reminder[],
  medicationName: string,
  isKnownIntervalMed: boolean = false
): MedicationReminderStatus {
  // Find reminders for this medication by name matching
  const medicationReminders = allReminders.filter(r => {
    if (r.type !== 'medication') return false;
    
    // Match by medication name in the medications array
    if (r.medications?.includes(medicationName)) return true;
    
    // Also match if title contains the medication name (fallback)
    if (r.title.toLowerCase().includes(medicationName.toLowerCase())) return true;
    
    return false;
  });
  
  // Filter for active/pending reminders
  const activeReminders = medicationReminders.filter(r => 
    r.status === 'pending' || r.status === 'processing'
  );
  
  // Determine if this is an interval medication (monthly, weekly - not daily)
  const isIntervalMed = isKnownIntervalMed || activeReminders.some(r => 
    r.repeat === 'monthly' || r.repeat === 'weekly'
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
    
    // Check if this is a known interval med
    const isKnownIntervalMed = med.intake_type === 'regular' && (
      med.art === 'prophylaxe' || 
      med.name.toLowerCase().includes('ajovy') ||
      med.name.toLowerCase().includes('aimovig') ||
      med.name.toLowerCase().includes('emgality')
    );
    
    return calculateReminderStatus(allReminders, med.name, isKnownIntervalMed);
  }, [allReminders, med]);
}

/**
 * Hook to get reminder status for a MedicationCourse (prophylaxis like Ajovy).
 * These are always considered interval meds with monthly default.
 */
export function useCourseReminderStatus(course: MedicationCourse | null): MedicationReminderStatus {
  const { data: allReminders = [] } = useReminders();
  
  return useMemo(() => {
    if (!course) {
      return {
        hasReminder: false,
        isActive: false,
        reminderCount: 0,
        reminders: [],
        nextTriggerDate: null,
        isIntervalMed: true, // Courses are always interval meds
        repeatType: null,
      };
    }
    
    // Courses (especially prophylaxis) are always interval meds
    return calculateReminderStatus(allReminders, course.medication_name, true);
  }, [allReminders, course]);
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
      const isKnownIntervalMed = med.intake_type === 'regular' && (
        med.art === 'prophylaxe' || 
        med.name.toLowerCase().includes('ajovy') ||
        med.name.toLowerCase().includes('aimovig') ||
        med.name.toLowerCase().includes('emgality')
      );
      
      statusMap.set(med.id, calculateReminderStatus(allReminders, med.name, isKnownIntervalMed));
    }
    
    return statusMap;
  }, [allReminders, meds]);
}

/**
 * Hook to get reminder status for multiple MedicationCourses at once.
 */
export function useCoursesReminderMap(courses: MedicationCourse[]): Map<string, MedicationReminderStatus> {
  const { data: allReminders = [] } = useReminders();
  
  return useMemo(() => {
    const statusMap = new Map<string, MedicationReminderStatus>();
    
    for (const course of courses) {
      // All courses are treated as interval meds
      statusMap.set(course.id, calculateReminderStatus(allReminders, course.medication_name, true));
    }
    
    return statusMap;
  }, [allReminders, courses]);
}
