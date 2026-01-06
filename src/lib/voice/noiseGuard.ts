/**
 * Noise Guard - Anti-false-trigger protection
 * 
 * Filters out:
 * - Very short transcripts
 * - Stopwords / filler words only
 * - Ambiguous numbers without context
 */

// Common filler words and stopwords that shouldn't trigger actions
const STOPWORDS = new Set([
  // Fillers
  'äh', 'ah', 'aeh', 'ähm', 'aehm', 'öhm', 'uhm', 'hm', 'hmm', 'äää',
  // Confirmations (without context)
  'ok', 'okay', 'ja', 'jo', 'jap', 'jep', 'jup', 'nein', 'ne', 'nö', 'noe',
  // Greetings
  'hallo', 'hi', 'hey', 'tschüss', 'tschuess', 'bye',
  // Common fragments
  'also', 'und', 'oder', 'aber', 'dann', 'so', 'eben', 'halt',
]);

// Words that, on their own, are too short/ambiguous
const AMBIGUOUS_ALONE = new Set([
  'test', 'bitte', 'danke', 'moment', 'warte', 'stop', 'stopp',
]);

export interface NoiseGuardResult {
  isNoise: boolean;
  isAmbiguousNumber: boolean;
  reason?: string;
  suggestedAction?: 'retry' | 'disambiguation' | 'continue';
  disambiguationQuestion?: string;
}

/**
 * Check if a transcript is just noise/filler
 */
export function checkNoiseGuard(transcript: string): NoiseGuardResult {
  const trimmed = transcript.trim().toLowerCase();
  const normalized = trimmed
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  
  // Rule 1: Empty or very short
  if (!trimmed || trimmed.length < 2) {
    return {
      isNoise: true,
      isAmbiguousNumber: false,
      reason: 'Input too short',
      suggestedAction: 'retry'
    };
  }
  
  // Rule 2: Single stopword
  if (STOPWORDS.has(normalized) || STOPWORDS.has(trimmed)) {
    return {
      isNoise: true,
      isAmbiguousNumber: false,
      reason: 'Only filler word detected',
      suggestedAction: 'retry'
    };
  }
  
  // Rule 3: Ambiguous single word
  if (AMBIGUOUS_ALONE.has(normalized) && trimmed.split(/\s+/).length === 1) {
    return {
      isNoise: true,
      isAmbiguousNumber: false,
      reason: 'Ambiguous single word',
      suggestedAction: 'retry'
    };
  }
  
  // Rule 4: Just a number (0-10) without context
  const justNumberMatch = trimmed.match(/^(\d{1,2})$/);
  if (justNumberMatch) {
    const num = parseInt(justNumberMatch[1], 10);
    if (num >= 0 && num <= 10) {
      return {
        isNoise: false, // Not noise, but ambiguous
        isAmbiguousNumber: true,
        reason: 'Ambiguous number without context',
        suggestedAction: 'disambiguation',
        disambiguationQuestion: `Meinst du Schmerzstärke ${num}?`
      };
    }
  }
  
  // Rule 5: Only stopwords in the sentence
  const tokens = trimmed.split(/\s+/);
  const nonStopwordTokens = tokens.filter(t => {
    const norm = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    return !STOPWORDS.has(norm) && !STOPWORDS.has(t);
  });
  
  if (nonStopwordTokens.length === 0) {
    return {
      isNoise: true,
      isAmbiguousNumber: false,
      reason: 'Only stopwords detected',
      suggestedAction: 'retry'
    };
  }
  
  // Rule 6: Less than 2 meaningful tokens
  if (tokens.length < 2 && nonStopwordTokens.length < 1) {
    return {
      isNoise: true,
      isAmbiguousNumber: false,
      reason: 'Not enough meaningful content',
      suggestedAction: 'retry'
    };
  }
  
  // Not noise
  return {
    isNoise: false,
    isAmbiguousNumber: false
  };
}

/**
 * Get user-friendly message for noise
 */
export function getNoiseMessage(result: NoiseGuardResult): string {
  if (result.isAmbiguousNumber && result.disambiguationQuestion) {
    return result.disambiguationQuestion;
  }
  
  return 'Ich habe dich nicht klar verstanden – versuch\'s nochmal.';
}
