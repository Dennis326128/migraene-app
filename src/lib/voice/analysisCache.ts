/**
 * analysisCache.ts
 * 
 * Persistence and reuse logic for voice pattern analysis results.
 * Uses the ai_reports table with report_type='pattern_analysis'.
 * 
 * === VALIDITY MODEL ===
 * An analysis is "valid" if and only if:
 *   1. It exists for the requested date range (dedupe_key match)
 *   2. The data-state fingerprint matches — meaning no relevant source
 *      data in that range was created or modified AFTER the analysis.
 * 
 * The data-state fingerprint checks FOUR sources (user-scoped, range-scoped):
 *   - pain_entries.updated_at     — edits AND new entries
 *   - voice_events.updated_at     — new/edited voice data
 *   - medication_intakes.updated_at — intake changes in range
 *   - medication_effects.updated_at — effect ratings for entries in range
 * 
 * The 5-minute cooldown is a SECONDARY safeguard against rapid
 * re-runs when data is unchanged. If data changed, re-analysis
 * is allowed immediately, even within the cooldown.
 * 
 * Dedupe key format: pattern_analysis_{from}_{to}
 */

import { supabase } from '@/integrations/supabase/client';
import type { VoiceAnalysisResult } from './analysisTypes';

// ============================================================
// === CONSTANTS ===
// ============================================================

/** Minimum interval between analyses for same UNCHANGED range (ms) — 5 minutes */
const MIN_REANALYSIS_INTERVAL_MS = 5 * 60 * 1000;

/** Report type used in ai_reports table */
const REPORT_TYPE = 'pattern_analysis';

// ============================================================
// === DEDUPE KEY ===
// ============================================================

export function buildDedupeKey(fromDate: string, toDate: string): string {
  return `pattern_analysis_${fromDate}_${toDate}`;
}

// ============================================================
// === TYPES ===
// ============================================================

export interface CachedAnalysis {
  id: string;
  result: VoiceAnalysisResult;
  createdAt: string;
  updatedAt: string;
  fromDate: string;
  toDate: string;
}

export interface CacheValidityResult {
  valid: boolean;
  reason?: 'not_authenticated' | 'pain_data_changed' | 'voice_data_changed' | 'medication_intake_changed' | 'medication_effect_changed';
}

/**
 * Fingerprint of the data state for a given user + date range.
 * Used to determine if a cached analysis is still valid.
 */
export interface DataStateFingerprint {
  /** Latest updated_at from pain_entries in range */
  latestPainEntry: string | null;
  /** Latest updated_at from voice_events in range */
  latestVoiceEvent: string | null;
  /** Latest updated_at from medication_intakes in range */
  latestMedIntake: string | null;
  /** Latest updated_at from medication_effects for entries in range */
  latestMedEffect: string | null;
  /** The single max timestamp across all sources */
  maxTimestamp: string | null;
}

// ============================================================
// === CENTRAL DATA-STATE FINGERPRINT ===
// ============================================================

/**
 * Compute the data-state fingerprint for a user's data in a date range.
 * 
 * This is the SINGLE SOURCE OF TRUTH for determining whether
 * source data has changed. Used by:
 *   - Client-side cache validation (analysisCache.ts)
 *   - Snapshot builder (doctorReportSnapshot.ts) — via equivalent Deno logic
 *   - PDF report embedding
 * 
 * All queries are scoped to the authenticated user AND the date range.
 */
export async function getDataStateFingerprint(
  fromDate: string,
  toDate: string,
): Promise<DataStateFingerprint | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [painResult, voiceResult, intakeResult, effectResult] = await Promise.all([
    // pain_entries: updated_at tracks both creation AND edits (trigger-backed)
    supabase
      .from('pain_entries')
      .select('updated_at')
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // voice_events: updated_at tracks edits to review_state, structured_data, etc.
    supabase
      .from('voice_events')
      .select('updated_at')
      .eq('user_id', user.id)
      .gte('event_timestamp', fromDate + 'T00:00:00Z')
      .lte('event_timestamp', toDate + 'T23:59:59Z')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // medication_intakes: scoped to user + date range
    supabase
      .from('medication_intakes')
      .select('updated_at')
      .eq('user_id', user.id)
      .gte('taken_date', fromDate)
      .lte('taken_date', toDate)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // medication_effects: scoped to user via pain_entries join
    // We query entries in range, then check their effects
    supabase
      .from('pain_entries')
      .select('id')
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('id', { ascending: false })
      .limit(500),
  ]);

  // For medication_effects, we need a second query scoped to the user's entries
  let latestMedEffect: string | null = null;
  if (effectResult.data && effectResult.data.length > 0) {
    const entryIds = effectResult.data.map(e => e.id);
    const { data: effectData } = await supabase
      .from('medication_effects')
      .select('updated_at')
      .in('entry_id', entryIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    latestMedEffect = effectData?.updated_at ?? null;
  }

  const latestPainEntry = painResult.data?.updated_at ?? null;
  const latestVoiceEvent = voiceResult.data?.updated_at ?? null;
  const latestMedIntake = intakeResult.data?.updated_at ?? null;

  // Compute max across all sources
  const timestamps: number[] = [];
  if (latestPainEntry) timestamps.push(new Date(latestPainEntry).getTime());
  if (latestVoiceEvent) timestamps.push(new Date(latestVoiceEvent).getTime());
  if (latestMedIntake) timestamps.push(new Date(latestMedIntake).getTime());
  if (latestMedEffect) timestamps.push(new Date(latestMedEffect).getTime());

  return {
    latestPainEntry,
    latestVoiceEvent,
    latestMedIntake,
    latestMedEffect,
    maxTimestamp: timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null,
  };
}

// ============================================================
// === LOAD CACHED ANALYSIS ===
// ============================================================

/**
 * Load the most recent cached analysis for a given date range.
 * Returns null if no valid cached result exists.
 */
export async function loadCachedAnalysis(
  fromDate: string,
  toDate: string,
): Promise<CachedAnalysis | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dedupeKey = buildDedupeKey(fromDate, toDate);

  const { data, error } = await supabase
    .from('ai_reports')
    .select('id, response_json, created_at, updated_at, from_date, to_date')
    .eq('user_id', user.id)
    .eq('report_type', REPORT_TYPE)
    .eq('dedupe_key', dedupeKey)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Validate the stored result has the expected shape
  const result = data.response_json as unknown;
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (typeof r.summary !== 'string' || !r.scope) return null;

  return {
    id: data.id,
    result: result as VoiceAnalysisResult,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    fromDate: data.from_date || fromDate,
    toDate: data.to_date || toDate,
  };
}

// ============================================================
// === DATA-STATE VALIDATION ===
// ============================================================

/**
 * Determine if a cached analysis is still valid.
 * 
 * PRIMARY CHECK: Has ANY relevant source data changed since the analysis was saved?
 * Uses getDataStateFingerprint (user-scoped, range-scoped) for all comparisons.
 */
export async function isCacheValid(
  cached: CachedAnalysis,
): Promise<CacheValidityResult> {
  const fingerprint = await getDataStateFingerprint(cached.fromDate, cached.toDate);
  if (!fingerprint) return { valid: false, reason: 'not_authenticated' };

  const cacheTime = new Date(cached.updatedAt).getTime();

  if (fingerprint.latestPainEntry && new Date(fingerprint.latestPainEntry).getTime() > cacheTime) {
    return { valid: false, reason: 'pain_data_changed' };
  }

  if (fingerprint.latestVoiceEvent && new Date(fingerprint.latestVoiceEvent).getTime() > cacheTime) {
    return { valid: false, reason: 'voice_data_changed' };
  }

  if (fingerprint.latestMedIntake && new Date(fingerprint.latestMedIntake).getTime() > cacheTime) {
    return { valid: false, reason: 'medication_intake_changed' };
  }

  if (fingerprint.latestMedEffect && new Date(fingerprint.latestMedEffect).getTime() > cacheTime) {
    return { valid: false, reason: 'medication_effect_changed' };
  }

  return { valid: true };
}

/**
 * Check if re-analysis is allowed (secondary safeguard).
 * 
 * Rules (in priority order):
 * 1. If data has changed → always allow (caller checks isCacheValid first)
 * 2. If data unchanged → respect cooldown to prevent unnecessary re-runs
 */
export function canReanalyze(cached: CachedAnalysis): boolean {
  const elapsed = Date.now() - new Date(cached.updatedAt).getTime();
  return elapsed >= MIN_REANALYSIS_INTERVAL_MS;
}

// ============================================================
// === SAVE ANALYSIS RESULT ===
// ============================================================

/**
 * Save a voice pattern analysis result to ai_reports.
 * Uses upsert with dedupe_key to avoid duplicates.
 */
export async function saveAnalysisResult(
  result: VoiceAnalysisResult,
  fromDate: string,
  toDate: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dedupeKey = buildDedupeKey(fromDate, toDate);

  // Check for existing
  const { data: existing } = await supabase
    .from('ai_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('ai_reports')
      .update({
        response_json: result as any,
        updated_at: new Date().toISOString(),
        title: `KI-Analyse ${fromDate} – ${toDate}`,
        model: result.meta.model,
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[AnalysisCache] Update error:', error);
      return null;
    }
    return existing.id;
  }

  // Create new
  const { data, error } = await supabase
    .from('ai_reports')
    .insert({
      user_id: user.id,
      report_type: REPORT_TYPE,
      title: `KI-Analyse ${fromDate} – ${toDate}`,
      from_date: fromDate,
      to_date: toDate,
      source: 'analysis_view',
      response_json: result as any,
      model: result.meta.model,
      dedupe_key: dedupeKey,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[AnalysisCache] Insert error:', error);
    return null;
  }

  return data?.id || null;
}

// ============================================================
// === LOAD FOR REPORT / SHARE ===
// ============================================================

/**
 * Load the most recent valid pattern analysis for a date range.
 * Used by PDF report generation and doctor-share to embed the analysis.
 * 
 * Returns the analysis result ONLY if it exists.
 * Staleness is noted but stale results are still returned (stale > missing).
 */
export async function loadAnalysisForReport(
  fromDate: string,
  toDate: string,
): Promise<VoiceAnalysisResult | null> {
  const cached = await loadCachedAnalysis(fromDate, toDate);
  if (!cached) return null;

  // Verify it's still valid against current data state
  const validity = await isCacheValid(cached);
  if (!validity.valid) {
    console.info(`[AnalysisCache] Report analysis stale: ${validity.reason}`);
    // Return it anyway for reports — stale is better than missing.
    // The analyzedAt timestamp makes the staleness visible.
  }

  return cached.result;
}

// ============================================================
// === SHARED SUMMARY FORMAT ===
// ============================================================

/**
 * Build a PatternAnalysisSummary from a VoiceAnalysisResult.
 * 
 * SINGLE FORMAT for all outputs: Snapshot, Website, PDF.
 * Enforces consistent limits and field mapping.
 * 
 * Limits:
 * - max 7 patterns (sorted by evidence strength)
 * - max 5 recurring sequences
 * - max 4 open questions
 */
export function buildPatternAnalysisSummary(result: VoiceAnalysisResult): {
  summary: string;
  patterns: Array<{ title: string; description: string; evidenceStrength: string }>;
  recurringSequences: Array<{ pattern: string; count: number; interpretation: string }>;
  openQuestions: string[];
  analyzedAt: string;
  daysAnalyzed: number;
} {
  // Sort patterns: high > medium > low evidence
  const evidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedPatterns = [...result.possiblePatterns]
    .sort((a, b) => (evidenceOrder[b.evidenceStrength] || 0) - (evidenceOrder[a.evidenceStrength] || 0));

  return {
    summary: result.summary,
    patterns: sortedPatterns.slice(0, 7).map(p => ({
      title: p.title,
      description: p.description,
      evidenceStrength: p.evidenceStrength,
    })),
    recurringSequences: result.recurringSequences.slice(0, 5).map(s => ({
      pattern: s.pattern,
      count: s.count,
      interpretation: s.llmInterpretation,
    })),
    openQuestions: result.openQuestions.slice(0, 4),
    analyzedAt: result.meta.analyzedAt,
    daysAnalyzed: result.scope.daysAnalyzed,
  };
}
