import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    console.log('🌤️ Fetch-weather function called');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ Missing or invalid authorization header');
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      console.error('❌ Authentication failed:', authError);
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { lat, lon, at } = await req.json();
    console.log('📍 Weather request for:', { lat, lon, at, userId: user.id });

    if (!lat || !lon || !at) {
      return new Response(JSON.stringify({ error: 'lat, lon, and at are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetDate = new Date(at);
    const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if we already have weather data for this user, location, and time
    const { data: existingLogs } = await supabase
      .from('weather_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('latitude', lat)
      .eq('longitude', lon)
      .gte('snapshot_date', dateStr)
      .lte('snapshot_date', dateStr)
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      console.log('✅ Using existing weather data:', existingLogs[0].id);
      return new Response(JSON.stringify({ weather_id: existingLogs[0].id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OpenWeatherMap API key
    const openWeatherApiKey = Deno.env.get('OPENWEATHERMAP_API_KEY');
    if (!openWeatherApiKey) {
      console.error('❌ OpenWeatherMap API key not configured');
      return new Response(JSON.stringify({ error: 'Weather service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine if we need historical data (more than 5 days old)
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    const isHistorical = daysDiff > 5;

    let weatherData;
    
    try {
      if (isHistorical) {
        // Use OpenWeatherMap Historical API for dates older than 5 days
        const timestamp = Math.floor(targetDate.getTime() / 1000);
        const historyUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${timestamp}&appid=${openWeatherApiKey}&units=metric`;
        
        console.log('🔍 Fetching historical weather data from OpenWeatherMap');
        const historyResponse = await fetch(historyUrl);
        
        if (!historyResponse.ok) {
          throw new Error(`OpenWeatherMap Historical API error: ${historyResponse.status}`);
        }
        
        const historyData = await historyResponse.json();
        const hourlyData = historyData.data[0]; // Get the closest hour data
        
        weatherData = {
          temperature_c: hourlyData.temp,
          pressure_mb: hourlyData.pressure,
          humidity: hourlyData.humidity,
          wind_kph: hourlyData.wind_speed * 3.6, // Convert m/s to km/h
          condition_text: hourlyData.weather[0].description,
          condition_icon: hourlyData.weather[0].icon,
        };
      } else {
        // Use current weather API for recent dates
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherApiKey}&units=metric`;
        
        console.log('🌤️ Fetching current weather data from OpenWeatherMap');
        const currentResponse = await fetch(currentUrl);
        
        if (!currentResponse.ok) {
          throw new Error(`OpenWeatherMap Current API error: ${currentResponse.status}`);
        }
        
        const currentData = await currentResponse.json();
        
        weatherData = {
          temperature_c: currentData.main.temp,
          pressure_mb: currentData.main.pressure,
          humidity: currentData.main.humidity,
          wind_kph: currentData.wind?.speed ? currentData.wind.speed * 3.6 : 0,
          condition_text: currentData.weather[0].description,
          condition_icon: currentData.weather[0].icon,
        };
      }

      // Calculate 24h pressure change (simplified approach)
      const pressure_change_24h = 0; // Would need historical comparison for accurate calculation

      // Insert weather log into database
      const { data: insertedLog, error: insertError } = await supabase
        .from('weather_logs')
        .insert({
          user_id: user.id,
          latitude: lat,
          longitude: lon,
          temperature_c: weatherData.temperature_c,
          pressure_mb: weatherData.pressure_mb,
          humidity: weatherData.humidity,
          wind_kph: weatherData.wind_kph,
          condition_text: weatherData.condition_text,
          condition_icon: weatherData.condition_icon,
          pressure_change_24h: pressure_change_24h,
          snapshot_date: dateStr,
          created_at: targetDate.toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to save weather data' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('✅ Weather data saved successfully:', insertedLog.id);
      
      return new Response(JSON.stringify({ weather_id: insertedLog.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (weatherError) {
      console.error('❌ Weather API error:', weatherError);
      return new Response(JSON.stringify({ error: 'Failed to fetch weather data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});