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
import { buildAnalysisReportV21 } from '@/lib/ai/buildAnalysisReportV21';
import { buildTrendDaysFromEntries, type TrendDayRecord } from '@/lib/ai/trendAnalysis';
import { ANALYSIS_V21_SCHEMA, ANALYSIS_V21_VERSION } from '@/lib/ai/analysisTypes';

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
export interface PreAnalysis {
  weather: {
    daysWithData: number;
    pressureDropDays: number;       // Δp24h ≤ -3 hPa
    pressureRiseDays: number;       // Δp24h ≥ +3 hPa
    painOnDropDays: number;
    painOnRiseDays: number;
    painOnStableDays: number;
    stableDays: number;
    pressureMin: number | null;
    pressureMax: number | null;
    tempMin: number | null;
    tempMax: number | null;
    note: string;                   // human summary
  };
  time: {
    topWeekday: string | null;
    topWeekdayShare: number;        // 0..1
    topPhase: string | null;
    topPhaseShare: number;
    weekdayCount: number;
    weekendCount: number;
    withTime: number;
    note: string;
  };
  mecfs: {
    daysWithMecfs: number;
    contextNoteCount: number;
    note: string;
  };
  medication: {
    intakeCount: number;
    highPainEntries: number;        // pain >= 7
    highPainWithMed: number;
    highPainWithoutMed: number;
    note: string;
  };
  dataQuality: {
    painEntries: number;
    voiceEvents: number;
    weatherDays: number;
    rangeDays: number;
    note: string;
  };
}

export async function buildAnalysisPromptData(range: AnalysisTimeRange): Promise<{
  serialized: string;
  tokenEstimate: number;
  wasTruncated: boolean;
  preAnalysis: PreAnalysis;
  trendDays: TrendDayRecord[];
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
  // Data minimization: only include private free-text notes in the LLM prompt
  // when the user explicitly opted in via Settings (default: false).
  let includePrivateNotes = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('ai_include_private_notes')
        .eq('user_id', user.id)
        .maybeSingle();
      includePrivateNotes = profile?.ai_include_private_notes === true;
    }
  } catch {
    includePrivateNotes = false;
  }
  const ctx = buildAnalysisContext(dataset, 6, { includePrivateNotes });
  let serialized = serializeForLLM(ctx);

  // === ENRICH: Pre-analysis + weather + time aggregates + data quality ===
  const rangeDays = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000));
  const preAnalysis: PreAnalysis = {
    weather: {
      daysWithData: 0, pressureDropDays: 0, pressureRiseDays: 0,
      painOnDropDays: 0, painOnRiseDays: 0, painOnStableDays: 0, stableDays: 0,
      pressureMin: null, pressureMax: null, tempMin: null, tempMax: null,
      note: 'Keine Wetterdaten im Zeitraum vorhanden.',
    },
    time: {
      topWeekday: null, topWeekdayShare: 0, topPhase: null, topPhaseShare: 0,
      weekdayCount: 0, weekendCount: 0, withTime: 0,
      note: 'Keine Zeitdaten verfügbar.',
    },
    mecfs: {
      daysWithMecfs: ctx.meta.daysWithMecfs ?? 0,
      contextNoteCount: dataset.meta.contextNoteCount ?? 0,
      note: '',
    },
    medication: {
      intakeCount: dataset.meta.medicationIntakeCount ?? 0,
      highPainEntries: 0, highPainWithMed: 0, highPainWithoutMed: 0,
      note: '',
    },
    dataQuality: {
      painEntries: dataset.meta.painEntryCount,
      voiceEvents: dataset.meta.voiceEventCount,
      weatherDays: 0,
      rangeDays,
      note: '',
    },
  };

  try {
    const fromDate = range.from.toISOString().slice(0, 10);
    const toDate = range.to.toISOString().slice(0, 10);
    const enrichments: string[] = [];

    // --- Time-pattern aggregate ---
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
      const wdSorted = Array.from(wdCount.entries()).sort((a,b)=>b[1]-a[1]);
      const phaseSorted = Array.from(phaseCount.entries()).sort((a,b)=>b[1]-a[1]);
      const totalWd = wdSorted.reduce((s,[,v])=>s+v,0);
      preAnalysis.time = {
        topWeekday: wdSorted[0]?.[0] ?? null,
        topWeekdayShare: totalWd > 0 ? (wdSorted[0]?.[1] ?? 0) / totalWd : 0,
        topPhase: phaseSorted[0]?.[0] ?? null,
        topPhaseShare: withTime > 0 ? (phaseSorted[0]?.[1] ?? 0) / withTime : 0,
        weekdayCount: weekday, weekendCount: weekend, withTime,
        note: phaseSorted[0]
          ? `Häufigster Wochentag: ${wdSorted[0][0]} (${wdSorted[0][1]}/${totalWd}). Häufigste Tagesphase: ${phaseSorted[0][0]} (${phaseSorted[0][1]}/${withTime}).`
          : `Wochentag-Verteilung erfasst (n=${totalWd}). Uhrzeitdaten nur für ${withTime} Einträge.`,
      };
      enrichments.push('=== Zeitaggregat Schmerzeinträge ===');
      enrichments.push(`Wochentage: ${wdSorted.map(([k,v])=>`${k}=${v}`).join(', ') || 'keine Daten'}`);
      enrichments.push(`Werktag vs. Wochenende: Werktag=${weekday}, Wochenende=${weekend}`);
      enrichments.push(`Tagesphasen (n=${withTime} mit Uhrzeit): ${phaseSorted.map(([k,v])=>`${k}=${v}`).join(', ') || 'keine Uhrzeitdaten'}`);
      enrichments.push('');
    }

    // --- Weather block + correlation ---
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

        // Correlation buckets
        let drop = 0, rise = 0, stable = 0;
        let painDrop = 0, painRise = 0, painStable = 0;
        for (const d of sortedDays) {
          const dp = byDay.get(d)!.pressure_change_24h;
          if (dp == null) continue;
          const isPain = painDates.has(d);
          if (dp <= -3) { drop++; if (isPain) painDrop++; }
          else if (dp >= 3) { rise++; if (isPain) painRise++; }
          else { stable++; if (isPain) painStable++; }
        }
        const pct = (n: number, d: number) => d > 0 ? `${Math.round((n/d)*100)}%` : '–';
        preAnalysis.weather = {
          daysWithData: byDay.size,
          pressureDropDays: drop, pressureRiseDays: rise, stableDays: stable,
          painOnDropDays: painDrop, painOnRiseDays: painRise, painOnStableDays: painStable,
          pressureMin: press.length ? Math.min(...press) : null,
          pressureMax: press.length ? Math.max(...press) : null,
          tempMin: temp.length ? Math.min(...temp) : null,
          tempMax: temp.length ? Math.max(...temp) : null,
          note: `Wetterabdeckung ${byDay.size}/${rangeDays} Tage. Druckabfall (Δ24h ≤ -3 hPa): ${drop} Tage, davon ${painDrop} mit Schmerz (${pct(painDrop,drop)}). Druckanstieg (≥ +3 hPa): ${rise} Tage, ${painRise} mit Schmerz (${pct(painRise,rise)}). Stabil: ${stable} Tage, ${painStable} mit Schmerz (${pct(painStable,stable)}).`,
        };

        if (press.length) enrichments.push(`Luftdruck: min=${Math.min(...press).toFixed(0)} mb, max=${Math.max(...press).toFixed(0)} mb, n=${press.length}`);
        if (delta.length) enrichments.push(`Luftdruckänderung 24h: min=${Math.min(...delta).toFixed(1)} mb, max=${Math.max(...delta).toFixed(1)} mb`);
        if (temp.length) enrichments.push(`Temperatur: min=${Math.min(...temp).toFixed(1)} °C, max=${Math.max(...temp).toFixed(1)} °C`);
        enrichments.push(`Wetterabdeckung: ${byDay.size}/${rangeDays} Tage`);
        enrichments.push(`Druck-Korrelation: Abfall=${drop}T (${painDrop} Schmerz), Anstieg=${rise}T (${painRise} Schmerz), Stabil=${stable}T (${painStable} Schmerz)`);
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

    // --- Medication timing (deterministic) ---
    let highPain = 0, highPainMed = 0;
    for (const p of dataset.painEntries) {
      const lvl = typeof p.pain_level === 'string' && /^\d+$/.test(p.pain_level) ? parseInt(p.pain_level, 10) : null;
      if (lvl != null && lvl >= 7) {
        highPain++;
        const meds = (p as any).medications;
        if (Array.isArray(meds) && meds.length > 0) highPainMed++;
      }
    }
    preAnalysis.medication.highPainEntries = highPain;
    preAnalysis.medication.highPainWithMed = highPainMed;
    preAnalysis.medication.highPainWithoutMed = highPain - highPainMed;
    preAnalysis.medication.note = highPain > 0
      ? `Schmerz ≥ 7: ${highPain} Einträge, davon mit dokumentiertem Akutmedikament: ${highPainMed} (${Math.round((highPainMed/highPain)*100)}%). Ohne Medikament: ${highPain - highPainMed}. Insgesamt ${dataset.meta.medicationIntakeCount} Medikamenteneinnahmen erfasst.`
      : `Keine Einträge mit Schmerz ≥ 7 im Zeitraum. Insgesamt ${dataset.meta.medicationIntakeCount} Medikamenteneinnahmen erfasst.`;

    // --- ME/CFS coverage ---
    preAnalysis.mecfs.note = preAnalysis.mecfs.daysWithMecfs > 0
      ? `${preAnalysis.mecfs.daysWithMecfs} Tage mit ME/CFS-/Energie-Signal dokumentiert. Tagesfaktoren-Einträge: ${preAnalysis.mecfs.contextNoteCount}.`
      : `Keine ME/CFS-/PEM-Daten im Zeitraum dokumentiert. Tagesfaktoren-Einträge: ${preAnalysis.mecfs.contextNoteCount}.`;

    preAnalysis.dataQuality.weatherDays = preAnalysis.weather.daysWithData;
    preAnalysis.dataQuality.note = `${dataset.meta.painEntryCount} Schmerzeinträge über ${ctx.meta.totalDays} Tage (Range ${rangeDays} Tage). Wetterdaten: ${preAnalysis.weather.daysWithData}/${rangeDays} Tage. Tagesfaktoren: ${preAnalysis.mecfs.contextNoteCount} Einträge. Voice-Events: ${dataset.meta.voiceEventCount}.`;

    // --- Top deterministic block (LLM reads first) ---
    const head = [
      '=== Deterministische Vorab-Auswertung ===',
      `Zeitmuster: ${preAnalysis.time.note}`,
      `Wetter: ${preAnalysis.weather.note}`,
      `Medikamente: ${preAnalysis.medication.note}`,
      `ME/CFS / Energie: ${preAnalysis.mecfs.note}`,
      `Datenqualität: ${preAnalysis.dataQuality.note}`,
      '',
    ];

    // --- Data quality block ---
    enrichments.push('=== Datenqualität ===');
    enrichments.push(`Schmerzeinträge: ${dataset.meta.painEntryCount}`);
    enrichments.push(`Sprach-/Voice-Events: ${dataset.meta.voiceEventCount}`);
    enrichments.push(`Medikamenteneinnahmen: ${dataset.meta.medicationIntakeCount}`);
    enrichments.push(`Tagesfaktoren-Einträge: ${dataset.meta.contextNoteCount}`);
    enrichments.push(`Tage mit Daten: ${ctx.meta.totalDays}, davon Schmerztage: ${ctx.meta.daysWithPain}, ME/CFS-Signal: ${ctx.meta.daysWithMecfs}`);
    enrichments.push('');

    serialized = head.join('\n') + '\n' + enrichments.join('\n') + '\n' + serialized;
  } catch (e) {
    console.warn('[AnalysisEngine] Enrichment failed (non-fatal):', e);
  }

  let wasTruncated = false;

  // === CONTEXT SIZE GUARD ===
  if (serialized.length > MAX_CONTEXT_CHARS) {
    console.warn(`[AnalysisEngine] Context too large (${serialized.length} chars), truncating to ${MAX_CONTEXT_CHARS}`);
    const truncated = serialized.slice(0, MAX_CONTEXT_CHARS);
    const lastNewline = truncated.lastIndexOf('\n');
    serialized = (lastNewline > MAX_CONTEXT_CHARS * 0.9 ? truncated.slice(0, lastNewline) : truncated)
      + '\n\n[... Kontext wurde aufgrund der Größe gekürzt. Nicht alle Tage sind enthalten.]';
    wasTruncated = true;
  } else if (serialized.length > WARN_CONTEXT_CHARS) {
    console.warn(`[AnalysisEngine] Large context: ${serialized.length} chars (~${estimateTokens(serialized)} tokens)`);
  }

  const tokenEstimate = estimateTokens(serialized);

  // Build deterministic trend days from raw entries (App-side SSOT).
  let trendDays: TrendDayRecord[] = [];
  try {
    trendDays = buildTrendDaysFromEntries({
      fromDate: range.from.toISOString().slice(0, 10),
      toDate: range.to.toISOString().slice(0, 10),
      painEntries: dataset.painEntries.map((p: any) => ({
        selected_date: p.selected_date,
        pain_level: p.pain_level,
        medications: p.medications,
        me_cfs_severity_score: p.me_cfs_severity_score ?? null,
        me_cfs_severity_level: p.me_cfs_severity_level ?? null,
      })),
      medIntakes: dataset.medicationIntakes.map((m: any) => ({
        taken_date: m.taken_date,
        taken_at: m.taken_at,
        medication_name: m.medication_name,
      })),
    });
  } catch (e) {
    console.warn('[AnalysisEngine] trendDays build failed (non-fatal):', e);
  }

  return {
    serialized,
    tokenEstimate,
    wasTruncated,
    preAnalysis,
    trendDays,
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

  // 3.5: Build deterministic V2.1 report BEFORE the LLM call so the LLM
  //      receives the structured findings as evidence base.
  const rangeDays = Math.max(
    1,
    Math.round((range.to.getTime() - range.from.getTime()) / 86400000),
  );
  let reportV21Pre: ReturnType<typeof buildAnalysisReportV21> | null = null;
  try {
    reportV21Pre = buildAnalysisReportV21({
      fromISO: range.from.toISOString(),
      toISO: range.to.toISOString(),
      timezone: 'Europe/Berlin',
      daysTotal: rangeDays,
      preAnalysis: promptData.preAnalysis,
      meta: promptData.meta,
      trendDays: promptData.trendDays,
    });
  } catch (e) {
    console.warn('[AnalysisEngine] Pre-LLM V2.1 build failed:', e);
  }

  // 4: Call edge function (passes preAnalysis + deterministicFindings to LLM)
  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'analyze-voice-patterns',
    {
      body: {
        serializedContext: promptData.serialized,
        meta: promptData.meta,
        fromDate: range.from.toISOString(),
        toDate: range.to.toISOString(),
        preAnalysis: promptData.preAnalysis,
        deterministicFindings: reportV21Pre?.findings ?? [],
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
  (result as any)._preAnalysis = promptData.preAnalysis;

  // Build deterministic V2.1 report and merge LLM expanded findings.
  try {
    const reportV21 = reportV21Pre ?? buildAnalysisReportV21({
      fromISO: range.from.toISOString(),
      toISO: range.to.toISOString(),
      timezone: 'Europe/Berlin',
      daysTotal: rangeDays,
      preAnalysis: promptData.preAnalysis,
      meta: promptData.meta,
      trendDays: promptData.trendDays,
    });

    const expanded = Array.isArray((fnData as any)?.llm_expanded_findings)
      ? (fnData as any).llm_expanded_findings as Array<Record<string, unknown>>
      : [];
    (reportV21 as any).llm_expanded_findings = expanded;

    // Bucket LLM findings into section_map by category
    const catToSection: Record<string, keyof typeof reportV21.section_map> = {
      burden: 'burden_course', chronification: 'burden_course',
      medication_use: 'medication', medication_effect: 'medication', preventive_course: 'medication',
      weather: 'weather_environment',
      mecfs_energy_pem: 'mecfs_energy',
      symptoms_aura: 'symptoms_aura',
      sleep: 'lifestyle_time_patterns', stress_mood: 'lifestyle_time_patterns',
      lifestyle_triggers: 'lifestyle_time_patterns', time_pattern: 'lifestyle_time_patterns',
      interaction: 'lifestyle_time_patterns',
      data_quality: 'data_quality',
      red_flag: 'red_flags',
      cycle_hormonal: 'symptoms_aura',
    };
    for (const f of expanded) {
      const id = typeof f.id === 'string' ? f.id : '';
      const cat = typeof f.category === 'string' ? f.category : '';
      if (!id || !cat) continue;
      const section = catToSection[cat];
      if (section && Array.isArray(reportV21.section_map[section])) {
        (reportV21.section_map[section] as string[]).push(id);
      }
      const lvl = (f as any).evidence_level;
      if (lvl === 'high' || lvl === 'moderate') reportV21.section_map.strongest_findings.push(id);
      else if (lvl === 'low') reportV21.section_map.weaker_findings.push(id);
    }

    (result as any).schema_version = ANALYSIS_V21_SCHEMA;
    (result as any).analysis_version = ANALYSIS_V21_VERSION;
    (result as any).analysisV21 = reportV21;
    (result as any).llm_expanded_findings = expanded;
  } catch (e) {
    console.warn('[AnalysisEngine] V2.1 report merge failed (non-fatal):', e);
  }

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
