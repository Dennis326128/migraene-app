/**
 * Voice Timing Configuration
 * Migraine-friendly settings: adaptive pause detection, sentence-completion heuristics
 * 
 * PHILOSOPHY: The app listens patiently. Users can think, pause, and speak at their own pace.
 * Recording only ends when:
 * 1. User manually taps mic
 * 2. Smart auto-stop detects natural end of speech (adaptive silence threshold)
 * 3. Hard timeout reached (safety)
 */

/**
 * Migraine-friendly voice profile
 * Central config for all timing parameters - can be adjusted without UI changes
 */
export const VOICE_MIGRAINE_PROFILE = {
  /** Base silence threshold before auto-stop (ms) - for normal speech */
  baseSilenceMs: 2500,
  
  /** Extended silence threshold for slow/pausy speech (ms) */
  slowSpeechSilenceMs: 4000,
  
  /** Minimum recording duration before auto-stop can trigger (ms) */
  minRecordMs: 2500,
  
  /** Hard timeout - max recording duration regardless of speech (ms) */
  hardTimeoutMs: 60000,
  
  /** Extra time added when sentence appears incomplete (ms) */
  continuationBoostMs: 1000,
  
  /** Words per second threshold below which speech is considered "slow" */
  slowSpeechWpsThreshold: 0.8,
  
  /** Minimum word count before auto-stop can trigger */
  minWordCount: 2,
};

/**
 * Legacy VOICE_TIMING export for backward compatibility
 * Used by useSpeechRecognition and useSmartVoiceRouter hooks
 */
export const VOICE_TIMING = {
  // Minimum recording time before unknown can trigger (10 seconds)
  MIN_LISTEN_MS: 10000,
  
  // Silence duration before auto-evaluation 
  // Set very high (60s) to effectively disable auto-stop in the old system
  SILENCE_END_MS: 60000,
  
  // Minimum words/chars before unknown is valid
  MIN_WORDS: 2,
  MIN_CHARS: 10,
  
  // Pause threshold for countdown display (in seconds)
  // Set very high to avoid countdown stress for users
  PAUSE_THRESHOLD_SECONDS: 30,
  
  // Initial wait before starting pause detection (in ms)
  INITIAL_SILENCE_GRACE_MS: 15000,
  
  // Confidence threshold for unknown intent
  CONFIDENCE_THRESHOLD: 0.5,
} as const;

/**
 * German continuation words/patterns that suggest speech isn't finished
 * If transcript ends with these, we add extra time before auto-stop
 */
export const CONTINUATION_PATTERNS = [
  // Conjunctions suggesting more to come
  'und', 'aber', 'weil', 'dann', 'also', 'oder', 'sondern', 'denn', 'ob',
  
  // Filler words / hesitations
  'äh', 'ähm', 'hm', 'hmm', 'öh', 'öhm', 'na', 'ja', 'naja',
  
  // Words suggesting continuation
  'noch', 'plus', 'außerdem', 'zusätzlich', 'dazu', 'danach', 'dabei',
  'sowie', 'beziehungsweise', 'bzw', 'eventuell', 'vielleicht', 'etwa',
  
  // Incomplete patterns (will check separately)
  'stärke', 'intensität', 'level', 'vor', 'seit', 'um', 'gegen', 'circa', 'ca',
] as const;

/**
 * Patterns that suggest a number is expected next (sentence incomplete)
 */
export const EXPECTING_NUMBER_PATTERNS = [
  /stärke$/i,
  /intensität$/i,
  /level$/i,
  /schmerzstärke$/i,
  /schmerzlautstärke$/i,
  /vor$/i,
  /seit$/i,
  /um$/i,
  /gegen$/i,
  /circa$/i,
  /ca\.?$/i,
  /\d+$/,  // Ends with number (might be saying "Ibuprofen 400" and continue with "mg")
] as const;

/**
 * Check if transcript ends with a continuation pattern
 */
export function endsWithContinuationPattern(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || '';
  const lastTwoWords = words.slice(-2).join(' ');
  
  // Check direct continuation words
  if (CONTINUATION_PATTERNS.some(p => lastWord === p || lastTwoWords.endsWith(p))) {
    return true;
  }
  
  // Check expecting-number patterns
  if (EXPECTING_NUMBER_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  return false;
}

/**
 * Calculate words per second to detect slow speech
 */
export function calculateWps(text: string, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const durationSec = durationMs / 1000;
  return wordCount / durationSec;
}

/**
 * Determine the appropriate silence threshold based on context
 */
export function getAdaptiveSilenceThreshold(
  text: string,
  recordingDurationMs: number
): number {
  const { baseSilenceMs, slowSpeechSilenceMs, continuationBoostMs, slowSpeechWpsThreshold } = VOICE_MIGRAINE_PROFILE;
  
  // Start with base threshold
  let threshold = baseSilenceMs;
  
  // Check if speech is slow
  const wps = calculateWps(text, recordingDurationMs);
  if (wps > 0 && wps < slowSpeechWpsThreshold) {
    threshold = slowSpeechSilenceMs;
  }
  
  // Add boost if sentence appears incomplete
  if (endsWithContinuationPattern(text)) {
    threshold += continuationBoostMs;
  }
  
  return threshold;
}

/**
 * Check if we can auto-stop (minimum requirements met)
 */
export function canAutoStop(text: string, recordingDurationMs: number): boolean {
  const { minRecordMs, minWordCount } = VOICE_MIGRAINE_PROFILE;
  
  // Must have recorded for minimum duration
  if (recordingDurationMs < minRecordMs) {
    return false;
  }
  
  // Must have minimum word count
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < minWordCount) {
    return false;
  }
  
  return true;
}

/**
 * Check if transcript is long enough to be evaluated
 */
export function isTranscriptSufficient(transcript: string): boolean {
  const trimmed = transcript.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return trimmed.length >= VOICE_TIMING.MIN_CHARS || wordCount >= VOICE_TIMING.MIN_WORDS;
}
