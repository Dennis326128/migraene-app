/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Prophylaxis Module — Public API
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Types
export type {
  ProphylaxisDrug,
  EvidenceSource,
  DoseConfidence,
  DoseEvidence,
  DoseEvent,
  ProphylaxisDayFeature,
  WindowStats,
  DoseComparison,
  ProphylaxisAnalysis,
  DiaryMedicationRecord,
  MedicationIntakeRecord,
  ReminderRecord,
  ReminderCompletionRecord,
  ResolverInput,
} from './types';

// Resolver
export { resolveDoseEvents } from './cgrpDoseResolver';

// Analysis
export {
  compareDoseEvent,
  computeProphylaxisAnalysis,
  type WindowConfig,
} from './prePostAnalysis';

// Helpers
export {
  berlinDateKeyFromUtc,
  berlinTimeLabelFromUtc,
  addBerlinDays,
  diffBerlinDays,
  isInRange,
} from './dateKeyHelpers';

// Drug Registry
export {
  findDrugProfile,
  textContainsDrug,
  CGRP_DRUG_REGISTRY,
  type DrugProfile,
} from './drugRegistry';
