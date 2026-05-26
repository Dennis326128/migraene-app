import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Supabase Configuration (single source of truth)
export const SUPABASE_URL = 'https://lzcbjciqrhsezxkjeyhb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6Y2JqY2lxcmhzZXp4a2pleWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMzUxNTIsImV4cCI6MjA2OTgxMTE1Mn0.Ak7qF9uZ7u9E48pkhlK5C4hyKQv6U5poOQAaO0K-cB8';

/**
 * Capacitor-backed storage adapter for Supabase Auth.
 * - Native (iOS/Android): uses @capacitor/preferences (persistent, survives app restart)
 * - Web: uses localStorage
 *
 * Supabase's GoTrueClient supports async storage adapters, so we can return
 * Promises directly from the native branch.
 */
const isNative = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

const nativeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },
  async removeItem(key: string): Promise<void> {
    await Preferences.remove({ key });
  },
};

const webStorageAdapter = typeof window !== 'undefined' ? window.localStorage : undefined;

// Single Supabase Client instance (prevents "Multiple GoTrueClient instances" warning)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: isNative ? (nativeStorageAdapter as any) : webStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

// Legacy exports for backwards compatibility
export const VITE_SUPABASE_URL = SUPABASE_URL;
export const VITE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
