import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Timezone utilities for Europe/Berlin
function berlinDateFromUTC(d = new Date()): Date {
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
}

function berlinYesterdayMidnightUTC(): Date {
  const nowBerlin = berlinDateFromUTC();
  nowBerlin.setDate(nowBerlin.getDate() - 1);
  nowBerlin.setHours(0, 0, 0, 0);
  
  // Convert Berlin midnight back to UTC
  const offset = nowBerlin.getTimezoneOffset() * 60000;
  const utcTime = nowBerlin.getTime() + offset;
  const berlinOffset = -1 * 60 * 60000; // UTC+1 in milliseconds
  const berlinTime = utcTime + berlinOffset;
  
  return new Date(berlinTime);
}

function toISODateUTC(d: Date): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

// Weather fetching
type WeatherDay = {
  dateISO: string;
  lat?: number; 
  lon?: number; 
  city?: string;
  source: "openweather" | "open-meteo";
  tempMin?: number; 
  tempMax?: number;
  pressure?: number; 
  humidity?: number;
  precipitationMm?: number;
};

async function fetchOpenMeteoHistorical(lat: number, lon: number, dateUTC: Date): Promise<WeatherDay | null> {
  const dateISO = new Date(dateUTC);
  dateISO.setUTCHours(0, 0, 0, 0);
  
  const base: WeatherDay = { 
    dateISO: dateISO.toISOString(), 
    lat, 
    lon, 
    source: "open-meteo" 
  };

  try {
    const day = new Date(dateISO);
    const yyyy = day.getUTCFullYear();
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(day.getUTCDate()).padStart(2, "0");
    const range = `${yyyy}-${mm}-${dd}`;
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${range}&end_date=${range}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,pressure_msl_mean,relative_humidity_2m_mean&timezone=UTC`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}: ${res.statusText}`);
    
    const j = await res.json();
    const d = j?.daily;
    if (!d) return base;
    
    return {
      ...base,
      tempMin: d.temperature_2m_min?.[0],
      tempMax: d.temperature_2m_max?.[0],
      precipitationMm: d.precipitation_sum?.[0],
      pressure: Array.isArray(d.pressure_msl_mean) ? Math.round(d.pressure_msl_mean[0]) : undefined,
      humidity: Array.isArray(d.relative_humidity_2m_mean) ? Math.round(d.relative_humidity_2m_mean[0]) : undefined,
    };
  } catch (e) {
    console.warn("fetchOpenMeteoHistorical error:", e);
    return null;
  }
}

async function backfillYesterdayForAllUsers(): Promise<{ok: number, skip: number, fail: number}> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let ok = 0, skip = 0, fail = 0;

  const dateUTC = berlinYesterdayMidnightUTC();
  const dateISO = toISODateUTC(dateUTC);
  const snapshotDate = dateISO.slice(0, 10); // "YYYY-MM-DD"
  const targetDate = new Date(dateISO);

  console.log(`🌤️ Starting daily weather backfill for ${dateISO}`);

  // Get all users with profiles that have coordinates
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('user_id, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (profilesError) {
    console.error('Error fetching user profiles:', profilesError);
    return { ok: 0, skip: 0, fail: 1 };
  }

  if (!profiles?.length) {
    console.log('No users with coordinates found');
    return { ok: 0, skip: 0, fail: 0 };
  }

  console.log(`Found ${profiles.length} users with coordinates`);

  for (const profile of profiles) {
    try {
      // 1) Existenzcheck per snapshot_date
      const { data: existing } = await supabase
        .from('weather_logs')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('snapshot_date', snapshotDate)
        .maybeSingle();

      if (existing) {
        skip++;
        continue;
      }

      // Fetch weather data
      const weatherData = await fetchOpenMeteoHistorical(
        Number(profile.latitude), 
        Number(profile.longitude), 
        dateUTC
      );

      if (!weatherData) {
        fail++;
        continue;
      }

      // 2) Insert mit snapshot_date
      const { data: weatherLog, error: weatherError } = await supabase
        .from('weather_logs')
        .insert({
          user_id: profile.user_id,
          latitude: weatherData.lat,
          longitude: weatherData.lon,
          temperature_c: weatherData.tempMax,
          pressure_mb: weatherData.pressure,
          humidity: weatherData.humidity,
          condition_text: `${weatherData.tempMin}°C - ${weatherData.tempMax}°C`,
          created_at: dateISO,
          snapshot_date: snapshotDate
        })
        .select('id')
        .single();

      if (weatherError) {
        console.error(`Error creating weather log for user ${profile.user_id}:`, weatherError);
        fail++;
        continue;
      }

      // Link pain entries from that day to the weather log
      const startOfDay = new Date(dateISO);
      const endOfDay = new Date(new Date(dateISO).getTime() + 24 * 60 * 60 * 1000);

      const { data: entries } = await supabase
        .from('pain_entries')
        .select('id')
        .eq('user_id', profile.user_id)
        .is('weather_id', null)
        .gte('timestamp_created', startOfDay.toISOString())
        .lt('timestamp_created', endOfDay.toISOString());

      if (entries?.length) {
        const { error: updateError } = await supabase
          .from('pain_entries')
          .update({ weather_id: weatherLog.id })
          .in('id', entries.map(e => e.id));

        if (updateError) {
          console.error(`Error linking entries for user ${profile.user_id}:`, updateError);
        } else {
          console.log(`✅ Linked ${entries.length} entries to weather for user ${profile.user_id}`);
        }
      }

      ok++;
      console.log(`✅ Weather backfill successful for user ${profile.user_id}`);

    } catch (error) {
      console.error(`Error processing user ${profile.user_id}:`, error);
      fail++;
    }

    // Rate limiting - small delay between users
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`🏁 Daily weather backfill completed: ok=${ok}, skip=${skip}, fail=${fail}`);
  return { ok, skip, fail };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    
    if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
      console.warn('Unauthorized cron request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🕘 Daily weather backfill started at', new Date().toISOString());
    
    const result = await backfillYesterdayForAllUsers();
    
    console.log('📊 Backfill result:', result);

    return new Response(JSON.stringify({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
      message: `Processed ${result.ok + result.skip + result.fail} users: ${result.ok} successful, ${result.skip} skipped, ${result.fail} failed`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Daily weather backfill error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});