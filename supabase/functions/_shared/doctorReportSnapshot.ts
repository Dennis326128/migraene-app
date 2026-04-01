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
// Aligned with src/features/doctor-share/api/reportModel.ts
// ════════════════════════════════════════════════════════════════════════════

export interface ReportPeriod {
  fromDate: string;
  toDate: string;
  daysInRange: number;
  documentedDaysCount: number;
  entriesCount: number;
}

export interface NormalizationConfig {
  enabled: boolean;
  targetDays: number;
  basisDays: number;
}

export interface DoctorReportMeta {
  range: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  timezone: string;
  reportVersion: string;
  /** Canonical schema version field for API contract */
  schemaVersion: string;
  /** Detailed period info */
  period: ReportPeriod;
  /** Normalization config */
  normalization: NormalizationConfig;
}

export interface DocumentationGap {
  gapDays: number;
  message: string;
}

export interface CoreKPIs {
  painDays: number;
  migraineDays: number;
  triptanDays: number;
  acuteMedDays: number;
  auraDays: number;
  avgIntensity: number;
  totalTriptanIntakes: number;
}

export interface NormalizedKPIs {
  painDaysPer30: number;
  migraineDaysPer30: number;
  triptanDaysPer30: number;
  triptanIntakesPer30: number;
  acuteMedDaysPer30: number;
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
  /** Raw KPIs */
  kpis: CoreKPIs;
  /** Normalized KPIs (per 30 days) */
  normalizedKPIs: NormalizedKPIs;
  /** Total triptan intakes (not days) */
  totalTriptanIntakes: number;
}

export interface IntensityDataPoint {
  date: string;
  maxIntensity: number;
  isMigraine: boolean;
  /** Daily temperature in °C (from weather_logs) */
  temperatureC?: number | null;
  /** Daily pressure in mbar (from weather_logs) */
  pressureMb?: number | null;
}

export interface MedicationChartItem {
  label: string;
  value: number;
  category?: string;
}

/** Time-of-day distribution item (hourly histogram) */
export interface TimeDistributionItem {
  hour: number;
  count: number;
}

export interface DoctorReportCharts {
  intensityOverTime: IntensityDataPoint[];
  topAcuteMeds: MedicationChartItem[];
  /** Hourly distribution of pain entries (0-23) */
  timeDistribution?: TimeDistributionItem[];
}

export interface DoctorReportEntry {
  id: number;
  date: string;
  time: string | null;
  /** createdAt for secondary sorting */
  createdAt: string;
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
  /** Course type: prophylaxe, akut, etc. */
  type?: string;
  /** Note for physician (non-private) */
  noteForPhysician?: string | null;
  /** Whether side effects were reported */
  hadSideEffects?: boolean;
  /** Baseline data for comparison */
  baselineMigraineDays?: string | null;
  baselineAcuteMedDays?: string | null;
  baselineTriptanDosesPerMonth?: number | null;
  baselineImpairmentLevel?: string | null;
}

export interface MedicationStat {
  name: string;
  intakeCount: number;
  avgEffect: number | null;
  effectCount: number;
  category?: string;
  /** Distinct days used */
  daysUsed?: number;
  /** Avg per 30 days */
  avgPer30?: number;
  /** Is triptan flag */
  isTriptan?: boolean;
  /** Intakes in last 30 days of range */
  last30Intakes?: number;
  /** Average effect as percentage (0-100), null if no ratings */
  avgEffectPercent?: number | null;
  /** Number of entries with actual effect ratings */
  ratedCount?: number;
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
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS BLOCK TYPES — Additive extension for Website (V1.1)
// ════════════════════════════════════════════════════════════════════════════

/** Symptom frequency item */
export interface SymptomStatItem {
  name: string;
  count: number;
  /** Percentage relative to checked episodes (symptoms_state viewed/edited) */
  percentageOfChecked: number;
  /** Clinical group classification */
  group?: 'migraine' | 'neurological' | 'other';
  /** User-assigned burden level (1-4, null if not set) */
  burdenLevel?: number | null;
  /** Human-readable burden label (DE) */
  burdenLabel?: string;
  /** Composite relevance score (frequency × burden weight) */
  relevanceScore?: number;
}

/** Accompanying symptoms analysis */
export interface SymptomsAnalysis {
  /** All symptoms sorted by frequency */
  items: SymptomStatItem[];
  /** Total entries in range */
  totalEntries: number;
  /** Entries where symptoms section was viewed/edited */
  checkedEntries: number;
  /** Entries that have at least one symptom */
  entriesWithSymptoms: number;
}

/** Trigger keyword extraction from notes */
export interface TriggerItem {
  trigger: string;
  count: number;
}

export interface TriggersAnalysis {
  /** Top triggers sorted by frequency, max 7 */
  items: TriggerItem[];
  /** Number of entries with non-private notes analyzed */
  notesAnalyzed: number;
}

/** Detailed headache/treatment day donut (3-bucket: painFree/painNoTriptan/triptan) */
export interface HeadacheDayDonut {
  painFreeDays: number;
  painDaysNoTriptan: number;
  triptanDays: number;
  totalDays: number;
  percentages: {
    painFree: number;
    painNoTriptan: number;
    triptan: number;
  };
}

/** Weather pressure bucket result */
export interface WeatherBucket {
  label: string;
  nDays: number;
  headacheRate: number;
  meanPainMax: number | null;
  acuteMedRate: number;
}

/** Weather relative risk */
export interface WeatherRelativeRisk {
  referenceLabel: string;
  compareLabel: string;
  rr: number | null;
  absDiff: number | null;
}

/** Weather coverage info */
export interface WeatherCoverage {
  daysDocumented: number;
  daysWithWeather: number;
  daysWithDelta24h: number;
  ratioWeather: number;
  ratioDelta24h: number;
}

/** Weather pressure delta 24h analysis */
export interface WeatherPressureDelta {
  enabled: boolean;
  confidence: "high" | "medium" | "low" | "insufficient";
  buckets: WeatherBucket[];
  relativeRisk: WeatherRelativeRisk | null;
  notes: string[];
}

/** Structured weather association analysis */
export interface WeatherAnalysis {
  coverage: WeatherCoverage;
  pressureDelta24h: WeatherPressureDelta;
  disclaimer: string;
}

/** ME/CFS severity segment */
export interface MeCfsSegment {
  key: "none" | "mild" | "moderate" | "severe" | "undocumented";
  days: number;
}

/** ME/CFS analysis */
export interface MeCfsAnalysis {
  segments: MeCfsSegment[];
  documentedDays: number;
  totalDaysInRange: number;
  /** Guard: only show if documented >= 14 */
  sufficient: boolean;
  /** Average severity score (only documented days with score > 0) */
  avgScore?: number | null;
  /** Peak severity score */
  peakScore?: number | null;
  /** Peak severity label (mild/moderate/severe) */
  peakLabel?: string | null;
  /** Documentation rate = documentedDays / totalDaysInRange */
  documentationRate?: number;
}

/** Full analysis block (all optional sub-fields) */
export interface DoctorReportAnalysis {
  symptoms?: SymptomsAnalysis;
  triggers?: TriggersAnalysis;
  headacheDayDonut?: HeadacheDayDonut;
  weather?: WeatherAnalysis;
  mecfs?: MeCfsAnalysis;
}

// ════════════════════════════════════════════════════════════════════════════

export interface DoctorReportJSON {
  meta: DoctorReportMeta;
  summary: DoctorReportSummary;
  charts: DoctorReportCharts;
  tables: DoctorReportTables;
  optional: DoctorReportOptional;
  /** V1.1: Extended clinical analysis blocks for website rendering */
  analysis?: DoctorReportAnalysis;
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
/** Snapshot TTL in milliseconds (10 minutes) */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

// Triptan-Keywords für Erkennung
const TRIPTAN_KEYWORDS = [
  "triptan", "almotriptan", "eletriptan", "frovatriptan",
  "naratriptan", "rizatriptan", "sumatriptan", "zolmitriptan",
  "suma", "riza", "zolmi", "nara", "almo", "ele", "frova",
  "imigran", "maxalt", "ascotop", "naramig", "almogran",
  "relpax", "allegro", "dolotriptan", "formigran"
];

// ── Symptom classification (mirrored from src/lib/pdf/symptomSection.ts) ──
const MIGRAINE_SYMPTOMS = [
  'lichtempfindlichkeit', 'photophobie',
  'geraeuschempfindlichkeit', 'geräuschempfindlichkeit', 'phonophobie',
  'uebelkeit', 'übelkeit', 'erbrechen',
  'appetitlosigkeit', 'geruchsempfindlichkeit',
];
const NEUROLOGICAL_SYMPTOMS = [
  'wortfindungsstoerung', 'wortfindungsstörung',
  'konzentrationsstoerung', 'konzentrationsstörung', 'konzentrationsprobleme',
  'sehstoerung', 'sehstörung', 'sehstörungen', 'verschwommensehen',
  'schwindel', 'taubheitsgefuehl', 'taubheitsgefühl',
  'kribbeln', 'sprachstoerung', 'sprachstörung', 'aura',
];

function classifySymptom(name: string): 'migraine' | 'neurological' | 'other' {
  const lower = name.toLowerCase().trim();
  if (MIGRAINE_SYMPTOMS.some(s => lower.includes(s))) return 'migraine';
  if (NEUROLOGICAL_SYMPTOMS.some(s => lower.includes(s))) return 'neurological';
  return 'other';
}

// ── Burden labels (mirrored from useSymptomBurden.ts) ──
const BURDEN_LABELS: Record<number, string> = {
  0: "",
  1: "gering",
  2: "moderat",
  3: "ausgeprägt",
  4: "führendes Leitsymptom",
};
const BURDEN_WEIGHTS: Record<number, number> = {
  0: 1.0, 1: 1.1, 2: 1.2, 3: 1.35, 4: 1.5,
};

// ── ME/CFS severity label mapping ──
function meCfsSeverityLabel(score: number): string {
  if (score <= 0) return 'none';
  if (score <= 3) return 'mild';
  if (score <= 6) return 'moderate';
  return 'severe';
}

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

// Trigger keywords — same as PDF report SSOT
const TRIGGER_KEYWORDS: Record<string, string[]> = {
  'Helligkeit / Licht': ['hell', 'licht', 'sonne', 'blendung', 'grell', 'bildschirm', 'monitor'],
  'Lärm / Geräusche': ['laerm', 'lärm', 'laut', 'geraeusch', 'geräusch', 'krach'],
  'Stress': ['stress', 'anspannung', 'druck', 'hektik', 'belastung'],
  'Schlafmangel': ['schlaf', 'muede', 'müde', 'schlecht geschlafen', 'wenig schlaf', 'uebermuedet', 'übermüdet'],
  'Körperliche Belastung': ['sport', 'anstrengung', 'koerperlich', 'körperlich', 'training', 'belastung'],
  'Wetter': ['wetter', 'foehn', 'föhn', 'gewitter', 'schwuel', 'schwül', 'hitze', 'kaelte', 'kälte'],
  'Infekt / Krankheit': ['infekt', 'erkaelt', 'erkält', 'krank', 'grippe', 'fieber'],
  'Alkohol': ['alkohol', 'wein', 'bier', 'sekt'],
  'Menstruation / Zyklus': ['menstruation', 'periode', 'zyklus', 'regel', 'pms'],
};

// Weather pressure delta bucket thresholds (same as computeWeatherAssociation SSOT)
const PRESSURE_STRONG_DROP = -8;
const PRESSURE_MODERATE_DROP = -3;

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function painLevelToNumber(level: string): number {
  if (level in PAIN_LEVEL_TO_NUMBER) return PAIN_LEVEL_TO_NUMBER[level];
  const num = parseFloat(level);
  if (!isNaN(num) && num >= 0 && num <= 10) return num;
  console.warn(`[DoctorReport] Unknown pain_level: "${level}", treating as 0`);
  return 0;
}

function painLevelToLabel(level: string): string {
  return PAIN_LEVEL_TO_LABEL[level] ?? level;
}

function isTriptan(medName: string): boolean {
  const lower = medName.toLowerCase();
  return TRIPTAN_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Fixed rolling-window date ranges — SSOT aligned with App (rangeResolver.ts PRESET_DAYS).
 * 1m=30d, 3m=90d, 6m=180d, 12m=365d. End = yesterday (effectiveToday).
 */
const PRESET_DAYS_EDGE: Record<string, number> = {
  '1m': 30, '30d': 30, '3m': 90, '6m': 180, '12m': 365,
};

function getDateRange(range: string): { from: string; to: string } {
  // effectiveToday = yesterday (today is not yet complete) — same as App SSOT
  const now = new Date();
  // Use Berlin timezone for consistency
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  berlinNow.setDate(berlinNow.getDate() - 1); // yesterday
  const toDate = berlinNow;

  const days = PRESET_DAYS_EDGE[range] ?? 90;
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - (days - 1));

  return {
    from: fromDate.toISOString().split("T")[0],
    to: toDate.toISOString().split("T")[0],
  };
}

function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  return timeStr.substring(0, 5);
}

/** Enumerate all dates [start, end] inclusive as YYYY-MM-DD */
function enumerateDatesInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return dates;
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS BUILDERS
// ════════════════════════════════════════════════════════════════════════════

interface RawEntry {
  id: number;
  selected_date: string | null;
  selected_time: string | null;
  pain_level: string;
  medications: string[] | null;
  aura_type: string;
  pain_locations: string[] | null;
  notes: string | null;
  timestamp_created: string | null;
  entry_note_is_private?: boolean;
  symptoms_state?: string;
  me_cfs_severity_level?: string;
  me_cfs_severity_score?: number;
}

/**
 * Build symptoms analysis from entry_symptoms + symptom_catalog data.
 * Enhanced with group, burden, and relevance for PDF-parity.
 */
function buildSymptomsAnalysis(
  allEntries: RawEntry[],
  entrySymptoms: Array<{ entry_id: number; symptom_id: string }>,
  symptomCatalog: Array<{ id: string; name: string }>,
  burdenData: Array<{ symptom_key: string; burden_level: number | null }>
): SymptomsAnalysis {
  const catalogMap = new Map(symptomCatalog.map(s => [s.id, s.name]));
  const totalEntries = allEntries.length;

  // Checked entries = symptoms_state 'viewed' or 'edited'
  const checkedEntryIds = new Set(
    allEntries
      .filter(e => e.symptoms_state === 'viewed' || e.symptoms_state === 'edited')
      .map(e => e.id)
  );
  const checkedEntries = checkedEntryIds.size;
  const basisCount = checkedEntries > 0 ? checkedEntries : totalEntries;

  // Build burden map: symptom_key → burden_level
  const burdenMap = new Map<string, number>();
  for (const b of burdenData) {
    if (b.burden_level !== null && b.burden_level > 0) {
      burdenMap.set(b.symptom_key, b.burden_level);
    }
  }

  // Count symptoms (only for checked entries if available, else all)
  const counts = new Map<string, number>();
  let entriesWithSymptoms = 0;
  const entriesHavingSymptom = new Set<number>();

  for (const es of entrySymptoms) {
    if (checkedEntries > 0 && !checkedEntryIds.has(es.entry_id)) continue;
    entriesHavingSymptom.add(es.entry_id);
    const name = catalogMap.get(es.symptom_id) || es.symptom_id;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  entriesWithSymptoms = entriesHavingSymptom.size;

  const items: SymptomStatItem[] = Array.from(counts.entries())
    .map(([name, count]) => {
      const pct = basisCount > 0 ? Math.round((count / basisCount) * 100) : 0;
      const bl = burdenMap.get(name) ?? null;
      const bw = BURDEN_WEIGHTS[bl ?? 0] ?? 1.0;
      const relevance = (count / Math.max(basisCount, 1)) * bw;
      return {
        name,
        count,
        percentageOfChecked: pct,
        group: classifySymptom(name),
        burdenLevel: bl,
        burdenLabel: bl !== null && bl > 0 ? (BURDEN_LABELS[bl] || "nicht festgelegt") : "nicht festgelegt",
        relevanceScore: Math.round(relevance * 1000) / 1000,
      };
    })
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  return { items, totalEntries, checkedEntries, entriesWithSymptoms };
}

/**
 * Build trigger keyword extraction from notes (same logic as PDF report).
 */
function buildTriggersAnalysis(allEntries: RawEntry[]): TriggersAnalysis {
  const triggerCounts = new Map<string, number>();
  let notesAnalyzed = 0;

  for (const entry of allEntries) {
    if (!entry.notes || entry.entry_note_is_private) continue;
    notesAnalyzed++;
    const noteLower = entry.notes.toLowerCase();
    for (const [trigger, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
      if (keywords.some(kw => noteLower.includes(kw))) {
        triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
      }
    }
  }

  const items: TriggerItem[] = Array.from(triggerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([trigger, count]) => ({ trigger, count }));

  return { items, notesAnalyzed };
}

/**
 * Build detailed headache day donut (painFree / painNoTriptan / triptan).
 * Same logic as computeHeadacheTreatmentDayDistribution SSOT.
 */
function buildHeadacheDayDonut(
  from: string,
  to: string,
  allEntries: RawEntry[]
): HeadacheDayDonut {
  // Group entries by date
  const entriesByDate = new Map<string, RawEntry[]>();
  for (const entry of allEntries) {
    const date = entry.selected_date;
    if (!date || date < from || date > to) continue;
    const existing = entriesByDate.get(date);
    if (existing) existing.push(entry);
    else entriesByDate.set(date, [entry]);
  }

  const allDates = enumerateDatesInclusive(from, to);
  const totalDays = allDates.length;
  let painFreeDays = 0;
  let painDaysNoTriptan = 0;
  let triptanDaysCount = 0;

  for (const date of allDates) {
    const dayEntries = entriesByDate.get(date) || [];
    let hasPain = false;
    let hasTriptan = false;

    for (const entry of dayEntries) {
      // Pain: pain_level not '-' and not 'keine' and not '0' and not empty
      const pl = entry.pain_level;
      if (pl && pl !== '-' && pl !== 'keine' && pl !== '0') {
        const num = painLevelToNumber(pl);
        if (num > 0) hasPain = true;
      }
      // Triptan check
      if (entry.medications?.length) {
        for (const med of entry.medications) {
          if (isTriptan(med)) { hasTriptan = true; break; }
        }
      }
    }

    if (hasTriptan) triptanDaysCount++;
    else if (hasPain) painDaysNoTriptan++;
    else painFreeDays++;
  }

  const pct = (v: number) => totalDays > 0 ? Math.round((v / totalDays) * 1000) / 10 : 0;

  return {
    painFreeDays,
    painDaysNoTriptan,
    triptanDays: triptanDaysCount,
    totalDays,
    percentages: {
      painFree: pct(painFreeDays),
      painNoTriptan: pct(painDaysNoTriptan),
      triptan: pct(triptanDaysCount),
    },
  };
}

/**
 * Build weather association analysis.
 * Replicates the deterministic bucket logic from computeWeatherAssociation SSOT.
 */
function buildWeatherAnalysis(
  from: string,
  to: string,
  allEntries: RawEntry[],
  weatherLogs: Array<{
    id: number;
    snapshot_date: string | null;
    requested_at: string | null;
    pressure_mb: number | null;
    pressure_change_24h: number | null;
    temperature_c: number | null;
    humidity: number | null;
  }>
): WeatherAnalysis | null {
  if (weatherLogs.length === 0) return null;

  // Build day features: for each documented day, find closest weather log
  const documentedDays = new Map<string, { painMax: number; hadHeadache: boolean; hadAcuteMed: boolean }>();

  // Aggregate per-day from entries
  for (const entry of allEntries) {
    const date = entry.selected_date;
    if (!date || date < from || date > to) continue;

    const intensity = painLevelToNumber(entry.pain_level);
    const existing = documentedDays.get(date);
    const hadAcuteMed = (entry.medications?.length || 0) > 0;

    if (existing) {
      if (intensity > existing.painMax) existing.painMax = intensity;
      if (intensity > 0) existing.hadHeadache = true;
      if (hadAcuteMed) existing.hadAcuteMed = true;
    } else {
      documentedDays.set(date, {
        painMax: intensity,
        hadHeadache: intensity > 0,
        hadAcuteMed,
      });
    }
  }

  // Index weather logs by snapshot_date (prefer) or requested_at date
  const weatherByDate = new Map<string, typeof weatherLogs[0]>();
  for (const log of weatherLogs) {
    const date = log.snapshot_date || (log.requested_at ? log.requested_at.split('T')[0] : null);
    if (!date) continue;
    // Keep first (or overwrite if same date — last write wins is fine for snapshots)
    if (!weatherByDate.has(date)) {
      weatherByDate.set(date, log);
    }
  }

  // Build features
  interface DayFeature {
    date: string;
    painMax: number;
    hadHeadache: boolean;
    hadAcuteMed: boolean;
    pressureMb: number | null;
    pressureChange24h: number | null;
  }

  const features: DayFeature[] = [];
  let daysWithWeather = 0;
  let daysWithDelta24h = 0;

  for (const [date, dayData] of documentedDays) {
    const weather = weatherByDate.get(date);
    const pressureMb = weather?.pressure_mb ?? null;
    const pressureChange24h = weather?.pressure_change_24h ?? null;

    if (pressureMb !== null) daysWithWeather++;
    if (pressureChange24h !== null) daysWithDelta24h++;

    features.push({
      date,
      painMax: dayData.painMax,
      hadHeadache: dayData.hadHeadache,
      hadAcuteMed: dayData.hadAcuteMed,
      pressureMb,
      pressureChange24h,
    });
  }

  const daysDocumented = documentedDays.size;
  const ratioWeather = daysDocumented > 0 ? Math.round((daysWithWeather / daysDocumented) * 100) / 100 : 0;
  const ratioDelta24h = daysDocumented > 0 ? Math.round((daysWithDelta24h / daysDocumented) * 100) / 100 : 0;

  // Pressure delta 24h buckets (same thresholds as SSOT)
  const withDelta = features.filter(f => f.pressureChange24h !== null);
  
  type Confidence = "high" | "medium" | "low" | "insufficient";
  let confidence: Confidence = "insufficient";
  if (withDelta.length >= 60) confidence = "high";
  else if (withDelta.length >= 30) confidence = "medium";
  else if (withDelta.length >= 14) confidence = "low";

  const strongDrop = withDelta.filter(f => f.pressureChange24h! <= PRESSURE_STRONG_DROP);
  const moderateDrop = withDelta.filter(f => f.pressureChange24h! > PRESSURE_STRONG_DROP && f.pressureChange24h! <= PRESSURE_MODERATE_DROP);
  const stableRise = withDelta.filter(f => f.pressureChange24h! > PRESSURE_MODERATE_DROP);

  function makeBucket(label: string, days: DayFeature[]): WeatherBucket {
    const nDays = days.length;
    const headacheDays = days.filter(d => d.hadHeadache).length;
    const acuteMedDays = days.filter(d => d.hadAcuteMed).length;
    const painValues = days.filter(d => d.painMax > 0).map(d => d.painMax);
    return {
      label,
      nDays,
      headacheRate: nDays > 0 ? Math.round((headacheDays / nDays) * 1000) / 10 : 0,
      meanPainMax: painValues.length > 0 ? Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10 : null,
      acuteMedRate: nDays > 0 ? Math.round((acuteMedDays / nDays) * 1000) / 10 : 0,
    };
  }

  const buckets: WeatherBucket[] = [
    makeBucket(`Starker Druckabfall (≤ ${PRESSURE_STRONG_DROP} hPa)`, strongDrop),
    makeBucket(`Mäßiger Druckabfall (${PRESSURE_STRONG_DROP} bis ${PRESSURE_MODERATE_DROP} hPa)`, moderateDrop),
    makeBucket(`Stabil / Anstieg (> ${PRESSURE_MODERATE_DROP} hPa)`, stableRise),
  ];

  // Relative risk: strongDrop vs stableRise
  let relativeRisk: WeatherRelativeRisk | null = null;
  const refRate = buckets[2].headacheRate;
  const cmpRate = buckets[0].headacheRate;
  if (buckets[0].nDays > 0 && buckets[2].nDays > 0) {
    relativeRisk = {
      referenceLabel: buckets[2].label,
      compareLabel: buckets[0].label,
      rr: refRate > 0 ? Math.round((cmpRate / refRate) * 100) / 100 : null,
      absDiff: Math.round((cmpRate - refRate) * 10) / 10,
    };
  }

  const notes: string[] = [];
  if (confidence === "insufficient") {
    notes.push("Zu wenige Tage mit Druckdaten für eine aussagekräftige Analyse.");
  }

  return {
    coverage: {
      daysDocumented,
      daysWithWeather,
      daysWithDelta24h,
      ratioWeather,
      ratioDelta24h,
    },
    pressureDelta24h: {
      enabled: withDelta.length >= 14,
      confidence,
      buckets,
      relativeRisk,
      notes,
    },
    disclaimer: "Rein deskriptive Statistik. Keine Kausalaussage. Individuelle klinische Bewertung erforderlich.",
  };
}

/**
 * Build ME/CFS analysis from entry severity data.
 */
function buildMeCfsAnalysis(
  from: string,
  to: string,
  allEntries: RawEntry[]
): MeCfsAnalysis | null {
  // Check if any entry has ME/CFS data
  const hasAnyCfs = allEntries.some(e => 
    e.me_cfs_severity_level && e.me_cfs_severity_level !== 'none' && e.me_cfs_severity_score !== undefined && e.me_cfs_severity_score > 0
  );
  
  // Also check if any entry explicitly documents ME/CFS (even 'none' = documented)
  const hasCfsDocumentation = allEntries.some(e => e.me_cfs_severity_level !== undefined);
  if (!hasCfsDocumentation && !hasAnyCfs) return null;

  const allDates = enumerateDatesInclusive(from, to);
  const totalDaysInRange = allDates.length;

  // Group by date, take max severity per day
  const severityOrder: Record<string, number> = { none: 0, mild: 1, moderate: 2, severe: 3 };
  const dailyMax = new Map<string, string>(); // date -> max severity level

  for (const entry of allEntries) {
    const date = entry.selected_date;
    if (!date || date < from || date > to) continue;
    const level = entry.me_cfs_severity_level || 'none';
    const current = dailyMax.get(date);
    if (!current || (severityOrder[level] ?? 0) > (severityOrder[current] ?? 0)) {
      dailyMax.set(date, level);
    }
  }

  const segments: MeCfsSegment[] = [
    { key: "none", days: 0 },
    { key: "mild", days: 0 },
    { key: "moderate", days: 0 },
    { key: "severe", days: 0 },
    { key: "undocumented", days: 0 },
  ];

  for (const date of allDates) {
    const level = dailyMax.get(date);
    if (!level) {
      segments[4].days++;
    } else {
      const seg = segments.find(s => s.key === level);
      if (seg) seg.days++;
      else segments[0].days++; // fallback to 'none'
    }
  }

  const documentedDays = totalDaysInRange - segments[4].days;

  // Compute avg and peak from me_cfs_severity_score
  const scores: number[] = [];
  for (const entry of allEntries) {
    const date = entry.selected_date;
    if (!date || date < from || date > to) continue;
    if (entry.me_cfs_severity_score !== undefined && entry.me_cfs_severity_score > 0) {
      scores.push(entry.me_cfs_severity_score);
    }
  }

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;
  const peakScore = scores.length > 0 ? Math.max(...scores) : null;
  const peakLabel = peakScore !== null ? meCfsSeverityLabel(peakScore) : null;
  const documentationRate = totalDaysInRange > 0
    ? Math.round((documentedDays / totalDaysInRange) * 1000) / 10
    : 0;

  return {
    segments,
    documentedDays,
    totalDaysInRange,
    sufficient: documentedDays >= 14,
    avgScore,
    peakScore,
    peakLabel,
    documentationRate,
  };
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

  console.log(`[DoctorReportSnapshot] Building snapshot for user=${userId.substring(0, 8)}... range=${range} from=${from} to=${to}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1) ALLE DATEN PARALLEL LADEN (extended with symptoms, weather, ME/CFS)
  // ─────────────────────────────────────────────────────────────────────────

  const [
    allEntriesResult,
    entriesCountResult,
    paginatedEntriesResult,
    medicationCoursesResult,
    patientDataResult,
    userMedicationsResult,
    symptomCatalogResult,
    weatherLogsResult,
    symptomBurdenResult,
    medicationEffectsResult,
    medicationIntakesLast30Result,
  ] = await Promise.all([
    // All entries for summary/charts — now include symptoms_state and ME/CFS fields
    supabase
      .from("pain_entries")
      .select("id, selected_date, selected_time, pain_level, medications, aura_type, pain_locations, notes, timestamp_created, entry_note_is_private, symptoms_state, me_cfs_severity_level, me_cfs_severity_score")
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

    // Paginated entries for table
    supabase
      .from("pain_entries")
      .select("id, selected_date, selected_time, pain_level, medications, aura_type, pain_locations, notes, timestamp_created")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .order("selected_date", { ascending: false })
      .order("selected_time", { ascending: false, nullsFirst: false })
      .order("timestamp_created", { ascending: false })
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

    // User Medications for categorization
    supabase
      .from("user_medications")
      .select("id, name, art, effect_category")
      .eq("user_id", userId),

    // Symptom catalog (global)
    supabase
      .from("symptom_catalog")
      .select("id, name")
      .eq("is_active", true),

    // Weather logs for the range
    supabase
      .from("weather_logs")
      .select("id, snapshot_date, requested_at, pressure_mb, pressure_change_24h, temperature_c, humidity")
      .eq("user_id", userId)
      .or(`snapshot_date.gte.${from},requested_at.gte.${from}T00:00:00`)
      .or(`snapshot_date.lte.${to},requested_at.lte.${to}T23:59:59`)
      .order("requested_at", { ascending: false })
      .limit(1000),

    // NEW: User symptom burden levels
    supabase
      .from("user_symptom_burden")
      .select("symptom_key, burden_level")
      .eq("user_id", userId),

    // NEW: Medication effects for entries in range (fetched via entry join)
    supabase
      .from("medication_effects")
      .select("med_name, effect_score, entry_id")
      .not("effect_score", "is", null),

    // NEW: Medication intakes in last 30 days of range
    (() => {
      const last30From = new Date(new Date(to).getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return supabase
        .from("medication_intakes")
        .select("medication_name, taken_date")
        .eq("user_id", userId)
        .gte("taken_date", last30From)
        .lte("taken_date", to);
    })(),
  ]);

  const allEntries = (allEntriesResult.data || []) as RawEntry[];
  const totalEntries = entriesCountResult.count || 0;
  const paginatedEntries = paginatedEntriesResult.data || [];
  const medicationCourses = medicationCoursesResult.data || [];
  const patientData = patientDataResult.data;
  const userMedications = userMedicationsResult.data || [];
  const symptomCatalog = symptomCatalogResult.data || [];
  const weatherLogs = weatherLogsResult.data || [];
  const symptomBurdenData = (symptomBurdenResult.data || []) as Array<{ symptom_key: string; burden_level: number | null }>;
  const allMedEffects = (medicationEffectsResult.data || []) as Array<{ med_name: string; effect_score: number | null; entry_id: number }>;
  const last30Intakes = (medicationIntakesLast30Result.data || []) as Array<{ medication_name: string; taken_date: string }>;

  // Filter medication_effects to only entries in range
  const entryIdSet = new Set(allEntries.map(e => e.id));
  const rangeEffects = allMedEffects.filter(e => entryIdSet.has(e.entry_id));

  // ─── Fetch entry_symptoms for entries in range ───────────────────────────
  const entryIds = allEntries.map(e => e.id);
  let entrySymptoms: Array<{ entry_id: number; symptom_id: string }> = [];
  if (entryIds.length > 0) {
    // Batch fetch in chunks of 500 to avoid query size limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < entryIds.length; i += CHUNK_SIZE) {
      const chunk = entryIds.slice(i, i + CHUNK_SIZE);
      const { data } = await supabase
        .from("entry_symptoms")
        .select("entry_id, symptom_id")
        .in("entry_id", chunk);
      if (data) entrySymptoms = entrySymptoms.concat(data);
    }
  }

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

  const painDaysSet = new Set<string>();
  const migraineDaysSet = new Set<string>();
  const triptanDaysSet = new Set<string>();
  const acuteMedDaysSet = new Set<string>();
  const auraDaysSet = new Set<string>();
  const documentedDatesSet = new Set<string>();
  const dailyMaxIntensity = new Map<string, number>();
  let totalTriptanIntakes = 0;

  allEntries.forEach(entry => {
    const date = entry.selected_date;
    if (!date) return;

    documentedDatesSet.add(date);

    const intensity = painLevelToNumber(entry.pain_level);

    if (entry.pain_level && entry.pain_level !== "-") {
      painDaysSet.add(date);
      const currentMax = dailyMaxIntensity.get(date) || 0;
      if (intensity > currentMax) {
        dailyMaxIntensity.set(date, intensity);
      }
    }

    const isMigraineCandidate = intensity >= 7
      || (entry.aura_type && entry.aura_type !== "keine")
      || (entry.medications?.some((med: string) => isTriptan(med)));
    if (isMigraineCandidate && intensity > 0) {
      migraineDaysSet.add(date);
    }

    if (entry.medications?.length) {
      entry.medications.forEach((med: string) => {
        if (isTriptan(med)) {
          triptanDaysSet.add(date);
          totalTriptanIntakes++;
        }
      });
    }

    if (entry.medications && entry.medications.length > 0) {
      acuteMedDaysSet.add(date);
    }

    if (entry.aura_type && entry.aura_type !== "keine") {
      auraDaysSet.add(date);
    }
  });

  const dailyMaxValues = Array.from(dailyMaxIntensity.values()).filter(v => v > 0);
  const avgIntensity = dailyMaxValues.length > 0
    ? Math.round((dailyMaxValues.reduce((a, b) => a + b, 0) / dailyMaxValues.length) * 10) / 10
    : 0;

  console.log(`[DoctorReport] KPI summary: headacheDays=${painDaysSet.size}, migraineDays=${migraineDaysSet.size}, triptanDays=${triptanDaysSet.size}, acuteMedDays=${acuteMedDaysSet.size}, avgIntensity=${avgIntensity}`);

  const monthsInRange = daysInRange / 30;
  const acuteMedDaysPerMonth = acuteMedDaysSet.size / monthsInRange;
  const overuseWarning = acuteMedDaysPerMonth > 10;

  const gapDays = daysInRange - documentedDatesSet.size;
  const documentationGaps: DocumentationGap = {
    gapDays,
    message: gapDays > 0
      ? `${gapDays} von ${daysInRange} Tagen ohne Dokumentation`
      : "Vollständig dokumentiert",
  };

  const normalize30 = (value: number) => Math.round((value / daysInRange) * 30 * 10) / 10;

  const kpis: CoreKPIs = {
    painDays: painDaysSet.size,
    migraineDays: migraineDaysSet.size,
    triptanDays: triptanDaysSet.size,
    acuteMedDays: acuteMedDaysSet.size,
    auraDays: auraDaysSet.size,
    avgIntensity,
    totalTriptanIntakes,
  };

  const normalizedKPIs: NormalizedKPIs = {
    painDaysPer30: normalize30(painDaysSet.size),
    migraineDaysPer30: normalize30(migraineDaysSet.size),
    triptanDaysPer30: normalize30(triptanDaysSet.size),
    triptanIntakesPer30: normalize30(totalTriptanIntakes),
    acuteMedDaysPer30: normalize30(acuteMedDaysSet.size),
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
    kpis,
    normalizedKPIs,
    totalTriptanIntakes,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4) CHARTS BAUEN
  // ─────────────────────────────────────────────────────────────────────────

  // Build weather-by-date map for chart enrichment
  const weatherByDateForChart = new Map<string, { temp: number | null; pressure: number | null }>();
  for (const log of weatherLogs) {
    const date = (log as any).snapshot_date || ((log as any).requested_at ? (log as any).requested_at.split('T')[0] : null);
    if (!date || weatherByDateForChart.has(date)) continue;
    weatherByDateForChart.set(date, {
      temp: (log as any).temperature_c ?? null,
      pressure: (log as any).pressure_mb ?? null,
    });
  }

  const intensityOverTime: IntensityDataPoint[] = Array.from(dailyMaxIntensity.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, maxIntensity]) => {
      const w = weatherByDateForChart.get(date);
      return {
        date,
        maxIntensity,
        isMigraine: migraineDaysSet.has(date),
        temperatureC: w?.temp ?? null,
        pressureMb: w?.pressure ?? null,
      };
    });

  // Time-of-day histogram
  const hourCounts = new Map<number, number>();
  for (const entry of allEntries) {
    if (!entry.selected_time || entry.pain_level === '-') continue;
    const hourMatch = entry.selected_time.match(/^(\d{1,2}):/);
    if (!hourMatch) continue;
    const hour = parseInt(hourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  }
  const timeDistribution: TimeDistributionItem[] = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  const medCountMap = new Map<string, number>();
  allEntries.forEach(entry => {
    entry.medications?.forEach((med: string) => {
      medCountMap.set(med, (medCountMap.get(med) || 0) + 1);
    });
  });

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
    timeDistribution: timeDistribution.length > 0 ? timeDistribution : undefined,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 5) TABLES BAUEN
  // ─────────────────────────────────────────────────────────────────────────

  const entries: DoctorReportEntry[] = paginatedEntries.map(e => ({
    id: e.id,
    date: e.selected_date,
    time: formatTime(e.selected_time),
    createdAt: e.timestamp_created || new Date().toISOString(),
    intensity: painLevelToNumber(e.pain_level),
    intensityLabel: painLevelToLabel(e.pain_level),
    medications: e.medications || [],
    note: e.notes || null,
    aura: e.aura_type && e.aura_type !== "keine" ? e.aura_type : null,
    painLocations: e.pain_locations || [],
  }));

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

  // Build effect aggregation from medication_effects
  const medEffectAgg = new Map<string, { scores: number[]; count: number }>();
  for (const eff of rangeEffects) {
    if (eff.effect_score === null) continue;
    if (!medEffectAgg.has(eff.med_name)) {
      medEffectAgg.set(eff.med_name, { scores: [], count: 0 });
    }
    const agg = medEffectAgg.get(eff.med_name)!;
    agg.scores.push(eff.effect_score);
    agg.count++;
  }

  // Build last30 intake counts per med
  const last30CountMap = new Map<string, number>();
  for (const intake of last30Intakes) {
    last30CountMap.set(intake.medication_name, (last30CountMap.get(intake.medication_name) || 0) + 1);
  }

  const medEffectMap = new Map<string, { count: number; daysUsed: Set<string>; effects: number[] }>();
  allEntries.forEach(entry => {
    const date = entry.selected_date;
    entry.medications?.forEach((med: string) => {
      if (!medEffectMap.has(med)) {
        medEffectMap.set(med, { count: 0, daysUsed: new Set(), effects: [] });
      }
      const stat = medEffectMap.get(med)!;
      stat.count++;
      if (date) stat.daysUsed.add(date);
    });
  });

  const medicationStats: MedicationStat[] = Array.from(medEffectMap.entries())
    .map(([name, stat]) => {
      const effAgg = medEffectAgg.get(name);
      const avgEffPct = effAgg && effAgg.scores.length > 0
        ? Math.round((effAgg.scores.reduce((a, b) => a + b, 0) / effAgg.scores.length) / 10 * 100)
        : null;
      return {
        name,
        intakeCount: stat.count,
        avgEffect: effAgg && effAgg.scores.length > 0
          ? Math.round((effAgg.scores.reduce((a, b) => a + b, 0) / effAgg.scores.length) * 10) / 10
          : null,
        effectCount: effAgg?.count ?? 0,
        category: medCategoryMap.get(name) || (isTriptan(name) ? "triptan" : "akut"),
        daysUsed: stat.daysUsed.size,
        avgPer30: Math.round((stat.count / daysInRange) * 30 * 10) / 10,
        isTriptan: isTriptan(name),
        last30Intakes: last30CountMap.get(name) ?? 0,
        avgEffectPercent: avgEffPct,
        ratedCount: effAgg?.count ?? 0,
      };
    })
    .sort((a, b) => b.intakeCount - a.intakeCount);

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
  // 7) ANALYSIS BLOCK (V1.1 — new clinical analysis for website)
  // ─────────────────────────────────────────────────────────────────────────

  const analysis: DoctorReportAnalysis = {};

  // A) Symptoms
  if (entrySymptoms.length > 0 && symptomCatalog.length > 0) {
    analysis.symptoms = buildSymptomsAnalysis(allEntries, entrySymptoms, symptomCatalog, symptomBurdenData);
    console.log(`[DoctorReport] Symptoms: ${analysis.symptoms.items.length} unique, ${analysis.symptoms.checkedEntries} checked entries`);
  }

  // B) Triggers
  const triggers = buildTriggersAnalysis(allEntries);
  if (triggers.items.length > 0) {
    analysis.triggers = triggers;
    console.log(`[DoctorReport] Triggers: ${triggers.items.length} found from ${triggers.notesAnalyzed} notes`);
  }

  // C) Detailed headache day donut
  analysis.headacheDayDonut = buildHeadacheDayDonut(from, to, allEntries);
  console.log(`[DoctorReport] Donut: painFree=${analysis.headacheDayDonut.painFreeDays} painNoTriptan=${analysis.headacheDayDonut.painDaysNoTriptan} triptan=${analysis.headacheDayDonut.triptanDays}`);

  // D) Weather
  const weatherAnalysis = buildWeatherAnalysis(from, to, allEntries, weatherLogs);
  if (weatherAnalysis) {
    analysis.weather = weatherAnalysis;
    console.log(`[DoctorReport] Weather: ${weatherAnalysis.coverage.daysWithDelta24h} days with delta, confidence=${weatherAnalysis.pressureDelta24h.confidence}`);
  }

  // E) ME/CFS
  const mecfs = buildMeCfsAnalysis(from, to, allEntries);
  if (mecfs) {
    analysis.mecfs = mecfs;
    console.log(`[DoctorReport] ME/CFS: ${mecfs.documentedDays} documented, sufficient=${mecfs.sufficient}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8) FINAL REPORT JSON
  // ─────────────────────────────────────────────────────────────────────────

  const meta: DoctorReportMeta = {
    range,
    fromDate: from,
    toDate: to,
    generatedAt: now,
    timezone: TIMEZONE,
    reportVersion: REPORT_VERSION,
    schemaVersion: REPORT_VERSION,
    period: {
      fromDate: from,
      toDate: to,
      daysInRange,
      documentedDaysCount: documentedDatesSet.size,
      entriesCount: totalEntries,
    },
    normalization: {
      enabled: true,
      targetDays: 30,
      basisDays: daysInRange,
    },
  };

  const reportJson: DoctorReportJSON = {
    meta,
    summary,
    charts,
    tables,
    optional,
    analysis: Object.keys(analysis).length > 0 ? analysis : undefined,
  };

  console.log(`[DoctorReportSnapshot] Built snapshot: userId=${userId.substring(0, 8)}... entriesCount=${totalEntries} daysWithEntries=${documentedDatesSet.size} from=${from} to=${to} painDays=${painDaysSet.size} paginatedEntries=${entries.length} analysisBlocks=${Object.keys(analysis).length}`);

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
    return true;
  }

  const { from, to } = getDateRange(range);

  const [latestEntryResult, _entryCountResult, latestCourseResult] = await Promise.all([
    supabase
      .from("pain_entries")
      .select("timestamp_created")
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .order("timestamp_created", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pain_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to),
    supabase
      .from("medication_courses")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const cachedDate = new Date(cachedSourceUpdatedAt);

  if (latestEntryResult.data?.timestamp_created && new Date(latestEntryResult.data.timestamp_created) > cachedDate) {
    console.log(`[SnapshotStale] pain_entries newer than snapshot`);
    return true;
  }

  if (latestCourseResult.data?.updated_at && new Date(latestCourseResult.data.updated_at) > cachedDate) {
    console.log(`[SnapshotStale] medication_courses newer than snapshot`);
    return true;
  }

  return false;
}

/**
 * Check if a cached snapshot should be force-rebuilt
 */
export async function shouldForceRebuild(
  supabase: SupabaseClient,
  cached: CachedSnapshot,
  userId: string,
  range: string
): Promise<{ rebuild: boolean; reason: string }> {
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  if (age > SNAPSHOT_TTL_MS) {
    return { rebuild: true, reason: `TTL expired (${Math.round(age / 1000)}s old)` };
  }

  const snapshotEntriesTotal = cached.reportJson?.tables?.entriesTotal ?? 0;
  const snapshotHeadacheDays = cached.reportJson?.summary?.headacheDays ?? 0;

  if (snapshotEntriesTotal === 0 || snapshotHeadacheDays === 0) {
    const { from, to } = getDateRange(range);
    const { count } = await supabase
      .from("pain_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("selected_date", from)
      .lte("selected_date", to)
      .neq("pain_level", "-");

    if (count && count > 0) {
      const reason = snapshotEntriesTotal === 0
        ? `Snapshot has 0 entries but DB has ${count} pain entries`
        : `Snapshot has 0 headacheDays but DB has ${count} pain entries`;
      return { rebuild: true, reason };
    }
  }

  return { rebuild: false, reason: "fresh" };
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
