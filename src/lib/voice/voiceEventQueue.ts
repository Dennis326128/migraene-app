/**
 * voiceEventQueue.ts
 * Offline-resilient queue for voice event saves.
 * 
 * Uses the existing offlineQueue infrastructure to ensure
 * voice events are never silently lost on network errors.
 * 
 * "Capture first, preserve always, structure second"
 */

import { addToOfflineQueue, syncPendingEntries } from '@/lib/offlineQueue';
import { saveVoiceEvent, type SaveVoiceEventOptions } from './voiceEventStore';

/**
 * Saves a voice event with automatic retry on failure.
 * If the save fails (network, auth, etc.), the event is queued
 * in IndexedDB and retried when the app comes back online.
 * 
 * Returns the event ID if saved immediately, or a queue ID if queued.
 */
export async function saveVoiceEventRobust(
  options: SaveVoiceEventOptions
): Promise<{ saved: boolean; id: string | null; queued: boolean }> {
  try {
    const id = await saveVoiceEvent(options);
    return { saved: true, id, queued: false };
  } catch (error) {
    console.warn('[VoiceEventQueue] Direct save failed, queueing:', error);

    try {
      // Serialize the options for offline queue
      const queueData = {
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
        // Classification is re-computed on retry (not serializable as-is)
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
