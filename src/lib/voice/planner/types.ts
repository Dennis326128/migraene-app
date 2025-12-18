/**
 * VoicePlan Types - Single Source of Truth für Voice OS
 * 
 * Jede Aktion im Voice OS basiert auf einem strukturierten Plan.
 * Die UI führt NUR Pläne aus, keine direkten Aktionen.
 */

// ============================================
// Core Types
// ============================================

export type PlanKind = 
  | 'navigate'
  | 'open_entry'
  | 'open_list'
  | 'query'
  | 'mutation'
  | 'confirm'
  | 'slot_filling'
  | 'not_supported';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type MutationType = 
  | 'create_reminder'
  | 'save_voice_note'
  | 'rate_intake'
  | 'edit_entry'
  | 'delete_entry'
  | 'delete_voice_note'
  | 'export_report'
  | 'export_med_plan'
  | 'quick_pain_entry';

export type QueryType =
  | 'last_entry'
  | 'last_entry_with_med'
  | 'last_intake_med'
  | 'list_entries_with_med'
  | 'list_notes_range'
  | 'count_med_range'
  | 'count_migraine_range'
  | 'avg_pain_range';

export type TargetView =
  | 'analysis'
  | 'diary'
  | 'medications'
  | 'reminders'
  | 'settings'
  | 'doctors'
  | 'profile'
  | 'voice_notes'
  | 'diary_report'
  | 'medication_effects'
  | 'new_entry';

export type ListType = 'entries' | 'notes' | 'reminders';

export type ConfirmType = 'danger' | 'ambiguous';

// ============================================
// Plan Action (für Result UI Buttons)
// ============================================

export interface PlanAction {
  label: string;
  doPlan?: VoicePlan;
  action?: 'close' | 'back' | 'retry';
}

// ============================================
// Undo Specification
// ============================================

export interface UndoSpec {
  kind: 'toast_undo';
  windowMs: number;
  undoPlan: VoicePlan;
  snapshotData?: unknown;
}

// ============================================
// Time Range
// ============================================

export interface TimeRange {
  from: string; // ISO date
  to: string;   // ISO date
  days?: number;
}

// ============================================
// Query Parameters
// ============================================

export interface QueryParams {
  medName?: string;
  medCategory?: string;
  timeRange?: TimeRange;
  painLevel?: number;
  limit?: number;
  offset?: number;
}

// ============================================
// Query Result
// ============================================

export interface QueryResult {
  type: 'single' | 'list' | 'count' | 'average';
  entry?: {
    id: number;
    date: string;
    time?: string;
    painLevel?: string;
    medications?: string[];
    notes?: string;
  };
  entries?: Array<{
    id: number;
    date: string;
    time?: string;
    painLevel?: string;
    medications?: string[];
  }>;
  count?: number;
  average?: number;
  message: string;
}

// ============================================
// Mutation Payloads
// ============================================

export interface ReminderPayload {
  title: string;
  dateTime: string;
  medications?: string[];
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  notes?: string;
}

export interface VoiceNotePayload {
  text: string;
  occurredAt?: string;
}

export interface RatingPayload {
  entryId: number;
  medName: string;
  rating: number; // 0-10
  notes?: string;
}

export interface EditEntryPayload {
  entryId: number;
  updates: {
    painLevel?: string;
    notes?: string;
    medications?: string[];
  };
}

export interface DeletePayload {
  targetId: number | string;
  targetType: 'entry' | 'note' | 'reminder';
}

export type MutationPayload = 
  | ReminderPayload
  | VoiceNotePayload
  | RatingPayload
  | EditEntryPayload
  | DeletePayload
  | { text?: string; [key: string]: unknown };

// ============================================
// Filter Types
// ============================================

export interface EntryFilter {
  medName?: string;
  medCategory?: string;
  timeRange?: TimeRange;
  painLevelMin?: number;
}

// ============================================
// Slot Filling
// ============================================

export interface SlotSuggestion {
  label: string;
  value: string;
}

export interface PartialPlan {
  targetSkillId: string;
  collectedSlots: Record<string, unknown>;
}

// ============================================
// Main VoicePlan Union Type
// ============================================

export type VoicePlan =
  | NavigatePlan
  | OpenEntryPlan
  | OpenListPlan
  | QueryPlan
  | MutationPlan
  | ConfirmPlan
  | SlotFillingPlan
  | NotSupportedPlan;

export interface BasePlan {
  summary: string;
  confidence: number;
  diagnostics?: PlanDiagnostics;
}

export interface NavigatePlan extends BasePlan {
  kind: 'navigate';
  targetView: TargetView;
  payload?: Record<string, unknown>;
}

export interface OpenEntryPlan extends BasePlan {
  kind: 'open_entry';
  entryId: number;
}

export interface OpenListPlan extends BasePlan {
  kind: 'open_list';
  listType: ListType;
  filter?: EntryFilter;
}

export interface QueryPlan extends BasePlan {
  kind: 'query';
  queryType: QueryType;
  params: QueryParams;
  result?: QueryResult;
  actions?: PlanAction[];
}

export interface MutationPlan extends BasePlan {
  kind: 'mutation';
  mutationType: MutationType;
  payload: MutationPayload;
  undo?: UndoSpec;
  risk: RiskLevel;
}

export interface ConfirmPlan extends BasePlan {
  kind: 'confirm';
  confirmType: ConfirmType;
  question: string;
  pending: VoicePlan;
}

export interface SlotFillingPlan extends BasePlan {
  kind: 'slot_filling';
  missingSlot: string;
  prompt: string;
  suggestions: SlotSuggestion[];
  partial: PartialPlan;
}

export interface NotSupportedPlan extends BasePlan {
  kind: 'not_supported';
  reason: string;
  suggestions: Array<{
    label: string;
    plan?: VoicePlan;
  }>;
}

// ============================================
// Diagnostics (für Debugging)
// ============================================

export interface PlanDiagnostics {
  canonicalizedText: string;
  detectedOperator?: string;
  matchedSkillId?: string;
  candidateScores?: Array<{
    skillId: string;
    score: number;
    reasons: string[];
  }>;
  extractedEntities?: {
    medications?: string[];
    timeRange?: TimeRange;
    numbers?: number[];
    ordinals?: number[];
  };
  processingTimeMs?: number;
}

// ============================================
// Confidence Thresholds
// ============================================

export const CONFIDENCE_THRESHOLDS = {
  // Navigation & Query (low risk)
  AUTO_NAV_QUERY: 0.80,
  CONFIRM_NAV_QUERY: 0.55,
  
  // Actions: Create/Rate/Edit (medium risk)
  AUTO_ACTION: 0.90,
  CONFIRM_ACTION: 0.70,
  
  // Delete (high risk) - ALWAYS confirm
  AUTO_DELETE: 0.00,  // Never auto-delete
  CONFIRM_DELETE: 0.00, // Always require confirmation
} as const;

// ============================================
// Helper Functions
// ============================================

export function getPlanRisk(plan: VoicePlan): RiskLevel {
  if (plan.kind === 'mutation') {
    if (plan.mutationType.startsWith('delete')) return 'high';
    if (['edit_entry', 'rate_intake'].includes(plan.mutationType)) return 'medium';
    return 'low';
  }
  if (plan.kind === 'navigate' || plan.kind === 'query' || plan.kind === 'open_entry' || plan.kind === 'open_list') {
    return 'low';
  }
  return 'medium';
}

export function shouldAutoExecute(plan: VoicePlan): boolean {
  const risk = getPlanRisk(plan);
  const { confidence } = plan;
  
  switch (risk) {
    case 'low':
      return confidence >= CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY;
    case 'medium':
      return confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACTION;
    case 'high':
      return false; // Never auto-execute high risk
  }
}

export function shouldConfirm(plan: VoicePlan): boolean {
  const risk = getPlanRisk(plan);
  const { confidence } = plan;
  
  switch (risk) {
    case 'low':
      return confidence >= CONFIDENCE_THRESHOLDS.CONFIRM_NAV_QUERY && confidence < CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY;
    case 'medium':
      return confidence >= CONFIDENCE_THRESHOLDS.CONFIRM_ACTION && confidence < CONFIDENCE_THRESHOLDS.AUTO_ACTION;
    case 'high':
      return true; // Always confirm high risk
  }
}

export function createNotSupportedPlan(
  reason: string,
  suggestions: Array<{ label: string; plan?: VoicePlan }>
): NotSupportedPlan {
  return {
    kind: 'not_supported',
    reason,
    suggestions,
    summary: reason,
    confidence: 0,
  };
}
