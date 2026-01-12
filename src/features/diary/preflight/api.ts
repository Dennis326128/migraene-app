import { supabase } from "@/lib/supabaseClient";
import type { DiaryCreationPromptPreferences } from "./types";

const STORAGE_KEY = "diary_creation_prompts";

/**
 * Get diary creation prompt preferences from user_profiles
 * Falls back to localStorage if DB column doesn't exist yet
 */
export async function getDiaryPromptPreferences(): Promise<DiaryCreationPromptPreferences> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return getLocalPreferences();

    // Try to get from user_profiles custom field
    const { data } = await supabase
      .from("user_profiles")
      .select("custom_medication_reasons")
      .eq("user_id", user.id)
      .maybeSingle();

    // We'll store in localStorage for now since we don't have a dedicated column
    // This is the recommended approach until a migration adds the column
    return getLocalPreferences();
  } catch {
    return getLocalPreferences();
  }
}

/**
 * Save diary creation prompt preferences
 */
export async function saveDiaryPromptPreferences(
  prefs: DiaryCreationPromptPreferences
): Promise<void> {
  try {
    // Save to localStorage for now
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail
  }
}

/**
 * Update a single preference
 */
export async function updateDiaryPromptPreference(
  key: keyof DiaryCreationPromptPreferences,
  value: boolean | DiaryCreationPromptPreferences['skipPersonalFields']
): Promise<void> {
  const current = await getDiaryPromptPreferences();
  const updated = { ...current, [key]: value };
  await saveDiaryPromptPreferences(updated);
}

/**
 * Update a personal field skip preference
 */
export async function updatePersonalFieldSkip(
  field: 'insuranceNumber' | 'dateOfBirth',
  skip: boolean
): Promise<void> {
  const current = await getDiaryPromptPreferences();
  const updated: DiaryCreationPromptPreferences = {
    ...current,
    skipPersonalFields: {
      ...current.skipPersonalFields,
      [field]: skip,
    },
  };
  await saveDiaryPromptPreferences(updated);
}

/**
 * Reset all preferences (for settings page)
 */
export async function resetDiaryPromptPreferences(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
}

// Local storage helpers
function getLocalPreferences(): DiaryCreationPromptPreferences {
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
