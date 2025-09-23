import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // optional später auf Domain einschränken
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY"); // in Supabase Secrets setzen
if (!SB_URL || !SB_ANON_KEY) throw new Error("Missing SB_URL or SB_ANON_KEY");

// --- UTC-Helper ---
function toUTCStartOfHourISO(iso: string) { const d = new Date(iso); d.setUTCMinutes(0,0,0); return d.toISOString(); }
function ymdUTC(iso: string) { return iso.slice(0,10); }
function addDaysUTC(iso: string, days: number) { const d = new Date(iso); d.setUTCDate(d.getUTCDate()+days); return d.toISOString(); }

async function fetchHourly(lat:number, lon:number, startDate:string, endDate:string){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,pressure_msl,relative_humidity_2m,wind_speed_10m,weather_code&timezone=UTC&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url); if(!res.ok) throw new Error(`Open-Meteo hourly failed: ${res.status}`); return await res.json();
}
async function fetchAstronomy(lat:number, lon:number, date:string){
  const url=`https://api.open-meteo.com/v1/astronomy?latitude=${lat}&longitude=${lon}&daily=moon_phase,moonrise,moonset&timezone=UTC&start_date=${date}&end_date=${date}`;
  const res = await fetch(url); if(!res.ok) throw new Error(`Open-Meteo astronomy failed: ${res.status}`); return await res.json();
}

const WMO_CODE_TEXT: Record<number,string> = {0:"Klar",1:"Überwiegend klar",2:"Teilweise bewölkt",3:"Bedeckt",45:"Nebel",48:"Reifiger Nebel",51:"Nieselregen leicht",53:"Nieselregen mäßig",55:"Nieselregen stark",61:"Regen leicht",63:"Regen mäßig",65:"Regen stark",66:"Gefrierender Regen leicht",67:"Gefrierender Regen stark",71:"Schnee leicht",73:"Schnee mäßig",75:"Schnee stark",77:"Schneekörner",80:"Regenschauer leicht",81:"Regenschauer mäßig",82:"Regenschauer stark",85:"Schneeschauer leicht",86:"Schneeschauer stark",95:"Gewitter",96:"Gewitter mit leichtem Hagel",99:"Gewitter mit starkem Hagel"};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 🔐 Authentifizierten Client erzeugen (RLS greift)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(SB_URL, SB_ANON_KEY, { global: { headers: { Authorization: authHeader }}});

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 📥 Body lesen (ohne user_id!)
    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const atISO_in: string = String(body.at || new Date().toISOString());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: "lat/lon required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const atHourUTC = toUTCStartOfHourISO(atISO_in);
    const atHourUTC_noZ = atHourUTC.slice(0,13)+":00";
    const startDate = ymdUTC(addDaysUTC(atHourUTC, -1));
    const endDate   = ymdUTC(atHourUTC);

    const hourly = await fetchHourly(lat, lon, startDate, endDate);
    const times: string[] = hourly?.hourly?.time || [];
    const idx = times.indexOf(atHourUTC_noZ);
    if (idx < 0) throw new Error("No hourly record for the requested UTC hour.");

    const temp = hourly.hourly.temperature_2m[idx] ?? null;
    const pressure = hourly.hourly.pressure_msl[idx] ?? null;
    const rh = hourly.hourly.relative_humidity_2m[idx] ?? null;
    const wind = hourly.hourly.wind_speed_10m[idx] ?? null;
    const code = hourly.hourly.weather_code[idx] ?? null;
    const condition_text = code != null ? (WMO_CODE_TEXT[Number(code)] || `WMO ${code}`) : null;

    let pressure_change_24h: number | null = null;
    if (idx - 24 >= 0 && hourly.hourly.pressure_msl[idx - 24] != null && pressure != null) {
      pressure_change_24h = Number((pressure - hourly.hourly.pressure_msl[idx - 24]).toFixed(1));
    }

    const astro = await fetchAstronomy(lat, lon, ymdUTC(atHourUTC));
    const moon_phase = astro?.daily?.moon_phase?.[0] ?? null;
    const moonrise = astro?.daily?.moonrise?.[0] ?? null;
    const moonset = astro?.daily?.moonset?.[0] ?? null;

    // 🧯 Dedupe: existiert bereits Log für diese UTC-Stunde?
    const { data: existing } = await supabase
      .from("weather_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("created_at", atHourUTC)
      .maybeSingle();
    if (existing?.id) {
      return new Response(JSON.stringify({ weather_id: existing.id, dedup: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // ✅ Insert mit RLS (user_id = auth.uid())
    const { data: inserted, error: insertError } = await supabase
      .from("weather_logs")
      .insert([{
        user_id: user.id,
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
        created_at: atHourUTC,
      }])
      .select("id")
      .single();
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ weather_id: inserted.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }
});