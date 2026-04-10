/**
 * analysisTypes.ts
 * Output structure for LLM-based voice/timeline pattern analysis.
 *
 * DESIGN PRINCIPLES:
 *   - Results are HYPOTHESES, never diagnostic truth
 *   - Every pattern carries explicit evidenceStrength + uncertainty
 *   - Structure is usable for app UI, doctor reports, and debugging
 *   - Separation: pain / fatigue-ME/CFS / medication perspectives
 */

// ============================================================
// === EVIDENCE & CONFIDENCE ===
// ============================================================

export type EvidenceStrength = 'low' | 'medium' | 'high';

const VALID_EVIDENCE_STRENGTHS: EvidenceStrength[] = ['low', 'medium', 'high'];

export interface UncertaintyNote {
  reason: string;
  code: string;
}

const VALID_UNCERTAINTY_CODES = [
  'few_data_points', 'ambiguous_timing', 'no_confirmation',
  'single_occurrence', 'unclear_causation', 'incomplete_data',
] as const;

// ============================================================
// === INDIVIDUAL PATTERN ===
// ============================================================

export type PatternType =
  | 'trigger_candidate'
  | 'temporal_sequence'
  | 'recurring_context'
  | 'pem_pattern'
  | 'medication_context'
  | 'sleep_impact'
  | 'environment_sensitivity'
  | 'food_drink_association'
  | 'stress_load'
  | 'other';

const VALID_PATTERN_TYPES: PatternType[] = [
  'trigger_candidate', 'temporal_sequence', 'recurring_context',
  'pem_pattern', 'medication_context', 'sleep_impact',
  'environment_sensitivity', 'food_drink_association', 'stress_load', 'other',
];

export interface PatternFinding {
  patternType: PatternType;
  title: string;
  description: string;
  evidenceStrength: EvidenceStrength;
  occurrences: number;
  examples: string[];
  uncertaintyNotes: UncertaintyNote[];
}

// ============================================================
// === CONTEXT FINDINGS (per perspective) ===
// ============================================================

export interface ContextFinding {
  observation: string;
  frequency: string;
  examples: string[];
  evidenceStrength: EvidenceStrength;
}

// ============================================================
// === FULL ANALYSIS RESULT ===
// ============================================================

export interface AnalysisResultMeta {
  model: string;
  analyzedAt: string;
  promptTokenEstimate: number;
  analysisVersion: string;
  /** Set to true when the result is an error/unavailable placeholder */
  error?: boolean;
  errorReason?: string;
}

export interface VoiceAnalysisResult {
  summary: string;
  scope: {
    fromDate: string;
    toDate: string;
    totalDays: number;
    daysAnalyzed: number;
    voiceEventCount: number;
    painEntryCount: number;
    medicationIntakeCount: number;
  };
  possiblePatterns: PatternFinding[];
  painContextFindings: ContextFinding[];
  fatigueContextFindings: ContextFinding[];
  medicationContextFindings: ContextFinding[];
  recurringSequences: {
    pattern: string;
    count: number;
    llmInterpretation: string;
  }[];
  openQuestions: string[];
  confidenceNotes: string[];
  meta: AnalysisResultMeta;
}

// ============================================================
// === VALIDATION HELPERS ===
// ============================================================

function sanitizeEvidenceStrength(val: unknown): EvidenceStrength {
  if (typeof val === 'string' && VALID_EVIDENCE_STRENGTHS.includes(val as EvidenceStrength)) {
    return val as EvidenceStrength;
  }
  return 'low';
}

function sanitizePatternType(val: unknown): PatternType {
  if (typeof val === 'string' && VALID_PATTERN_TYPES.includes(val as PatternType)) {
    return val as PatternType;
  }
  return 'other';
}

function sanitizeUncertaintyNote(note: unknown): UncertaintyNote | null {
  if (!note || typeof note !== 'object') return null;
  const n = note as Record<string, unknown>;
  if (typeof n.reason !== 'string' || !n.reason.trim()) return null;
  const code = typeof n.code === 'string' && (VALID_UNCERTAINTY_CODES as readonly string[]).includes(n.code)
    ? n.code
    : 'incomplete_data';
  return { reason: n.reason.trim(), code };
}

function sanitizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function sanitizePattern(raw: unknown): PatternFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const title = typeof p.title === 'string' ? p.title.trim() : '';
  const description = typeof p.description === 'string' ? p.description.trim() : '';

  // Reject patterns with no meaningful content
  if (!title && !description) return null;

  const occurrences = typeof p.occurrences === 'number' && p.occurrences > 0 ? p.occurrences : 1;

  return {
    patternType: sanitizePatternType(p.patternType),
    title: title || 'Unbenanntes Muster',
    description: description || 'Keine Beschreibung verfügbar.',
    evidenceStrength: sanitizeEvidenceStrength(p.evidenceStrength),
    occurrences,
    examples: sanitizeStringArray(p.examples),
    uncertaintyNotes: Array.isArray(p.uncertaintyNotes)
      ? p.uncertaintyNotes.map(sanitizeUncertaintyNote).filter((n): n is UncertaintyNote => n !== null)
      : [],
  };
}

function sanitizeContextFinding(raw: unknown): ContextFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;

  const observation = typeof f.observation === 'string' ? f.observation.trim() : '';
  if (!observation) return null;

  return {
    observation,
    frequency: typeof f.frequency === 'string' ? f.frequency.trim() : 'nicht angegeben',
    examples: sanitizeStringArray(f.examples),
    evidenceStrength: sanitizeEvidenceStrength(f.evidenceStrength),
  };
}

function sanitizeRecurringSequence(raw: unknown): VoiceAnalysisResult['recurringSequences'][0] | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const pattern = typeof s.pattern === 'string' ? s.pattern.trim() : '';
  if (!pattern) return null;
  return {
    pattern,
    count: typeof s.count === 'number' ? s.count : 1,
    llmInterpretation: typeof s.llmInterpretation === 'string' ? s.llmInterpretation.trim() : '',
  };
}

// ============================================================
// === MAIN VALIDATOR ===
// ============================================================

/**
 * Validate and sanitize a parsed LLM response into VoiceAnalysisResult.
 * Returns a clean object or null if fundamentally invalid.
 *
 * Strictly filters: empty patterns, invalid types, broken structures.
 * Tolerantly defaults: missing optional fields, missing arrays → empty.
 */
export function validateAnalysisResult(raw: unknown): VoiceAnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Required: summary string
  if (typeof r.summary !== 'string' || r.summary.trim().length < 3) return null;

  // Required: scope object
  if (!r.scope || typeof r.scope !== 'object') return null;

  // Required: at least these arrays must exist (can be empty)
  const requiredArrayKeys = [
    'possiblePatterns', 'painContextFindings', 'fatigueContextFindings',
    'medicationContextFindings', 'openQuestions', 'confidenceNotes',
  ];
  for (const key of requiredArrayKeys) {
    if (!Array.isArray(r[key])) return null;
  }

  // Sanitize scope
  const rawScope = r.scope as Record<string, unknown>;
  const scope: VoiceAnalysisResult['scope'] = {
    fromDate: typeof rawScope.fromDate === 'string' ? rawScope.fromDate : '',
    toDate: typeof rawScope.toDate === 'string' ? rawScope.toDate : '',
    totalDays: typeof rawScope.totalDays === 'number' ? rawScope.totalDays : 0,
    daysAnalyzed: typeof rawScope.daysAnalyzed === 'number' ? rawScope.daysAnalyzed : 0,
    voiceEventCount: typeof rawScope.voiceEventCount === 'number' ? rawScope.voiceEventCount : 0,
    painEntryCount: typeof rawScope.painEntryCount === 'number' ? rawScope.painEntryCount : 0,
    medicationIntakeCount: typeof rawScope.medicationIntakeCount === 'number' ? rawScope.medicationIntakeCount : 0,
  };

  // Sanitize all arrays strictly
  const possiblePatterns = (r.possiblePatterns as unknown[])
    .map(sanitizePattern)
    .filter((p): p is PatternFinding => p !== null);

  const painContextFindings = (r.painContextFindings as unknown[])
    .map(sanitizeContextFinding)
    .filter((f): f is ContextFinding => f !== null);

  const fatigueContextFindings = (r.fatigueContextFindings as unknown[])
    .map(sanitizeContextFinding)
    .filter((f): f is ContextFinding => f !== null);

  const medicationContextFindings = (r.medicationContextFindings as unknown[])
    .map(sanitizeContextFinding)
    .filter((f): f is ContextFinding => f !== null);

  const recurringSequences = Array.isArray(r.recurringSequences)
    ? (r.recurringSequences as unknown[])
        .map(sanitizeRecurringSequence)
        .filter((s): s is VoiceAnalysisResult['recurringSequences'][0] => s !== null)
    : [];

  // Meta with safe defaults
  const rawMeta = (r.meta && typeof r.meta === 'object') ? r.meta as Record<string, unknown> : {};
  const meta: AnalysisResultMeta = {
    model: typeof rawMeta.model === 'string' ? rawMeta.model : 'unknown',
    analyzedAt: typeof rawMeta.analyzedAt === 'string' ? rawMeta.analyzedAt : new Date().toISOString(),
    promptTokenEstimate: typeof rawMeta.promptTokenEstimate === 'number' ? rawMeta.promptTokenEstimate : 0,
    analysisVersion: typeof rawMeta.analysisVersion === 'string' ? rawMeta.analysisVersion : '1.0.0',
    ...(rawMeta.error === true ? { error: true, errorReason: String(rawMeta.errorReason ?? '') } : {}),
  };

  return {
    summary: r.summary as string,
    scope,
    possiblePatterns,
    painContextFindings,
    fatigueContextFindings,
    medicationContextFindings,
    recurringSequences,
    openQuestions: sanitizeStringArray(r.openQuestions),
    confidenceNotes: sanitizeStringArray(r.confidenceNotes),
    meta,
  };
}

/**
 * Check if a result is an error/unavailable placeholder (not a real analysis).
 */
export function isAnalysisUnavailable(result: VoiceAnalysisResult): boolean {
  return result.meta.error === true || result.scope.daysAnalyzed === 0;
}
