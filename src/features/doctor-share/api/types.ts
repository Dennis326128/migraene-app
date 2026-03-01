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
  is_active: boolean;
  expires_at: string | null;
  is_currently_active: boolean;
  default_range: string;
  // Legacy compat (App-side)
  is_share_active: boolean;
  share_active_until: string | null;
  share_revoked_at: string | null;
  was_revoked_today: boolean;
}

// Ergebnis der Aktivierung/Deaktivierung
export interface ActivateShareResult {
  success: boolean;
  message: string;
  is_active: boolean;
  expires_at: string | null;
  is_currently_active: boolean;
  code_display?: string;
  // Legacy compat (App-side)
  is_share_active: boolean;
  share_active_until: string | null;
  share_revoked_at: string | null;
}

// Website: Patientenstammdaten (für Arzt-Ansicht)
export interface PatientInfo {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  fax: string | null;
  healthInsurance: string | null;
  insuranceNumber: string | null;
  salutation: string | null;
  title: string | null;
}

// Website: Prophylaxe-Kurs
export interface MedicationCourse {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  doseText: string | null;
  isActive: boolean;
  effectiveness: number | null;
  sideEffects: string | null;
  discontinuationReason: string | null;
}

// Website: Medikamenten-Statistik
export interface MedicationStat {
  name: string;
  intakeCount: number;
  avgEffect: number | null;
  effectCount: number;
  daysUsed?: number;
  avgPer30?: number;
  isTriptan?: boolean;
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

// Website: Validation Response (token-based)
export interface ValidateShareResponse {
  valid: boolean;
  access_token?: string;
  expires_at?: string;
  default_range?: string;
  error?: string;
  error_code?: 'invalid' | 'revoked' | 'expired_code' | 'not_shared' | 'rate_limited' | 'internal_error';
}

// Website: Ping Response (token-based status check)
export interface PingSessionResponse {
  active: boolean;
  remaining_minutes?: number;
  reason?: string;
}

// Legacy-Exports für Kompatibilität
export type DoctorShare = DoctorShareStatus;
