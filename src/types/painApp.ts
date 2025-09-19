export interface WeatherData {
  id?: number;
  temperature_c: number | null;
  pressure_mb: number | null;
  humidity: number | null;
  condition_text: string | null;
  location?: string | null;
  pressure_change_24h?: number | null;
  moon_phase?: number | null;
  moonrise?: number | null;
  moonset?: number | null;
}

export interface PainEntry {
  id: string;
  timestamp_created: string;
  selected_date?: string;
  selected_time?: string;
  pain_level: string;
  medications: string[];
  notes?: string | null;
  weather_id?: number | null;
  weather?: WeatherData;
}
