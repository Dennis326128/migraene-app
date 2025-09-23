import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  throw new Error("❌ SB_URL oder SB_SERVICE_ROLE_KEY fehlt");
}
const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

// --- Helpers (UTC-basiert) ---
function toUTCStartOfHourISO(iso: string) {
  const d = new Date(iso);
  // in JS-Date ist intern UTC; wir setzen explizit Minuten/Sekunden auf 0
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString(); // exakt „YYYY-MM-DDTHH:00:00.000Z"
}
function ymdUTC(iso: string) {
  return iso.slice(0, 10); // von ISO „YYYY-MM-DD"
}
function addDaysUTC(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function fetchHourly(lat: number, lon: number, startDate: string, endDate: string) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,pressure_msl,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&timezone=UTC&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo hourly failed: ${res.status}`);
  return await res.json();
}

async function fetchAstronomy(lat: number, lon: number, date: string) {
  const url =
    `https://api.open-meteo.com/v1/astronomy?latitude=${lat}&longitude=${lon}` +
    `&daily=moon_phase,moonrise,moonset&timezone=UTC&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo astronomy failed: ${res.status}`);
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const user_id = String(body.user_id || "");
    const atISO_in = String(body.at || new Date().toISOString());

    if (!lat || !lon || !user_id) {
      return new Response(JSON.stringify({ error: "lat, lon, user_id erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ziel-Zeitpunkt exakt auf UTC-Stundenanfang
    const atHourUTC = toUTCStartOfHourISO(atISO_in);                     // z.B. 2025-09-23T17:00:00.000Z
    const atHourUTC_noZ = atHourUTC.slice(0, 13) + ":00";                // 2025-09-23T17:00 (Open-Meteo times Format)

    // Zwei UTC-Tage für 24h-Druckdelta
    const startDate = ymdUTC(addDaysUTC(atHourUTC, -1));                 // Vortag (UTC)
    const endDate   = ymdUTC(atHourUTC);                                 // Zieltag (UTC)

    const hourly = await fetchHourly(lat, lon, startDate, endDate);
    const times: string[] = hourly?.hourly?.time || [];

    const idx = times.indexOf(atHourUTC_noZ);
    if (idx < 0) throw new Error("Kein stündlicher Datensatz für die gewünschte UTC-Stunde gefunden.");

    const temp = hourly.hourly.temperature_2m[idx] ?? null;
    const pressure = hourly.hourly.pressure_msl[idx] ?? null;
    const rh = hourly.hourly.relative_humidity_2m[idx] ?? null;
    const wind = hourly.hourly.wind_speed_10m[idx] ?? null;
    const code = hourly.hourly.weather_code[idx] ?? null;

    const WMO_CODE_TEXT: Record<number, string> = {
      0:"Klar",1:"Überwiegend klar",2:"Teilweise bewölkt",3:"Bedeckt",45:"Nebel",48:"Reifiger Nebel",
      51:"Nieselregen leicht",53:"Nieselregen mäßig",55:"Nieselregen stark",
      61:"Regen leicht",63:"Regen mäßig",65:"Regen stark",
      66:"Gefrierender Regen leicht",67:"Gefrierender Regen stark",
      71:"Schnee leicht",73:"Schnee mäßig",75:"Schnee stark",77:"Schneekörner",
      80:"Regenschauer leicht",81:"Regenschauer mäßig",82:"Regenschauer stark",
      85:"Schneeschauer leicht",86:"Schneeschauer stark",
      95:"Gewitter",96:"Gewitter mit leichtem Hagel",99:"Gewitter mit starkem Hagel"
    };
    const condition_text = code != null ? (WMO_CODE_TEXT[Number(code)] || `WMO ${code}`) : null;

    let pressure_change_24h: number | null = null;
    if (idx - 24 >= 0 && hourly.hourly.pressure_msl[idx - 24] != null && pressure != null) {
      pressure_change_24h = Number((pressure - hourly.hourly.pressure_msl[idx - 24]).toFixed(1));
    }

    const astro = await fetchAstronomy(lat, lon, ymdUTC(atHourUTC));
    const moon_phase = astro?.daily?.moon_phase?.[0] ?? null;
    const moonrise = astro?.daily?.moonrise?.[0] ?? null;
    const moonset = astro?.daily?.moonset?.[0] ?? null;

    // Dedupe: existiert bereits ein Log für diese Stunde?
    const { data: existing, error: existErr } = await supabase
      .from("weather_logs")
      .select("id")
      .eq("user_id", user_id)
      .eq("created_at", atHourUTC)
      .maybeSingle();

    if (!existErr && existing?.id) {
      return new Response(JSON.stringify({ weather_id: existing.id, dedup: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("weather_logs")
      .insert([{
        user_id,
        latitude: lat,
        longitude: lon,
        temperature_c: temp,
        pressure_mb: pressure,
        humidity: rh,
        wind_kph: wind,
        condition_text,
        condition_icon: null,
        location: null,
        pressure_change_24h,
        moon_phase,
        moonrise,
        moonset,
        created_at: atHourUTC, // exakt die angefragte UTC-Stunde speichern
      }])
      .select("id")
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ weather_id: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});