/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MiaryReportV2 — Single Source of Truth Contract
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Pure data types. No DB imports, no UI labels, no side effects.
 * Compatible with both browser (React) and Deno (Edge Functions).
 */

// ─── Range & Options ─────────────────────────────────────────────────────

export type RangeMode = 'LAST_30_DAYS' | 'CUSTOM' | 'CALENDAR_MONTH';

export interface ReportRange {
  startISO: string;   // YYYY-MM-DD
  endISO: string;     // YYYY-MM-DD
  timezone: string;   // e.g. "Europe/Berlin"
  mode: RangeMode;
}

export interface ReportOptions {
  includeMeCfs: boolean;
  includeSymptoms: boolean;
  includeMedications: boolean;
  includeTimeOfDay: boolean;
  includeWeather: boolean;
}

// ─── ME/CFS Levels ───────────────────────────────────────────────────────

export type MeCfsSeverity = 'none' | 'mild' | 'moderate' | 'severe';

// ─── MOH Risk ────────────────────────────────────────────────────────────

export type MohRiskFlag = 'none' | 'possible' | 'likely';

// ─── KPIs ────────────────────────────────────────────────────────────────

export interface ReportKPIsV2 {
  headacheDays: number;
  treatmentDays: number;
  avgPain: number | null;
  maxPain: number | null;
  triptanDays: number;
  acuteMedDays: number;
  preventiveMedActive: boolean;
  mohRiskFlag: MohRiskFlag;
}

// ─── Chart Data ──────────────────────────────────────────────────────────

export type DonutSegmentKey = 'headache' | 'no_headache' | 'undocumented';

export interface DonutSegment {
  key: DonutSegmentKey;
  days: number;
}

export interface PainTrendPoint {
  dateISO: string;
  value: number | null;
}

export type TimeOfDayBucket = 'night' | 'morning' | 'afternoon' | 'evening';

export interface TimeOfDayEntry {
  bucket: TimeOfDayBucket;
  headacheDays: number;
}

export interface MedicationChartItem {
  medicationId: string;
  name: string;
  daysUsed: number;
  avgEffect: number | null;
}

export type MeCfsDonutKey = 'none' | 'mild' | 'moderate' | 'severe' | 'undocumented';

export interface MeCfsDonutSegment {
  key: MeCfsDonutKey;
  days: number;
}

export interface ReportCharts {
  headacheDaysDonut: {
    segments: DonutSegment[];
  };
  painIntensityTrend: {
    points: PainTrendPoint[];
  };
  timeOfDayDistribution: {
    buckets: TimeOfDayEntry[];
  };
  medications: {
    items: MedicationChartItem[];
  };
  meCfs?: {
    donut: MeCfsDonutSegment[];
  };
}

// ─── Raw Day-Level Data ──────────────────────────────────────────────────

export interface DayCountRecord {
  dateISO: string;
  documented: boolean;
  headache: boolean;
  treatment: boolean;
  painMax: number | null;
  meCfsMax?: MeCfsSeverity | null;
}

// ─── Report Meta ─────────────────────────────────────────────────────────

export interface ReportMeta {
  generatedAtISO: string;
  range: ReportRange;
  basis: {
    totalDaysInRange: number;
    documentedDays: number;
    undocumentedDays: number;
  };
}

// ─── Full Report ─────────────────────────────────────────────────────────

export interface MiaryReportV2 {
  meta: ReportMeta;
  kpis: ReportKPIsV2;
  charts: ReportCharts;
  raw: {
    countsByDay: DayCountRecord[];
  };
}

// ─── Aggregate Input ─────────────────────────────────────────────────────

export interface ReportEntryInput {
  dateISO: string;           // YYYY-MM-DD
  painMax: number | null;
  acuteMedUsed: boolean;
  triptanUsed: boolean;
  meCfsLevels?: Array<MeCfsSeverity | null | undefined>;
  medications?: Array<{
    medicationId: string;
    name: string;
    effect?: number | null;
  }>;
  documented: boolean;
}

export interface ComputeReportInput {
  range: ReportRange;
  options?: Partial<ReportOptions>;
  entries: ReportEntryInput[];
}
