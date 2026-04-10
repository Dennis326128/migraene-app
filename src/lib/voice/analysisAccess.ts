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
 * 
 * === TIMESTAMP SEMANTICS ===
 * 
 *   event_timestamp  – when the user SPOKE (event time, always use for analysis)
 *   created_at       – when the DB row was created (may differ due to queue/retry)
 * 
 * For temporal analysis (trigger chains, PEM patterns), always use event_timestamp.
 * created_at is only useful for debugging queue/sync delays.
 */

import { supabase } from '@/integrations/supabase/client';

// ============================================================
// === TYPES ===
// ============================================================

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
  voice_note_id: string | null;
  source: string;
  created_at: string;
}

export interface PainEntryForAnalysis {
  id: number;
  selected_date: string | null;
  selected_time: string | null;
  pain_level: string;
  medications: string[] | null;
  medication_ids: string[] | null;
  notes: string | null;
  pain_locations: string[] | null;
  aura_type: string;
  me_cfs_severity_level: string;
  entry_kind: string;
  voice_note_id: string | null;
  timestamp_created: string | null;
}

export interface MedicationIntakeForAnalysis {
  id: string;
  medication_name: string;
  medication_id: string | null;
  entry_id: number;
  taken_date: string | null;
  taken_time: string | null;
  dose_quarters: number;
}

export interface AnalysisTimeRange {
  from: Date;
  to: Date;
}

/**
 * Full analysis dataset combining all data layers.
 * 
 * IMPORTANT: No filtering is applied — the consumer (LLM/analysis)
 * must see everything, including low-confidence and unclassified events.
 */
export interface FullAnalysisDataset {
  /** All voice events (raw + enriched), ordered by event_timestamp */
  voiceEvents: VoiceEventForAnalysis[];
  /** All structured pain/lifestyle entries */
  painEntries: PainEntryForAnalysis[];
  /** All medication intake records (granular dose tracking) */
  medicationIntakes: MedicationIntakeForAnalysis[];
  /** Metadata for the dataset */
  meta: {
    range: AnalysisTimeRange;
    voiceEventCount: number;
    painEntryCount: number;
    medicationIntakeCount: number;
    /** Voice events that are linked to a pain_entry */
    linkedVoiceEventCount: number;
    /** Voice events without a structured counterpart (everyday observations) */
    unlinkedVoiceEventCount: number;
  };
}

// ============================================================
// === VOICE EVENT QUERIES ===
// ============================================================

/** Common select fields for voice events (DRY) */
const VOICE_EVENT_SELECT = 'id, raw_transcript, cleaned_transcript, event_timestamp, event_types, event_subtypes, tags, confidence, stt_confidence, medical_relevance, review_state, parsing_status, structured_data, segments, session_id, related_entry_id, voice_note_id, source, created_at';

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
    .select(VOICE_EVENT_SELECT)
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
    .select(VOICE_EVENT_SELECT)
    .eq('session_id', sessionId)
    .order('event_timestamp', { ascending: true });

  if (error) {
    console.error('[AnalysisAccess] Session query failed:', error);
    return [];
  }

  return (data ?? []) as VoiceEventForAnalysis[];
}

// ============================================================
// === COMBINED ANALYSIS DATASET ===
// ============================================================

/**
 * Fetches the full analysis dataset for a time range:
 *   - Voice events (all, unfiltered)
 *   - Pain entries (structured)
 *   - Medication intakes (granular dose records)
 * 
 * This is the primary entry point for LLM-based pattern analysis.
 * 
 * DESIGN DECISION: Three parallel queries instead of JOINs because:
 *   1. Voice events without linked entries must be included
 *   2. Pain entries without voice events must be included
 *   3. Medication intakes provide temporal detail not in pain_entries
 *   4. The LLM needs to correlate across all three independently
 */
export async function getAnalysisDataset(range: AnalysisTimeRange): Promise<FullAnalysisDataset> {
  const dateFrom = range.from.toISOString().slice(0, 10);
  const dateTo = range.to.toISOString().slice(0, 10);

  // Parallel fetch: voice events + pain entries + medication intakes
  const [voiceResult, painResult, intakeResult] = await Promise.all([
    getVoiceEventsForAnalysis(range),
    supabase
      .from('pain_entries')
      .select('id, selected_date, selected_time, pain_level, medications, medication_ids, notes, pain_locations, aura_type, me_cfs_severity_level, entry_kind, voice_note_id, timestamp_created')
      .gte('selected_date', dateFrom)
      .lte('selected_date', dateTo)
      .order('selected_date', { ascending: true }),
    supabase
      .from('medication_intakes')
      .select('id, medication_name, medication_id, entry_id, taken_date, taken_time, dose_quarters')
      .gte('taken_date', dateFrom)
      .lte('taken_date', dateTo)
      .order('taken_date', { ascending: true }),
  ]);

  const voiceEvents = voiceResult;
  const painEntries = (painResult.data ?? []) as PainEntryForAnalysis[];
  const medicationIntakes = (intakeResult.data ?? []) as MedicationIntakeForAnalysis[];

  // Compute linkage metadata
  const linkedCount = voiceEvents.filter(e => e.related_entry_id !== null).length;

  return {
    voiceEvents,
    painEntries,
    medicationIntakes,
    meta: {
      range,
      voiceEventCount: voiceEvents.length,
      painEntryCount: painEntries.length,
      medicationIntakeCount: medicationIntakes.length,
      linkedVoiceEventCount: linkedCount,
      unlinkedVoiceEventCount: voiceEvents.length - linkedCount,
    },
  };
}

/**
 * Reconstructs a temporal chain of events for a given session.
 * 
 * Useful for analyzing sequences like:
 *   "Einkaufen" → "platt" → "hingelegt" → (later) pain entry
 * 
 * Returns voice events + any linked pain entries, all ordered by time.
 */
export async function getSessionChain(sessionId: string): Promise<{
  events: VoiceEventForAnalysis[];
  linkedEntries: PainEntryForAnalysis[];
}> {
  const events = await getVoiceEventsBySession(sessionId);
  
  // Collect all related entry IDs
  const entryIds = events
    .map(e => e.related_entry_id)
    .filter((id): id is number => id !== null);

  let linkedEntries: PainEntryForAnalysis[] = [];
  if (entryIds.length > 0) {
    const { data } = await supabase
      .from('pain_entries')
      .select('id, selected_date, selected_time, pain_level, medications, medication_ids, notes, pain_locations, aura_type, me_cfs_severity_level, entry_kind, voice_note_id, timestamp_created')
      .in('id', entryIds);
    linkedEntries = (data ?? []) as PainEntryForAnalysis[];
  }

  return { events, linkedEntries };
}
