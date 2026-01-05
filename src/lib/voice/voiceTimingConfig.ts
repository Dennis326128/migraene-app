/**
 * Voice Timing Configuration
 * Migraine-friendly settings: very long pauses allowed, user must click "Fertig" to stop
 * 
 * PHILOSOPHY: The app listens patiently. Users can think, pause, and speak at their own pace.
 * Recording only ends when user explicitly clicks "Fertig" - not due to silence.
 */

export const VOICE_TIMING = {
  // Minimum recording time before unknown can trigger (10 seconds)
  MIN_LISTEN_MS: 10000,
  
  // Silence duration before auto-evaluation 
  // Set very high (60s) to effectively disable auto-stop
  // User must click "Fertig" button manually
  SILENCE_END_MS: 60000,
  
  // Minimum words/chars before unknown is valid (otherwise keep listening)
  MIN_WORDS: 2,
  MIN_CHARS: 10,
  
  // Pause threshold for countdown display (in seconds)
  // Set very high to avoid countdown stress for users
  // Countdown only starts after 30s of silence (very rare)
  PAUSE_THRESHOLD_SECONDS: 30,
  
  // Initial wait before starting pause detection (in ms)
  // Give users 15 seconds of silence before even considering it a "pause"
  INITIAL_SILENCE_GRACE_MS: 15000,
  
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
