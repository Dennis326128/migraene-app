import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Legacy weather fetch endpoint.
 *
 * Privacy: Uses Open-Meteo only (no API key, EU-friendly).
 * The current app uses `fetch-weather-hybrid`; this function is kept
 * as a backwards-compatible shim and now also routes through Open-Meteo
 * so we no longer call the US-based OpenWeatherMap API.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🌤️ Fetch-weather (Open-Meteo) function called');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lat, lon, at } = await req.json();
    if (!lat || !lon || !at) {
      return new Response(JSON.stringify({ error: 'lat, lon, and at are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetDate = new Date(at);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Reuse existing snapshot for the same day if present
    const { data: existingLogs } = await supabase
      .from('weather_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('latitude', lat)
      .eq('longitude', lon)
      .gte('snapshot_date', dateStr)
      .lte('snapshot_date', dateStr)
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      return new Response(JSON.stringify({ weather_id: existingLogs[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decide between current API or historical archive
    const now = new Date();
    const hoursDiff = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60));
    const useHistorical = hoursDiff >= 1;

    let weatherData: {
      temperature_c: number | null;
      pressure_mb: number | null;
      humidity: number | null;
      wind_kph: number | null;
      condition_text: string | null;
      condition_icon: string | null;
    } | null = null;

    try {
      if (!useHistorical) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo current ${res.status}`);
        const data = await res.json();
        const c = data?.current;
        if (c) {
          weatherData = {
            temperature_c: c.temperature_2m ?? null,
            pressure_mb: c.surface_pressure ?? null,
            humidity: c.relative_humidity_2m ?? null,
            wind_kph: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null, // Open-Meteo default unit is km/h
            condition_text: 'Current weather (Open-Meteo)',
            condition_icon: null,
          };
        }
      }

      if (!weatherData) {
        // Historical hourly archive
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
        const data = await res.json();
        if (data?.hourly?.time?.length) {
          // Pick closest hour
          const targetHour = targetDate.getUTCHours();
          let bestIdx = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < data.hourly.time.length; i++) {
            const h = new Date(data.hourly.time[i]).getUTCHours();
            const diff = Math.abs(h - targetHour);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = i;
            }
          }
          weatherData = {
            temperature_c: data.hourly.temperature_2m?.[bestIdx] ?? null,
            pressure_mb: data.hourly.surface_pressure?.[bestIdx] ?? null,
            humidity: data.hourly.relative_humidity_2m?.[bestIdx] ?? null,
            wind_kph: typeof data.hourly.wind_speed_10m?.[bestIdx] === 'number'
              ? data.hourly.wind_speed_10m[bestIdx]
              : null, // Open-Meteo default unit is km/h
            condition_text: 'Historical (Open-Meteo)',
            condition_icon: null,
          };
        }
      }

      if (!weatherData) {
        return new Response(JSON.stringify({ error: 'No weather data available' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: insertedLog, error: insertError } = await supabase
        .from('weather_logs')
        .insert({
          user_id: user.id,
          latitude: lat,
          longitude: lon,
          temperature_c: weatherData.temperature_c,
          pressure_mb: weatherData.pressure_mb,
          humidity: weatherData.humidity,
          wind_kph: weatherData.wind_kph,
          condition_text: weatherData.condition_text,
          condition_icon: weatherData.condition_icon,
          pressure_change_24h: null,
          snapshot_date: dateStr,
          created_at: targetDate.toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to save weather data' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ weather_id: insertedLog.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (weatherError) {
      console.error('❌ Open-Meteo error:', weatherError);
      return new Response(JSON.stringify({ error: 'Failed to fetch weather data' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
