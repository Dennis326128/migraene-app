// supabase/functions/fetch-weather/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS erlauben (im Livebetrieb statt "*" deine App-Domain eintragen)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Umgebungsvariablen (in Supabase Function Settings setzen!)
const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const WEATHER_API_KEY = Deno.env.get("WEATHER_API_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY || !WEATHER_API_KEY) {
  throw new Error("❌ Ein oder mehrere Secrets fehlen!");
}

const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lat, lon, user_id } = await req.json();

    if (!lat || !lon || !user_id) {
      return new Response(JSON.stringify({ error: "lat, lon und user_id sind erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wetterdaten von OpenWeatherMap holen
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=de`
    );

    if (!weatherRes.ok) {
      const errText = await weatherRes.text();
      return new Response(JSON.stringify({ error: errText }), {
        status: weatherRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weatherData = await weatherRes.json();

    // In weather_logs speichern
    const { data: inserted, error: insertError } = await supabase
      .from("weather_logs")
      .insert([
        {
          user_id,
          latitude: lat,
          longitude: lon,
          temperature_c: weatherData.main?.temp ?? null,
          pressure_mb: weatherData.main?.pressure ?? null,
          humidity: weatherData.main?.humidity ?? null,
          wind_kph: weatherData.wind?.speed ?? null,
          condition_text: weatherData.weather?.[0]?.description ?? null,
          condition_icon: weatherData.weather?.[0]?.icon ?? null,
          location: weatherData.name ?? null,
          created_at: new Date().toISOString(),
        }
      ])
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify({ weather_id: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
