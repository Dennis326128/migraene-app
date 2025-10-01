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
    console.log('🌤️ Fetch-weather-hybrid function called');

    // Create two clients: one for auth validation, one for database operations
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body once
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('❌ Invalid JSON in request body');
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        weather_id: null 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Authentication - support both user JWT and service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ Missing Authorization header');
      return new Response(JSON.stringify({ 
        error: 'Missing Authorization header',
        weather_id: null 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let userId: string;
    let lat: number, lon: number, at: string;

    if (token === serviceRoleKey) {
      // Service role authentication - get userId from request body
      const { lat: reqLat, lon: reqLon, at: reqAt, userId: requestUserId } = requestBody;
      
      if (!requestUserId) {
        console.error('❌ userId required for service role authentication');
        return new Response(JSON.stringify({ 
          error: 'userId required for service role authentication',
          weather_id: null 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      userId = requestUserId;
      lat = reqLat;
      lon = reqLon;
      at = reqAt;
      console.log('🔑 Service role authentication for user:', userId);
    } else {
      // User JWT authentication - use ANON client for auth validation
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

      if (authError || !user) {
        console.error('❌ Invalid user authentication:', authError?.message);
        return new Response(JSON.stringify({ 
          error: 'Invalid authentication',
          weather_id: null 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      userId = user.id;
      console.log('👤 User JWT authentication:', userId);
      
      // Parse request data
      const { lat: reqLat, lon: reqLon, at: reqAt } = requestBody;
      lat = reqLat;
      lon = reqLon;
      at = reqAt;
    }

    console.log('📍 Weather request for:', { lat, lon, at, userId });

    if (!lat || !lon || !at) {
      console.error('❌ Missing required parameters');
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: lat, lon, at',
        weather_id: null 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse the date
    const requestDate = new Date(at);
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log('📅 Date analysis:', { 
      requestDate: requestDate.toISOString(), 
      today: today.toISOString(), 
      daysDiff 
    });

    // Check for existing weather data first with more flexible matching
    const dateString = requestDate.toISOString().split('T')[0];
    console.log('🔍 Checking for existing weather data for date:', dateString);

    // Round coordinates to avoid tiny GPS differences
    const roundedLat = Math.round(lat * 1000) / 1000; // 3 decimal places = ~111m precision
    const roundedLon = Math.round(lon * 1000) / 1000;

    const { data: existing, error: existingError } = await supabaseService
      .from('weather_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_date', dateString)
      .gte('latitude', roundedLat - 0.001)
      .lte('latitude', roundedLat + 0.001)
      .gte('longitude', roundedLon - 0.001)
      .lte('longitude', roundedLon + 0.001)
      .limit(1);

    if (existingError) {
      console.log('❌ Error checking existing data:', existingError);
    } else if (existing && existing.length > 0) {
      console.log('✅ Found existing weather data:', existing[0].id);
      return new Response(JSON.stringify({ weather_id: existing[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let weatherData = null;

    // For recent dates (within 7 days), try current weather API
    if (daysDiff <= 7) {
      console.log('🌍 Fetching current weather data from Open-Meteo');
      try {
        const currentWeatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,dewpoint_2m&timezone=auto`;
        
        const response = await fetch(currentWeatherUrl);
        const data = await response.json();
        
        console.log('📊 Current weather response:', data);

        if (data.current) {
          // Calculate 24h pressure change for current weather
          let pressureChange24h = null;
          try {
            const yesterdayDate = new Date(requestDate);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayString = yesterdayDate.toISOString().split('T')[0];
            
            const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${yesterdayString}&end_date=${yesterdayString}&daily=surface_pressure_mean&timezone=auto`;
            const histResponse = await fetch(histUrl);
            const histData = await histResponse.json();
            
            if (histData.daily?.surface_pressure_mean?.[0]) {
              pressureChange24h = data.current.surface_pressure - histData.daily.surface_pressure_mean[0];
              console.log('📈 Calculated 24h pressure change:', pressureChange24h, 'hPa');
            }
          } catch (pressureError) {
            console.log('⚠️ Failed to calculate pressure change:', pressureError);
          }

          weatherData = {
            temperature_c: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            pressure_mb: data.current.surface_pressure,
            pressure_change_24h: pressureChange24h,
            wind_kph: data.current.wind_speed_10m * 3.6, // Convert m/s to km/h
            dewpoint_c: data.current.dewpoint_2m,
            condition_text: 'Current weather',
            location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
          };
          console.log('✅ Using current weather data');
        }
      } catch (error) {
        console.log('⚠️ Current weather API failed:', error);
      }
    }

    // If current weather failed or for older dates, use historical API
    if (!weatherData) {
      console.log('🌍 Fetching historical weather data from Open-Meteo');
      try {
        // Fetch current date and previous day for pressure change calculation
        const prevDate = new Date(requestDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateString = prevDate.toISOString().split('T')[0];
        
        const historicalUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${prevDateString}&end_date=${dateString}&daily=temperature_2m_mean,relative_humidity_2m_mean,surface_pressure_mean,wind_speed_10m_mean,dewpoint_2m_mean&timezone=auto`;
        
        const response = await fetch(historicalUrl);
        const data = await response.json();
        
        console.log('📊 Historical weather response:', data);

        if (data.daily && data.daily.temperature_2m_mean && data.daily.temperature_2m_mean.length > 0) {
          const currentIndex = data.daily.temperature_2m_mean.length - 1; // Last day = requested date
          let pressureChange24h = null;
          
          // Calculate pressure change if we have both days
          if (data.daily.surface_pressure_mean && data.daily.surface_pressure_mean.length >= 2) {
            const currentPressure = data.daily.surface_pressure_mean[currentIndex];
            const previousPressure = data.daily.surface_pressure_mean[currentIndex - 1];
            if (currentPressure && previousPressure) {
              pressureChange24h = currentPressure - previousPressure;
              console.log('📈 Calculated historical 24h pressure change:', pressureChange24h, 'hPa');
            }
          }

          weatherData = {
            temperature_c: data.daily.temperature_2m_mean[currentIndex],
            humidity: data.daily.relative_humidity_2m_mean[currentIndex],
            pressure_mb: data.daily.surface_pressure_mean[currentIndex],
            pressure_change_24h: pressureChange24h,
            wind_kph: data.daily.wind_speed_10m_mean[currentIndex], // Already in km/h from archive API
            dewpoint_c: data.daily.dewpoint_2m_mean ? data.daily.dewpoint_2m_mean[currentIndex] : null,
            condition_text: 'Historical data',
            location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
          };
          console.log('✅ Using historical weather data');
        }
      } catch (error) {
        console.log('⚠️ Historical weather API failed:', error);
      }
    }

    // If both APIs failed, create a placeholder entry
    if (!weatherData) {
      console.log('❌ Both weather APIs failed, creating placeholder');
      weatherData = {
        temperature_c: null,
        humidity: null,
        pressure_mb: null,
        wind_kph: null,
        condition_text: 'No data available',
        location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
      };
    }

    // Final check with rounded coordinates before inserting
    console.log('🔍 Final check for existing weather data before insert...');
    const { data: existingWeather } = await supabaseService
      .from('weather_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_date', dateString)
      .gte('latitude', roundedLat - 0.001)
      .lte('latitude', roundedLat + 0.001)
      .gte('longitude', roundedLon - 0.001)
      .lte('longitude', roundedLon + 0.001)
      .limit(1)
      .maybeSingle();

    if (existingWeather) {
      console.log('✅ Returning existing weather data:', existingWeather.id);
      return new Response(JSON.stringify({ weather_id: existingWeather.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // UPSERT weather data - automatically handles duplicates
    console.log('💾 Upserting weather data into database...');
    const { data: upsertResult, error: upsertError } = await supabaseService
      .from('weather_logs')
      .upsert({
        user_id: userId,
        latitude: roundedLat,
        longitude: roundedLon,
        snapshot_date: dateString,
        temperature_c: weatherData.temperature_c,
        humidity: weatherData.humidity,
        pressure_mb: weatherData.pressure_mb,
        pressure_change_24h: weatherData.pressure_change_24h,
        wind_kph: weatherData.wind_kph,
        dewpoint_c: weatherData.dewpoint_c,
        condition_text: weatherData.condition_text,
        location: weatherData.location
      }, {
        onConflict: 'weather_logs_user_date_uidx',
        ignoreDuplicates: false // Update if exists
      })
      .select('id')
      .maybeSingle();

    if (upsertError) {
      console.error('❌ Upsert error:', upsertError);
      throw upsertError;
    }

    if (!upsertResult) {
      console.warn('⚠️ No result from upsert, fetching existing record...');
      const { data: existingRecord, error: fetchError } = await supabaseService
        .from('weather_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('snapshot_date', dateString)
        .gte('latitude', roundedLat - 0.001)
        .lte('latitude', roundedLat + 0.001)
        .gte('longitude', roundedLon - 0.001)
        .lte('longitude', roundedLon + 0.001)
        .limit(1)
        .maybeSingle();
      
      if (fetchError) {
        throw fetchError;
      }
      
      if (existingRecord) {
        console.log('✅ Weather data exists:', existingRecord.id);
        return new Response(JSON.stringify({ weather_id: existingRecord.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error('Failed to create or retrieve weather data');
    }

    console.log('✅ Weather data saved successfully:', upsertResult.id);

    return new Response(JSON.stringify({ weather_id: upsertResult.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (errorMessage.includes('Missing Authorization') || errorMessage.includes('Invalid authentication')) {
      statusCode = 401;
    } else if (errorMessage.includes('Missing required parameters') || errorMessage.includes('Invalid JSON')) {
      statusCode = 400;
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      weather_id: null 
    }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});