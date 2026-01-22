/**
 * Doctor Share Types
 * TypeScript-Definitionen für den Doctor-Share-Flow
 */

// Patient App: Status des eigenen Arzt-Codes
export interface DoctorShareStatus {
  id: string;
  code: string;
  code_display: string;
  created_at: string;
  share_active_until: string | null;
  share_revoked_at: string | null;
  is_share_active: boolean;
  was_revoked_today: boolean;
}

// Ergebnis der Aktivierung/Revoke-Mutation
export interface ActivateShareResult {
  success: boolean;
  message: string;
  share_active_until: string | null;
  share_revoked_at: string | null;
  is_share_active: boolean;
  code_display?: string;
}

// Website: Patientenstammdaten (für Arzt-Ansicht)
export interface PatientInfo {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  fax: string | null;
  health_insurance: string | null;
  insurance_number: string | null;
  salutation: string | null;
  title: string | null;
}

// Website: Zusammenfassung der Einträge
export interface ReportSummary {
  headache_days: number;
  migraine_days: number;
  triptan_days: number;
  acute_med_days: number;
  aura_days: number;
  avg_intensity: number;
  overuse_warning: boolean;
  days_in_range: number;
}

// Website: Chart-Daten
export interface ChartData {
  dates: string[];
  pain_levels: number[];
}

// Website: Einzelner Tagebucheintrag
export interface PainEntry {
  id: number;
  user_id: string;
  selected_date: string;
  selected_time: string | null;
  pain_level: string;
  medications: string[] | null;
  medication_ids: string[] | null;
  notes: string | null;
  pain_locations: string[] | null;
  aura_type: string;
  timestamp_created: string;
}

// Website: Medikamenten-Statistik
export interface MedicationStat {
  name: string;
  intake_count: number;
  avg_effect: number | null;
  effect_count: number;
}

// Website: Prophylaxe-Kurs
export interface MedicationCourse {
  id: string;
  medication_name: string;
  start_date: string | null;
  end_date: string | null;
  dose_text: string | null;
  is_active: boolean;
  subjective_effectiveness: number | null;
  side_effects_text: string | null;
  discontinuation_reason: string | null;
  type: string;
}

// Website: User Medication (aus Medikamentenliste)
export interface UserMedication {
  id: string;
  name: string;
  wirkstoff: string | null;
  staerke: string | null;
  art: string | null;
  intake_type: string | null;
  is_active: boolean;
}

// Website: Vollständige API-Response
export interface DoctorReportData {
  // Patientenstammdaten
  patient: PatientInfo | null;
  
  // Zusammenfassung
  summary: ReportSummary;
  
  // Chart-Daten
  chart_data: ChartData;
  
  // Paginierte Einträge
  entries: PainEntry[];
  entries_total: number;
  entries_page: number;
  entries_page_size: number;
  
  // Medikamenten-Infos
  medication_stats: MedicationStat[];
  medication_courses: MedicationCourse[];
  user_medications: UserMedication[];
  
  // Schmerzort-Statistik
  location_stats: Record<string, number>;
  
  // Zeitraum
  from_date: string;
  to_date: string;
}

// Website: Validation Response
export interface ValidateShareResponse {
  valid: boolean;
  session_id?: string;
  share_active_until?: string;
  default_range?: string;
  error?: string;
  error_code?: 'invalid' | 'revoked' | 'expired_code' | 'not_shared' | 'rate_limited' | 'internal_error';
}

// Website: Ping Response
export interface PingSessionResponse {
  active: boolean;
  remaining_minutes?: number;
  reason?: string;
}

// Legacy-Exports für Kompatibilität
export type DoctorShare = DoctorShareStatus;
