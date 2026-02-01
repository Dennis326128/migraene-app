/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPORT MODEL - SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gemeinsames Report-Modell für App-PDF und Website.
 * Stellt sicher, dass beide dieselbe Datenstruktur verwenden.
 * 
 * WICHTIG: Diese Types werden sowohl vom Frontend (App) als auch
 * vom Edge Function (Website) verwendet.
 */

// ═══════════════════════════════════════════════════════════════════════════
// REPORT PERIOD & NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ReportPeriod {
  /** Erster Tag im Zeitraum (YYYY-MM-DD) */
  fromDate: string;
  /** Letzter Tag im Zeitraum (YYYY-MM-DD) */
  toDate: string;
  /** Exakte Anzahl Tage im Zeitraum (inklusive) */
  daysInRange: number;
  /** Anzahl Tage mit mindestens einem Eintrag */
  documentedDaysCount: number;
  /** Gesamtzahl der Einträge */
  entriesCount: number;
}

export interface NormalizationConfig {
  /** Normalisierung aktiviert */
  enabled: boolean;
  /** Ziel-Tage für Normalisierung (Standard: 30) */
  targetDays: number;
  /** Basis für Normalisierung (= daysInRange) */
  basisDays: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE KPIs (RAW + NORMALIZED)
// ═══════════════════════════════════════════════════════════════════════════

export interface CoreKPIs {
  /** Distinct Tage mit Kopfschmerzen (roh) */
  painDays: number;
  /** Distinct Tage mit Migräne (stark/sehr_stark) (roh) */
  migraineDays: number;
  /** Distinct Tage mit Triptan-Einnahme (roh) */
  triptanDays: number;
  /** Distinct Tage mit Akutmedikation (roh) */
  acuteMedDays: number;
  /** Distinct Tage mit Aura (roh) */
  auraDays: number;
  /** Durchschnittliche Schmerzintensität (0-10) */
  avgIntensity: number;
  /** Gesamtzahl Triptan-Einnahmen (nicht Tage!) */
  totalTriptanIntakes: number;
}

export interface NormalizedKPIs {
  /** Kopfschmerztage normiert auf 30 Tage */
  painDaysPer30: number;
  /** Migränetage normiert auf 30 Tage */
  migraineDaysPer30: number;
  /** Triptantage normiert auf 30 Tage */
  triptanDaysPer30: number;
  /** Triptan-Einnahmen normiert auf 30 Tage */
  triptanIntakesPer30: number;
  /** Akutmedikationstage normiert auf 30 Tage */
  acuteMedDaysPer30: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface MedicationStat {
  /** Medikamentenname */
  name: string;
  /** Dosierung (falls bekannt) */
  dose?: string;
  /** Einheit (mg, Stück, etc.) */
  units?: string;
  /** Gesamteinnahmen im Zeitraum */
  totalIntakes: number;
  /** Distinct Tage mit Einnahme */
  daysUsed: number;
  /** Ø Einnahmen pro 30 Tage */
  avgPer30: number;
  /** Einnahmen in den letzten 30 Tagen */
  last30Intakes: number;
  /** Durchschnittliche Wirksamkeit (0-10, null wenn keine Bewertung) */
  effectivenessPct: number | null;
  /** Anzahl Wirksamkeitsbewertungen */
  effectivenessCount: number;
  /** Ist Triptan */
  isTriptan: boolean;
  /** Kategorie (akut, prophylaxe, etc.) */
  category?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPHYLAXIS COURSES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProphylaxisCourse {
  id: string;
  name: string;
  doseText: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  effectiveness: number | null;
  sideEffects: string | null;
  discontinuationReason: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRIES
// ═══════════════════════════════════════════════════════════════════════════

export interface ReportEntry {
  id: number;
  /** Event-Datum (selected_date) */
  date: string;
  /** Event-Uhrzeit (selected_time), null wenn nicht angegeben */
  time: string | null;
  /** Erstellungszeitpunkt (für Sortierung bei gleichem Datum) */
  createdAt: string;
  /** Schmerzintensität (0-10) */
  intensity: number;
  /** Schmerzlevel-Label (Leicht, Mittel, etc.) */
  intensityLabel: string;
  /** Eingenommene Medikamente */
  medications: string[];
  /** Notiz (optional, je nach Privacy-Einstellung) */
  note: string | null;
  /** Aura-Typ (null wenn keine) */
  aura: string | null;
  /** Schmerzorte */
  painLocations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER DATA (optional)
// ═══════════════════════════════════════════════════════════════════════════

export interface WeatherDataPoint {
  date: string;
  temperatureC: number | null;
  pressureMb: number | null;
  pressureChange24h: number | null;
  humidity: number | null;
  conditionText: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT DATA
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE REPORT MODEL
// ═══════════════════════════════════════════════════════════════════════════

export interface UnifiedReportModel {
  /** Schema-Version für Kompatibilität */
  schemaVersion: string;
  
  /** Zeitraum-Metadaten */
  period: ReportPeriod;
  
  /** Normalisierungs-Konfiguration */
  normalization: NormalizationConfig;
  
  /** Kern-KPIs (roh) */
  kpis: CoreKPIs;
  
  /** Normalisierte KPIs (auf 30 Tage) */
  normalizedKPIs: NormalizedKPIs;
  
  /** Medikamenten-Statistik */
  medications: MedicationStat[];
  
  /** Prophylaxe-Kurse */
  prophylaxis: ProphylaxisCourse[];
  
  /** Wetterdaten (optional) */
  weather?: WeatherDataPoint[];
  
  /** Einträge (paginiert) */
  entries: ReportEntry[];
  entriesTotal: number;
  entriesPage: number;
  entriesPageSize: number;
  
  /** Patientendaten (optional) */
  patient?: PatientInfo;
  
  /** Schmerzort-Statistik */
  locationStats: Record<string, number>;
  
  /** Generierungszeitpunkt */
  generatedAt: string;
  
  /** Timezone */
  timezone: string;
  
  /** Übergebrauchswarnung aktiv */
  overuseWarning: boolean;
  
  /** Dokumentationslücken */
  documentationGapDays: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Normalisierung berechnen
// ═══════════════════════════════════════════════════════════════════════════

export function normalizeValue(rawValue: number, daysInRange: number, targetDays = 30): number {
  if (daysInRange <= 0) return 0;
  return Math.round((rawValue / daysInRange) * targetDays * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// SORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sortiert Einträge nach:
 * 1. selected_date DESC (neueste zuerst)
 * 2. selected_time DESC (späteste Uhrzeit zuerst)
 * 3. timestamp_created DESC (Fallback für gleiche Uhrzeit)
 */
export function sortEntriesDescending<T extends { date: string; time: string | null; createdAt: string }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    // 1. Datum vergleichen
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    
    // 2. Zeit vergleichen (null = Ende des Tages für Sortierung)
    const timeA = a.time || '23:59:59';
    const timeB = b.time || '23:59:59';
    const timeCompare = timeB.localeCompare(timeA);
    if (timeCompare !== 0) return timeCompare;
    
    // 3. createdAt als Fallback
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const CURRENT_SCHEMA_VERSION = 'v2.0';

export const PAIN_LEVEL_MAP: Record<string, { value: number; label: string }> = {
  '-': { value: 0, label: 'Kein Schmerz' },
  'leicht': { value: 3, label: 'Leicht' },
  'mittel': { value: 5, label: 'Mittel' },
  'stark': { value: 7, label: 'Stark' },
  'sehr_stark': { value: 9, label: 'Sehr stark' },
};

export const TRIPTAN_KEYWORDS = [
  'triptan', 'almotriptan', 'eletriptan', 'frovatriptan',
  'naratriptan', 'rizatriptan', 'sumatriptan', 'zolmitriptan',
  'suma', 'riza', 'zolmi', 'nara', 'almo', 'ele', 'frova',
  'imigran', 'maxalt', 'ascotop', 'naramig', 'almogran',
  'relpax', 'allegro', 'dolotriptan', 'formigran'
];

export function isTriptan(medName: string): boolean {
  const lower = medName.toLowerCase();
  return TRIPTAN_KEYWORDS.some(kw => lower.includes(kw));
}
