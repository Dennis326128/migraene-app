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

    // Create both regular and service role clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    console.log('🔐 Auth header present, length:', authHeader.length);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      throw new Error('Invalid authentication');
    }

    const userId = user.id;
    console.log('👤 Processing clean import for user:', userId);
    console.log('📧 User email:', user.email);

    // Get user's fallback coordinates from profile (for entries without GPS)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('latitude, longitude')
      .eq('user_id', userId)
      .single();

    const userLat = profile?.latitude ? Number(profile.latitude) : null;
    const userLon = profile?.longitude ? Number(profile.longitude) : null;
    console.log(`📍 User fallback coordinates: ${userLat}, ${userLon}`);

    // DEBUG: First count ALL entries for this user
    console.log('🔍 DEBUG: Checking user entries...');
    const { count: totalEntries, error: countError } = await serviceSupabase
      .from('pain_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      console.error('❌ Count error:', countError);
    } else {
      console.log(`📊 Total entries for user: ${totalEntries}`);
    }

    // DEBUG: Count entries with weather_id
    const { count: withWeather, error: withWeatherError } = await serviceSupabase
      .from('pain_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('weather_id', 'is', null);
    
    if (withWeatherError) {
      console.error('❌ With weather count error:', withWeatherError);
    } else {
      console.log(`🌤️ Entries with weather: ${withWeather}`);
    }

    // Get ALL entries without weather_id using service role for better access
    console.log('🔍 Querying entries without weather_id...');
    const { data: entries, error: entriesError } = await serviceSupabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, latitude, longitude, weather_id')
      .eq('user_id', userId)
      .is('weather_id', null)
      .order('timestamp_created', { ascending: true });

    console.log('📋 Query result:', {
      entriesError: entriesError?.message,
      entriesCount: entries?.length,
      firstFewEntries: entries?.slice(0, 3)?.map(e => ({
        id: e.id,
        weather_id: e.weather_id,
        hasCoords: !!(e.latitude && e.longitude)
      }))
    });

    if (entriesError) {
      throw new Error(`Failed to fetch entries: ${entriesError.message}`);
    }

    if (!entries?.length) {
      console.log(`✅ No entries without weather data found (checked ${totalEntries} total entries, ${withWeather} already have weather)`);
      return new Response(JSON.stringify({
        success: true,
        message: 'No entries need weather import',
        total: totalEntries || 0,
        withWeather: withWeather || 0,
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

    // Process entries in smaller batches with better error handling
    const batchSize = 3; // Increase batch size slightly for better performance
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)} (${batch.length} entries)`);

      for (const entry of batch) {
        try {
          // Check if entry has both coordinates types (GPS vs fallback)
          const hasGPS = entry.latitude && entry.longitude;
          const hasUserFallback = userLat && userLon;
          // Determine the timestamp to use (prioritize selected date/time)
          let timestamp: string;
          if (entry.selected_date && entry.selected_time) {
            // User entered Berlin local time - convert to UTC for weather API
            let timeStr = entry.selected_time;
            if (timeStr.length === 5) {
              timeStr += ':00'; // Add seconds if missing
            }
            
            try {
              // Create Berlin timezone datetime - assume user entered Berlin local time
              const berlinDateTime = `${entry.selected_date}T${timeStr}`;
              
              // Simple approach: create date and manually adjust for Berlin timezone
              const date = new Date(berlinDateTime + 'Z'); // Treat as UTC first
              
              // Berlin is UTC+1 in winter, UTC+2 in summer
              // For weather correlation, 1-2 hours difference is usually acceptable
              // We'll use a fixed UTC+1 offset for simplicity
              date.setHours(date.getHours() - 1); // Adjust UTC+1 to UTC
              
              timestamp = date.toISOString();
              console.log(`🕐 Berlin time ${berlinDateTime} → UTC: ${timestamp}`);
              
            } catch (error) {
              console.warn(`⚠️ Date parsing failed for entry ${entry.id}, using timestamp_created`);
              timestamp = new Date(entry.timestamp_created).toISOString();
            }
          } else {
            // Fallback to creation timestamp
            timestamp = new Date(entry.timestamp_created).toISOString();
          }

          // Determine coordinates to use: entry GPS coordinates or fallback to user profile
          let lat: number, lon: number;
          if (hasGPS) {
            lat = Number(entry.latitude);
            lon = Number(entry.longitude);
            console.log(`🎯 Using entry GPS coordinates: ${lat}, ${lon}`);
          } else if (hasUserFallback) {
            lat = userLat;
            lon = userLon;
            console.log(`📍 Using fallback user coordinates: ${lat}, ${lon}`);
          } else {
            throw new Error(`No coordinates available for entry ${entry.id} - neither GPS nor user profile coordinates found`);
          }

          console.log(`🌤️ Fetching weather for entry ${entry.id} at ${timestamp} (${lat}, ${lon})`);

          // Call fetch-weather-hybrid function with service role for better reliability
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
            // Update the entry with weather_id using service role
            const { error: updateError } = await serviceSupabase
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
            const errorMsg = `No weather_id returned for entry ${entry.id} - response: ${JSON.stringify(weatherResult)}`;
            errors.push(errorMsg);
            console.warn(`⚠️ ${errorMsg}`);
          }

          // Longer delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));

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