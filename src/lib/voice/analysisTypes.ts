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

/**
 * How strong the evidence for a pattern is.
 * The LLM must assign this conservatively.
 */
export type EvidenceStrength = 'low' | 'medium' | 'high';

/**
 * A note explaining why certainty is limited.
 */
export interface UncertaintyNote {
  reason: string;
  /** e.g. 'few_data_points', 'ambiguous_timing', 'no_confirmation', 'single_occurrence' */
  code: string;
}

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

export interface PatternFinding {
  patternType: PatternType;
  /** Short title, e.g. "Duschen → Erschöpfung" */
  title: string;
  /** Descriptive text (1-3 sentences, cautiously worded) */
  description: string;
  evidenceStrength: EvidenceStrength;
  /** How many times observed */
  occurrences: number;
  /** Example dates or brief excerpts */
  examples: string[];
  /** Why this might NOT be a real pattern */
  uncertaintyNotes: UncertaintyNote[];
}

// ============================================================
// === CONTEXT FINDINGS (per perspective) ===
// ============================================================

export interface ContextFinding {
  /** What was observed */
  observation: string;
  /** When / how often */
  frequency: string;
  /** Relevant raw excerpts or dates */
  examples: string[];
  evidenceStrength: EvidenceStrength;
}

// ============================================================
// === FULL ANALYSIS RESULT ===
// ============================================================

export interface VoiceAnalysisResult {
  /** Short overall summary (2-5 sentences) */
  summary: string;

  /** Dataset scope */
  scope: {
    fromDate: string;
    toDate: string;
    totalDays: number;
    daysAnalyzed: number;
    voiceEventCount: number;
    painEntryCount: number;
    medicationIntakeCount: number;
  };

  /** Possible patterns discovered */
  possiblePatterns: PatternFinding[];

  /** Pain-centric observations */
  painContextFindings: ContextFinding[];

  /** ME/CFS / fatigue / PEM observations */
  fatigueContextFindings: ContextFinding[];

  /** Medication context observations */
  medicationContextFindings: ContextFinding[];

  /** Recurring sequences (from prepared data, enriched by LLM) */
  recurringSequences: {
    pattern: string;
    count: number;
    llmInterpretation: string;
  }[];

  /** Questions that remain open */
  openQuestions: string[];

  /** Explicit notes about data gaps, uncertainty, limits */
  confidenceNotes: string[];

  /** Model/version metadata for traceability */
  meta: {
    model: string;
    analyzedAt: string;
    promptTokenEstimate: number;
    analysisVersion: string;
  };
}

/**
 * Validate that a parsed LLM response conforms to VoiceAnalysisResult.
 * Returns a clean object or null if invalid.
 */
export function validateAnalysisResult(raw: unknown): VoiceAnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Check required top-level fields
  if (typeof r.summary !== 'string') return null;
  if (!r.scope || typeof r.scope !== 'object') return null;
  if (!Array.isArray(r.possiblePatterns)) return null;
  if (!Array.isArray(r.painContextFindings)) return null;
  if (!Array.isArray(r.fatigueContextFindings)) return null;
  if (!Array.isArray(r.medicationContextFindings)) return null;
  if (!Array.isArray(r.openQuestions)) return null;
  if (!Array.isArray(r.confidenceNotes)) return null;

  // Coerce with safe defaults
  return {
    summary: r.summary as string,
    scope: r.scope as VoiceAnalysisResult['scope'],
    possiblePatterns: (r.possiblePatterns as PatternFinding[]).map(p => ({
      patternType: p.patternType ?? 'other',
      title: p.title ?? '',
      description: p.description ?? '',
      evidenceStrength: p.evidenceStrength ?? 'low',
      occurrences: p.occurrences ?? 1,
      examples: Array.isArray(p.examples) ? p.examples : [],
      uncertaintyNotes: Array.isArray(p.uncertaintyNotes) ? p.uncertaintyNotes : [],
    })),
    painContextFindings: (r.painContextFindings as ContextFinding[]).map(f => ({
      observation: f.observation ?? '',
      frequency: f.frequency ?? '',
      examples: Array.isArray(f.examples) ? f.examples : [],
      evidenceStrength: f.evidenceStrength ?? 'low',
    })),
    fatigueContextFindings: (r.fatigueContextFindings as ContextFinding[]).map(f => ({
      observation: f.observation ?? '',
      frequency: f.frequency ?? '',
      examples: Array.isArray(f.examples) ? f.examples : [],
      evidenceStrength: f.evidenceStrength ?? 'low',
    })),
    medicationContextFindings: (r.medicationContextFindings as ContextFinding[]).map(f => ({
      observation: f.observation ?? '',
      frequency: f.frequency ?? '',
      examples: Array.isArray(f.examples) ? f.examples : [],
      evidenceStrength: f.evidenceStrength ?? 'low',
    })),
    recurringSequences: Array.isArray(r.recurringSequences)
      ? (r.recurringSequences as VoiceAnalysisResult['recurringSequences'])
      : [],
    openQuestions: r.openQuestions as string[],
    confidenceNotes: r.confidenceNotes as string[],
    meta: (r.meta as VoiceAnalysisResult['meta']) ?? {
      model: 'unknown',
      analyzedAt: new Date().toISOString(),
      promptTokenEstimate: 0,
      analysisVersion: '1.0.0',
    },
  };
}
