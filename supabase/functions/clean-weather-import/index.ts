import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧹 Clean weather import started');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const userId = user.id;
    console.log('👤 Processing clean import for user:', userId);

    // Get user's current coordinates from profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile?.latitude || !profile?.longitude) {
      throw new Error('User coordinates not found in profile');
    }

    const userLat = Number(profile.latitude);
    const userLon = Number(profile.longitude);
    console.log(`📍 Using user coordinates: ${userLat}, ${userLon}`);

    // Get ALL entries without weather_id
    const { data: entries, error: entriesError } = await supabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time')
      .eq('user_id', userId)
      .is('weather_id', null)
      .order('timestamp_created', { ascending: true });

    if (entriesError) {
      throw new Error(`Failed to fetch entries: ${entriesError.message}`);
    }

    if (!entries?.length) {
      console.log('✅ No entries without weather data found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No entries need weather import',
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Found ${entries.length} entries without weather data`);

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process entries in batches of 1 for testing
    const batchSize = 1;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)}`);

      for (const entry of batch) {
        try {
          // Determine the timestamp to use
          let timestamp: string;
          if (entry.selected_date && entry.selected_time) {
            // Build ISO string from selected_date and selected_time
            let timeStr = entry.selected_time;
            if (timeStr.length === 5) {
              timeStr += ':00'; // Add seconds if missing
            }
            const localDateTime = `${entry.selected_date}T${timeStr}`;
            const date = new Date(localDateTime);
            
            if (isNaN(date.getTime())) {
              console.warn(`⚠️ Invalid date for entry ${entry.id}, using timestamp_created`);
              timestamp = new Date(entry.timestamp_created).toISOString();
            } else {
              // Convert to UTC properly
              const offset = date.getTimezoneOffset();
              date.setMinutes(date.getMinutes() - offset);
              timestamp = date.toISOString();
            }
          } else {
            timestamp = new Date(entry.timestamp_created).toISOString();
          }

          console.log(`🌤️ Fetching weather for entry ${entry.id} at ${timestamp}`);

          // Call fetch-weather-hybrid function with service role
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          const { data: weatherResult, error: weatherError } = await supabase.functions.invoke('fetch-weather-hybrid', {
            body: {
              lat: userLat,
              lon: userLon,
              at: timestamp,
              userId: userId
            },
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`
            }
          });

          if (weatherError) {
            throw new Error(`Weather fetch failed: ${weatherError.message}`);
          }

          if (weatherResult?.weather_id) {
            // Update the entry with weather_id
            const { error: updateError } = await supabase
              .from('pain_entries')
              .update({ weather_id: weatherResult.weather_id })
              .eq('id', entry.id);

            if (updateError) {
              throw new Error(`Failed to update entry: ${updateError.message}`);
            }

            successful++;
            console.log(`✅ Entry ${entry.id} updated with weather_id ${weatherResult.weather_id}`);
          } else {
            failed++;
            const errorMsg = `No weather_id returned for entry ${entry.id}`;
            errors.push(errorMsg);
            console.warn(`⚠️ ${errorMsg}`);
          }

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          failed++;
          const errorMsg = `Entry ${entry.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      // Pause between batches
      if (i + batchSize < entries.length) {
        console.log('⏸️ Pausing between batches...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const result = {
      success: true,
      message: `Processed ${entries.length} entries. ${successful} successful, ${failed} failed.`,
      total: entries.length,
      processed: entries.length,
      successful,
      failed,
      errors: errors.slice(0, 10) // Limit error list
    };

    console.log('🎉 Clean import completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Clean import error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Clean weather import failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});