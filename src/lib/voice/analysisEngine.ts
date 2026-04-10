/**
 * analysisEngine.ts
 * Client-side orchestrator for the voice pattern analysis pipeline.
 *
 * Pipeline: getAnalysisDataset → buildAnalysisContext → serializeForLLM → edge function → validate result
 *
 * NO direct LLM calls – always goes through the edge function.
 * NO medical assertions – results are hypotheses.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAnalysisDataset, type AnalysisTimeRange } from './analysisAccess';
import { buildAnalysisContext, serializeForLLM } from './analysisContext';
import { validateAnalysisResult, isAnalysisUnavailable, type VoiceAnalysisResult } from './analysisTypes';

// ============================================================
// === CONSTANTS ===
// ============================================================

/** Max context chars before we refuse to send (must match edge function) */
const MAX_CONTEXT_CHARS = 120_000;
/** Warn threshold */
const WARN_CONTEXT_CHARS = 80_000;

// ============================================================
// === TOKEN ESTIMATION ===
// ============================================================

/**
 * Rough token estimate (1 token ≈ 4 chars for German text).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================
// === DEBUG INFO ===
// ============================================================

/**
 * Debug snapshot of the analysis pipeline state.
 * Intended for development inspection, NOT for end-user display.
 */
export interface AnalysisDebugInfo {
  /** Serialized context string sent to LLM */
  serializedContext: string;
  /** Token estimate */
  tokenEstimate: number;
  /** Context char count */
  contextChars: number;
  /** Was context truncated? */
  wasTruncated: boolean;
  /** Meta sent to edge function */
  meta: Record<string, unknown>;
  /** Raw edge function response (before validation) */
  rawResponse: unknown;
  /** Validated result (or null if validation failed) */
  validatedResult: VoiceAnalysisResult | null;
  /** Error if any */
  error: string | null;
  /** Timing in ms */
  durationMs: number;
}

// ============================================================
// === PROMPT BUILDING ===
// ============================================================

/**
 * Build the serialized context string for the LLM.
 * Exported for testing prompt construction independently.
 */
export async function buildAnalysisPromptData(range: AnalysisTimeRange): Promise<{
  serialized: string;
  tokenEstimate: number;
  wasTruncated: boolean;
  meta: {
    totalDays: number;
    voiceEventCount: number;
    painEntryCount: number;
    medicationIntakeCount: number;
    daysWithPain: number;
    daysWithMecfs: number;
  };
}> {
  const dataset = await getAnalysisDataset(range);
  const ctx = buildAnalysisContext(dataset);
  let serialized = serializeForLLM(ctx);
  let wasTruncated = false;

  // === CONTEXT SIZE GUARD ===
  if (serialized.length > MAX_CONTEXT_CHARS) {
    console.warn(`[AnalysisEngine] Context too large (${serialized.length} chars), truncating to ${MAX_CONTEXT_CHARS}`);
    // Truncate at a line boundary to avoid cutting mid-sentence
    const truncated = serialized.slice(0, MAX_CONTEXT_CHARS);
    const lastNewline = truncated.lastIndexOf('\n');
    serialized = (lastNewline > MAX_CONTEXT_CHARS * 0.9 ? truncated.slice(0, lastNewline) : truncated)
      + '\n\n[... Kontext wurde aufgrund der Größe gekürzt. Nicht alle Tage sind enthalten.]';
    wasTruncated = true;
  } else if (serialized.length > WARN_CONTEXT_CHARS) {
    console.warn(`[AnalysisEngine] Large context: ${serialized.length} chars (~${estimateTokens(serialized)} tokens)`);
  }

  const tokenEstimate = estimateTokens(serialized);

  return {
    serialized,
    tokenEstimate,
    wasTruncated,
    meta: {
      totalDays: ctx.meta.totalDays,
      voiceEventCount: dataset.meta.voiceEventCount,
      painEntryCount: dataset.meta.painEntryCount,
      medicationIntakeCount: dataset.meta.medicationIntakeCount,
      daysWithPain: ctx.meta.daysWithPain,
      daysWithMecfs: ctx.meta.daysWithMecfs,
    },
  };
}

// ============================================================
// === ANALYSIS EXECUTION ===
// ============================================================

export interface AnalysisOptions {
  /** Override window hours for context (default: 6) */
  windowHours?: number;
}

/**
 * Run the full voice pattern analysis pipeline.
 *
 * 1. Fetch data from Supabase
 * 2. Build temporal context
 * 3. Serialize for LLM (with size guard)
 * 4. Call edge function
 * 5. Validate and return structured result
 *
 * Returns a validated VoiceAnalysisResult.
 * Check isAnalysisUnavailable(result) to distinguish real analysis from error placeholders.
 */
export async function runVoicePatternAnalysis(
  range: AnalysisTimeRange,
  _options?: AnalysisOptions,
): Promise<VoiceAnalysisResult> {
  // 1+2+3: Build prompt data
  const promptData = await buildAnalysisPromptData(range);

  // Guard: minimum data threshold
  if (promptData.meta.totalDays === 0 &&
      promptData.meta.voiceEventCount === 0 &&
      promptData.meta.painEntryCount === 0) {
    throw new Error('Keine Daten im gewählten Zeitraum vorhanden.');
  }

  // 4: Call edge function
  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'analyze-voice-patterns',
    {
      body: {
        serializedContext: promptData.serialized,
        meta: promptData.meta,
        fromDate: range.from.toISOString(),
        toDate: range.to.toISOString(),
      },
    },
  );

  if (fnError) {
    console.error('[AnalysisEngine] Edge function error:', fnError);

    // Check for specific error codes
    const msg = typeof fnError === 'object' && fnError.message ? fnError.message : String(fnError);
    if (msg.includes('429')) throw new Error('Rate Limit erreicht. Bitte später erneut versuchen.');
    if (msg.includes('402')) throw new Error('Guthaben aufgebraucht. Bitte Credits hinzufügen.');

    throw new Error(`Analyse fehlgeschlagen: ${msg}`);
  }

  // 5: Validate result
  const result = validateAnalysisResult(fnData);
  if (!result) {
    console.error('[AnalysisEngine] Invalid result structure:', JSON.stringify(fnData).slice(0, 500));
    throw new Error('Analyse-Ergebnis konnte nicht verarbeitet werden.');
  }

  // Enrich meta with prompt info
  result.meta.promptTokenEstimate = promptData.tokenEstimate;

  return result;
}

/**
 * Run the full analysis pipeline with debug info capture.
 * Returns both the result and detailed debug information.
 * Intended for development/inspection only.
 */
export async function runVoicePatternAnalysisWithDebug(
  range: AnalysisTimeRange,
): Promise<{ result: VoiceAnalysisResult | null; debug: AnalysisDebugInfo }> {
  const start = Date.now();
  const debug: AnalysisDebugInfo = {
    serializedContext: '',
    tokenEstimate: 0,
    contextChars: 0,
    wasTruncated: false,
    meta: {},
    rawResponse: null,
    validatedResult: null,
    error: null,
    durationMs: 0,
  };

  try {
    // Build prompt data
    const promptData = await buildAnalysisPromptData(range);
    debug.serializedContext = promptData.serialized;
    debug.tokenEstimate = promptData.tokenEstimate;
    debug.contextChars = promptData.serialized.length;
    debug.wasTruncated = promptData.wasTruncated;
    debug.meta = promptData.meta;

    if (promptData.meta.totalDays === 0 &&
        promptData.meta.voiceEventCount === 0 &&
        promptData.meta.painEntryCount === 0) {
      debug.error = 'Keine Daten im gewählten Zeitraum.';
      debug.durationMs = Date.now() - start;
      return { result: null, debug };
    }

    // Call edge function
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'analyze-voice-patterns',
      {
        body: {
          serializedContext: promptData.serialized,
          meta: promptData.meta,
          fromDate: range.from.toISOString(),
          toDate: range.to.toISOString(),
        },
      },
    );

    debug.rawResponse = fnData;

    if (fnError) {
      debug.error = `Edge function error: ${fnError.message ?? String(fnError)}`;
      debug.durationMs = Date.now() - start;
      return { result: null, debug };
    }

    // Validate
    const result = validateAnalysisResult(fnData);
    debug.validatedResult = result;

    if (!result) {
      debug.error = 'Validation failed on edge function response';
      debug.durationMs = Date.now() - start;
      return { result: null, debug };
    }

    result.meta.promptTokenEstimate = promptData.tokenEstimate;
    debug.durationMs = Date.now() - start;
    return { result, debug };

  } catch (err) {
    debug.error = err instanceof Error ? err.message : String(err);
    debug.durationMs = Date.now() - start;
    return { result: null, debug };
  }
}
