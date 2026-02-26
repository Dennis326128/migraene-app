import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfill edge function: finds pain_entries with weather_status='pending' or weather_id=null
 * in the last 30 days, attempts to fetch weather and link it.
 *
 * Can be called via cron or manually.
 * Auth: uses service role key (verify_jwt=false, secured by CRON_SECRET header).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret or service role
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const providedSecret = req.headers.get('x-cron-secret');

    if (cronSecret && providedSecret !== cronSecret && !authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '___none___')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const openWeatherApiKey = Deno.env.get('OPENWEATHERMAP_API_KEY');
    if (!openWeatherApiKey) {
      return new Response(JSON.stringify({ error: 'OPENWEATHERMAP_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find entries needing weather (last 30 days, max 50 per run)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: entries, error: fetchError } = await supabase
      .from('pain_entries')
      .select('id, user_id, selected_date, selected_time, latitude, longitude, timestamp_created, weather_status, weather_retry_count')
      .or('weather_status.eq.pending,and(weather_id.is.null,weather_status.eq.ok)')
      .gte('timestamp_created', thirtyDaysAgo)
      .lt('weather_retry_count', 5)
      .order('timestamp_created', { ascending: false })
      .limit(50);

    if (fetchError) {
      console.error('❌ Query error:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No entries need weather backfill' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔄 Processing ${entries.length} entries for weather backfill`);

    let successCount = 0;
    let failCount = 0;

    for (const entry of entries) {
      try {
        // Need coordinates - check entry or user profile
        let lat = entry.latitude;
        let lon = entry.longitude;

        if (!lat || !lon) {
          // Try user profile location
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('latitude, longitude')
            .eq('user_id', entry.user_id)
            .single();

          lat = profile?.latitude;
          lon = profile?.longitude;
        }

        if (!lat || !lon) {
          // No location available - mark as failed
          await supabase
            .from('pain_entries')
            .update({
              weather_status: 'failed',
              weather_error_code: 'NO_LOCATION',
              weather_error_at: new Date().toISOString(),
              weather_retry_count: (entry.weather_retry_count || 0) + 1,
            })
            .eq('id', entry.id);
          failCount++;
          continue;
        }

        // First check: is there already a snapshot for this date?
        const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
        if (entryDate) {
          const { data: existingLog } = await supabase
            .from('weather_logs')
            .select('id')
            .eq('user_id', entry.user_id)
            .eq('snapshot_date', entryDate)
            .limit(1);

          if (existingLog && existingLog.length > 0) {
            // Link existing snapshot
            await supabase
              .from('pain_entries')
              .update({
                weather_id: existingLog[0].id,
                weather_status: 'ok',
              })
              .eq('id', entry.id);
            successCount++;
            continue;
          }
        }

        // Fetch weather from OpenWeatherMap
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=metric`;
        const response = await fetch(currentUrl);

        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }

        const weatherData = await response.json();

        // Insert weather log
        const { data: insertedLog, error: insertError } = await supabase
          .from('weather_logs')
          .insert({
            user_id: entry.user_id,
            latitude: lat,
            longitude: lon,
            temperature_c: weatherData.main?.temp,
            pressure_mb: weatherData.main?.pressure,
            humidity: weatherData.main?.humidity,
            wind_kph: weatherData.wind?.speed ? weatherData.wind.speed * 3.6 : 0,
            condition_text: weatherData.weather?.[0]?.description,
            condition_icon: weatherData.weather?.[0]?.icon,
            snapshot_date: entryDate,
            pressure_change_24h: 0,
          })
          .select('id')
          .single();

        if (insertError || !insertedLog) {
          throw new Error(insertError?.message || 'Insert failed');
        }

        // Link to entry
        await supabase
          .from('pain_entries')
          .update({
            weather_id: insertedLog.id,
            weather_status: 'ok',
          })
          .eq('id', entry.id);

        successCount++;
      } catch (err: any) {
        console.error(`❌ Entry ${entry.id}:`, err.message);
        await supabase
          .from('pain_entries')
          .update({
            weather_status: 'failed',
            weather_error_code: err.message?.substring(0, 50) || 'UNKNOWN',
            weather_error_at: new Date().toISOString(),
            weather_retry_count: (entry.weather_retry_count || 0) + 1,
          })
          .eq('id', entry.id);
        failCount++;
      }
    }

    console.log(`✅ Backfill complete: ${successCount} success, ${failCount} failed`);

    return new Response(JSON.stringify({
      processed: entries.length,
      success: successCount,
      failed: failCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
