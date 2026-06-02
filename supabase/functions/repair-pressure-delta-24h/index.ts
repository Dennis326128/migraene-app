// Repair pressure_change_24h for existing weather_logs.
// One-shot / cron-friendly. Idempotent: only processes rows where
// pressure_mb IS NOT NULL AND pressure_change_24h IS NULL.
//
// Auth: x-cron-secret header (same convention as auto-weather-backfill).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;
const RATE_LIMIT_MS = 200;

async function fetchPressureDelta24hFromArchive(
  lat: number,
  lon: number,
  atIso: string,
): Promise<number | null> {
  try {
    const at = new Date(atIso);
    const prev = new Date(at.getTime() - 24 * 60 * 60 * 1000);
    const startDate = prev.toISOString().split('T')[0];
    const endDate = at.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=surface_pressure&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] | undefined = data?.hourly?.time;
    const pressures: (number | null)[] | undefined = data?.hourly?.surface_pressure;
    if (!Array.isArray(times) || !Array.isArray(pressures) || times.length === 0) return null;

    const pickClosest = (targetMs: number): number | null => {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const t = new Date(times[i] + 'Z').getTime();
        const diff = Math.abs(t - targetMs);
        if (diff < bestDiff && pressures[i] != null) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) return null;
      if (bestDiff > 3 * 60 * 60 * 1000) return null;
      return pressures[bestIdx] as number;
    };

    const pNow = pickClosest(at.getTime());
    const pPrev = pickClosest(prev.getTime());
    if (pNow == null || pPrev == null) return null;
    return Math.round(pNow - pPrev);
  } catch (_err) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret');
    if (!expectedSecret || provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let batch = DEFAULT_BATCH;
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
      if (body && typeof body.batch === 'number' && body.batch > 0) {
        batch = Math.min(MAX_BATCH, Math.floor(body.batch));
      }
    } catch (_) {/* ignore */}

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: rows, error: selErr } = await supabase
      .from('weather_logs')
      .select('id, latitude, longitude, requested_at, created_at, pressure_mb, pressure_change_24h')
      .not('pressure_mb', 'is', null)
      .is('pressure_change_24h', null)
      .order('id', { ascending: false })
      .limit(batch);

    if (selErr) {
      console.error('❌ Select error:', selErr);
      return new Response(JSON.stringify({ error: 'select_failed', message: selErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, updated: 0, message: 'Nothing to repair.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;
    let archiveMiss = 0;
    let updateErr = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      const at = (row.requested_at ?? row.created_at) as string | null;
      if (!at || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const delta = await fetchPressureDelta24hFromArchive(lat, lon, at);
      if (delta == null) {
        archiveMiss++;
      } else {
        const { error: updErr } = await supabase
          .from('weather_logs')
          .update({ pressure_change_24h: delta })
          .eq('id', row.id);
        if (updErr) {
          updateErr++;
          if (errors.length < 5) errors.push(`#${row.id}: ${updErr.message}`);
        } else {
          updated++;
        }
      }
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    const result = {
      success: true,
      processed: rows.length,
      updated,
      archive_miss: archiveMiss,
      update_errors: updateErr,
      errors,
    };
    console.log('🔧 repair-pressure-delta-24h summary:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ repair-pressure-delta-24h error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
