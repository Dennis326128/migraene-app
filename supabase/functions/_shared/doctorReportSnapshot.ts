/**
 * Shared Module: Doctor Report Snapshot Generator
 * 
 * Baut ein stabiles, websitefreundliches JSON-Format für Doctor-Share Reports.
 * Single Source of Truth für Web-Rendering und PDF-Generierung.
 * 
 * WICHTIG: Diese Logik ist NUR für Doctor-Share und ändert NICHT die App-Report-Pipeline!
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ════════════════════════════════════════════════════════════════════════════
// TYPES: Report JSON Shape (stabil & websitefreundlich)
// ════════════════════════════════════════════════════════════════════════════

export interface DoctorReportMeta {
  range: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  timezone: string;
  reportVersion: string;
}

export interface DocumentationGap {
  gapDays: number;
  message: string;
}

export interface DoctorReportSummary {
  daysInRange: number;
  headacheDays: number;
  migraineDays: number;
  triptanDays: number;
  acuteMedDays: number;
  auraDays: number;
  avgIntensity: number;
  overuseWarning: boolean;
  documentationGaps: DocumentationGap;
}

export interface IntensityDataPoint {
  date: string;
  maxIntensity: number;
  isMigraine: boolean;
}

export interface MedicationChartItem {
  label: string;
  value: number;
  category?: string;
}

export interface DoctorReportCharts {
  intensityOverTime: IntensityDataPoint[];
  topAcuteMeds: MedicationChartItem[];
}

export interface DoctorReportEntry {
  id: number;
  date: string;
  time: string | null;
  intensity: number;
  intensityLabel: string;
  medications: string[];
  note: string | null;
  aura: string | null;
  painLocations: string[];
}

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

export interface MedicationStat {
  name: string;
  intakeCount: number;
  avgEffect: number | null;
  effectCount: number;
  category?: string;
}

export interface DoctorReportTables {
  entries: DoctorReportEntry[];
  entriesTotal: number;
  entriesPage: number;
  entriesPageSize: number;
  prophylaxisCourses: ProphylaxisCourse[];
  medicationStats: MedicationStat[];
  locationStats: Record<string, number>;
}

export interface PatientData {
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

export interface DoctorReportOptional {
  patientData?: PatientData;
  // Future: aiAnalysis, doctorData
}

export interface DoctorReportJSON {
  meta: DoctorReportMeta;
  summary: DoctorReportSummary;
  charts: DoctorReportCharts;
  tables: DoctorReportTables;
  optional: DoctorReportOptional;
}

export interface BuildSnapshotResult {
  reportJson: DoctorReportJSON;
  sourceUpdatedAt: string | null;
}

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const REPORT_VERSION = "v1";
const TIMEZONE = "Europe/Berlin";
const MAX_ENTRIES_PER_PAGE = 100;

// Triptan-Keywords für Erkennung
const TRIPTAN_KEYWORDS = [
  "triptan", "almotriptan", "eletriptan", "frovatriptan",
  "naratriptan", "rizatriptan", "sumatriptan", "zolmitriptan",
  "suma", "riza", "zolmi", "nara", "almo", "ele", "frova",
  "imigran", "maxalt", "ascotop", "naramig", "almogran",
  "relpax", "allegro", "dolotriptan", "formigran"
];

// Pain Level Mapping
const PAIN_LEVEL_TO_NUMBER: Record<string, number> = {
  "-": 0,
  "leicht": 3,
  "mittel": 5,
  "stark": 7,
  "sehr_stark": 9,
};

const PAIN_LEVEL_TO_LABEL: Record<string, string> = {
  "-": "Kein Schmerz",
  "leicht": "Leicht",
  "mittel": "Mittel",
  "stark": "Stark",
  "sehr_stark": "Sehr stark",
};

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function painLevelToNumber(level: string): number {
  return PAIN_LEVEL_TO_NUMBER[level] ?? 5;
}

function painLevelToLabel(level: string): string {
  return PAIN_LEVEL_TO_LABEL[level] ?? level;
}

function isTriptan(medName: string): boolean {
  const lower = medName.toLowerCase();
  return TRIPTAN_KEYWORDS.some(kw => lower.includes(kw));
}

function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  switch (range) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "6m":
      from.setMonth(from.getMonth() - 6);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      from.setMonth(from.getMonth() - 3);
  }

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  return timeStr.substring(0, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ════════════════════════════════════════════════════════════════════════════

export interface BuildSnapshotOptions {
  userId: string;
  range: string;
  page?: number;
  pageSize?: number;
  includePatientData?: boolean;
}

export async function buildDoctorReportSnapshot(
  supabase: SupabaseClient,
  options: BuildSnapshotOptions
): Promise<BuildSnapshotResult> {
  const {
    userId,
    range,
    page = 1,
    pageSize = MAX_ENTRIES_PER_PAGE,
    includePatientData = true,
  } = options;

  const { from, to } = getDateRange(range);
  const now = new Date().toISOString();

  console.log(`[DoctorReportSnapshot] Building snapshot for user=${userId.substring(0, 8)}... range=${range}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1) ALLE DATEN PARALLEL LADEN
  // ─────────────────────────────────────────────────────────────────────────

  const [
    allEntriesResult,
    entriesCountResult,
    paginatedEntriesResult,
    medicationCoursesResult,
    patientDataResult,
    userMedicationsResult,
  ] = await Promise.all([
    // Alle Einträge für Summary/Charts (ohne Limit!)
    supabase
      .from("pain_entries")
      .select("id, selected_date, selected_time, pain_level, medications, aura_type, pain_locations, notes, timestamp_created")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .order("selected_date", { ascending: false })
      .order("selected_time", { ascending: false }),

    // Total Count
    supabase
      .from("pain_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to),

    // Paginierte Einträge für Tabelle
    supabase
      .from("pain_entries")
      .select("id, selected_date, selected_time, pain_level, medications, aura_type, pain_locations, notes")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .order("selected_date", { ascending: false })
      .order("selected_time", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),

    // Medication Courses (Prophylaxe)
    supabase
      .from("medication_courses")
      .select("id, medication_name, start_date, end_date, dose_text, is_active, subjective_effectiveness, side_effects_text, discontinuation_reason, type, updated_at")
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),

    // Patient Data (optional)
    includePatientData
      ? supabase
          .from("patient_data")
          .select("first_name, last_name, date_of_birth, street, postal_code, city, phone, fax, health_insurance, insurance_number, salutation, title")
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // User Medications für Kategorisierung
    supabase
      .from("user_medications")
      .select("id, name, art, effect_category")
      .eq("user_id", userId),
  ]);

  const allEntries = allEntriesResult.data || [];
  const totalEntries = entriesCountResult.count || 0;
  const paginatedEntries = paginatedEntriesResult.data || [];
  const medicationCourses = medicationCoursesResult.data || [];
  const patientData = patientDataResult.data;
  const userMedications = userMedicationsResult.data || [];

  // ─────────────────────────────────────────────────────────────────────────
  // 2) SOURCE_UPDATED_AT BERECHNEN (für Staleness-Check)
  // ─────────────────────────────────────────────────────────────────────────

  let latestTimestamp: Date | null = null;

  allEntries.forEach(e => {
    const ts = e.timestamp_created ? new Date(e.timestamp_created) : null;
    if (ts && (!latestTimestamp || ts > latestTimestamp)) {
      latestTimestamp = ts;
    }
  });

  medicationCourses.forEach(c => {
    const ts = c.updated_at ? new Date(c.updated_at) : null;
    if (ts && (!latestTimestamp || ts > latestTimestamp)) {
      latestTimestamp = ts;
    }
  });

  const sourceUpdatedAt = latestTimestamp?.toISOString() || null;

  // ─────────────────────────────────────────────────────────────────────────
  // 3) SUMMARY BERECHNEN
  // ─────────────────────────────────────────────────────────────────────────

  const daysInRange = Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  // Unique date sets
  const painDaysSet = new Set<string>();
  const migraineDaysSet = new Set<string>();
  const triptanDaysSet = new Set<string>();
  const acuteMedDaysSet = new Set<string>();
  const auraDaysSet = new Set<string>();
  const documentedDatesSet = new Set<string>();

  // Intensity für Durchschnitt (Tagesmaximum)
  const dailyMaxIntensity = new Map<string, number>();

  allEntries.forEach(entry => {
    const date = entry.selected_date;
    if (!date) return;

    documentedDatesSet.add(date);

    const intensity = painLevelToNumber(entry.pain_level);

    // Schmerztag = intensity > 0
    if (entry.pain_level && entry.pain_level !== "-") {
      painDaysSet.add(date);

      // Track daily max intensity
      const currentMax = dailyMaxIntensity.get(date) || 0;
      if (intensity > currentMax) {
        dailyMaxIntensity.set(date, intensity);
      }
    }

    // Migränetag = stark oder sehr_stark (>=7)
    if (entry.pain_level === "stark" || entry.pain_level === "sehr_stark") {
      migraineDaysSet.add(date);
    }

    // Triptantag
    if (entry.medications?.some((med: string) => isTriptan(med))) {
      triptanDaysSet.add(date);
    }

    // Akutmedikationstag
    if (entry.medications && entry.medications.length > 0) {
      acuteMedDaysSet.add(date);
    }

    // Auratag
    if (entry.aura_type && entry.aura_type !== "keine") {
      auraDaysSet.add(date);
    }
  });

  // Durchschnittliche Intensität (über Tagesmaximum)
  const dailyMaxValues = Array.from(dailyMaxIntensity.values());
  const avgIntensity = dailyMaxValues.length > 0
    ? Math.round((dailyMaxValues.reduce((a, b) => a + b, 0) / dailyMaxValues.length) * 10) / 10
    : 0;

  // Overuse Warning
  const monthsInRange = daysInRange / 30;
  const acuteMedDaysPerMonth = acuteMedDaysSet.size / monthsInRange;
  const overuseWarning = acuteMedDaysPerMonth > 10;

  // Documentation Gaps
  const gapDays = daysInRange - documentedDatesSet.size;
  const documentationGaps: DocumentationGap = {
    gapDays,
    message: gapDays > 0
      ? `${gapDays} von ${daysInRange} Tagen ohne Dokumentation`
      : "Vollständig dokumentiert",
  };

  const summary: DoctorReportSummary = {
    daysInRange,
    headacheDays: painDaysSet.size,
    migraineDays: migraineDaysSet.size,
    triptanDays: triptanDaysSet.size,
    acuteMedDays: acuteMedDaysSet.size,
    auraDays: auraDaysSet.size,
    avgIntensity,
    overuseWarning,
    documentationGaps,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4) CHARTS BAUEN
  // ─────────────────────────────────────────────────────────────────────────

  // Intensity Over Time (sorted by date)
  const intensityOverTime: IntensityDataPoint[] = Array.from(dailyMaxIntensity.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, maxIntensity]) => ({
      date,
      maxIntensity,
      isMigraine: maxIntensity >= 7,
    }));

  // Top Acute Meds
  const medCountMap = new Map<string, number>();
  allEntries.forEach(entry => {
    entry.medications?.forEach((med: string) => {
      medCountMap.set(med, (medCountMap.get(med) || 0) + 1);
    });
  });

  // Kategorisierung via user_medications
  const medCategoryMap = new Map<string, string>();
  userMedications.forEach(um => {
    medCategoryMap.set(um.name, um.art || um.effect_category || "akut");
  });

  const topAcuteMeds: MedicationChartItem[] = Array.from(medCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({
      label,
      value,
      category: medCategoryMap.get(label) || (isTriptan(label) ? "triptan" : "akut"),
    }));

  const charts: DoctorReportCharts = {
    intensityOverTime,
    topAcuteMeds,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 5) TABLES BAUEN
  // ─────────────────────────────────────────────────────────────────────────

  // Entries (paginiert)
  const entries: DoctorReportEntry[] = paginatedEntries.map(e => ({
    id: e.id,
    date: e.selected_date,
    time: formatTime(e.selected_time),
    intensity: painLevelToNumber(e.pain_level),
    intensityLabel: painLevelToLabel(e.pain_level),
    medications: e.medications || [],
    note: e.notes || null,
    aura: e.aura_type && e.aura_type !== "keine" ? e.aura_type : null,
    painLocations: e.pain_locations || [],
  }));

  // Prophylaxis Courses
  const prophylaxisCourses: ProphylaxisCourse[] = medicationCourses.map(c => ({
    id: c.id,
    name: c.medication_name,
    doseText: c.dose_text || null,
    startDate: c.start_date || null,
    endDate: c.end_date || null,
    isActive: c.is_active,
    effectiveness: c.subjective_effectiveness || null,
    sideEffects: c.side_effects_text || null,
    discontinuationReason: c.discontinuation_reason || null,
  }));

  // Medication Stats
  const medEffectMap = new Map<string, { count: number; effects: number[] }>();
  allEntries.forEach(entry => {
    entry.medications?.forEach((med: string) => {
      if (!medEffectMap.has(med)) {
        medEffectMap.set(med, { count: 0, effects: [] });
      }
      medEffectMap.get(med)!.count++;
    });
  });

  const medicationStats: MedicationStat[] = Array.from(medEffectMap.entries())
    .map(([name, stat]) => ({
      name,
      intakeCount: stat.count,
      avgEffect: null, // TODO: Integrate medication_effects if needed
      effectCount: 0,
      category: medCategoryMap.get(name) || (isTriptan(name) ? "triptan" : "akut"),
    }))
    .sort((a, b) => b.intakeCount - a.intakeCount);

  // Location Stats
  const locationStats: Record<string, number> = {};
  allEntries.forEach(entry => {
    entry.pain_locations?.forEach((loc: string) => {
      locationStats[loc] = (locationStats[loc] || 0) + 1;
    });
  });

  const tables: DoctorReportTables = {
    entries,
    entriesTotal: totalEntries,
    entriesPage: page,
    entriesPageSize: pageSize,
    prophylaxisCourses,
    medicationStats,
    locationStats,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 6) OPTIONAL DATA
  // ─────────────────────────────────────────────────────────────────────────

  const optional: DoctorReportOptional = {};

  if (patientData) {
    const firstName = patientData.first_name as string | null;
    const lastName = patientData.last_name as string | null;
    const title = patientData.title as string | null;

    let fullName: string | null = null;
    if (firstName || lastName) {
      const parts: string[] = [];
      if (title) parts.push(title);
      if (firstName) parts.push(firstName);
      if (lastName) parts.push(lastName);
      fullName = parts.join(" ");
    }

    optional.patientData = {
      firstName: firstName || null,
      lastName: lastName || null,
      fullName,
      dateOfBirth: patientData.date_of_birth as string | null,
      street: patientData.street as string | null,
      postalCode: patientData.postal_code as string | null,
      city: patientData.city as string | null,
      phone: patientData.phone as string | null,
      fax: patientData.fax as string | null,
      healthInsurance: patientData.health_insurance as string | null,
      insuranceNumber: patientData.insurance_number as string | null,
      salutation: patientData.salutation as string | null,
      title: title || null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7) FINAL REPORT JSON
  // ─────────────────────────────────────────────────────────────────────────

  const meta: DoctorReportMeta = {
    range,
    fromDate: from,
    toDate: to,
    generatedAt: now,
    timezone: TIMEZONE,
    reportVersion: REPORT_VERSION,
  };

  const reportJson: DoctorReportJSON = {
    meta,
    summary,
    charts,
    tables,
    optional,
  };

  console.log(`[DoctorReportSnapshot] Built snapshot: ${entries.length}/${totalEntries} entries, ${prophylaxisCourses.length} courses`);

  return {
    reportJson,
    sourceUpdatedAt,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SNAPSHOT CACHING HELPERS
// ════════════════════════════════════════════════════════════════════════════

export interface CachedSnapshot {
  id: string;
  reportJson: DoctorReportJSON;
  sourceUpdatedAt: string | null;
  generatedAt: string;
  isStale: boolean;
}

/**
 * Get cached snapshot if fresh, otherwise null
 */
export async function getCachedSnapshot(
  supabase: SupabaseClient,
  shareId: string,
  range: string
): Promise<CachedSnapshot | null> {
  const { data, error } = await supabase
    .from("doctor_share_report_snapshots")
    .select("id, report_json, source_updated_at, generated_at, is_stale")
    .eq("share_id", shareId)
    .eq("range", range)
    .eq("report_version", REPORT_VERSION)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    reportJson: data.report_json as DoctorReportJSON,
    sourceUpdatedAt: data.source_updated_at,
    generatedAt: data.generated_at,
    isStale: data.is_stale,
  };
}

/**
 * Check if snapshot is stale by comparing source_updated_at
 */
export async function isSnapshotStale(
  supabase: SupabaseClient,
  userId: string,
  range: string,
  cachedSourceUpdatedAt: string | null
): Promise<boolean> {
  if (!cachedSourceUpdatedAt) {
    return true; // No cached timestamp = stale
  }

  const { from, to } = getDateRange(range);

  // Check latest update in pain_entries
  const { data: latestEntry } = await supabase
    .from("pain_entries")
    .select("timestamp_created")
    .eq("user_id", userId)
    .gte("selected_date", from)
    .lte("selected_date", to)
    .order("timestamp_created", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check latest update in medication_courses
  const { data: latestCourse } = await supabase
    .from("medication_courses")
    .select("updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cachedDate = new Date(cachedSourceUpdatedAt);

  if (latestEntry?.timestamp_created && new Date(latestEntry.timestamp_created) > cachedDate) {
    return true;
  }

  if (latestCourse?.updated_at && new Date(latestCourse.updated_at) > cachedDate) {
    return true;
  }

  return false;
}

/**
 * Upsert snapshot in cache
 */
export async function upsertSnapshot(
  supabase: SupabaseClient,
  shareId: string,
  range: string,
  reportJson: DoctorReportJSON,
  sourceUpdatedAt: string | null,
  sessionId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from("doctor_share_report_snapshots")
    .upsert(
      {
        share_id: shareId,
        range,
        report_version: REPORT_VERSION,
        report_json: reportJson,
        source_updated_at: sourceUpdatedAt,
        generated_at: new Date().toISOString(),
        session_id: sessionId || null,
        is_stale: false,
      },
      {
        onConflict: "share_id,range,report_version",
      }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[DoctorReportSnapshot] Upsert error:", error);
    throw error;
  }

  return data.id;
}
