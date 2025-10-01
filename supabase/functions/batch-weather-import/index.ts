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
    console.log('🚀 Batch weather import started');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const authToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(authToken);

    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication failed',
        details: authError?.message
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;
    console.log('👤 Processing batch import for user:', userId);

    // Get user's fallback coordinates
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .maybeSingle();

    const userLat = profile?.latitude ? Number(profile.latitude) : null;
    const userLon = profile?.longitude ? Number(profile.longitude) : null;

    // Get entries without weather_id
    const { data: entries, error: entriesError } = await serviceSupabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, latitude, longitude, weather_id')
      .eq('user_id', userId)
      .is('weather_id', null)
      .order('timestamp_created', { ascending: true });

    if (entriesError) {
      throw new Error(`Failed to fetch entries: ${entriesError.message}`);
    }

    if (!entries?.length) {
      console.log('✅ No entries need weather import');
      return new Response(JSON.stringify({
        success: true,
        message: 'No entries need weather import',
        totalProcessed: 0,
        successCount: 0,
        failCount: 0,
        progress: 100
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Found ${entries.length} entries without weather data`);

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    // Intelligent batch sizing: 10 for small datasets, 20 for larger
    const batchSize = entries.length < 50 ? 10 : 20;
    const totalBatches = Math.ceil(entries.length / batchSize);

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      const progress = Math.round((i / entries.length) * 100);
      
      console.log(`🔄 Processing batch ${currentBatch}/${totalBatches} (${batch.length} entries) - ${progress}% complete`);

      // Process batch entries in parallel
      const batchPromises = batch.map(async (entry) => {
        try {
          const hasGPS = entry.latitude && entry.longitude;
          const hasUserFallback = userLat && userLon;

          // Determine timestamp
          let timestamp: string;
          if (entry.selected_date && entry.selected_time) {
            let timeStr = entry.selected_time;
            if (timeStr.length === 5) {
              timeStr += ':00';
            }
            
            try {
              const berlinDateTime = `${entry.selected_date}T${timeStr}`;
              const date = new Date(berlinDateTime + 'Z');
              date.setHours(date.getHours() - 1); // UTC+1 to UTC
              timestamp = date.toISOString();
            } catch (error) {
              timestamp = new Date(entry.timestamp_created).toISOString();
            }
          } else {
            timestamp = new Date(entry.timestamp_created).toISOString();
          }

          // Determine coordinates
          let lat: number, lon: number;
          if (hasGPS) {
            lat = Number(entry.latitude);
            lon = Number(entry.longitude);
          } else if (hasUserFallback) {
            lat = userLat;
            lon = userLon;
          } else {
            throw new Error(`No coordinates available for entry ${entry.id}`);
          }

          // Call fetch-weather-hybrid
          const { data: weatherResult, error: weatherError } = await serviceSupabase.functions.invoke('fetch-weather-hybrid', {
            body: {
              lat,
              lon,
              at: timestamp,
              userId: userId
            }
          });

          if (weatherError) {
            throw new Error(`Weather fetch failed: ${weatherError.message}`);
          }

          if (weatherResult?.weather_id) {
            // Update entry with weather_id
            const { error: updateError } = await serviceSupabase
              .from('pain_entries')
              .update({ weather_id: weatherResult.weather_id })
              .eq('id', entry.id);

            if (updateError) {
              throw new Error(`Failed to update entry: ${updateError.message}`);
            }

            return { success: true, entryId: entry.id, weatherId: weatherResult.weather_id };
          } else {
            throw new Error(`No weather_id returned for entry ${entry.id}`);
          }

        } catch (error) {
          const errorMsg = `Entry ${entry.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          return { success: false, entryId: entry.id, error: errorMsg };
        }
      });

      // Wait for all promises in the batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successful++;
          console.log(`✅ Entry ${result.entryId} updated with weather_id ${result.weatherId}`);
        } else {
          failed++;
          errors.push(result.error);
          console.error(`❌ ${result.error}`);
        }
      });

      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const result = {
      success: true,
      message: `Processed ${entries.length} entries. ${successful} successful, ${failed} failed.`,
      totalProcessed: entries.length,
      successCount: successful,
      failCount: failed,
      progress: 100,
      errors: errors.slice(0, 10),
      speed: Math.round(entries.length / ((Date.now() - Date.now()) / 1000))
    };

    console.log('🎉 Batch import completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Batch import error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Batch weather import failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
