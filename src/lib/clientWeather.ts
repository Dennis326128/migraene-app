import { supabase } from "@/lib/supabaseClient";

export async function triggerDailyBackfill(): Promise<{
  success: boolean;
  ok: number;
  skip: number;
  fail: number;
  message?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('daily-weather-backfill', {
      method: 'POST',
      headers: {
        'x-cron-secret': 'dev-test-secret' // Für lokale Tests
      }
    });

    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Backfill trigger error:', error);
    throw new Error(`Backfill fehlgeschlagen: ${error.message}`);
  }
}

export async function checkUserCoordinates(): Promise<{
  hasCoordinates: boolean;
  latitude?: number;
  longitude?: number;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht authentifiziert');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('latitude, longitude')
    .eq('user_id', user.id)
    .single();

  const hasCoordinates = !!(profile?.latitude && profile?.longitude);
  
  return {
    hasCoordinates,
    latitude: profile?.latitude || undefined,
    longitude: profile?.longitude || undefined,
  };
}