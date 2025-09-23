import { Geolocation } from '@capacitor/geolocation';
import { supabase, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL } from '@/lib/supabaseClient';

type Coords = { lat: number; lon: number };

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getCoords(): Promise<Coords | null> {
  const userId = await getUserId();
  if (!userId) return null;

  // 1) Versuche gespeicherte Koordinaten
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('latitude, longitude')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.latitude && profile?.longitude) {
    return { lat: Number(profile.latitude), lon: Number(profile.longitude) };
  }

  // 2) Hole aktuelle Position und speichere sie
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    await supabase
      .from('user_profiles')
      .upsert(
        { user_id: userId, latitude: lat, longitude: lon, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    return { lat, lon };
  } catch {
    return null;
  }
}

/** Holt & speichert Wetter für einen konkreten Zeitpunkt (ISO) und gibt weather_logs.id zurück. */
export async function logAndSaveWeatherAt(atISO: string): Promise<number | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const coords = await getCoords();
  if (!coords) return null;

  const url = `${VITE_SUPABASE_URL}/functions/v1/fetch-weather`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ lat: coords.lat, lon: coords.lon, user_id: userId, at: atISO }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.weather_id ?? null;
}

const SNAP_HOURS = [6, 12, 18];

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Trägt für den gegebenen Tag (default: heute) Snapshots (06/12/18) nach, falls fehlen. */
export async function logDailyWeatherSnapshots(date: Date = new Date()): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const coords = await getCoords();
  if (!coords) return;

  const day = yyyyMmDd(date);
  const startISO = new Date(`${day}T00:00:00`).toISOString();
  const endISO = new Date(`${day}T23:59:59`).toISOString();

  const { data: logs } = await supabase
    .from('weather_logs')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const haveHours = new Set<number>((logs || []).map(l => new Date(l.created_at as string).getHours()));

  for (const h of SNAP_HOURS) {
    if (!haveHours.has(h)) {
      const at = new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).toISOString();
      await logAndSaveWeatherAt(at);
    }
  }
}