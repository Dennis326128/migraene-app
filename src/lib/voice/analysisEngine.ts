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
import { validateAnalysisResult, type VoiceAnalysisResult } from './analysisTypes';

// ============================================================
// === PROMPT BUILDING ===
// ============================================================

/**
 * Rough token estimate (1 token ≈ 4 chars for German text).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build the serialized context string for the LLM.
 * Exported for testing prompt construction independently.
 */
export async function buildAnalysisPromptData(range: AnalysisTimeRange): Promise<{
  serialized: string;
  tokenEstimate: number;
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
  const serialized = serializeForLLM(ctx);
  const tokenEstimate = estimateTokens(serialized);

  return {
    serialized,
    tokenEstimate,
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
 * 3. Serialize for LLM
 * 4. Call edge function
 * 5. Validate and return structured result
 */
export async function runVoicePatternAnalysis(
  range: AnalysisTimeRange,
  options?: AnalysisOptions,
): Promise<VoiceAnalysisResult> {
  // 1+2+3: Build prompt data
  const promptData = await buildAnalysisPromptData(range);

  // Guard: minimum data threshold
  if (promptData.meta.totalDays === 0) {
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
    throw new Error(
      fnError.message?.includes('429')
        ? 'Rate Limit erreicht. Bitte später erneut versuchen.'
        : fnError.message?.includes('402')
          ? 'Guthaben aufgebraucht. Bitte Credits hinzufügen.'
          : `Analyse fehlgeschlagen: ${fnError.message}`,
    );
  }

  // 5: Validate result
  const result = validateAnalysisResult(fnData);
  if (!result) {
    console.error('[AnalysisEngine] Invalid result structure:', fnData);
    throw new Error('Analyse-Ergebnis konnte nicht verarbeitet werden.');
  }

  // Enrich meta with prompt info
  result.meta.promptTokenEstimate = promptData.tokenEstimate;

  return result;
}
