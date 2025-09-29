import { useState, useCallback, useRef, useEffect } from 'react';
import { updateUserProfileCoordinates, getUserFallbackCoordinates } from '@/utils/coordinateUpdater';
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from '@/utils/weatherLogger';
import { Geolocation } from '@capacitor/geolocation';

interface WeatherSystemState {
  isLoading: boolean;
  coordinates: { lat: number; lon: number } | null;
  lastWeatherId: number | null;
  error: string | null;
  cacheTimestamp: number | null;
}

interface WeatherResult {
  weatherId: number | null;
  coordinates: { lat: number; lon: number } | null;
  source: 'gps' | 'cache' | 'profile' | 'manual';
}

export function useOptimizedWeatherSystem() {
  const [state, setState] = useState<WeatherSystemState>({
    isLoading: false,
    coordinates: null,
    lastWeatherId: null,
    error: null,
    cacheTimestamp: null
  });

  const coordinateCacheRef = useRef<{
    coords: { lat: number; lon: number } | null;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
  }>({
    coords: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000 // 5 minutes cache
  });

  // Optimized coordinate fetching with smart caching
  const getCoordinatesOptimized = useCallback(async (forceRefresh = false): Promise<{ lat: number; lon: number } | null> => {
    const cache = coordinateCacheRef.current;
    const now = Date.now();

    // Return cached coordinates if still valid and not forcing refresh
    if (!forceRefresh && cache.coords && (now - cache.timestamp) < cache.ttl) {
      console.log('🚀 Using cached coordinates:', cache.coords);
      return cache.coords;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Try GPS first for most accurate coordinates
      console.log('📍 Attempting GPS location...');
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000, // Increased timeout for better accuracy
        maximumAge: 60000 // Accept cached GPS position up to 1 minute old
      });

      const gpsCoords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };

      console.log('✅ GPS coordinates obtained:', gpsCoords);

      // Update cache
      coordinateCacheRef.current = {
        coords: gpsCoords,
        timestamp: now,
        ttl: cache.ttl
      };

      // Update user profile asynchronously
      updateUserProfileCoordinates(gpsCoords.lat, gpsCoords.lon)
        .catch(err => console.warn('Profile update failed:', err));

      setState(prev => ({ 
        ...prev, 
        coordinates: gpsCoords, 
        isLoading: false 
      }));

      return gpsCoords;

    } catch (gpsError) {
      console.warn('📍 GPS failed, trying fallback coordinates...', gpsError);
      
      try {
        // Fallback to user profile coordinates
        const fallbackCoords = await getUserFallbackCoordinates();
        
        if (fallbackCoords) {
          console.log('✅ Using fallback coordinates from profile:', fallbackCoords);
          
          // Update cache with fallback coords (shorter TTL)
          coordinateCacheRef.current = {
            coords: fallbackCoords,
            timestamp: now,
            ttl: cache.ttl / 2 // Shorter cache for fallback coords
          };

          setState(prev => ({ 
            ...prev, 
            coordinates: fallbackCoords, 
            isLoading: false 
          }));

          return fallbackCoords;
        }

        throw new Error('No fallback coordinates available');

      } catch (fallbackError) {
        const errorMsg = 'Failed to get coordinates from GPS or profile';
        console.error('❌', errorMsg, fallbackError);
        
        setState(prev => ({ 
          ...prev, 
          error: errorMsg, 
          isLoading: false 
        }));

        return null;
      }
    }
  }, []);

  // Optimized weather fetching with smart coordinate handling
  const fetchWeatherOptimized = useCallback(async (
    timestamp?: string,
    manualCoords?: { lat: number; lon: number }
  ): Promise<WeatherResult> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let coordinates: { lat: number; lon: number } | null = null;
      let source: WeatherResult['source'] = 'gps';

      // Priority: Manual coords -> Cached coords -> Fresh GPS/Fallback
      if (manualCoords) {
        coordinates = manualCoords;
        source = 'manual';
        console.log('🎯 Using manual coordinates:', coordinates);
      } else {
        coordinates = await getCoordinatesOptimized();
        source = coordinateCacheRef.current.coords === coordinates ? 'cache' : 'gps';
      }

      if (!coordinates) {
        throw new Error('No coordinates available for weather fetch');
      }

      const targetTimestamp = timestamp || new Date().toISOString();
      console.log(`🌤️ Fetching weather for ${targetTimestamp} at:`, coordinates);

      let weatherId: number | null = null;

      if (manualCoords) {
        // Use coordinate-specific weather function for manual coords
        weatherId = await logAndSaveWeatherAtCoords(targetTimestamp, coordinates.lat, coordinates.lon);
      } else {
        // Use optimized weather function for current user coords
        weatherId = await logAndSaveWeatherAt(targetTimestamp);
      }

      if (weatherId) {
        setState(prev => ({ 
          ...prev, 
          lastWeatherId: weatherId, 
          isLoading: false 
        }));

        console.log('✅ Weather fetch successful, ID:', weatherId);
        return { weatherId, coordinates, source };
      }

      throw new Error('Weather fetch returned null');

    } catch (error: any) {
      const errorMsg = `Weather fetch failed: ${error.message}`;
      console.error('❌', errorMsg);
      
      setState(prev => ({ 
        ...prev, 
        error: errorMsg, 
        isLoading: false 
      }));

      return { weatherId: null, coordinates: null, source: 'gps' };
    }
  }, [getCoordinatesOptimized]);

  // Batch weather fetching for multiple entries
  const fetchWeatherBatch = useCallback(async (
    entries: Array<{ timestamp: string; coords?: { lat: number; lon: number } }>
  ): Promise<Array<WeatherResult>> => {
    console.log(`🔄 Batch weather fetch for ${entries.length} entries`);
    const results: WeatherResult[] = [];

    for (const entry of entries) {
      try {
        const result = await fetchWeatherOptimized(entry.timestamp, entry.coords);
        results.push(result);
        
        // Rate limiting between requests
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error('Batch fetch error for entry:', entry, error);
        results.push({ weatherId: null, coordinates: null, source: 'gps' });
      }
    }

    return results;
  }, [fetchWeatherOptimized]);

  // Clear coordinate cache
  const clearCache = useCallback(() => {
    coordinateCacheRef.current = {
      coords: null,
      timestamp: 0,
      ttl: coordinateCacheRef.current.ttl
    };
    setState(prev => ({ 
      ...prev, 
      coordinates: null, 
      error: null 
    }));
    console.log('🗑️ Coordinate cache cleared');
  }, []);

  // Initialize coordinate cache on mount
  useEffect(() => {
    const initializeCache = async () => {
      try {
        const coords = await getCoordinatesOptimized();
        if (coords) {
          console.log('🚀 Weather system initialized with coordinates:', coords);
        }
      } catch (error) {
        console.warn('Weather system initialization failed:', error);
      }
    };

    initializeCache();
  }, [getCoordinatesOptimized]);

  return {
    // State
    isLoading: state.isLoading,
    coordinates: state.coordinates,
    lastWeatherId: state.lastWeatherId,
    error: state.error,
    hasCache: !!coordinateCacheRef.current.coords,
    
    // Methods
    getCoordinates: getCoordinatesOptimized,
    fetchWeather: fetchWeatherOptimized,
    fetchWeatherBatch,
    clearCache,
    
    // Utils
    updateCoordinates: updateUserProfileCoordinates
  };
}