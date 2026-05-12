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

  // === ENRICH: Weather + time aggregates + data quality ===
  // Pure prompt extension; no schema/type changes.
  try {
    const fromDate = range.from.toISOString().slice(0, 10);
    const toDate = range.to.toISOString().slice(0, 10);
    const enrichments: string[] = [];

    // --- Time-pattern aggregate (weekday × tagesphase) from pain entries ---
    if (dataset.painEntries.length > 0) {
      const WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
      const phaseOf = (h: number) => h < 6 ? 'Nacht' : h < 12 ? 'Morgen' : h < 18 ? 'Mittag/Nachmittag' : 'Abend';
      const wdCount = new Map<string, number>();
      const phaseCount = new Map<string, number>();
      let weekday = 0, weekend = 0, withTime = 0;
      for (const p of dataset.painEntries) {
        if (!p.selected_date) continue;
        const d = new Date(p.selected_date + 'T00:00:00');
        const wd = WD[d.getDay()];
        wdCount.set(wd, (wdCount.get(wd) ?? 0) + 1);
        if (d.getDay() === 0 || d.getDay() === 6) weekend++; else weekday++;
        if (p.selected_time) {
          const h = parseInt(p.selected_time.slice(0, 2), 10);
          if (Number.isFinite(h)) {
            phaseCount.set(phaseOf(h), (phaseCount.get(phaseOf(h)) ?? 0) + 1);
            withTime++;
          }
        }
      }
      const wdLine = Array.from(wdCount.entries()).sort((a,b)=>b[1]-a[1])
        .map(([k,v])=>`${k}=${v}`).join(', ');
      const phaseLine = Array.from(phaseCount.entries()).sort((a,b)=>b[1]-a[1])
        .map(([k,v])=>`${k}=${v}`).join(', ');
      enrichments.push('=== Zeitaggregat Schmerzeinträge ===');
      enrichments.push(`Wochentage: ${wdLine || 'keine Daten'}`);
      enrichments.push(`Werktag vs. Wochenende: Werktag=${weekday}, Wochenende=${weekend}`);
      enrichments.push(`Tagesphasen (nur Einträge mit Uhrzeit, n=${withTime}): ${phaseLine || 'keine Uhrzeitdaten'}`);
      enrichments.push('');
    }

    // --- Weather block: fetch weather_logs in range, snapshot per day ---
    try {
      const { data: wRows } = await supabase
        .from('weather_logs')
        .select('snapshot_date, pressure_mb, pressure_change_24h, temperature_c, humidity, condition_text')
        .gte('snapshot_date', fromDate)
        .lte('snapshot_date', toDate)
        .order('snapshot_date', { ascending: true })
        .limit(400);

      const rows = (wRows ?? []) as Array<{
        snapshot_date: string | null;
        pressure_mb: number | null;
        pressure_change_24h: number | null;
        temperature_c: number | null;
        humidity: number | null;
        condition_text: string | null;
      }>;
      const byDay = new Map<string, typeof rows[number]>();
      for (const r of rows) {
        if (!r.snapshot_date) continue;
        byDay.set(r.snapshot_date, r);
      }
      enrichments.push('=== Wetterdaten (Tageswerte) ===');
      if (byDay.size === 0) {
        enrichments.push('Keine Wetterdaten im Zeitraum vorhanden.');
      } else {
        const painDates = new Set(
          dataset.painEntries
            .filter(p => p.selected_date && p.pain_level && p.pain_level !== '-')
            .map(p => p.selected_date as string)
        );
        const sortedDays = Array.from(byDay.keys()).sort();
        const press = sortedDays.map(d => byDay.get(d)!.pressure_mb).filter((v): v is number => v != null);
        const delta = sortedDays.map(d => byDay.get(d)!.pressure_change_24h).filter((v): v is number => v != null);
        const temp = sortedDays.map(d => byDay.get(d)!.temperature_c).filter((v): v is number => v != null);
        if (press.length) enrichments.push(`Luftdruck: min=${Math.min(...press).toFixed(0)} mb, max=${Math.max(...press).toFixed(0)} mb, n=${press.length}`);
        if (delta.length) {
          const drops = delta.filter(d => d <= -3);
          enrichments.push(`Luftdruckänderung 24h: min=${Math.min(...delta).toFixed(1)} mb, max=${Math.max(...delta).toFixed(1)} mb, Tage mit Abfall ≥3 mb: ${drops.length}`);
        }
        if (temp.length) enrichments.push(`Temperatur: min=${Math.min(...temp).toFixed(1)} °C, max=${Math.max(...temp).toFixed(1)} °C`);
        enrichments.push(`Wetterabdeckung: ${byDay.size} Tage mit Wetterdaten`);
        enrichments.push('');
        enrichments.push('Tageswerte (Datum | Druck mb | Δ24h mb | Temp °C | Feuchte % | Bedingung | Schmerztag?):');
        for (const d of sortedDays.slice(-90)) {
          const w = byDay.get(d)!;
          const isPain = painDates.has(d) ? 'JA' : 'nein';
          enrichments.push(`  ${d} | ${w.pressure_mb ?? '–'} | ${w.pressure_change_24h ?? '–'} | ${w.temperature_c ?? '–'} | ${w.humidity ?? '–'} | ${w.condition_text ?? '–'} | ${isPain}`);
        }
      }
      enrichments.push('');
    } catch (e) {
      console.warn('[AnalysisEngine] Weather fetch failed (non-fatal):', e);
      enrichments.push('=== Wetterdaten (Tageswerte) ===');
      enrichments.push('Wetterdaten konnten nicht geladen werden.');
      enrichments.push('');
    }

    // --- Data quality block ---
    enrichments.push('=== Datenqualität ===');
    enrichments.push(`Schmerzeinträge: ${dataset.meta.painEntryCount}`);
    enrichments.push(`Sprach-/Voice-Events: ${dataset.meta.voiceEventCount}`);
    enrichments.push(`Medikamenteneinnahmen: ${dataset.meta.medicationIntakeCount}`);
    enrichments.push(`Tagesfaktoren-Einträge: ${dataset.meta.contextNoteCount}`);
    enrichments.push(`Tage mit Daten: ${ctx.meta.totalDays}, davon Schmerztage: ${ctx.meta.daysWithPain}, ME/CFS-Signal: ${ctx.meta.daysWithMecfs}`);
    enrichments.push('');

    serialized = enrichments.join('\n') + '\n' + serialized;
  } catch (e) {
    console.warn('[AnalysisEngine] Enrichment failed (non-fatal):', e);
  }

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

    // Try to read the actual response body
    let status: number | null = null;
    let bodyCode: string | null = null;
    let bodyError: string | null = null;
    let bodyExtra: Record<string, unknown> = {};
    try {
      const ctx = (fnError as any)?.context;
      const resp: Response | undefined = ctx?.response ?? (ctx instanceof Response ? ctx : undefined);
      if (resp) {
        status = resp.status;
        const text = await resp.clone().text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            bodyCode = parsed?.code ?? parsed?.errorCode ?? null;
            bodyError = parsed?.error ?? null;
            bodyExtra = parsed ?? {};
          } catch { /* not JSON */ }
        }
      }
    } catch (e) {
      console.warn('[AnalysisEngine] Could not parse edge function error body:', e);
    }

    const msg = typeof fnError === 'object' && (fnError as any).message ? (fnError as any).message : String(fnError);

    const throwCoded = (code: string, message: string, extra: Record<string, unknown> = {}) => {
      const err = new Error(message);
      (err as any).code = code;
      Object.assign(err, extra);
      throw err;
    };

    if (status === 401) throwCoded('AUTH_REQUIRED', bodyError ?? 'Sitzung abgelaufen. Bitte erneut anmelden.');
    if (bodyCode === 'AI_CONSENT_REQUIRED') throwCoded('AI_CONSENT_REQUIRED', bodyError ?? 'Bitte erteile zuerst deine Einwilligung zur KI-Verarbeitung.');
    if (bodyCode === 'AI_DISABLED') throwCoded('AI_DISABLED', bodyError ?? 'KI-Analyse ist in den Einstellungen deaktiviert.');
    if (bodyCode === 'QUOTA_EXCEEDED' || status === 409) throwCoded('QUOTA_EXCEEDED', bodyError ?? 'Monatliches Analyselimit erreicht.', { quota: bodyExtra.quota });
    if (bodyCode === 'COOLDOWN_ACTIVE') throwCoded('COOLDOWN_ACTIVE', bodyError ?? 'Bitte kurz warten, bevor du erneut analysierst.', { cooldownRemaining: bodyExtra.cooldownRemaining });
    if (bodyCode === 'INSUFFICIENT_DATA' || status === 422) throwCoded('INSUFFICIENT_DATA', bodyError ?? 'Zu wenig Daten für eine sinnvolle Analyse.');
    if (bodyCode === 'CONTEXT_TOO_LARGE' || status === 413) throwCoded('CONTEXT_TOO_LARGE', bodyError ?? 'Analysezeitraum zu groß.');
    if (bodyCode === 'TIMEOUT' || status === 504) throwCoded('TIMEOUT', bodyError ?? 'Die Analyse hat zu lange gedauert.');
    if (bodyCode === 'LLM_UNAVAILABLE' || status === 502) throwCoded('LLM_UNAVAILABLE', bodyError ?? 'Der KI-Dienst ist vorübergehend nicht verfügbar.');
    if (status === 429) throwCoded('LLM_UNAVAILABLE', bodyError ?? 'Rate Limit erreicht. Bitte später erneut versuchen.');

    throwCoded('UNKNOWN', `Analyse fehlgeschlagen: ${bodyError ?? msg}`);
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
