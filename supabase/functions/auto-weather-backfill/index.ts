import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  console.log('🔄 Auto Weather Backfill function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret for automated calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET') || 'dev-test-secret';
    
    if (cronSecret !== expectedSecret) {
      console.error('❌ Invalid cron secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get OpenWeatherMap API key
    const openWeatherApiKey = Deno.env.get('OPENWEATHERMAP_API_KEY');
    if (!openWeatherApiKey) {
      console.error('❌ OpenWeatherMap API key not configured');
      return new Response(JSON.stringify({ error: 'Weather service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalProcessed = 0;
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Step 1: Backfill missing weather data for pain_entries (legacy system)
    console.log('📋 Processing pain_entries without weather data...');
    
    const { data: painEntries, error: painEntriesError } = await supabase
      .from('pain_entries')
      .select(`
        id, user_id, timestamp_created, selected_date, selected_time, weather_id,
        user_profiles!inner(latitude, longitude)
      `)
      .is('weather_id', null)
      .not('user_profiles.latitude', 'is', null)
      .not('user_profiles.longitude', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(50); // Process in batches to avoid timeout

    if (painEntriesError) {
      console.error('❌ Error fetching pain entries:', painEntriesError);
      errors.push(`Pain entries fetch error: ${painEntriesError.message}`);
    } else if (painEntries) {
      totalProcessed += painEntries.length;
      
      for (const entry of painEntries) {
        try {
          const profile = Array.isArray(entry.user_profiles) ? entry.user_profiles[0] : entry.user_profiles;
          if (!profile || !profile.latitude || !profile.longitude) continue;

          // Determine the target timestamp
          let targetTimestamp: string;
          if (entry.selected_date && entry.selected_time) {
            targetTimestamp = new Date(`${entry.selected_date}T${entry.selected_time}:00`).toISOString();
          } else {
            targetTimestamp = new Date(entry.timestamp_created).toISOString();
          }

          const targetDate = new Date(targetTimestamp);
          const dateStr = targetDate.toISOString().split('T')[0];

          // Check if weather data already exists for this date/location
          const { data: existingWeather } = await supabase
            .from('weather_logs')
            .select('id')
            .eq('user_id', entry.user_id)
            .eq('latitude', profile.latitude)
            .eq('longitude', profile.longitude)
            .eq('snapshot_date', dateStr)
            .limit(1);

          let weatherId: number;

          if (existingWeather && existingWeather.length > 0) {
            // Use existing weather data
            weatherId = existingWeather[0].id;
            console.log(`♻️ Using existing weather data for entry ${entry.id}`);
          } else {
            // Fetch new weather data
            const weatherResult = await fetchWeatherData(
              profile.latitude,
              profile.longitude,
              targetTimestamp,
              openWeatherApiKey,
              supabase,
              entry.user_id
            );

            if (!weatherResult) {
              failCount++;
              errors.push(`Failed to fetch weather for entry ${entry.id}`);
              continue;
            }

            weatherId = weatherResult;
          }

          // Update the entry with weather_id
          const { error: updateError } = await supabase
            .from('pain_entries')
            .update({ weather_id: weatherId })
            .eq('id', entry.id);

          if (updateError) {
            failCount++;
            errors.push(`Failed to update entry ${entry.id}: ${updateError.message}`);
          } else {
            successCount++;
            console.log(`✅ Updated pain entry ${entry.id} with weather ${weatherId}`);
          }

          // Rate limiting - wait 100ms between requests
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error: any) {
          failCount++;
          errors.push(`Error processing pain entry ${entry.id}: ${error?.message || 'Unknown error'}`);
          console.error(`❌ Error processing pain entry ${entry.id}:`, error);
        }
      }
    }

    // Step 2: Backfill missing weather data for events (new system)
    console.log('📅 Processing events without weather data...');
    
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`
        id, user_id, started_at, weather_id,
        user_profiles!inner(latitude, longitude)
      `)
      .is('weather_id', null)
      .not('user_profiles.latitude', 'is', null)
      .not('user_profiles.longitude', 'is', null)
      .order('started_at', { ascending: false })
      .limit(50); // Process in batches

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError);
      errors.push(`Events fetch error: ${eventsError.message}`);
    } else if (events) {
      totalProcessed += events.length;
      
      for (const event of events) {
        try {
          const profile = Array.isArray(event.user_profiles) ? event.user_profiles[0] : event.user_profiles;
          if (!profile || !profile.latitude || !profile.longitude) continue;

          const targetTimestamp = new Date(event.started_at).toISOString();
          const targetDate = new Date(targetTimestamp);
          const dateStr = targetDate.toISOString().split('T')[0];

          // Check if weather data already exists
          const { data: existingWeather } = await supabase
            .from('weather_logs')
            .select('id')
            .eq('user_id', event.user_id)
            .eq('latitude', profile.latitude)
            .eq('longitude', profile.longitude)
            .eq('snapshot_date', dateStr)
            .limit(1);

          let weatherId: number;

          if (existingWeather && existingWeather.length > 0) {
            weatherId = existingWeather[0].id;
            console.log(`♻️ Using existing weather data for event ${event.id}`);
          } else {
            const weatherResult = await fetchWeatherData(
              profile.latitude,
              profile.longitude,
              targetTimestamp,
              openWeatherApiKey,
              supabase,
              event.user_id
            );

            if (!weatherResult) {
              failCount++;
              errors.push(`Failed to fetch weather for event ${event.id}`);
              continue;
            }

            weatherId = weatherResult;
          }

          // Update the event with weather_id
          const { error: updateError } = await supabase
            .from('events')
            .update({ weather_id: weatherId })
            .eq('id', event.id);

          if (updateError) {
            failCount++;
            errors.push(`Failed to update event ${event.id}: ${updateError.message}`);
          } else {
            successCount++;
            console.log(`✅ Updated event ${event.id} with weather ${weatherId}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error: any) {
          failCount++;
          errors.push(`Error processing event ${event.id}: ${error?.message || 'Unknown error'}`);
          console.error(`❌ Error processing event ${event.id}:`, error);
        }
      }
    }

    const result = {
      success: true,
      totalProcessed,
      successCount,
      failCount,
      errors: errors.slice(0, 10), // Limit error messages
      message: `Processed ${totalProcessed} entries. ${successCount} successful, ${failCount} failed.`
    };

    console.log('🎉 Auto backfill completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Unexpected error in auto backfill:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error',
      message: error?.message || 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to fetch weather data from OpenWeatherMap
async function fetchWeatherData(
  lat: number, 
  lon: number, 
  timestamp: string, 
  apiKey: string, 
  supabase: any, 
  userId: string
): Promise<number | null> {
  try {
    const targetDate = new Date(timestamp);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    const isHistorical = daysDiff > 5;
    const dateStr = targetDate.toISOString().split('T')[0];

    let weatherData;

    if (isHistorical) {
      // Use historical API
      const unixTimestamp = Math.floor(targetDate.getTime() / 1000);
      const historyUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${unixTimestamp}&appid=${apiKey}&units=metric`;
      
      const response = await fetch(historyUrl);
      if (!response.ok) {
        throw new Error(`OpenWeatherMap Historical API error: ${response.status}`);
      }
      
      const data = await response.json();
      const hourlyData = data.data[0];
      
      weatherData = {
        temperature_c: hourlyData.temp,
        pressure_mb: hourlyData.pressure,
        humidity: hourlyData.humidity,
        wind_kph: hourlyData.wind_speed * 3.6,
        condition_text: hourlyData.weather[0].description,
        condition_icon: hourlyData.weather[0].icon,
      };
    } else {
      // Use current weather API
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
      
      const response = await fetch(currentUrl);
      if (!response.ok) {
        throw new Error(`OpenWeatherMap Current API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      weatherData = {
        temperature_c: data.main.temp,
        pressure_mb: data.main.pressure,
        humidity: data.main.humidity,
        wind_kph: data.wind?.speed ? data.wind.speed * 3.6 : 0,
        condition_text: data.weather[0].description,
        condition_icon: data.weather[0].icon,
      };
    }

    // Insert weather log
    const { data: insertedLog, error: insertError } = await supabase
      .from('weather_logs')
      .insert({
        user_id: userId,
        latitude: lat,
        longitude: lon,
        temperature_c: weatherData.temperature_c,
        pressure_mb: weatherData.pressure_mb,
        humidity: weatherData.humidity,
        wind_kph: weatherData.wind_kph,
        condition_text: weatherData.condition_text,
        condition_icon: weatherData.condition_icon,
        pressure_change_24h: 0, // Simplified
        snapshot_date: dateStr,
        created_at: targetDate.toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Database insert error: ${insertError.message}`);
    }

    return insertedLog.id;

  } catch (error) {
    console.error('❌ fetchWeatherData error:', error);
    return null;
  }
}