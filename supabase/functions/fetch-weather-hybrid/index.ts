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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authentication - support both user JWT and service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let userId: string;

    if (token === serviceRoleKey) {
      // Service role authentication - get userId from request body
      const requestBody = await req.json();
      const { lat, lon, at, userId: requestUserId } = requestBody;
      
      if (!requestUserId) {
        throw new Error('userId required for service role authentication');
      }
      
      userId = requestUserId;
      console.log('🔑 Service role authentication for user:', userId);
      
      // Re-parse request data
      const requestData = { lat, lon, at };
      console.log('📍 Weather request for:', { ...requestData, userId });
      
      // Continue with the rest of the function using requestData
      req.json = () => Promise.resolve(requestData);
    } else {
      // User JWT authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        throw new Error('Invalid authentication');
      }

      userId = user.id;
      console.log('👤 User JWT authentication:', userId);
    }

    const { lat, lon, at } = await req.json();
    console.log('📍 Weather request for:', { lat, lon, at, userId });

    if (!lat || !lon || !at) {
      throw new Error('Missing required parameters: lat, lon, at');
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

    // Check for existing weather data first
    const dateString = requestDate.toISOString().split('T')[0];
    console.log('🔍 Checking for existing weather data for date:', dateString);

    const { data: existing, error: existingError } = await supabase
      .from('weather_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_date', dateString)
      .eq('latitude', lat)
      .eq('longitude', lon)
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
        const currentWeatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&timezone=auto`;
        
        const response = await fetch(currentWeatherUrl);
        const data = await response.json();
        
        console.log('📊 Current weather response:', data);

        if (data.current) {
          weatherData = {
            temperature_c: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            pressure_mb: data.current.surface_pressure,
            wind_kph: data.current.wind_speed_10m * 3.6, // Convert m/s to km/h
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
        const historicalUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateString}&end_date=${dateString}&daily=temperature_2m_mean,relative_humidity_2m_mean,surface_pressure_mean,wind_speed_10m_mean&timezone=auto`;
        
        const response = await fetch(historicalUrl);
        const data = await response.json();
        
        console.log('📊 Historical weather response:', data);

        if (data.daily && data.daily.temperature_2m_mean && data.daily.temperature_2m_mean[0] !== null) {
          weatherData = {
            temperature_c: data.daily.temperature_2m_mean[0],
            humidity: data.daily.relative_humidity_2m_mean[0],
            pressure_mb: data.daily.surface_pressure_mean[0],
            wind_kph: data.daily.wind_speed_10m_mean[0], // Already in km/h from archive API
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

    // Insert weather data into database
    console.log('💾 Inserting weather data into database...');
    const { data: insertResult, error: insertError } = await supabase
      .from('weather_logs')
      .insert({
        user_id: userId,
        latitude: lat,
        longitude: lon,
        snapshot_date: dateString,
        temperature_c: weatherData.temperature_c,
        humidity: weatherData.humidity,
        pressure_mb: weatherData.pressure_mb,
        wind_kph: weatherData.wind_kph,
        condition_text: weatherData.condition_text,
        location: weatherData.location,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) {
      // Check if it's a duplicate key error
      if (insertError.code === '23505') {
        console.log('⚠️ Duplicate weather entry, fetching existing...');
        const { data: existingData } = await supabase
          .from('weather_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('snapshot_date', dateString)
          .eq('latitude', lat)
          .eq('longitude', lon)
          .limit(1)
          .single();
        
        if (existingData) {
          console.log('✅ Returning existing weather data:', existingData.id);
          return new Response(JSON.stringify({ weather_id: existingData.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      throw insertError;
    }

    console.log('✅ Weather data saved successfully:', insertResult.id);

    return new Response(JSON.stringify({ weather_id: insertResult.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      weather_id: null 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});