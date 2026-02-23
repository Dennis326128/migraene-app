/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Miary Report V2 — SSOT Library Public API
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Main aggregation
export { computeMiaryReport } from './aggregate';

// Types
export type {
  MiaryReportV2,
  ReportRange,
  ReportOptions,
  ReportKPIsV2,
  ReportCharts,
  ReportMeta,
  DayCountRecord,
  ComputeReportInput,
  ReportEntryInput,
  MeCfsSeverity,
  MohRiskFlag,
  DonutSegment,
  DonutSegmentKey,
  PainTrendPoint,
  TimeOfDayBucket,
  TimeOfDayEntry,
  MedicationChartItem,
  MeCfsDonutSegment,
  MeCfsDonutKey,
  RangeMode,
  LegacyPieKey,
  LegacyPieSegment,
} from './types';

// Definitions (for testing & direct use)
export {
  isDocumentedDay,
  isHeadacheDay,
  isTreatmentDay,
  computeMeCfsMax,
  computeMohRiskFlag,
} from './definitions';

// Normalize helpers
export { normalizeOptions, clampRange } from './normalize';
