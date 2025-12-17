/**
 * Demo User Service
 * Handles creation and authentication of the demo user
 */

import { supabase } from '@/integrations/supabase/client';
import { DEMO_CONFIG, isDemoEnabled } from './demoConfig';
import { resetDemoData, seedDemoData } from './seedDemoData';

export interface DemoProgress {
  message: string;
  percent: number;
}

export type ProgressCallback = (progress: DemoProgress) => void;

export async function startDemoUser(onProgress?: ProgressCallback): Promise<{ success: boolean; error?: string }> {
  if (!isDemoEnabled()) {
    return { success: false, error: 'Demo mode is not enabled' };
  }

  try {
    onProgress?.({ message: 'Prüfe Demo-User...', percent: 5 });

    // First, try to sign in with existing demo user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: DEMO_CONFIG.email,
      password: DEMO_CONFIG.password,
    });

    let userId: string;

    if (signInError) {
      // User doesn't exist or wrong password - try to create via Edge Function
      onProgress?.({ message: 'Erstelle Demo-User...', percent: 10 });
      
      const { data: createData, error: createError } = await supabase.functions.invoke('create-demo-user', {
        body: {
          email: DEMO_CONFIG.email,
          password: DEMO_CONFIG.password,
        },
      });

      if (createError || !createData?.success) {
        // Edge function failed - try direct signup (works if email confirmation is disabled)
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: DEMO_CONFIG.email,
          password: DEMO_CONFIG.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (signUpError) {
          return { 
            success: false, 
            error: `Demo-User konnte nicht erstellt werden: ${signUpError.message}. Bitte Email-Bestätigung in Supabase deaktivieren.` 
          };
        }

        // Try to sign in again after signup
        const { data: retrySignIn, error: retryError } = await supabase.auth.signInWithPassword({
          email: DEMO_CONFIG.email,
          password: DEMO_CONFIG.password,
        });

        if (retryError) {
          return { 
            success: false, 
            error: 'Demo-User erstellt, aber Anmeldung fehlgeschlagen. Bitte Email-Bestätigung in Supabase deaktivieren.' 
          };
        }

        userId = retrySignIn.user!.id;
      } else {
        // Edge function succeeded - sign in
        const { data: postCreateSignIn, error: postCreateError } = await supabase.auth.signInWithPassword({
          email: DEMO_CONFIG.email,
          password: DEMO_CONFIG.password,
        });

        if (postCreateError) {
          return { 
            success: false, 
            error: `Anmeldung nach Erstellung fehlgeschlagen: ${postCreateError.message}` 
          };
        }

        userId = postCreateSignIn.user!.id;
      }
    } else {
      userId = signInData.user!.id;
    }

    onProgress?.({ message: 'Demo-User angemeldet, bereite Daten vor...', percent: 15 });

    // Reset and seed demo data
    await resetDemoData(userId, (msg, pct) => {
      onProgress?.({ message: msg, percent: pct });
    });

    const { entriesCount } = await seedDemoData(userId, (msg, pct) => {
      onProgress?.({ message: msg, percent: pct });
    });

    onProgress?.({ 
      message: `Demo-Daten erstellt: 90 Tage, ${entriesCount} Einträge`, 
      percent: 100 
    });

    return { success: true };

  } catch (error: any) {
    console.error('[DemoUser] Error:', error);
    return { 
      success: false, 
      error: error?.message || 'Unbekannter Fehler beim Erstellen des Demo-Users' 
    };
  }
}

export async function resetDemoUserData(onProgress?: ProgressCallback): Promise<{ success: boolean; error?: string }> {
  if (!isDemoEnabled()) {
    return { success: false, error: 'Demo mode is not enabled' };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: 'Nicht angemeldet' };
    }

    if (user.email !== DEMO_CONFIG.email) {
      return { success: false, error: 'Reset nur für Demo-User verfügbar' };
    }

    await resetDemoData(user.id, (msg, pct) => {
      onProgress?.({ message: msg, percent: pct });
    });

    const { entriesCount } = await seedDemoData(user.id, (msg, pct) => {
      onProgress?.({ message: msg, percent: pct });
    });

    return { success: true };

  } catch (error: any) {
    return { 
      success: false, 
      error: error?.message || 'Fehler beim Zurücksetzen der Demo-Daten' 
    };
  }
}

export function isDemoUser(email?: string | null): boolean {
  return email === DEMO_CONFIG.email;
}
