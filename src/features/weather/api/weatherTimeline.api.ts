import { supabase } from "@/lib/supabaseClient";

export interface WeatherTimelineData {
  date: string;
  time?: string;
  pain_level?: number;
  pressure_mb?: number;
  temperature_c?: number;
  humidity?: number;
  source: 'entry' | 'passive';
  entry_id?: number;
  has_pain_entry: boolean;
}

export async function getWeatherTimelineData(
  from: string,
  to: string,
  includePassive: boolean = true
): Promise<WeatherTimelineData[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");

  // Get entry-based weather data - fix the relationship reference
  const { data: entryWeather, error: entryError } = await supabase
    .from('pain_entries')
    .select(`
      id,
      timestamp_created,
      selected_date,
      selected_time,
      pain_level,
      weather_logs!pain_entries_weather_id_fkey (
        pressure_mb,
        temperature_c,
        humidity,
        snapshot_date
      )
    `)
    .eq('user_id', userData.user.id)
    .gte('timestamp_created', from + 'T00:00:00')
    .lte('timestamp_created', to + 'T23:59:59')
    .order('timestamp_created', { ascending: true });

  if (entryError) throw entryError;

  const result: WeatherTimelineData[] = [];

  // Process entry-based data
  entryWeather?.forEach(entry => {
    const weather = Array.isArray(entry.weather_logs) ? entry.weather_logs[0] : entry.weather_logs;
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0];
    const time = entry.selected_time || new Date(entry.timestamp_created).toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    if (date) {
      result.push({
        date,
        time,
        pain_level: mapPainLevelToScore(entry.pain_level),
        pressure_mb: weather?.pressure_mb || undefined,
        temperature_c: weather?.temperature_c || undefined,
        humidity: weather?.humidity || undefined,
        source: 'entry',
        entry_id: entry.id,
        has_pain_entry: true
      });
    }
  });

  // Get passive weather data if requested - also handle null snapshot_date
  if (includePassive) {
    const { data: passiveWeather, error: passiveError } = await supabase
      .from('weather_logs')
      .select('pressure_mb, temperature_c, humidity, snapshot_date, created_at')
      .eq('user_id', userData.user.id)
      .or(`and(snapshot_date.gte.${from},snapshot_date.lte.${to}),and(snapshot_date.is.null,created_at.gte.${from}T00:00:00,created_at.lte.${to}T23:59:59)`)
      .order('created_at', { ascending: true });

    if (passiveError) throw passiveError;

    // Group passive data by date to avoid duplicates - handle null snapshot_date
    const passiveByDate = new Map<string, typeof passiveWeather[0]>();
    passiveWeather?.forEach(weather => {
      // Use snapshot_date if available, otherwise use created_at date
      const date = weather.snapshot_date || weather.created_at?.split('T')[0];
      if (date) {
        const existing = passiveByDate.get(date);
        if (!existing || new Date(weather.created_at) > new Date(existing.created_at)) {
          passiveByDate.set(date, weather);
        }
      }
    });

    // Add passive data points where no entry exists
    passiveByDate.forEach((weather, date) => {
      const hasEntry = result.some(r => r.date === date && r.source === 'entry');
      if (!hasEntry) {
        result.push({
          date,
          pressure_mb: weather?.pressure_mb || undefined,
          temperature_c: weather?.temperature_c || undefined,
          humidity: weather?.humidity || undefined,
          source: 'passive',
          has_pain_entry: false
        });
      }
    });
  }

  // Sort by date and time
  return result.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    
    if (a.time && b.time) {
      return a.time.localeCompare(b.time);
    }
    
    // Passive data comes first if same date
    if (a.source === 'passive' && b.source === 'entry') return -1;
    if (a.source === 'entry' && b.source === 'passive') return 1;
    
    return 0;
  });
}

function mapPainLevelToScore(painLevel: string): number {
  switch (painLevel) {
    case 'leicht': return 2;
    case 'mittel': return 5;
    case 'stark': return 7;
    case 'sehr_stark': return 9;
    default: return 0;
  }
}