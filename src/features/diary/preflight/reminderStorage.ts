/**
 * Storage utilities for intelligent reminder preferences
 * Uses localStorage for persistence with daily "later" tracking
 */

import type { ReminderPreferences } from "./types";

const STORAGE_KEY = "diary_reminder_preferences";

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get reminder preferences from localStorage
 */
export function getReminderPreferences(): ReminderPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

/**
 * Save reminder preferences to localStorage
 */
export function saveReminderPreferences(prefs: ReminderPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail
  }
}

/**
 * Check if personal data reminder was dismissed today
 */
export function wasPersonalDataDismissedToday(): boolean {
  const prefs = getReminderPreferences();
  return prefs.laterPersonalDataDate === getTodayString();
}

/**
 * Check if doctors reminder was dismissed today
 */
export function wasDoctorsDismissedToday(): boolean {
  const prefs = getReminderPreferences();
  return prefs.laterDoctorsDate === getTodayString();
}

/**
 * Mark personal data reminder as "later" for today
 */
export function dismissPersonalDataForToday(): void {
  const prefs = getReminderPreferences();
  prefs.laterPersonalDataDate = getTodayString();
  saveReminderPreferences(prefs);
}

/**
 * Mark doctors reminder as "later" for today
 */
export function dismissDoctorsForToday(): void {
  const prefs = getReminderPreferences();
  prefs.laterDoctorsDate = getTodayString();
  saveReminderPreferences(prefs);
}

/**
 * Permanently disable personal data reminders
 */
export function neverAskPersonalData(): void {
  const prefs = getReminderPreferences();
  prefs.neverAskPersonalData = true;
  saveReminderPreferences(prefs);
}

/**
 * Permanently disable doctors reminders
 */
export function neverAskDoctors(): void {
  const prefs = getReminderPreferences();
  prefs.neverAskDoctors = true;
  saveReminderPreferences(prefs);
}

/**
 * Check if personal data reminders are permanently disabled
 */
export function isPersonalDataNeverAsk(): boolean {
  const prefs = getReminderPreferences();
  return prefs.neverAskPersonalData === true;
}

/**
 * Check if doctors reminders are permanently disabled
 */
export function isDoctorsNeverAsk(): boolean {
  const prefs = getReminderPreferences();
  return prefs.neverAskDoctors === true;
}

/**
 * Reset all reminder preferences (for settings/debugging)
 */
export function resetReminderPreferences(): void {
  localStorage.removeItem(STORAGE_KEY);
}
