import { createClient } from '@supabase/supabase-js';

// Supabase Configuration (single source of truth)
export const SUPABASE_URL = 'https://lzcbjciqrhsezxkjeyhb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6Y2JqY2lxcmhzZXp4a2pleWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMzUxNTIsImV4cCI6MjA2OTgxMTE1Mn0.Ak7qF9uZ7u9E48pkhlK5C4hyKQv6U5poOQAaO0K-cB8';

// Single Supabase Client instance (prevents "Multiple GoTrueClient instances" warning)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

// Legacy exports for backwards compatibility
export const VITE_SUPABASE_URL = SUPABASE_URL;
export const VITE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
