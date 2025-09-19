import { Geolocation } from '@capacitor/geolocation';
import { supabase, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL } from '@/lib/supabaseClient';

/** Ruft GPS ab, triggert Edge Function (POST, JSON) und liefert weather_logs.id zurück. */
export async function logAndSaveWeather(): Promise<number | null> {
  try {
    const [{ data: authData }, position] = await Promise.all([
      supabase.auth.getUser(),
      Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }),
    ]);

    const userId = authData.user?.id;
    if (!userId) return null;

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    const url = `${VITE_SUPABASE_URL}/functions/v1/fetch-weather`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ lat, lon, user_id: userId }),
    });
    if (!res.ok) return null;

    const json = await res.json();
    return json?.weather_id ?? null;
  } catch (err) {
    console.error('logAndSaveWeather:', err);
    return null;
  }
}
