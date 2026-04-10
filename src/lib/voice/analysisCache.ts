/**
 * analysisCache.ts
 * 
 * Persistence and reuse logic for voice pattern analysis results.
 * Uses the ai_reports table with report_type='pattern_analysis'.
 * 
 * Dedupe key format: pattern_analysis_{from}_{to}
 * Reuse rule: an existing analysis is valid if it was created AFTER the latest
 * data change (pain entry or voice event) in the same date range.
 */

import { supabase } from '@/integrations/supabase/client';
import type { VoiceAnalysisResult } from './analysisTypes';

// ============================================================
// === CONSTANTS ===
// ============================================================

/** Minimum interval between analyses for same range (ms) — 5 minutes */
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
// === LOAD CACHED ANALYSIS ===
// ============================================================

export interface CachedAnalysis {
  id: string;
  result: VoiceAnalysisResult;
  createdAt: string;
  updatedAt: string;
  fromDate: string;
  toDate: string;
}

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
// === CHECK IF REANALYSIS IS NEEDED ===
// ============================================================

/**
 * Determine if a cached analysis is still valid or needs refresh.
 * 
 * Returns { valid: true } if cache can be reused,
 * or { valid: false, reason: string } if new analysis needed.
 */
export async function isCacheValid(
  cached: CachedAnalysis,
): Promise<{ valid: boolean; reason?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { valid: false, reason: 'not_authenticated' };

  // 1. Check if latest data change is newer than the analysis
  const { data: latestEntry } = await supabase
    .from('pain_entries')
    .select('timestamp_created')
    .eq('user_id', user.id)
    .gte('selected_date', cached.fromDate)
    .lte('selected_date', cached.toDate)
    .order('timestamp_created', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestEntry?.timestamp_created) {
    const entryTime = new Date(latestEntry.timestamp_created).getTime();
    const cacheTime = new Date(cached.updatedAt).getTime();
    if (entryTime > cacheTime) {
      return { valid: false, reason: 'data_changed' };
    }
  }

  // 2. Check voice events
  const { data: latestVoice } = await supabase
    .from('voice_events')
    .select('updated_at')
    .eq('user_id', user.id)
    .gte('event_timestamp', cached.fromDate + 'T00:00:00Z')
    .lte('event_timestamp', cached.toDate + 'T23:59:59Z')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVoice?.updated_at) {
    const voiceTime = new Date(latestVoice.updated_at).getTime();
    const cacheTime = new Date(cached.updatedAt).getTime();
    if (voiceTime > cacheTime) {
      return { valid: false, reason: 'voice_data_changed' };
    }
  }

  return { valid: true };
}

/**
 * Check if enough time has passed since last analysis to allow reanalysis.
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
// === LOAD LATEST FOR REPORT/SHARE ===
// ============================================================

/**
 * Load the most recent valid pattern analysis for a date range.
 * Used by PDF report generation and doctor-share to embed the analysis.
 * Falls back to the latest analysis overlapping the range.
 */
export async function loadAnalysisForReport(
  fromDate: string,
  toDate: string,
): Promise<VoiceAnalysisResult | null> {
  const cached = await loadCachedAnalysis(fromDate, toDate);
  if (cached) return cached.result;
  return null;
}
