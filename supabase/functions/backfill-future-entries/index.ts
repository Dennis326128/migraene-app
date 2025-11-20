import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Cron Secret Check
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET') || 'dev-test-secret';
    
    if (cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🕘 Starting backfill for future entries that are now past');

    const now = new Date();

    // Finde alle Einträge ohne weather_id, deren Zeitpunkt nun in der Vergangenheit liegt
    const { data: entries, error: fetchError } = await supabase
      .from('pain_entries')
      .select('id, user_id, selected_date, selected_time, latitude, longitude')
      .is('weather_id', null)
      .not('selected_date', 'is', null)
      .lt('selected_date', now.toISOString().split('T')[0])
      .order('selected_date', { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error('Error fetching entries:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!entries || entries.length === 0) {
      console.log('✅ No past entries without weather data found');
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No entries to backfill'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${entries.length} past entries without weather data`);

    let success = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        const entryDateTime = new Date(`${entry.selected_date}T${entry.selected_time || '12:00'}:00`);
        
        // Doppel-Check: Nur Vergangenheit
        if (entryDateTime > now) {
          console.log(`⏭️ Skipping future entry ${entry.id}`);
          continue;
        }

        const atISO = entryDateTime.toISOString();
        
        // Koordinaten: 1. Aus Eintrag, 2. Aus Profil
        let lat = entry.latitude;
        let lon = entry.longitude;
        
        if (!lat || !lon) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('latitude, longitude')
            .eq('user_id', entry.user_id)
            .single();
          
          lat = profile?.latitude || 52.52;
          lon = profile?.longitude || 13.405;
        }

        // Wetter abrufen
        const { data: weatherData, error: weatherError } = await supabase.functions.invoke('fetch-weather-hybrid', {
          body: { 
            requested_at: atISO,
            lat,
            lon
          }
        });

        if (weatherError || !weatherData?.weather_id) {
          throw new Error('Weather fetch failed');
        }

        // Entry updaten
        const { error: updateError } = await supabase
          .from('pain_entries')
          .update({ weather_id: weatherData.weather_id })
          .eq('id', entry.id);

        if (updateError) throw updateError;

        success++;
        console.log(`✅ Updated entry ${entry.id} with weather ${weatherData.weather_id}`);

      } catch (error) {
        failed++;
        console.error(`❌ Failed for entry ${entry.id}:`, error);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    console.log(`🏁 Backfill complete: ${success} success, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      processed: entries.length,
      success_count: success,
      failed_count: failed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
