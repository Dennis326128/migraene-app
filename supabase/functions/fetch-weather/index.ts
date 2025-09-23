import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS (später Domain einschränken)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supabase (Service Role)
const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  throw new Error("❌ SB_URL oder SB_SERVICE_ROLE_KEY fehlt");
}
const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

// Helpers
function toISOHour(iso: string) {
  // runde auf volle Stunde ab (für Open-Meteo hourly)
  const d = new Date(iso);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13) + ":00";
}
function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addHours(iso: string, h: number) {
  const d = new Date(iso);
  d.setHours(d.getHours() + h);
  return d.toISOString();
}
function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
const WMO_CODE_TEXT: Record<number, string> = {
  0: "Klar",
  1: "Überwiegend klar",
  2: "Teilweise bewölkt",
  3: "Bedeckt",
  45: "Nebel",
  48: "Reifiger Nebel",
  51: "Nieselregen leicht",
  53: "Nieselregen mäßig",
  55: "Nieselregen stark",
  61: "Regen leicht",
  63: "Regen mäßig",
  65: "Regen stark",
  66: "Gefrierender Regen leicht",
  67: "Gefrierender Regen stark",
  71: "Schnee leicht",
  73: "Schnee mäßig",
  75: "Schnee stark",
  77: "Schneekörner",
  80: "Regenschauer leicht",
  81: "Regenschauer mäßig",
  82: "Regenschauer stark",
  85: "Schneeschauer leicht",
  86: "Schneeschauer stark",
  95: "Gewitter",
  96: "Gewitter mit leichtem Hagel",
  99: "Gewitter mit starkem Hagel",
};

async function fetchHourly(lat: number, lon: number, startDate: string, endDate: string) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,pressure_msl,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo hourly failed: ${res.status}`);
  return await res.json();
}

async function fetchAstronomy(lat: number, lon: number, date: string) {
  const url =
    `https://api.open-meteo.com/v1/astronomy?latitude=${lat}&longitude=${lon}` +
    `&daily=moon_phase,moonrise,moonset&timezone=auto&start_date=${date}&end_date=${date}`;
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
    const atISO: string = body.at || new Date().toISOString(); // optional Zeitpunkt

    if (!lat || !lon || !user_id) {
      return new Response(JSON.stringify({ error: "lat, lon, user_id erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const atHourISO = toISOHour(atISO);
    const startDate = dateStr(new Date(addDays(atHourISO, -1))); // Vortag
    const endDate = dateStr(new Date(atHourISO));                // Zieltag

    // Hole stündliche Werte (Vortag + Tag) → ermöglicht 24h-Delta
    const hourly = await fetchHourly(lat, lon, startDate, endDate);

    // Index des Zielzeitpunkts finden
    const times: string[] = hourly.hourly.time; // ISO strings
    const idx = times.findIndex((t) => t.startsWith(atHourISO.slice(0, 13))); // gleiche Stunde
    if (idx < 0) throw new Error("Kein stündlicher Datensatz für die gewünschte Stunde gefunden.");

    // Werte für Zielstunde
    const temp = hourly.hourly.temperature_2m[idx] ?? null;
    const pressure = hourly.hourly.pressure_msl[idx] ?? null;          // hPa
    const rh = hourly.hourly.relative_humidity_2m[idx] ?? null;        // %
    const wind = hourly.hourly.wind_speed_10m[idx] ?? null;            // km/h
    const code = hourly.hourly.weather_code[idx] ?? null;
    const condition_text = code != null ? (WMO_CODE_TEXT[Number(code)] || `WMO ${code}`) : null;

    // Druckänderung 24h (Index -24)
    let pressure_change_24h: number | null = null;
    if (idx - 24 >= 0 && hourly.hourly.pressure_msl[idx - 24] != null && pressure != null) {
      pressure_change_24h = Number((pressure - hourly.hourly.pressure_msl[idx - 24]).toFixed(1));
    }

    // Astronomie (Mondphase/Rise/Set) für das Datum
    const astro = await fetchAstronomy(lat, lon, dateStr(new Date(atHourISO)));
    const moon_phase = astro?.daily?.moon_phase?.[0] ?? null;
    const moonrise = astro?.daily?.moonrise?.[0] ?? null;
    const moonset = astro?.daily?.moonset?.[0] ?? null;

    // Speichern
    const { data: inserted, error: insertError } = await supabase
      .from("weather_logs")
      .insert([{
        user_id,
        latitude: lat,
        longitude: lon,
        temperature_c: temp,
        pressure_mb: pressure,
        humidity: rh,
        wind_kph: wind,               // Open-Meteo liefert km/h → Spalte heißt wind_kph
        condition_text,
        condition_icon: null,
        location: null,               // Open-Meteo liefert keinen Ortsnamen
        pressure_change_24h,
        moon_phase,
        moonrise,
        moonset,
        created_at: atHourISO,        // WICHTIG: auf Zielzeitpunkt setzen
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