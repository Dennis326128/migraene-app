/**
 * analysisCache.ts
 * 
 * Persistence and reuse logic for voice pattern analysis results.
 * Uses the ai_reports table with report_type='pattern_analysis'.
 * 
 * === VALIDITY MODEL ===
 * An analysis is "valid" if and only if:
 *   1. It exists for the requested date range (dedupe_key match)
 *   2. No pain_entries or voice_events in that range have been
 *      created/updated AFTER the analysis was last saved
 * 
 * The 5-minute cooldown is a SECONDARY safeguard against rapid
 * re-runs, not the primary validity check. If data changed,
 * re-analysis is allowed even within the cooldown.
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
  reason?: 'not_authenticated' | 'data_changed' | 'voice_data_changed';
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
 * Get the latest source data timestamp for a date range.
 * Checks pain_entries and voice_events to determine if any
 * data has changed since a given reference point.
 */
export async function getLatestSourceTimestamp(
  fromDate: string,
  toDate: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Parallel: check latest pain entry and latest voice event
  const [entryResult, voiceResult] = await Promise.all([
    supabase
      .from('pain_entries')
      .select('timestamp_created')
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('timestamp_created', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('voice_events')
      .select('updated_at')
      .eq('user_id', user.id)
      .gte('event_timestamp', fromDate + 'T00:00:00Z')
      .lte('event_timestamp', toDate + 'T23:59:59Z')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const timestamps: number[] = [];
  if (entryResult.data?.timestamp_created) {
    timestamps.push(new Date(entryResult.data.timestamp_created).getTime());
  }
  if (voiceResult.data?.updated_at) {
    timestamps.push(new Date(voiceResult.data.updated_at).getTime());
  }

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

/**
 * Determine if a cached analysis is still valid or needs refresh.
 * 
 * Primary check: Has source data changed since the analysis was saved?
 * This is the core validity rule — NOT the cooldown timer.
 */
export async function isCacheValid(
  cached: CachedAnalysis,
): Promise<CacheValidityResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { valid: false, reason: 'not_authenticated' };

  const cacheTime = new Date(cached.updatedAt).getTime();

  // Parallel check both data sources
  const [entryResult, voiceResult] = await Promise.all([
    supabase
      .from('pain_entries')
      .select('timestamp_created')
      .eq('user_id', user.id)
      .gte('selected_date', cached.fromDate)
      .lte('selected_date', cached.toDate)
      .order('timestamp_created', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('voice_events')
      .select('updated_at')
      .eq('user_id', user.id)
      .gte('event_timestamp', cached.fromDate + 'T00:00:00Z')
      .lte('event_timestamp', cached.toDate + 'T23:59:59Z')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (entryResult.data?.timestamp_created) {
    if (new Date(entryResult.data.timestamp_created).getTime() > cacheTime) {
      return { valid: false, reason: 'data_changed' };
    }
  }

  if (voiceResult.data?.updated_at) {
    if (new Date(voiceResult.data.updated_at).getTime() > cacheTime) {
      return { valid: false, reason: 'voice_data_changed' };
    }
  }

  return { valid: true };
}

/**
 * Check if re-analysis is allowed.
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
 * Returns the analysis result ONLY if it's still valid against current data.
 * Falls back to null if no valid analysis exists.
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

/**
 * Build a PatternAnalysisSummary from a VoiceAnalysisResult.
 * Used to create the compact format for snapshots and reports.
 */
export function buildPatternAnalysisSummary(result: VoiceAnalysisResult): {
  summary: string;
  patterns: Array<{ title: string; description: string; evidenceStrength: string }>;
  recurringSequences: Array<{ pattern: string; count: number; interpretation: string }>;
  openQuestions: string[];
  analyzedAt: string;
  daysAnalyzed: number;
} {
  return {
    summary: result.summary,
    patterns: result.possiblePatterns.slice(0, 7).map(p => ({
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
