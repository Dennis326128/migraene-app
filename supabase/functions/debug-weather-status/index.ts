import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Debug Weather Status');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Count entries without weather
    const { count: entriesWithoutWeather } = await supabase
      .from('pain_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('weather_id', null);

    // Get sample entries with weather to verify coordinates
    const { data: entriesWithWeather, error: entriesError } = await supabase
      .from('pain_entries')
      .select(`
        id,
        selected_date,
        selected_time,
        latitude as entry_lat,
        longitude as entry_lon,
        weather:weather_logs!pain_entries_weather_id_fkey (
          id,
          latitude as weather_lat,
          longitude as weather_lon,
          requested_at,
          temperature_c
        )
      `)
      .eq('user_id', user.id)
      .not('weather_id', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(10);

    if (entriesError) throw entriesError;

    // Calculate distances
    const entriesWithDistance = (entriesWithWeather || []).map(entry => {
      const weather = Array.isArray(entry.weather) ? entry.weather[0] : entry.weather;
      
      if (!weather) {
        return { ...entry, distance_km: null, status: 'no_weather' };
      }

      const entryLat = Number(entry.entry_lat);
      const entryLon = Number(entry.entry_lon);
      const weatherLat = Number(weather.weather_lat);
      const weatherLon = Number(weather.weather_lon);

      // Haversine distance
      const R = 6371;
      const dLat = (entryLat - weatherLat) * Math.PI / 180;
      const dLon = (entryLon - weatherLon) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(weatherLat * Math.PI / 180) * Math.cos(entryLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance_km = R * c;

      return {
        entry_id: entry.id,
        date: entry.selected_date,
        time: entry.selected_time,
        entry_coords: `${entryLat.toFixed(4)}, ${entryLon.toFixed(4)}`,
        weather_coords: `${weatherLat.toFixed(4)}, ${weatherLon.toFixed(4)}`,
        distance_km: distance_km.toFixed(2),
        status: distance_km > 10 ? 'mismatch' : 'ok',
        weather_id: weather.id,
        temperature: weather.temperature_c
      };
    });

    const mismatches = entriesWithDistance.filter(e => e.status === 'mismatch');

    return new Response(JSON.stringify({
      summary: {
        entries_without_weather: entriesWithoutWeather || 0,
        entries_checked: entriesWithWeather?.length || 0,
        coordinate_mismatches: mismatches.length
      },
      recent_entries: entriesWithDistance,
      mismatches: mismatches.length > 0 ? mismatches : undefined
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
