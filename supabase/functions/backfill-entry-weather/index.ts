import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Breakdown counters for structured response */
interface BackfillBreakdown {
  linked_existing_snapshot: number;
  fetched_new_weather: number;
  no_location: number;
  api_error: number;
  insert_error: number;
}

interface EntryLog {
  entryId: number;
  userId: string;
  date: string | null;
  time: string | null;
  action: string;
  reason: string;
  weatherLogId?: number;
  errorCode?: string;
}

/**
 * Backfill edge function: finds pain_entries needing weather data
 * (weather_status pending/failed/null OR weather_id null) in the last 30 days.
 *
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
    // Target: weather_status IN (null, 'pending', 'failed') OR weather_id IS NULL
    // AND retry_count < 5
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: entries, error: fetchError } = await supabase
      .from('pain_entries')
      .select('id, user_id, selected_date, selected_time, latitude, longitude, timestamp_created, weather_status, weather_retry_count')
      .or('weather_status.is.null,weather_status.eq.pending,weather_status.eq.failed,weather_id.is.null')
      .lt('weather_retry_count', 5)
      .gte('timestamp_created', thirtyDaysAgo)
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
    const breakdown: BackfillBreakdown = {
      linked_existing_snapshot: 0,
      fetched_new_weather: 0,
      no_location: 0,
      api_error: 0,
      insert_error: 0,
    };
    const entryLogs: EntryLog[] = [];

    for (const entry of entries) {
      const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
      const logEntry: EntryLog = {
        entryId: entry.id,
        userId: entry.user_id,
        date: entryDate || null,
        time: entry.selected_time || null,
        action: 'skip',
        reason: 'unknown',
      };

      try {
        // Need coordinates - check entry or user profile
        let lat = entry.latitude;
        let lon = entry.longitude;

        if (!lat || !lon) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('latitude, longitude')
            .eq('user_id', entry.user_id)
            .single();

          lat = profile?.latitude;
          lon = profile?.longitude;
        }

        if (!lat || !lon) {
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
          breakdown.no_location++;
          logEntry.action = 'failed';
          logEntry.reason = 'no_location';
          logEntry.errorCode = 'NO_LOCATION';
          entryLogs.push(logEntry);
          continue;
        }

        // Check for existing snapshots on the same date — pick NEAREST by time
        if (entryDate) {
          const { data: existingLogs } = await supabase
            .from('weather_logs')
            .select('id, requested_at, created_at')
            .eq('user_id', entry.user_id)
            .eq('snapshot_date', entryDate)
            .order('requested_at', { ascending: true })
            .limit(20);

          if (existingLogs && existingLogs.length > 0) {
            // Pick nearest to entry time
            const entryTimeMs = computeEntryTimeMs(entryDate, entry.selected_time);
            const nearest = pickNearestSnapshot(existingLogs, entryTimeMs);

            await supabase
              .from('pain_entries')
              .update({
                weather_id: nearest.id,
                weather_status: 'ok',
              })
              .eq('id', entry.id);
            successCount++;
            breakdown.linked_existing_snapshot++;
            logEntry.action = 'linked_existing';
            logEntry.reason = 'nearest_snapshot_by_time';
            logEntry.weatherLogId = nearest.id;
            entryLogs.push(logEntry);
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

        // Insert weather log — pressure_change_24h = NULL (never fabricate 0)
        const { data: insertedLog, error: insertError } = await supabase
          .from('weather_logs')
          .insert({
            user_id: entry.user_id,
            latitude: lat,
            longitude: lon,
            temperature_c: weatherData.main?.temp ?? null,
            pressure_mb: weatherData.main?.pressure ?? null,
            humidity: weatherData.main?.humidity ?? null,
            wind_kph: weatherData.wind?.speed ? weatherData.wind.speed * 3.6 : null,
            condition_text: weatherData.weather?.[0]?.description ?? null,
            condition_icon: weatherData.weather?.[0]?.icon ?? null,
            snapshot_date: entryDate,
            pressure_change_24h: null, // Never fabricate — must be calculated properly
          })
          .select('id')
          .single();

        if (insertError || !insertedLog) {
          breakdown.insert_error++;
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
        breakdown.fetched_new_weather++;
        logEntry.action = 'fetched_new';
        logEntry.reason = 'api_fetch';
        logEntry.weatherLogId = insertedLog.id;
        entryLogs.push(logEntry);
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
        breakdown.api_error++;
        logEntry.action = 'failed';
        logEntry.reason = 'api_error';
        logEntry.errorCode = err.message?.substring(0, 50) || 'UNKNOWN';
        entryLogs.push(logEntry);
      }
    }

    // Structured summary log
    const summary = {
      processed: entries.length,
      success: successCount,
      failed: failCount,
      breakdown,
      sample: entryLogs.slice(0, 5),
    };
    console.log('✅ Backfill complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
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

/**
 * Compute entry target time in epoch ms for nearest-snapshot matching.
 * Falls back to noon UTC if no time provided.
 */
function computeEntryTimeMs(dateISO: string, timeStr: string | null): number {
  if (!timeStr) {
    return new Date(`${dateISO}T12:00:00Z`).getTime();
  }
  // Normalize HH:MM or HH:MM:SS
  const parts = timeStr.split(':');
  const hh = parts[0] || '12';
  const mm = parts[1] || '00';
  return new Date(`${dateISO}T${hh}:${mm}:00Z`).getTime();
}

/**
 * Pick the snapshot with requested_at (or created_at) nearest to targetMs.
 */
function pickNearestSnapshot(
  logs: Array<{ id: number; requested_at: string | null; created_at: string | null }>,
  targetMs: number
): { id: number } {
  let best = logs[0];
  let bestDiff = Infinity;

  for (const log of logs) {
    const ts = log.requested_at || log.created_at;
    if (!ts) continue;
    const diff = Math.abs(new Date(ts).getTime() - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = log;
    }
  }

  return best;
}
