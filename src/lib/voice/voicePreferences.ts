/**
 * Voice Preferences Storage
 * Persists voice-related user preferences
 * 
 * Priority:
 * 1. Supabase user_profiles (if logged in)
 * 2. localStorage fallback
 */

import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY_HOLD_TO_TALK = 'voice_hold_to_talk_enabled';

export interface VoicePreferences {
  holdToTalkEnabled: boolean;
}

const DEFAULT_PREFERENCES: VoicePreferences = {
  holdToTalkEnabled: false,
};

/**
 * Load voice preferences from storage
 * Tries Supabase first, falls back to localStorage
 */
export async function loadVoicePreferences(): Promise<VoicePreferences> {
  try {
    // Try Supabase first
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Check if we have a stored preference in user_profiles
      // For now, use localStorage as primary since user_profiles doesn't have this column
      // This can be migrated to DB later if needed
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(STORAGE_KEY_HOLD_TO_TALK);
    if (stored !== null) {
      return {
        holdToTalkEnabled: stored === 'true',
      };
    }
    
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('[VoicePrefs] Error loading preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save voice preferences to storage
 * Saves to localStorage (can be extended to Supabase)
 */
export async function saveVoicePreferences(prefs: Partial<VoicePreferences>): Promise<void> {
  try {
    if (prefs.holdToTalkEnabled !== undefined) {
      localStorage.setItem(STORAGE_KEY_HOLD_TO_TALK, String(prefs.holdToTalkEnabled));
    }
    
    // Future: Also save to Supabase user_profiles if needed
    // const { data: { user } } = await supabase.auth.getUser();
    // if (user) {
    //   await supabase.from('user_profiles').upsert({
    //     user_id: user.id,
    //     voice_hold_to_talk: prefs.holdToTalkEnabled,
    //   });
    // }
  } catch (error) {
    console.error('[VoicePrefs] Error saving preferences:', error);
  }
}

/**
 * Quick getter for hold-to-talk preference (sync)
 */
export function getHoldToTalkPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_HOLD_TO_TALK);
    return stored === 'true';
  } catch {
    return false;
  }
}

/**
 * Quick setter for hold-to-talk preference (sync)
 */
export function setHoldToTalkPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_HOLD_TO_TALK, String(enabled));
  } catch (error) {
    console.error('[VoicePrefs] Error setting hold-to-talk:', error);
  }
}
