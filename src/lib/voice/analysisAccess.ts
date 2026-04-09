/**
 * analysisAccess.ts
 * Query helpers for later KI/LLM analysis of voice event data.
 * 
 * ARCHITECTURE PRINCIPLE:
 * Analysis must ALWAYS access ALL data layers:
 * 
 *   1. Raw context    – raw_transcript (PRIMARY source of truth)
 *   2. Enrichment     – event_types, tags, segments (helpful but fallible)
 *   3. Structured     – structured_data, related_entry_id (optional extraction)
 *   4. Classical data – pain_entries, medications, reminders (existing structured data)
 * 
 * The raw transcript is NEVER excluded from analysis.
 * Pre-classification is a helper layer, NOT a filter.
 * Unknown or unclassified content remains fully analyzable.
 */

import { supabase } from '@/integrations/supabase/client';

export interface VoiceEventForAnalysis {
  id: string;
  raw_transcript: string;
  cleaned_transcript: string | null;
  event_timestamp: string;
  event_types: string[];
  event_subtypes: string[];
  tags: string[];
  confidence: number | null;
  stt_confidence: number | null;
  medical_relevance: string;
  review_state: string;
  parsing_status: string;
  structured_data: Record<string, unknown> | null;
  segments: unknown[] | null;
  session_id: string | null;
  related_entry_id: number | null;
  source: string;
  created_at: string;
}

export interface AnalysisTimeRange {
  from: Date;
  to: Date;
}

/**
 * Fetches ALL voice events for a time range – including unclassified ones.
 * 
 * IMPORTANT: This deliberately does NOT filter by event_type or medical_relevance.
 * The analysis layer must see everything to discover unexpected patterns.
 */
export async function getVoiceEventsForAnalysis(
  range: AnalysisTimeRange,
  options?: {
    /** Include all events, even low-confidence ones (default: true) */
    includeAll?: boolean;
    /** Limit results (default: 2000) */
    limit?: number;
  }
): Promise<VoiceEventForAnalysis[]> {
  const limit = options?.limit ?? 2000;

  const { data, error } = await supabase
    .from('voice_events')
    .select('id, raw_transcript, cleaned_transcript, event_timestamp, event_types, event_subtypes, tags, confidence, stt_confidence, medical_relevance, review_state, parsing_status, structured_data, segments, session_id, related_entry_id, source, created_at')
    .gte('event_timestamp', range.from.toISOString())
    .lte('event_timestamp', range.to.toISOString())
    .order('event_timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[AnalysisAccess] Query failed:', error);
    return [];
  }

  return (data ?? []) as VoiceEventForAnalysis[];
}

/**
 * Fetches voice events grouped by session for sequential analysis.
 * Useful for understanding temporal patterns within a recording session.
 */
export async function getVoiceEventsBySession(
  sessionId: string
): Promise<VoiceEventForAnalysis[]> {
  const { data, error } = await supabase
    .from('voice_events')
    .select('id, raw_transcript, cleaned_transcript, event_timestamp, event_types, event_subtypes, tags, confidence, stt_confidence, medical_relevance, review_state, parsing_status, structured_data, segments, session_id, related_entry_id, source, created_at')
    .eq('session_id', sessionId)
    .order('event_timestamp', { ascending: true });

  if (error) {
    console.error('[AnalysisAccess] Session query failed:', error);
    return [];
  }

  return (data ?? []) as VoiceEventForAnalysis[];
}

/**
 * Fetches a combined analysis dataset: voice events + linked pain entries.
 * This is the foundation for pattern recognition (triggers, PEM, etc.).
 * 
 * Returns raw transcripts alongside structured entries so the LLM
 * can correlate everyday observations with clinical outcomes.
 */
export async function getAnalysisDataset(range: AnalysisTimeRange): Promise<{
  voiceEvents: VoiceEventForAnalysis[];
  painEntries: Array<{
    id: number;
    selected_date: string | null;
    selected_time: string | null;
    pain_level: string;
    medications: string[] | null;
    notes: string | null;
    pain_locations: string[] | null;
    aura_type: string;
    me_cfs_severity_level: string;
    entry_kind: string;
  }>;
}> {
  // Parallel fetch: voice events + pain entries
  const [voiceResult, painResult] = await Promise.all([
    getVoiceEventsForAnalysis(range),
    supabase
      .from('pain_entries')
      .select('id, selected_date, selected_time, pain_level, medications, notes, pain_locations, aura_type, me_cfs_severity_level, entry_kind')
      .gte('selected_date', range.from.toISOString().slice(0, 10))
      .lte('selected_date', range.to.toISOString().slice(0, 10))
      .order('selected_date', { ascending: true }),
  ]);

  return {
    voiceEvents: voiceResult,
    painEntries: (painResult.data ?? []) as any[],
  };
}
