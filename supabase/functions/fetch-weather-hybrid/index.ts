import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for weather request
const WeatherRequestSchema = z.object({
  lat: z.number()
    .min(-90, 'Breitengrad muss zwischen -90 und 90 liegen')
    .max(90, 'Breitengrad muss zwischen -90 und 90 liegen'),
  lon: z.number()
    .min(-180, 'Längengrad muss zwischen -180 und 180 liegen')
    .max(180, 'Längengrad muss zwischen -180 und 180 liegen'),
  at: z.string()
    .datetime({ message: 'Ungültiges ISO 8601 Datum-Format' })
    .refine((date) => {
      const d = new Date(date);
      const now = new Date();
      const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      const oneYearFuture = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      return d >= fiveYearsAgo && d <= oneYearFuture;
    }, 'Datum muss innerhalb der letzten 5 Jahre und nicht mehr als 1 Jahr in der Zukunft liegen'),
  forceRefresh: z.boolean().optional()
});

// Generic error handler to prevent exposing internal structures
function handleError(error: unknown, context: string): Response {
  // Log detailed error internally
  console.error(`❌ [${context}] Error:`, error);
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }

  // Determine error type and return generic message
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({ 
      error: 'Ungültige Eingabedaten',
      weather_id: null 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check for authentication errors
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  if (errorMessage.includes('authorization') || errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
    return new Response(JSON.stringify({ 
      error: 'Authentifizierung fehlgeschlagen',
      weather_id: null 
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generic server error
  return new Response(JSON.stringify({ 
    error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
    weather_id: null 
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🌤️ Fetch-weather-hybrid function called');

    // JWT verification is now handled by Supabase automatically (verify_jwt = true)
    // Create service role client for database operations
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse and validate request body
    let requestBody: z.infer<typeof WeatherRequestSchema>;
    try {
      const rawBody = await req.json();
      requestBody = WeatherRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Validation error:', error.errors);
        return new Response(JSON.stringify({ 
          error: 'Ungültige Eingabedaten',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          weather_id: null 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.error('❌ Invalid JSON in request body');
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        weather_id: null 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if caller wants to skip cache
    const forceRefresh = requestBody.forceRefresh === true;
    if (forceRefresh) {
      console.log('🔄 Force refresh requested, skipping cache checks');
    }

    // Get authenticated user from JWT (already validated by Supabase)
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
    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);

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

    const userId = user.id;
    const { lat, lon, at } = requestBody;
    console.log('👤 User authentication successful:', userId);

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

    // Calculate daysDiff based on DATE ONLY (ignore time)
    const todayDateOnly = today.toISOString().split('T')[0];      // "2025-10-14"
    const requestDateOnly = requestDate.toISOString().split('T')[0]; // "2025-10-13"

    const todayDate = new Date(todayDateOnly + 'T00:00:00.000Z');
    const requestDateNormalized = new Date(requestDateOnly + 'T00:00:00.000Z');
    const daysDiff = Math.floor((todayDate.getTime() - requestDateNormalized.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate time difference in HOURS (not just days)
    const hoursDiff = Math.floor((today.getTime() - requestDate.getTime()) / (1000 * 60 * 60));
    
    // Decision logic:
    // - If entry is >1 hour in the past: Use HOURLY archive API
    // - If entry is within last hour: Use current API
    const useHistoricalAPI = hoursDiff >= 1;

    console.log('📅 Date analysis:', { 
      requestDate: requestDate.toISOString(), 
      requestDateOnly: requestDateOnly,
      today: today.toISOString(),
      todayDateOnly: todayDateOnly,
      daysDiff,
      hoursDiff,
      useHistoricalAPI
    });

    // Check for existing weather data with proximity-based reuse strategy
    const dateString = requestDate.toISOString().split('T')[0];
    console.log('🔍 Checking for existing weather data for date:', dateString);

    // Round coordinates to avoid tiny GPS differences
    const roundedLat = Math.round(lat * 1000) / 1000; // 3 decimal places = ~111m precision
    const roundedLon = Math.round(lon * 1000) / 1000;

    // Hourly cache strategy with 5km proximity radius
    if (!forceRefresh) {
      console.log('🔍 Checking for recent hourly weather data...');
      
      // Define hourly window for the requested time
      const requestedHour = new Date(requestDate);
      requestedHour.setMinutes(0, 0, 0);
      const hourEndUTC = new Date(requestedHour);
      hourEndUTC.setMinutes(59, 59, 999);
      
      const proximityKm = 5; // 5km radius for same weather
      
      const { data: recentLogs, error: cacheError } = await supabaseService
        .from('weather_logs')
        .select('id, latitude, longitude, created_at, temperature_c')
        .eq('user_id', userId)
        .gte('created_at', requestedHour.toISOString())
        .lte('created_at', hourEndUTC.toISOString())
        .order('created_at', { ascending: false })
        .limit(20);

      if (cacheError) {
        console.log('❌ Error checking hourly cache:', cacheError);
      } else if (recentLogs && recentLogs.length > 0) {
        // Find log within 5km radius
        for (const log of recentLogs) {
          const existingLat = Number(log.latitude);
          const existingLon = Number(log.longitude);
          
          // Haversine distance calculation
          const R = 6371; // Earth's radius in km
          const dLat = (roundedLat - existingLat) * Math.PI / 180;
          const dLon = (roundedLon - existingLon) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(existingLat * Math.PI / 180) * Math.cos(roundedLat * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          if (distance < proximityKm) {
            const logTime = new Date(log.created_at);
            console.log(`✅ Reusing hourly cache within ${distance.toFixed(2)} km from ${logTime.toISOString()}`);
            return new Response(JSON.stringify({ 
              weather_id: log.id,
              source: 'cache_hourly' 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        console.log(`📍 No cache within ${proximityKm}km radius for this hour`);
      }
    } else {
      console.log('🔄 Force refresh enabled, skipping cache...');
    }

    let weatherData = null;

    // Only use current weather API for requests within the last hour
    // For older entries, always use historical API
    if (!useHistoricalAPI) {
      console.log('🌍 Fetching current weather data from Open-Meteo (recent entry)');
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
      // Try HOURLY historical data first (for time-accurate data)
      if (useHistoricalAPI) {
        console.log('📅 Fetching HOURLY historical weather from Open-Meteo Archive');
        try {
          const hourUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateString}&end_date=${dateString}&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,dewpoint_2m&timezone=auto`;
          
          const response = await fetch(hourUrl);
          const data = await response.json();
          
          console.log('📊 Hourly archive response:', data);
          
          if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            // Find the closest hour to requested time
            const requestHour = requestDate.getUTCHours();
            let closestIndex = -1;
            let minDiff = Infinity;
            
            // Find closest time match
            for (let i = 0; i < data.hourly.time.length; i++) {
              const apiTime = new Date(data.hourly.time[i]);
              const apiHour = apiTime.getUTCHours();
              const diff = Math.abs(apiHour - requestHour);
              
              if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
              }
            }
            
            if (closestIndex !== -1 && data.hourly.temperature_2m[closestIndex] !== null) {
              const matchedTime = new Date(data.hourly.time[closestIndex]);
              const formattedTime = `${matchedTime.getUTCHours()}:00`;
              
              weatherData = {
                temperature_c: data.hourly.temperature_2m[closestIndex],
                humidity: data.hourly.relative_humidity_2m[closestIndex],
                pressure_mb: data.hourly.surface_pressure[closestIndex],
                pressure_change_24h: null, // Will be calculated below from DB
                wind_kph: data.hourly.wind_speed_10m[closestIndex] * 3.6,
                dewpoint_c: data.hourly.dewpoint_2m?.[closestIndex],
                condition_text: `Historical data (${formattedTime})`,
                location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
              };
              console.log('✅ Using hourly historical weather data for', formattedTime);
            }
          }
        } catch (error) {
          console.log('⚠️ Hourly archive API failed:', error);
        }
      }
      
      // Fallback to DAILY historical data if hourly failed
      if (!weatherData) {
        console.log('🌍 Fetching DAILY historical weather data from Open-Meteo');
        try {
          const prevDate = new Date(requestDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevDateString = prevDate.toISOString().split('T')[0];
          
          const historicalUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${prevDateString}&end_date=${dateString}&daily=temperature_2m_mean,relative_humidity_2m_mean,surface_pressure_mean,wind_speed_10m_mean,dewpoint_2m_mean&timezone=auto`;
          
          const response = await fetch(historicalUrl);
          const data = await response.json();
        
          console.log('📊 Daily historical weather response:', data);

          if (data.daily && data.daily.temperature_2m_mean && data.daily.temperature_2m_mean.length > 0) {
            const currentIndex = data.daily.temperature_2m_mean.length - 1;
            let pressureChange24h = null;
            
            if (data.daily.surface_pressure_mean && data.daily.surface_pressure_mean.length >= 2) {
              const currentPressure = data.daily.surface_pressure_mean[currentIndex];
              const previousPressure = data.daily.surface_pressure_mean[currentIndex - 1];
              if (currentPressure && previousPressure) {
                pressureChange24h = currentPressure - previousPressure;
                console.log('📈 Calculated historical 24h pressure change from daily API:', pressureChange24h, 'hPa');
              }
            }

            weatherData = {
              temperature_c: data.daily.temperature_2m_mean[currentIndex],
              humidity: data.daily.relative_humidity_2m_mean[currentIndex],
              pressure_mb: data.daily.surface_pressure_mean[currentIndex],
              pressure_change_24h: pressureChange24h,
              wind_kph: data.daily.wind_speed_10m_mean[currentIndex],
              dewpoint_c: data.daily.dewpoint_2m_mean ? data.daily.dewpoint_2m_mean[currentIndex] : null,
              condition_text: 'Historical data (daily average)',
              location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`
            };
            console.log('✅ Using daily historical weather data');
          }
        } catch (error) {
          console.log('⚠️ Daily historical weather API failed:', error);
        }
      }
    }

    // ────────────────────────────────────────
    // Δ24h: Calculate from DB if not yet set
    // ────────────────────────────────────────
    // Δ is often NULL for hourly historical data because the API doesn't provide it.
    // We calculate it from a weather_log ~24h prior in the same location.
    if (weatherData && weatherData.pressure_mb != null && weatherData.pressure_change_24h == null) {
      console.log('📈 Calculating Δ24h from DB...');
      try {
        const targetTime = new Date(requestDate.getTime() - 24 * 60 * 60 * 1000);
        const toleranceMs = 90 * 60 * 1000; // ±90 minutes
        const windowStart = new Date(targetTime.getTime() - toleranceMs).toISOString();
        const windowEnd = new Date(targetTime.getTime() + toleranceMs).toISOString();

        // lat_rounded / lon_rounded are computed columns (2 decimal places)
        const latRounded = Math.round(roundedLat * 100) / 100;
        const lonRounded = Math.round(roundedLon * 100) / 100;

        const { data: candidates, error: deltaError } = await supabaseService
          .from('weather_logs')
          .select('pressure_mb, requested_at')
          .eq('user_id', userId)
          .eq('lat_rounded', latRounded)
          .eq('lon_rounded', lonRounded)
          .not('pressure_mb', 'is', null)
          .gte('requested_at', windowStart)
          .lte('requested_at', windowEnd)
          .order('requested_at', { ascending: false })
          .limit(5);

        if (deltaError) {
          console.log('⚠️ Δ24h query error:', deltaError.message);
        } else if (candidates && candidates.length > 0) {
          // Find the closest match to targetTime
          let bestMatch = candidates[0];
          let bestDiff = Math.abs(new Date(bestMatch.requested_at).getTime() - targetTime.getTime());

          for (const c of candidates) {
            const diff = Math.abs(new Date(c.requested_at).getTime() - targetTime.getTime());
            if (diff < bestDiff) {
              bestDiff = diff;
              bestMatch = c;
            }
          }

          const delta = Math.round(weatherData.pressure_mb - bestMatch.pressure_mb);
          weatherData.pressure_change_24h = delta;
          console.log(`✅ Δ24h calculated: ${delta} hPa (ref from ${bestMatch.requested_at}, diff ${Math.round(bestDiff / 60000)}min)`);
        } else {
          console.log('ℹ️ No weather_log found ~24h prior for Δ24h calculation');
        }
      } catch (err) {
        console.log('⚠️ Δ24h calculation failed:', err);
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

    // Try to INSERT new weather data (no UPSERT to avoid conflicts)
    console.log('💾 Inserting new weather data into database...');
    const { data: insertResult, error: insertError } = await supabaseService
      .from('weather_logs')
      .insert({
        user_id: userId,
        latitude: roundedLat,
        longitude: roundedLon,
        snapshot_date: dateString,
        requested_at: requestDate.toISOString(), // ✅ NEU: Zeitpunkt für den die Wetterdaten gelten
        temperature_c: weatherData.temperature_c,
        humidity: weatherData.humidity,
        pressure_mb: weatherData.pressure_mb,
        pressure_change_24h: weatherData.pressure_change_24h,
        wind_kph: weatherData.wind_kph,
        dewpoint_c: weatherData.dewpoint_c,
        condition_text: weatherData.condition_text,
        location: weatherData.location
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      // ✅ VERBESSERTER FEHLERHANDLER: Prüfe Distanz statt nur Datum
      if (insertError.code === '23505') { // Unique violation
        console.log('⚠️ Duplicate key conflict, suche passenden Log innerhalb 5km...');
        
        // Suche alle Logs des Users am gleichen Tag
        const { data: existingRecords, error: fetchError } = await supabaseService
          .from('weather_logs')
          .select('id, latitude, longitude, requested_at')
          .eq('user_id', userId)
          .eq('snapshot_date', dateString)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (fetchError) {
          console.error('❌ Failed to fetch existing records:', fetchError);
          throw fetchError;
        }
        
        // Prüfe Distanz zu jedem Log (5km Radius)
        const proximityKm = 5;
        if (existingRecords && existingRecords.length > 0) {
          for (const log of existingRecords) {
            const existingLat = Number(log.latitude);
            const existingLon = Number(log.longitude);
            
            // Haversine Distanzberechnung
            const R = 6371;
            const dLat = (roundedLat - existingLat) * Math.PI / 180;
            const dLon = (roundedLon - existingLon) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(existingLat * Math.PI / 180) * Math.cos(roundedLat * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;
            
            if (distance < proximityKm) {
              console.log(`✅ Reusing existing log ${log.id} within ${distance.toFixed(2)} km`);
              return new Response(JSON.stringify({ 
                weather_id: log.id,
                source: 'duplicate_nearby' 
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }
          
          // Kein Log in der Nähe gefunden - das sollte nicht passieren mit neuem Schema
          console.log('⚠️ No log within 5km found despite duplicate error - proceeding with error');
        }
      }
      
      console.error('❌ Insert error:', insertError);
      throw insertError;
    }

    if (!insertResult) {
      console.warn('⚠️ No result from insert, this should not happen');
      throw new Error('Failed to create weather data');
    }

    console.log('✅ Weather data saved successfully:', insertResult.id);

    return new Response(JSON.stringify({ weather_id: insertResult.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return handleError(error, 'fetch-weather-hybrid');
  }
});