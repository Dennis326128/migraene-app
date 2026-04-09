/**
 * voiceEventStore.ts
 * Persistiert Voice Events in Supabase.
 * 
 * "Capture first, preserve always, structure second"
 * 
 * Jede sinnvolle Spracheingabe wird IMMER gespeichert,
 * unabhängig davon ob strukturierte Extraktion gelingt.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  classifyVoiceEvent,
  segmentVoiceInput,
  type ClassificationResult,
  type VoiceSegment,
} from './eventClassifier';
import { v4 as uuidv4 } from 'crypto';

// ============================================================
// === TYPEN ===
// ============================================================

export interface SaveVoiceEventOptions {
  rawTranscript: string;
  cleanedTranscript?: string;
  sttConfidence?: number;
  source?: 'voice' | 'dictation' | 'manual';
  eventTimestamp?: Date;
  sessionId?: string;
  relatedEntryId?: number;
  voiceNoteId?: string;
  /** Pre-computed classification (skip re-classification) */
  classification?: ClassificationResult;
  /** Pre-computed segments */
  segments?: VoiceSegment[];
  /** Structured data from parser (pain, meds, etc.) */
  structuredData?: Record<string, unknown>;
  /** Review state override */
  reviewState?: 'auto_saved' | 'reviewed' | 'edited';
}

export interface VoiceEventRecord {
  id: string;
  rawTranscript: string;
  cleanedTranscript: string | null;
  eventTypes: string[];
  tags: string[];
  confidence: number | null;
  medicalRelevance: string;
  reviewState: string;
  createdAt: string;
  eventTimestamp: string;
}

// ============================================================
// === HAUPT-FUNKTIONEN ===
// ============================================================

/**
 * Speichert ein Voice Event in der Datenbank.
 * IMMER aufrufen wenn eine sinnvolle Spracheingabe vorliegt.
 * 
 * Returns the saved event ID, or null if the input was noise.
 */
export async function saveVoiceEvent(options: SaveVoiceEventOptions): Promise<string | null> {
  const {
    rawTranscript,
    cleanedTranscript,
    sttConfidence,
    source = 'voice',
    eventTimestamp = new Date(),
    sessionId,
    relatedEntryId,
    voiceNoteId,
    classification: preClassification,
    segments: preSegments,
    structuredData,
    reviewState,
  } = options;

  // Get user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[VoiceEvent] Not authenticated, skipping save');
    return null;
  }

  // Classify if not pre-classified
  const classification = preClassification ?? classifyVoiceEvent(rawTranscript);
  
  // Skip noise
  if (!classification.isMeaningful) {
    console.log('[VoiceEvent] Skipping noise:', rawTranscript.slice(0, 50));
    return null;
  }

  // Segment if not pre-segmented
  const segments = preSegments ?? segmentVoiceInput(rawTranscript);

  // Determine review state
  let finalReviewState = reviewState ?? 'auto_saved';
  if (classification.medicalRelevance === 'high') {
    // Medical content defaults to needing review (unless explicitly set)
    if (!reviewState) {
      const hasMed = classification.classifications.some(c => c.type === 'medication');
      const hasPain = classification.classifications.some(c => c.type === 'pain');
      if (hasMed || hasPain) {
        finalReviewState = 'auto_saved'; // Still save, but mark for attention
      }
    }
  }

  // Primary classification confidence
  const primaryConf = classification.classifications[0]?.confidence ?? null;

  // Build segments JSON
  const segmentsJson = segments.length > 1 ? segments.map(s => ({
    text: s.text,
    index: s.index,
    types: s.classification.classifications.map(c => c.type),
    tags: s.classification.tags,
    confidence: s.classification.classifications[0]?.confidence ?? null,
  })) : null;

  // Insert
  const { data, error } = await (supabase
    .from('voice_events')
    .insert({
      user_id: user.id,
      raw_transcript: rawTranscript,
      cleaned_transcript: cleanedTranscript ?? null,
      event_timestamp: eventTimestamp.toISOString(),
      tz: 'Europe/Berlin',
      event_types: classification.classifications.map(c => c.type),
      event_subtypes: classification.classifications.filter(c => c.subtype).map(c => c.subtype!),
      tags: classification.tags,
      confidence: primaryConf,
      stt_confidence: sttConfidence ?? null,
      review_state: finalReviewState,
      medical_relevance: classification.medicalRelevance,
      analysis_ready: true,
      parsing_status: structuredData ? 'completed' : 'classified',
      related_entry_id: relatedEntryId ?? null,
      voice_note_id: voiceNoteId ?? null,
      session_id: sessionId ?? null,
      structured_data: structuredData ?? null,
      segments: segmentsJson,
      source,
    } as any)
    .select('id')
    .single());

  if (error) {
    console.error('[VoiceEvent] Save failed:', error);
    // Don't throw – voice event persistence should never block the main flow
    return null;
  }

  console.log(`[VoiceEvent] ✅ Saved: ${data.id} (types: ${classification.classifications.map(c => c.type).join(', ')})`);
  return data.id;
}

/**
 * Generates a session ID for grouping related voice inputs.
 */
export function generateVoiceSessionId(): string {
  // Simple approach: use crypto.randomUUID if available, otherwise timestamp-based
  try {
    return crypto.randomUUID();
  } catch {
    return `vs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Links a voice event to a structured pain entry after creation.
 */
export async function linkVoiceEventToEntry(voiceEventId: string, entryId: number): Promise<void> {
  const { error } = await (supabase
    .from('voice_events')
    .update({
      related_entry_id: entryId,
      parsing_status: 'linked',
    } as any)
    .eq('id', voiceEventId));

  if (error) {
    console.error('[VoiceEvent] Link failed:', error);
  }
}

/**
 * Updates a voice event's review state after user interaction.
 */
export async function updateVoiceEventReview(
  voiceEventId: string,
  reviewState: 'reviewed' | 'edited',
  updatedStructuredData?: Record<string, unknown>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    review_state: reviewState,
  };
  if (updatedStructuredData) {
    updateData.structured_data = updatedStructuredData;
    updateData.parsing_status = 'completed';
  }

  const { error } = await (supabase
    .from('voice_events')
    .update(updateData as any)
    .eq('id', voiceEventId));

  if (error) {
    console.error('[VoiceEvent] Update review failed:', error);
  }
}
