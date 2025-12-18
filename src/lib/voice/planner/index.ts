/**
 * Voice Planner - Public API
 * 
 * Zentrale Exports für das Voice OS Planner System
 */

// Types
export type {
  VoicePlan,
  PlanKind,
  RiskLevel,
  ConfidenceLevel,
  MutationType,
  QueryType,
  TargetView,
  ListType,
  ConfirmType,
  PlanAction,
  UndoSpec,
  TimeRange,
  QueryParams,
  QueryResult,
  MutationPayload,
  ReminderPayload,
  VoiceNotePayload,
  RatingPayload,
  EditEntryPayload,
  DeletePayload,
  EntryFilter,
  SlotSuggestion,
  PartialPlan,
  NavigatePlan,
  OpenEntryPlan,
  OpenListPlan,
  QueryPlan,
  MutationPlan,
  ConfirmPlan,
  SlotFillingPlan,
  NotSupportedPlan,
  BasePlan,
  PlanDiagnostics,
} from './types';

export {
  CONFIDENCE_THRESHOLDS,
  getPlanRisk,
  shouldAutoExecute,
  shouldConfirm,
  createNotSupportedPlan,
} from './types';

// Lexicon
export {
  canonicalizeText,
  detectOperator,
  detectObject,
  extractOrdinal,
  extractRating,
  extractTimeRange,
  hasExplicitOperator,
  findMedicationCategory,
  FILLER_WORDS,
  OPERATORS,
  OBJECTS,
  ORDINALS,
  TIME_WORDS,
  RATING_EXPRESSIONS,
  MEDICATION_CATEGORIES,
} from './lexicon/de';

export type { OperatorType, ObjectType } from './lexicon/de';

// Skills
export {
  skillRegistry,
  registerSkill,
  registerSkills,
  debugSkillMatches,
  initializeSkills,
} from './skills';

export type {
  Skill,
  SkillMatchResult,
  SkillCategory,
  VoiceUserContext,
  SlotDefinition,
} from './skills/types';

// Planner
export {
  planVoiceCommand,
  initPlanner,
} from './voicePlanner';

export type { PlannerResult } from './voicePlanner';
