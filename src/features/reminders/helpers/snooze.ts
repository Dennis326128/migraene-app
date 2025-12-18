import { addMinutes, addHours, setHours, setMinutes, startOfDay, addDays } from 'date-fns';

/**
 * Snooze presets for quick selection
 */
export const SNOOZE_PRESETS = [
  { value: 10, label: '+10 Min', icon: 'clock' },
  { value: 60, label: '+1 Std', icon: 'clock' },
  { value: 'evening', label: 'Heute Abend', icon: 'moon' },
  { value: 'tomorrow', label: 'Morgen', icon: 'sunrise' },
  { value: 'custom', label: 'Datum/Uhrzeit…', icon: 'calendar' },
] as const;

export type SnoozePresetValue = typeof SNOOZE_PRESETS[number]['value'];

/**
 * Calculate snooze target time based on preset
 */
export function calculateSnoozeTime(preset: SnoozePresetValue, now: Date = new Date()): Date {
  if (typeof preset === 'number') {
    // Minutes offset
    return addMinutes(now, preset);
  }
  
  if (preset === 'evening') {
    // Today at 21:00
    const evening = setMinutes(setHours(startOfDay(now), 21), 0);
    // If already past 21:00, set for tomorrow 21:00
    if (now >= evening) {
      return addDays(evening, 1);
    }
    return evening;
  }
  
  if (preset === 'tomorrow') {
    // Tomorrow at 08:00
    const tomorrow = addDays(startOfDay(now), 1);
    return setMinutes(setHours(tomorrow, 8), 0);
  }
  
  // Default: +1 hour
  return addHours(now, 1);
}

/**
 * Smart default snooze time (migraine-friendly, one tap)
 * - Before 18:00: snooze +1 hour
 * - After 18:00: snooze until tomorrow 08:00
 */
export function getSmartSnoozeTime(now: Date = new Date()): Date {
  const hour = now.getHours();
  
  if (hour < 18) {
    // Before 6pm: snooze for 1 hour
    return addHours(now, 1);
  }
  
  // After 6pm: snooze until tomorrow 8am
  const tomorrow = addDays(startOfDay(now), 1);
  return setMinutes(setHours(tomorrow, 8), 0);
}

/**
 * Format snooze time for display
 */
export function formatSnoozeTime(date: Date, now: Date = new Date()): string {
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === addDays(now, 1).toDateString();
  
  const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return `Heute, ${timeStr}`;
  }
  if (isTomorrow) {
    return `Morgen, ${timeStr}`;
  }
  
  return date.toLocaleDateString('de-DE', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
