/**
 * analysisCache.ts
 * 
 * Persistence and reuse logic for voice pattern analysis results.
 * Uses the ai_reports table with report_type='pattern_analysis'.
 * 
 * === VALIDITY MODEL ===
 * An analysis is "valid" if and only if:
 *   1. It exists for the requested date range (dedupe_key match)
 *   2. Its data_state_signature matches the CURRENT data state —
 *      i.e. no relevant source data was created/modified since analysis.
 * 
 * The data-state fingerprint checks FOUR sources (user-scoped, range-scoped):
 *   - pain_entries.updated_at     — edits AND new entries
 *   - voice_events.updated_at     — new/edited voice data
 *   - medication_intakes.updated_at — intake changes in range
 *   - medication_effects.updated_at — effect ratings for entries in range
 * 
 * From these, a deterministic STATE SIGNATURE is derived:
 *   pe:{count}:{latestTs}|ve:{count}:{latestTs}|mi:{count}:{latestTs}|me:{count}:{latestTs}
 * 
 * This signature is stored on ai_reports.data_state_signature and used for
 * exact-match reuse — not just timestamp comparison.
 * 
 * The 5-minute cooldown is a SECONDARY safeguard against rapid
 * re-runs when data is unchanged. If data changed (signature differs),
 * re-analysis is allowed immediately.
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
  /** The data-state signature stored when this analysis was created/updated */
  dataStateSignature: string | null;
}

export interface CacheValidityResult {
  valid: boolean;
  reason?: 'not_authenticated' | 'no_signature' | 'signature_mismatch' | 'pain_data_changed' | 'voice_data_changed' | 'medication_intake_changed' | 'medication_effect_changed';
}

/**
 * Fingerprint of the data state for a given user + date range.
 * Used to determine if a cached analysis is still valid.
 * 
 * Contains both per-source metrics AND a derived signature string
 * for exact-match comparison.
 */
export interface DataStateFingerprint {
  /** Count of pain_entries in range */
  painEntryCount: number;
  /** Latest updated_at from pain_entries in range */
  latestPainEntry: string | null;
  /** Count of voice_events in range */
  voiceEventCount: number;
  /** Latest updated_at from voice_events in range */
  latestVoiceEvent: string | null;
  /** Count of medication_intakes in range */
  medIntakeCount: number;
  /** Latest updated_at from medication_intakes in range */
  latestMedIntake: string | null;
  /** Count of medication_effects for entries in range */
  medEffectCount: number;
  /** Latest updated_at from medication_effects for entries in range */
  latestMedEffect: string | null;
  /** The single max timestamp across all sources */
  maxTimestamp: string | null;
  /**
   * Deterministic state signature for exact-match comparison.
   * Format: pe:{count}:{ts}|ve:{count}:{ts}|mi:{count}:{ts}|me:{count}:{ts}
   * where {ts} is epoch ms or 0 if null.
   */
  stateSignature: string;
}

// ============================================================
// === STATE SIGNATURE BUILDER (pure function) ===
// ============================================================

/**
 * Build a deterministic state signature from per-source counts and timestamps.
 * This is a PURE FUNCTION — no Supabase calls. Used by both client and tests.
 */
export function buildStateSignature(
  painCount: number, painTs: string | null,
  voiceCount: number, voiceTs: string | null,
  intakeCount: number, intakeTs: string | null,
  effectCount: number, effectTs: string | null,
): string {
  const ts = (v: string | null) => v ? new Date(v).getTime() : 0;
  return `pe:${painCount}:${ts(painTs)}|ve:${voiceCount}:${ts(voiceTs)}|mi:${intakeCount}:${ts(intakeTs)}|me:${effectCount}:${ts(effectTs)}`;
}

// ============================================================
// === CENTRAL DATA-STATE FINGERPRINT ===
// ============================================================

/**
 * Compute the data-state fingerprint for a user's data in a date range.
 * 
 * This is the SINGLE SOURCE OF TRUTH for determining whether
 * source data has changed. Used by:
 *   - Client-side cache validation (this file)
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

  const [painResult, voiceResult, intakeResult, entryIdsResult] = await Promise.all([
    // pain_entries: count + latest updated_at
    supabase
      .from('pain_entries')
      .select('updated_at', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('updated_at', { ascending: false })
      .limit(1),

    // voice_events: count + latest updated_at
    supabase
      .from('voice_events')
      .select('updated_at', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('event_timestamp', fromDate + 'T00:00:00Z')
      .lte('event_timestamp', toDate + 'T23:59:59Z')
      .order('updated_at', { ascending: false })
      .limit(1),

    // medication_intakes: count + latest updated_at
    supabase
      .from('medication_intakes')
      .select('updated_at', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('taken_date', fromDate)
      .lte('taken_date', toDate)
      .order('updated_at', { ascending: false })
      .limit(1),

    // Get entry IDs for medication_effects scoping
    supabase
      .from('pain_entries')
      .select('id')
      .eq('user_id', user.id)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('id', { ascending: false })
      .limit(500),
  ]);

  // medication_effects: scoped to the user's entries in range
  let latestMedEffect: string | null = null;
  let medEffectCount = 0;
  if (entryIdsResult.data && entryIdsResult.data.length > 0) {
    const entryIds = entryIdsResult.data.map(e => e.id);
    const { data: effectData, count: effectCount } = await supabase
      .from('medication_effects')
      .select('updated_at', { count: 'exact' })
      .in('entry_id', entryIds)
      .order('updated_at', { ascending: false })
      .limit(1);
    latestMedEffect = effectData?.[0]?.updated_at ?? null;
    medEffectCount = effectCount ?? 0;
  }

  const painEntryCount = painResult.count ?? 0;
  const latestPainEntry = painResult.data?.[0]?.updated_at ?? null;
  const voiceEventCount = voiceResult.count ?? 0;
  const latestVoiceEvent = voiceResult.data?.[0]?.updated_at ?? null;
  const medIntakeCount = intakeResult.count ?? 0;
  const latestMedIntake = intakeResult.data?.[0]?.updated_at ?? null;

  // Compute max across all sources
  const timestamps: number[] = [];
  if (latestPainEntry) timestamps.push(new Date(latestPainEntry).getTime());
  if (latestVoiceEvent) timestamps.push(new Date(latestVoiceEvent).getTime());
  if (latestMedIntake) timestamps.push(new Date(latestMedIntake).getTime());
  if (latestMedEffect) timestamps.push(new Date(latestMedEffect).getTime());

  const stateSignature = buildStateSignature(
    painEntryCount, latestPainEntry,
    voiceEventCount, latestVoiceEvent,
    medIntakeCount, latestMedIntake,
    medEffectCount, latestMedEffect,
  );

  return {
    painEntryCount,
    latestPainEntry,
    voiceEventCount,
    latestVoiceEvent,
    medIntakeCount,
    latestMedIntake,
    medEffectCount,
    latestMedEffect,
    maxTimestamp: timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null,
    stateSignature,
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
    .select('id, response_json, created_at, updated_at, from_date, to_date, data_state_signature')
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
    dataStateSignature: data.data_state_signature ?? null,
  };
}

// ============================================================
// === DATA-STATE VALIDATION ===
// ============================================================

/**
 * Determine if a cached analysis is still valid.
 * 
 * PRIMARY CHECK: Does the stored data_state_signature match the current one?
 * If no signature stored (legacy), falls back to timestamp comparison.
 */
export async function isCacheValid(
  cached: CachedAnalysis,
): Promise<CacheValidityResult> {
  const fingerprint = await getDataStateFingerprint(cached.fromDate, cached.toDate);
  if (!fingerprint) return { valid: false, reason: 'not_authenticated' };

  // PRIMARY: signature-based comparison (exact match)
  if (cached.dataStateSignature) {
    if (cached.dataStateSignature === fingerprint.stateSignature) {
      return { valid: true };
    }
    return { valid: false, reason: 'signature_mismatch' };
  }

  // FALLBACK: timestamp-based for legacy entries without signature
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
 * 1. If data has changed (signature mismatch) → always allow (caller checks isCacheValid first)
 * 2. If data unchanged → respect cooldown to prevent unnecessary re-runs
 */
export function canReanalyze(cached: CachedAnalysis): boolean {
  const elapsed = Date.now() - new Date(cached.updatedAt).getTime();
  return elapsed >= MIN_REANALYSIS_INTERVAL_MS;
}

// ============================================================
// === CENTRAL ANALYSIS SELECTION ===
// ============================================================

/**
 * Stale analysis policy per output channel.
 */
export type OutputChannel = 'app' | 'pdf' | 'website' | 'snapshot';

export interface AnalysisSelection {
  /** The analysis result, or null if none available */
  result: VoiceAnalysisResult | null;
  /** Whether the analysis matches the current data state */
  isFresh: boolean;
  /** Why the analysis was selected or rejected */
  status: 'fresh' | 'stale_accepted' | 'stale_rejected' | 'not_found' | 'not_authenticated';
  /** The stored signature */
  storedSignature: string | null;
  /** The current signature */
  currentSignature: string | null;
}

/**
 * Central analysis selection function.
 * 
 * Used by ALL output channels: App, PDF, Website, Snapshot.
 * Decision chain:
 *   1. Determine date range
 *   2. Compute current data-state fingerprint
 *   3. Find matching analysis by dedupe_key
 *   4. Compare signatures → fresh or stale
 *   5. Apply channel-specific stale policy
 * 
 * STALE POLICIES:
 *   - app:      show stale with visual indicator (stale > missing)
 *   - pdf:      include stale silently (stale > gap in report)
 *   - website:  show stale with timestamp caveat
 *   - snapshot: include stale, mark snapshot as stale
 */
export async function selectAnalysisForChannel(
  fromDate: string,
  toDate: string,
  channel: OutputChannel,
): Promise<AnalysisSelection> {
  const fingerprint = await getDataStateFingerprint(fromDate, toDate);
  if (!fingerprint) {
    return { result: null, isFresh: false, status: 'not_authenticated', storedSignature: null, currentSignature: null };
  }

  const cached = await loadCachedAnalysis(fromDate, toDate);
  if (!cached) {
    return { result: null, isFresh: false, status: 'not_found', storedSignature: null, currentSignature: fingerprint.stateSignature };
  }

  const isFresh = cached.dataStateSignature === fingerprint.stateSignature;

  if (isFresh) {
    return {
      result: cached.result,
      isFresh: true,
      status: 'fresh',
      storedSignature: cached.dataStateSignature,
      currentSignature: fingerprint.stateSignature,
    };
  }

  // Stale: channel decides whether to accept
  // All channels currently accept stale (stale > missing), but with different presentation
  const staleAccepted = channel === 'app' || channel === 'pdf' || channel === 'website' || channel === 'snapshot';

  return {
    result: staleAccepted ? cached.result : null,
    isFresh: false,
    status: staleAccepted ? 'stale_accepted' : 'stale_rejected',
    storedSignature: cached.dataStateSignature,
    currentSignature: fingerprint.stateSignature,
  };
}

// ============================================================
// === SAVE ANALYSIS RESULT ===
// ============================================================

/**
 * Save a voice pattern analysis result to ai_reports.
 * Stores the current data_state_signature for later exact-match reuse.
 * Also persists a pre-built compact summary (_compactSummary) inside
 * response_json so all channels (App, PDF, Website, Snapshot) can
 * read the same pre-mapped structure without re-mapping.
 */
export async function saveAnalysisResult(
  result: VoiceAnalysisResult,
  fromDate: string,
  toDate: string,
  stateSignature?: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dedupeKey = buildDedupeKey(fromDate, toDate);

  // If no signature provided, compute it now
  let signature = stateSignature;
  if (!signature) {
    const fp = await getDataStateFingerprint(fromDate, toDate);
    signature = fp?.stateSignature ?? null;
  }

  // Build compact summary and attach to response_json for SSOT
  const compactSummary = buildPatternAnalysisSummary(result);
  const enrichedResult = {
    ...result,
    _compactSummary: compactSummary,
  };

  // Check for existing
  const { data: existing } = await supabase
    .from('ai_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('ai_reports')
      .update({
        response_json: enrichedResult as any,
        updated_at: new Date().toISOString(),
        title: `KI-Analyse ${fromDate} – ${toDate}`,
        model: result.meta.model,
        data_state_signature: signature,
        source_updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[AnalysisCache] Update error:', error);
      return null;
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from('ai_reports')
    .insert({
      user_id: user.id,
      report_type: REPORT_TYPE,
      title: `KI-Analyse ${fromDate} – ${toDate}`,
      from_date: fromDate,
      to_date: toDate,
      source: 'analysis_view',
      response_json: enrichedResult as any,
      model: result.meta.model,
      dedupe_key: dedupeKey,
      data_state_signature: signature,
      source_updated_at: new Date().toISOString(),
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
// === LOAD FOR REPORT / SHARE (convenience wrapper) ===
// ============================================================

/**
 * Load the most recent valid pattern analysis for a date range.
 * Used by PDF report generation and doctor-share to embed the analysis.
 * 
 * Delegates to selectAnalysisForChannel with the appropriate channel.
 * Returns the analysis result ONLY if it exists (stale or fresh).
 */
export async function loadAnalysisForReport(
  fromDate: string,
  toDate: string,
): Promise<VoiceAnalysisResult | null> {
  const selection = await selectAnalysisForChannel(fromDate, toDate, 'pdf');
  if (selection.status === 'stale_accepted') {
    console.info(`[AnalysisCache] Report using stale analysis (stored=${selection.storedSignature}, current=${selection.currentSignature})`);
  }
  return selection.result;
}

// ============================================================
// === SHARED CONSTANTS ===
// ============================================================

/** Max patterns shown in any channel */
export const MAX_PATTERNS = 4;
/** Max recurring sequences shown */
export const MAX_SEQUENCES = 2;
/** Max open questions shown */
export const MAX_QUESTIONS = 2;

/** Evidence sort order */
export const EVIDENCE_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

// ============================================================
// === SHARED SUMMARY FORMAT ===
// ============================================================

/**
 * Compact summary type used by all output channels.
 */
export interface PatternAnalysisCompactSummary {
  summary: string;
  patterns: Array<{ title: string; description: string; evidenceStrength: string }>;
  recurringSequences: Array<{ pattern: string; count: number; interpretation: string }>;
  openQuestions: string[];
  analyzedAt: string;
  daysAnalyzed: number;
}

/**
 * Build a PatternAnalysisSummary from a VoiceAnalysisResult.
 * 
 * SINGLE FORMAT for all outputs: App, Snapshot, Website, PDF.
 * Enforces consistent limits and field mapping.
 * 
 * Limits:
 * - max 5 patterns (sorted by evidence strength, then occurrences)
 * - max 3 recurring sequences
 * - max 3 open questions
 */
export function buildPatternAnalysisSummary(result: VoiceAnalysisResult): PatternAnalysisCompactSummary {
  const sortedPatterns = [...result.possiblePatterns]
    .sort((a, b) => {
      const ePri = (EVIDENCE_ORDER[b.evidenceStrength] || 0) - (EVIDENCE_ORDER[a.evidenceStrength] || 0);
      if (ePri !== 0) return ePri;
      return b.occurrences - a.occurrences;
    });

  return {
    summary: result.summary,
    patterns: sortedPatterns.slice(0, MAX_PATTERNS).map(p => ({
      title: p.title,
      description: p.description,
      evidenceStrength: p.evidenceStrength,
    })),
    recurringSequences: result.recurringSequences.slice(0, MAX_SEQUENCES).map(s => ({
      pattern: s.pattern,
      count: s.count,
      interpretation: s.llmInterpretation,
    })),
    openQuestions: result.openQuestions.slice(0, MAX_QUESTIONS),
    analyzedAt: result.meta.analyzedAt,
    daysAnalyzed: result.scope.daysAnalyzed,
  };
}

/**
 * Extract the pre-built compact summary from a stored response_json.
 * Falls back to building from raw if _compactSummary is not present (legacy).
 */
export function extractCompactSummary(
  responseJson: unknown,
): PatternAnalysisCompactSummary | null {
  const r = responseJson as Record<string, unknown>;
  if (!r || typeof r !== 'object') return null;

  // Prefer pre-built compact summary (persisted at save time)
  if (r._compactSummary && typeof (r._compactSummary as any).summary === 'string') {
    const cs = r._compactSummary as PatternAnalysisCompactSummary;
    // Re-enforce limits in case they changed
    return {
      summary: cs.summary,
      patterns: (cs.patterns || []).slice(0, MAX_PATTERNS),
      recurringSequences: (cs.recurringSequences || []).slice(0, MAX_SEQUENCES),
      openQuestions: (cs.openQuestions || []).slice(0, MAX_QUESTIONS),
      analyzedAt: cs.analyzedAt,
      daysAnalyzed: cs.daysAnalyzed,
    };
  }

  // Fallback: build from raw VoiceAnalysisResult shape (legacy records)
  if (typeof r.summary !== 'string' || !Array.isArray(r.possiblePatterns)) return null;
  if (r.possiblePatterns.length === 0) return null;

  const sorted = [...(r.possiblePatterns as any[])]
    .sort((a, b) => (EVIDENCE_ORDER[b.evidenceStrength] || 0) - (EVIDENCE_ORDER[a.evidenceStrength] || 0));

  return {
    summary: r.summary as string,
    patterns: sorted.slice(0, MAX_PATTERNS).map((p: any) => ({
      title: String(p.title || ''),
      description: String(p.description || ''),
      evidenceStrength: String(p.evidenceStrength || 'low'),
    })),
    recurringSequences: Array.isArray(r.recurringSequences)
      ? (r.recurringSequences as any[]).slice(0, MAX_SEQUENCES).map((s: any) => ({
          pattern: String(s.pattern || ''),
          count: Number(s.count) || 1,
          interpretation: String(s.llmInterpretation || s.interpretation || ''),
        }))
      : [],
    openQuestions: Array.isArray(r.openQuestions)
      ? (r.openQuestions as string[]).slice(0, MAX_QUESTIONS)
      : [],
    analyzedAt: (r.meta as any)?.analyzedAt || '',
    daysAnalyzed: (r.scope as any)?.daysAnalyzed || 0,
  };
}
