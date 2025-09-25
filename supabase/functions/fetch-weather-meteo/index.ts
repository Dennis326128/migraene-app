import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  console.log('🌤️ Fetch-weather-meteo function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } }
    });

    // Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('❌ Authentication failed:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { lat, lon, at } = await req.json();
    console.log('📍 Weather request for:', { lat, lon, at, userId: user.id });

    // Validate input
    if (!lat || !lon || !at) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: lat, lon, at' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const targetDate = new Date(at);
    const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if we already have weather data for this user, location, and date
    console.log('🔍 Checking for existing weather data...');
    const { data: existingLogs } = await supabase
      .from('weather_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('snapshot_date', dateStr)
      .gte('latitude', lat - 0.01)
      .lte('latitude', lat + 0.01)
      .gte('longitude', lon - 0.01)
      .lte('longitude', lon + 0.01)
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      console.log('✅ Found existing weather data:', existingLogs[0].id);
      return new Response(JSON.stringify({ weather_id: existingLogs[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch weather data from Open-Meteo
    console.log('🌍 Fetching weather data from Open-Meteo for:', dateStr);
    const openMeteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean,relative_humidity_2m_mean,surface_pressure_mean,wind_speed_10m_mean&timezone=auto`;
    
    const weatherResponse = await fetch(openMeteoUrl);
    if (!weatherResponse.ok) {
      console.error('❌ Open-Meteo API error:', weatherResponse.status, weatherResponse.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch weather data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const weatherData = await weatherResponse.json();
    console.log('📊 Open-Meteo response:', weatherData);

    if (!weatherData.daily || !weatherData.daily.time || weatherData.daily.time.length === 0) {
      console.error('❌ No weather data available for date:', dateStr);
      return new Response(JSON.stringify({ error: 'No weather data available for this date' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract weather data
    const daily = weatherData.daily;
    const temperature = daily.temperature_2m_mean?.[0] || null;
    const humidity = daily.relative_humidity_2m_mean?.[0] || null;
    const pressure = daily.surface_pressure_mean?.[0] || null;
    const windSpeed = daily.wind_speed_10m_mean?.[0] || null;

    // Convert pressure from hPa to mb (they are the same unit)
    const pressureMb = pressure;

    // Insert weather data into database
    console.log('💾 Inserting weather data into database...');
    const { data: weatherLog, error: insertError } = await supabase
      .from('weather_logs')
      .insert({
        user_id: user.id,
        latitude: lat,
        longitude: lon,
        snapshot_date: dateStr,
        temperature_c: temperature,
        humidity: humidity,
        pressure_mb: pressureMb,
        wind_kph: windSpeed ? windSpeed * 3.6 : null, // Convert m/s to km/h
        condition_text: 'Historical Data',
        condition_icon: '01d', // Default sunny icon
        location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('❌ Database insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save weather data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Weather data saved successfully:', weatherLog.id);
    return new Response(JSON.stringify({ weather_id: weatherLog.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Unexpected error in fetch-weather-meteo:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});