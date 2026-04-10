/**
 * voiceEventQueue.ts
 * Offline-resilient queue for voice event saves.
 * 
 * Uses the existing offlineQueue infrastructure to ensure
 * voice events are never silently lost on network errors.
 * 
 * "Capture first, preserve always, structure second"
 * 
 * === DEDUP STRATEGY ===
 * 
 * Each save attempt gets a stable client-generated UUID (clientId).
 * This ID is:
 *   1. Used as the DB row PK on direct save
 *   2. Preserved in the queue payload for retry
 *   3. On retry, if DB returns 23505 (duplicate key), it's treated as success
 * 
 * This prevents duplicate entries when:
 *   - Direct save succeeds but response times out → client queues → retry hits duplicate
 *   - Double-click / double finishRecording call
 *   - App restart triggers queue sync for already-saved event
 */

import { addToOfflineQueue } from '@/lib/offlineQueue';
import { saveVoiceEvent, generateVoiceEventClientId, type SaveVoiceEventOptions } from './voiceEventStore';

/**
 * Saves a voice event with automatic retry on failure.
 * If the save fails (network, auth, etc.), the event is queued
 * in IndexedDB and retried when the app comes back online.
 * 
 * Uses a client-generated stable ID to prevent duplicates across
 * direct save + queue retry paths.
 * 
 * Returns the event ID if saved immediately, or a queue ID if queued.
 */
export async function saveVoiceEventRobust(
  options: SaveVoiceEventOptions
): Promise<{ saved: boolean; id: string | null; queued: boolean }> {
  // Generate a stable client ID for this save attempt (idempotency key)
  const clientId = options.clientId ?? generateVoiceEventClientId();
  const optionsWithId = { ...options, clientId };

  try {
    const id = await saveVoiceEvent(optionsWithId);
    
    // CONTRACT CHECK: null means noise (intentional skip).
    // If the input was pre-classified as meaningful but save returned null,
    // that's unexpected — but we trust the classifier's re-evaluation.
    // The raw transcript was already deemed noise inside saveVoiceEvent.
    return { saved: id !== null, id, queued: false };
  } catch (error) {
    console.warn('[VoiceEventQueue] Direct save failed, queueing:', error);

    try {
      // Serialize the options for offline queue
      // Include clientId so retry uses the same PK (dedup)
      const queueData = {
        clientId,
        rawTranscript: options.rawTranscript,
        cleanedTranscript: options.cleanedTranscript ?? null,
        sttConfidence: options.sttConfidence ?? null,
        source: options.source ?? 'voice',
        eventTimestamp: (options.eventTimestamp ?? new Date()).toISOString(),
        sessionId: options.sessionId ?? null,
        relatedEntryId: options.relatedEntryId ?? null,
        voiceNoteId: options.voiceNoteId ?? null,
        structuredData: options.structuredData ?? null,
        reviewState: options.reviewState ?? 'auto_saved',
        // Preserve classification data for queue sync
        eventTypes: options.classification?.classifications.map(c => c.type) ?? [],
        tags: options.classification?.tags ?? [],
        medicalRelevance: options.classification?.medicalRelevance ?? 'unknown',
      };

      const queueId = await addToOfflineQueue('voice_note', queueData);
      return { saved: false, id: null, queued: true };
    } catch (queueError) {
      console.error('[VoiceEventQueue] Queue also failed:', queueError);
      return { saved: false, id: null, queued: false };
    }
  }
}
