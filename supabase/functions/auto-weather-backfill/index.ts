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

    // No need for OpenWeatherMap API key - we use the free fetch-weather-hybrid function

    let totalProcessed = 0;
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Step 1: Backfill missing weather data for pain_entries (legacy system)
    console.log('📋 Processing pain_entries without weather data...');
    
    // First, get users with coordinates
    const { data: usersWithCoords, error: coordsError } = await supabase
      .from('user_profiles')
      .select('user_id, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (coordsError) {
      console.error('❌ Error fetching user coordinates:', coordsError);
      errors.push(`User coordinates fetch error: ${coordsError.message}`);
    } else if (usersWithCoords && usersWithCoords.length > 0) {
      const userIds = usersWithCoords.map(u => u.user_id);
      
      // Then get pain entries for those users
      const { data: painEntries, error: painEntriesError } = await supabase
        .from('pain_entries')
        .select('id, user_id, timestamp_created, selected_date, selected_time')
        .is('weather_id', null)
        .in('user_id', userIds)
        .order('timestamp_created', { ascending: false })
        .limit(50); // Process in batches to avoid timeout

      if (painEntriesError) {
        console.error('❌ Error fetching pain entries:', painEntriesError);
        errors.push(`Pain entries fetch error: ${painEntriesError.message}`);
      } else if (painEntries && painEntries.length > 0) {
        totalProcessed += painEntries.length;
        
        for (const entry of painEntries) {
          try {
            // Find coordinates for this user
            const userCoords = usersWithCoords.find(u => u.user_id === entry.user_id);
            
            if (!userCoords?.latitude || !userCoords?.longitude) {
              console.log(`⚠️ No coordinates for pain entry ${entry.id}, user ${entry.user_id}`);
              failCount++;
              continue;
            }

            // Determine the target timestamp with safe date parsing
            let targetTimestamp: string;
            try {
              if (entry.selected_date && entry.selected_time) {
                // Validate date components
                const dateStr = String(entry.selected_date);
                const timeStr = String(entry.selected_time);
                
                // Try parsing the date combination
                const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
                
                // Check if the date is valid
                if (isNaN(combinedDateTime.getTime())) {
                  console.log(`⚠️ Invalid date/time combination for entry ${entry.id}: ${dateStr}T${timeStr}, falling back to timestamp_created`);
                  targetTimestamp = new Date(entry.timestamp_created).toISOString();
                } else {
                  targetTimestamp = combinedDateTime.toISOString();
                }
              } else {
                targetTimestamp = new Date(entry.timestamp_created).toISOString();
              }
            } catch (dateError) {
              console.log(`⚠️ Date parsing error for entry ${entry.id}, using timestamp_created:`, dateError);
              targetTimestamp = new Date(entry.timestamp_created).toISOString();
            }

            const targetDate = new Date(targetTimestamp);
            const dateStr = targetDate.toISOString().split('T')[0];

            // Check if weather data already exists for this date/location
            const { data: existingWeather } = await supabase
              .from('weather_logs')
              .select('id')
              .eq('user_id', entry.user_id)
              .eq('latitude', userCoords.latitude)
              .eq('longitude', userCoords.longitude)
              .eq('snapshot_date', dateStr)
              .limit(1);

            let weatherId: number;

            if (existingWeather && existingWeather.length > 0) {
              // Use existing weather data
              weatherId = existingWeather[0].id;
              console.log(`♻️ Using existing weather data for entry ${entry.id}`);
            } else {
              // Fetch new weather data using fetch-weather-hybrid
              const weatherResult = await fetchWeatherViaHybrid(
                userCoords.latitude,
                userCoords.longitude,
                targetTimestamp,
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
      } else {
        console.log('ℹ️ No pain entries without weather data found');
      }
    } else {
      console.log('ℹ️ No users with coordinates found');
    }

    // Step 2: Backfill missing weather data for events (new system)
    console.log('📅 Processing events without weather data...');
    
    // Reuse users with coordinates or fetch again if needed
    let eventUsersWithCoords = usersWithCoords;
    if (!eventUsersWithCoords) {
      const { data: eventCoordsData, error: eventCoordsError } = await supabase
        .from('user_profiles')
        .select('user_id, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (eventCoordsError) {
        console.error('❌ Error fetching user coordinates for events:', eventCoordsError);
        errors.push(`Event user coordinates fetch error: ${eventCoordsError.message}`);
        eventUsersWithCoords = [];
      } else {
        eventUsersWithCoords = eventCoordsData || [];
      }
    }

    if (eventUsersWithCoords && eventUsersWithCoords.length > 0) {
      const eventUserIds = eventUsersWithCoords.map(u => u.user_id);
      
      // Get events for those users
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, user_id, started_at')
        .is('weather_id', null)
        .in('user_id', eventUserIds)
        .order('started_at', { ascending: false })
        .limit(50); // Process in batches

      if (eventsError) {
        console.error('❌ Error fetching events:', eventsError);
        errors.push(`Events fetch error: ${eventsError.message}`);
      } else if (events && events.length > 0) {
        totalProcessed += events.length;
        
        for (const event of events) {
          try {
            // Find coordinates for this user
            const userCoords = eventUsersWithCoords.find(u => u.user_id === event.user_id);
            
            if (!userCoords?.latitude || !userCoords?.longitude) {
              console.log(`⚠️ No coordinates for event ${event.id}, user ${event.user_id}`);
              failCount++;
              continue;
            }

            const targetTimestamp = new Date(event.started_at).toISOString();
            const targetDate = new Date(targetTimestamp);
            const dateStr = targetDate.toISOString().split('T')[0];

            // Check if weather data already exists
            const { data: existingWeather } = await supabase
              .from('weather_logs')
              .select('id')
              .eq('user_id', event.user_id)
              .eq('latitude', userCoords.latitude)
              .eq('longitude', userCoords.longitude)
              .eq('snapshot_date', dateStr)
              .limit(1);

            let weatherId: number;

            if (existingWeather && existingWeather.length > 0) {
              weatherId = existingWeather[0].id;
              console.log(`♻️ Using existing weather data for event ${event.id}`);
            } else {
              const weatherResult = await fetchWeatherViaHybrid(
                userCoords.latitude,
                userCoords.longitude,
                targetTimestamp,
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
      } else {
        console.log('ℹ️ No events without weather data found');
      }
    } else {
      console.log('ℹ️ No users with coordinates found for events');
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

// Helper function to fetch weather data via fetch-weather-hybrid function
async function fetchWeatherViaHybrid(
  lat: number, 
  lon: number, 
  timestamp: string, 
  supabase: any, 
  userId: string
): Promise<number | null> {
  try {
    console.log(`🌤️ Fetching weather for user ${userId} at ${lat},${lon} for ${timestamp}`);
    
    // Call the fetch-weather-hybrid function
    const { data, error } = await supabase.functions.invoke('fetch-weather-hybrid', {
      body: {
        lat,
        lon,
        at: timestamp
      },
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      }
    });

    if (error) {
      console.error('❌ Error calling fetch-weather-hybrid:', error);
      return null;
    }

    if (!data || !data.weather_id) {
      console.error('❌ No weather_id returned from fetch-weather-hybrid');
      return null;
    }

    console.log(`✅ Successfully fetched weather_id ${data.weather_id} for user ${userId}`);
    return data.weather_id;

  } catch (error) {
    console.error('❌ fetchWeatherViaHybrid error:', error);
    return null;
  }
}