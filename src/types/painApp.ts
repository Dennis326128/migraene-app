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

export interface MedicationIntakeInfo {
  medication_name: string;
  medication_id?: string | null;
  dose_quarters: number;
}

export interface MigraineEntry {
  id: string;
  timestamp_created: string;
  selected_date?: string;
  selected_time?: string;
  pain_level: string;
  aura_type?: string;
  pain_locations?: string[];
  medications: string[];
  medication_intakes?: MedicationIntakeInfo[];
  notes?: string | null;
  weather_id?: number | null;
  weather?: WeatherData;
  latitude?: number | null;
  longitude?: number | null;
  entry_kind?: string;
  symptoms_state?: string;
  symptoms_source?: string;
  me_cfs_severity_score?: number;
  me_cfs_severity_level?: string;
}

// Backward compatibility
export type PainEntry = MigraineEntry;
