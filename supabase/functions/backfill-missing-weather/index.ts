import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth-Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // User ID aus JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔄 Starting weather backfill for user ${user.id}`);

    // Alle Einträge ohne weather_id holen, die in der Vergangenheit liegen
    const now = new Date();
    const { data: entries, error: fetchError } = await supabase
      .from('pain_entries')
      .select('id, selected_date, selected_time, latitude, longitude')
      .eq('user_id', user.id)
      .is('weather_id', null)
      .not('selected_date', 'is', null)
      .order('selected_date', { ascending: false });

    if (fetchError) {
      console.error('Error fetching entries:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'Keine Einträge ohne Wetterdaten gefunden',
        processed: 0,
        success: 0,
        failed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${entries.length} entries without weather data`);

    let success = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const entry of entries) {
      try {
        // Prüfen ob in der Vergangenheit
        const entryDateTime = new Date(`${entry.selected_date}T${entry.selected_time || '12:00'}:00`);
        
        if (entryDateTime > now) {
          console.log(`⏭️ Skipping future entry: ${entry.id}`);
          continue;
        }

        // Wetter-Daten abrufen
        const atISO = entryDateTime.toISOString();
        const lat = entry.latitude || 52.52; // Berlin Fallback
        const lon = entry.longitude || 13.405;

        // Fetch-Weather-Hybrid aufrufen
        const weatherResponse = await supabase.functions.invoke('fetch-weather-hybrid', {
          body: { 
            requested_at: atISO,
            lat,
            lon
          }
        });

        if (weatherResponse.error) {
          throw weatherResponse.error;
        }

        const weatherId = weatherResponse.data?.weather_id;
        
        if (weatherId) {
          // Entry updaten
          const { error: updateError } = await supabase
            .from('pain_entries')
            .update({ weather_id: weatherId })
            .eq('id', entry.id);

          if (updateError) throw updateError;

          success++;
          console.log(`✅ Weather added for entry ${entry.id}`);
        } else {
          throw new Error('No weather_id returned');
        }

      } catch (error) {
        console.error(`❌ Failed for entry ${entry.id}:`, error);
        failed++;
        errors.push({
          entry_id: entry.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`✅ Backfill complete: ${success} success, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      processed: entries.length,
      success_count: success,
      failed_count: failed,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
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
