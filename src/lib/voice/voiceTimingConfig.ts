/**
 * Voice Timing Configuration
 * Migraine-friendly settings: long pauses allowed, user has "Fertig" button
 */

export const VOICE_TIMING = {
  // Minimum recording time before unknown can trigger (8 seconds)
  MIN_LISTEN_MS: 8000,
  
  // Silence duration before auto-evaluation (5 seconds - generous for word-finding issues)
  SILENCE_END_MS: 5000,
  
  // Minimum words/chars before unknown is valid (otherwise keep listening)
  MIN_WORDS: 2,
  MIN_CHARS: 10,
  
  // Pause threshold for countdown display (in seconds)
  PAUSE_THRESHOLD_SECONDS: 5,
  
  // Confidence threshold for unknown intent
  CONFIDENCE_THRESHOLD: 0.5,
} as const;

/**
 * Check if transcript is long enough to be evaluated
 */
export function isTranscriptSufficient(transcript: string): boolean {
  const trimmed = transcript.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return trimmed.length >= VOICE_TIMING.MIN_CHARS || wordCount >= VOICE_TIMING.MIN_WORDS;
}
