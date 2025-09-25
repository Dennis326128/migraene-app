import { Geolocation } from '@capacitor/geolocation';
import { supabase, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL } from '@/lib/supabaseClient';
import { getUserSettings } from "@/features/settings/api/settings.api";

type Coords = { lat: number; lon: number };

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getCoords(): Promise<Coords | null> {
  const userId = await getUserId();
  if (!userId) return null;

  // 1) Immer zuerst aktuelle GPS-Position versuchen
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    return { lat, lon };
  } catch {
    // 2) Fallback: gespeicherte Koordinaten aus user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.latitude && profile?.longitude) {
      return { lat: Number(profile.latitude), lon: Number(profile.longitude) };
    }

    // 3) Letzter Fallback: letzte bekannte Koordinaten aus weather_logs
    const { data: lastLog } = await supabase
      .from('weather_logs')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog?.latitude && lastLog?.longitude) {
      return { lat: Number(lastLog.latitude), lon: Number(lastLog.longitude) };
    }

    return null;
  }
}

/** Holt & speichert Wetter für einen konkreten Zeitpunkt (ISO) und gibt weather_logs.id zurück. */
export async function logAndSaveWeatherAt(atISO: string): Promise<number | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const coords = await getCoords();
  if (!coords) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;

  const url = `${VITE_SUPABASE_URL}/functions/v1/fetch-weather-hybrid`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,   // wichtig: User-JWT, nicht anon key
    },
    body: JSON.stringify({ lat: coords.lat, lon: coords.lon, at: atISO }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.weather_id ?? null;
}

async function getSnapshotHours(): Promise<number[]> {
  try {
    const s = await getUserSettings();
    const hours = s?.snapshot_hours?.length ? s.snapshot_hours : [6, 12, 18];
    // nur valide Stunden 0..23
    return hours.filter(h => Number.isInteger(h) && h >= 0 && h <= 23);
  } catch { return [6, 12, 18]; }
}

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Trägt für den gegebenen Tag Snapshots nach, falls fehlen (Stunden aus user_settings). */
export async function logDailyWeatherSnapshots(date: Date = new Date()): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const coords = await getCoords();
  if (!coords) return;

  const SNAP_HOURS = await getSnapshotHours();
  const day = yyyyMmDd(date);
  const startISO = new Date(`${day}T00:00:00`).toISOString();
  const endISO = new Date(`${day}T23:59:59`).toISOString();

  const { data: logs } = await supabase
    .from('weather_logs')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const haveHours = new Set<number>((logs || []).map(l => new Date(l.created_at as string).getUTCHours()));
  for (const h of SNAP_HOURS) {
    // Stunde in lokaler Zeit annehmen und zu ISO konvertieren
    const atLocal = new Date(`${day}T${String(h).padStart(2, '0')}:00:00`);
    const at = atLocal.toISOString();
    const hourUTC = new Date(at).getUTCHours();
    if (!haveHours.has(hourUTC)) {
      await logAndSaveWeatherAt(at);
      await new Promise(r => setTimeout(r, 150));
    }
  }
}