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

    // Privacy: Uses Open-Meteo only (no API key, EU-friendly).

    // Find entries needing weather (last 30 days, max 50 per run)
    // Target: weather_status IN (null, 'pending', 'failed') OR weather_id IS NULL
    // AND retry_count < 5
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: entries, error: fetchError } = await supabase
      .from('pain_entries')
      .select('id, user_id, selected_date, selected_time, latitude, longitude, timestamp_created, weather_status, weather_retry_count')
      .or('weather_status.is.null,weather_status.eq.pending,weather_status.eq.failed,weather_id.is.null')
      .or('weather_retry_count.is.null,weather_retry_count.lt.5')
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

        // Fetch weather from Open-Meteo (privacy-friendly, EU-based, no API key)
        // Use hourly archive for historical accuracy; falls back to current API for today.
        let temperature_c: number | null = null;
        let pressure_mb: number | null = null;
        let humidity: number | null = null;
        let wind_kph: number | null = null;
        let condition_text: string | null = null;

        try {
          const today = new Date().toISOString().split('T')[0];
          const isToday = entryDate === today;

          if (!isToday && entryDate) {
            // Hourly archive for past entries
            const hour = entry.selected_time
              ? parseInt(String(entry.selected_time).split(':')[0] || '12', 10)
              : 12;
            const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${entryDate}&end_date=${entryDate}&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&timezone=auto`;
            const r = await fetch(archiveUrl);
            if (!r.ok) throw new Error(`Open-Meteo archive ${r.status}`);
            const d = await r.json();
            const times: string[] = d?.hourly?.time ?? [];
            if (times.length) {
              let bestIdx = 0;
              let bestDiff = Infinity;
              for (let i = 0; i < times.length; i++) {
                const h = new Date(times[i]).getHours();
                const diff = Math.abs(h - hour);
                if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
              }
              temperature_c = d.hourly.temperature_2m?.[bestIdx] ?? null;
              pressure_mb = d.hourly.surface_pressure?.[bestIdx] ?? null;
              humidity = d.hourly.relative_humidity_2m?.[bestIdx] ?? null;
              const ws = d.hourly.wind_speed_10m?.[bestIdx];
              wind_kph = typeof ws === 'number' ? ws : null; // Open-Meteo default unit is km/h
              condition_text = 'Historical (Open-Meteo)';
            }
          } else {
            // Current weather for today
            const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&timezone=auto`;
            const r = await fetch(currentUrl);
            if (!r.ok) throw new Error(`Open-Meteo current ${r.status}`);
            const d = await r.json();
            const c = d?.current;
            if (c) {
              temperature_c = c.temperature_2m ?? null;
              pressure_mb = c.surface_pressure ?? null;
              humidity = c.relative_humidity_2m ?? null;
              wind_kph = typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null; // Open-Meteo default unit is km/h
              condition_text = 'Current (Open-Meteo)';
            }
          }
        } catch (e) {
          throw new Error(`Open-Meteo error: ${(e as Error).message}`);
        }

        if (temperature_c === null && pressure_mb === null) {
          throw new Error('No weather data');
        }

        // Insert weather log — pressure_change_24h = NULL (never fabricate 0)
        const { data: insertedLog, error: insertError } = await supabase
          .from('weather_logs')
          .insert({
            user_id: entry.user_id,
            latitude: lat,
            longitude: lon,
            temperature_c,
            pressure_mb,
            humidity,
            wind_kph,
            condition_text,
            condition_icon: null,
            snapshot_date: entryDate,
            pressure_change_24h: null,
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
 * Uses Europe/Berlin timezone for DST-safe conversion.
 * Falls back to noon Berlin time if no time provided.
 */
function computeEntryTimeMs(dateISO: string, timeStr: string | null): number {
  // Parse time
  const hh = timeStr ? parseInt(timeStr.split(':')[0] || '12', 10) : 12;
  const mm = timeStr ? parseInt(timeStr.split(':')[1] || '0', 10) : 0;

  // Build local time string and compute UTC offset via Intl
  const isoStr = `${dateISO}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  const naive = new Date(isoStr + 'Z');
  if (isNaN(naive.getTime())) return new Date(`${dateISO}T12:00:00Z`).getTime();

  // Get Berlin offset at this moment
  const utcFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const tzFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  const getPart = (parts: Intl.DateTimeFormatPart[], type: string) => {
    let val = parts.find(p => p.type === type)?.value ?? '0';
    if (type === 'hour' && val === '24') val = '0';
    return parseInt(val, 10);
  };
  const toMs = (parts: Intl.DateTimeFormatPart[]) =>
    Date.UTC(getPart(parts, 'year'), getPart(parts, 'month') - 1, getPart(parts, 'day'),
             getPart(parts, 'hour'), getPart(parts, 'minute'), getPart(parts, 'second'));

  const utcMs = toMs(utcFmt.formatToParts(naive));
  const tzMs = toMs(tzFmt.formatToParts(naive));
  const offsetMs = tzMs - utcMs;

  // UTC = localTime - offset
  return naive.getTime() - offsetMs;
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
