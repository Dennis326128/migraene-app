/**
 * Medication Fuzzy Matching
 * User-specific medication lexicon with STT error tolerance
 * 
 * Uses Jaro-Winkler similarity for ASR error robustness:
 * - Handles 1-3 character errors
 * - Handles split tokens ("suma triptan")
 * - Context-aware matching (medication keywords boost)
 * - Confidence scoring with uncertainty detection
 */

// ============================================
// Types
// ============================================

export interface UserMedication {
  id?: string;
  name: string;
  wirkstoff?: string | null;
}

export interface MedicationLexiconEntry {
  canonical: string;
  id?: string;
  normalizedForms: string[]; // All searchable variants
  baseName: string; // Name without strength (e.g., "Sumatriptan")
  strength?: string; // e.g., "50 mg"
}

export interface UserMedicationLexicon {
  entries: MedicationLexiconEntry[];
  prefixIndex: Map<string, string[]>; // 3-char prefix -> canonical names
}

export interface MedicationMatch {
  canonical: string;
  medicationId?: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'prefix' | 'split_token';
  isUncertain: boolean;
  alternatives?: string[];
}

export interface TranscriptMedicationHit {
  raw: string;
  match: MedicationMatch | null;
  startIndex: number;
  endIndex: number;
}

// ============================================
// Constants
// ============================================

// Context words that boost medication matching confidence
const MEDICATION_CONTEXT_WORDS = new Set([
  'genommen', 'eingenommen', 'nehme', 'nehmen', 'nehm',
  'tablette', 'tabletten', 'pille', 'kapsel',
  'mg', 'milligramm', 'ml', 'tropfen',
  'triptan', 'schmerzmittel', 'medikament',
  'halbe', 'ganze', 'viertel', 'eine', 'zwei',
]);

// Words to skip when searching for medications (NEVER match as med names)
const SKIP_WORDS = new Set([
  'vor', 'nach', 'mit', 'und', 'oder', 'bei', 'wegen', 'durch',
  'ich', 'habe', 'hab', 'heute', 'gestern', 'jetzt', 'gerade', 'dann', 'noch',
  'eine', 'einen', 'einer', 'einem', 'das', 'die', 'der', 'den', 'dem',
  'schmerz', 'kopfschmerz', 'migräne', 'migraene', 'stark', 'stärke',
  // Context words that must NEVER fuzzy-match to medications
  'büro', 'buero', 'stress', 'trigger', 'geschlafen', 'arbeit',
  'müde', 'muede', 'wenig', 'morgen', 'schlaf', 'schlecht',
  'wetter', 'sport', 'training', 'essen', 'trinken', 'getrunken',
  'kaffee', 'alkohol', 'periode', 'regel', 'zyklus', 'reise',
  'lärm', 'laerm', 'erschöpft', 'erschoepft', 'verspannt',
  'bildschirm', 'termine', 'sitzen', 'autofahren', 'zugfahrt',
  'gearbeitet', 'ausgesetzt', 'angestrengt', 'überstunden',
]);

// Minimum similarity thresholds
const SIMILARITY_THRESHOLD = 0.82; // Base threshold
const SIMILARITY_THRESHOLD_WITH_CONTEXT = 0.78; // With medication context
const AMBIGUITY_DELTA = 0.08; // If top2 diff < this, mark as uncertain

// ============================================
// Jaro-Winkler Similarity
// ============================================

/**
 * Calculate Jaro similarity between two strings
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  return jaro;
}

/**
 * Calculate Jaro-Winkler similarity (boosts matches with common prefix)
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  
  // Find common prefix (max 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  // Winkler modification: boost for common prefix
  const winklerBoost = 0.1;
  return jaro + prefix * winklerBoost * (1 - jaro);
}

/**
 * Standard Levenshtein distance
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================
// Normalization
// ============================================

/**
 * Normalize string for matching (lowercase, no umlauts, no spaces)
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Extract base medication name (without strength)
 */
function extractBaseName(name: string): { baseName: string; strength?: string } {
  const match = name.match(/^(.+?)\s*(\d+\s*(mg|ml|mcg|µg|g|mikrogramm|milligramm)).*$/i);
  if (match) {
    return {
      baseName: match[1].trim(),
      strength: match[2].trim()
    };
  }
  return { baseName: name.trim() };
}

/**
 * Generate searchable variants for a medication name
 */
function generateNormalizedForms(name: string): string[] {
  const forms = new Set<string>();
  const lower = name.toLowerCase();
  const normalized = normalizeForMatch(name);
  
  forms.add(lower);
  forms.add(normalized);
  
  // Without strength
  const { baseName } = extractBaseName(name);
  forms.add(baseName.toLowerCase());
  forms.add(normalizeForMatch(baseName));
  
  // First 4-6 chars as prefix variants
  if (normalized.length >= 4) forms.add(normalized.substring(0, 4));
  if (normalized.length >= 5) forms.add(normalized.substring(0, 5));
  if (normalized.length >= 6) forms.add(normalized.substring(0, 6));
  
  // Common ASR variants for known patterns
  if (lower.includes('triptan')) {
    forms.add(lower.replace('triptan', 'tryptan'));
    forms.add(lower.replace('triptan', 'triplan'));
  }
  if (lower.startsWith('suma')) {
    forms.add('soma' + lower.substring(4));
    forms.add('zuma' + lower.substring(4));
  }
  if (lower.includes('ibuprofen')) {
    forms.add('iboprofen');
    forms.add('ibuproffen');
  }
  if (lower.includes('paracetamol')) {
    forms.add('parazitamol');
    forms.add('paracetamoll');
  }
  
  return Array.from(forms);
}

// ============================================
// Lexicon Building
// ============================================

/**
 * Build a searchable lexicon from user's medications
 */
export function buildUserMedicationLexicon(userMeds: UserMedication[]): UserMedicationLexicon {
  const entries: MedicationLexiconEntry[] = [];
  const prefixIndex = new Map<string, string[]>();
  
  for (const med of userMeds) {
    if (!med.name || med.name.length < 2) continue;
    
    const { baseName, strength } = extractBaseName(med.name);
    const normalizedForms = generateNormalizedForms(med.name);
    
    // Also add wirkstoff variants if available
    if (med.wirkstoff) {
      normalizedForms.push(...generateNormalizedForms(med.wirkstoff));
    }
    
    const entry: MedicationLexiconEntry = {
      canonical: med.name,
      id: med.id,
      normalizedForms,
      baseName,
      strength
    };
    
    entries.push(entry);
    
    // Build prefix index (3-char prefixes)
    const baseNormalized = normalizeForMatch(baseName);
    if (baseNormalized.length >= 3) {
      const prefix = baseNormalized.substring(0, 3);
      if (!prefixIndex.has(prefix)) {
        prefixIndex.set(prefix, []);
      }
      const existing = prefixIndex.get(prefix)!;
      if (!existing.includes(med.name)) {
        existing.push(med.name);
      }
    }
  }
  
  return { entries, prefixIndex };
}

// ============================================
// Matching Logic
// ============================================

/**
 * Check if surrounding context indicates medication
 */
function hasMedicationContext(tokens: string[], targetIndex: number): boolean {
  const windowStart = Math.max(0, targetIndex - 3);
  const windowEnd = Math.min(tokens.length, targetIndex + 3);
  
  for (let i = windowStart; i < windowEnd; i++) {
    if (i === targetIndex) continue;
    if (MEDICATION_CONTEXT_WORDS.has(tokens[i].toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Find best matching medication for a single word/phrase
 */
export function findBestMedicationMatch(
  input: string,
  lexicon: UserMedicationLexicon,
  hasContext: boolean = false
): MedicationMatch | null {
  const normalized = normalizeForMatch(input);
  
  if (normalized.length < 3) return null;
  if (SKIP_WORDS.has(input.toLowerCase())) return null;
  
  const threshold = hasContext ? SIMILARITY_THRESHOLD_WITH_CONTEXT : SIMILARITY_THRESHOLD;
  const candidates: Array<{ entry: MedicationLexiconEntry; score: number; type: MedicationMatch['matchType'] }> = [];
  
  for (const entry of lexicon.entries) {
    // 1. Exact match check
    if (entry.normalizedForms.some(form => normalizeForMatch(form) === normalized)) {
      return {
        canonical: entry.canonical,
        medicationId: entry.id,
        confidence: 0.98,
        matchType: 'exact',
        isUncertain: false
      };
    }
    
    // 2. Fuzzy match against all forms
    let bestScore = 0;
    for (const form of entry.normalizedForms) {
      const normalizedForm = normalizeForMatch(form);
      const score = jaroWinklerSimilarity(normalized, normalizedForm);
      if (score > bestScore) {
        bestScore = score;
      }
    }
    
    // 3. Also check Levenshtein for short inputs
    if (normalized.length >= 6) {
      const baseNorm = normalizeForMatch(entry.baseName);
      const levDist = levenshteinDistance(normalized, baseNorm);
      // Allow 1-2 errors for words >= 6 chars
      const maxDist = normalized.length >= 8 ? 2 : 1;
      if (levDist <= maxDist) {
        const levScore = 1 - (levDist / Math.max(normalized.length, baseNorm.length));
        if (levScore > bestScore) {
          bestScore = Math.max(bestScore, levScore);
        }
      }
    }
    
    if (bestScore >= threshold) {
      candidates.push({ entry, score: bestScore, type: 'fuzzy' });
    }
  }
  
  // 4. Prefix match fallback
  if (candidates.length === 0 && normalized.length >= 3) {
    const prefix = normalized.substring(0, 3);
    const prefixMatches = lexicon.prefixIndex.get(prefix);
    if (prefixMatches && prefixMatches.length === 1) {
      const entry = lexicon.entries.find(e => e.canonical === prefixMatches[0]);
      if (entry) {
        return {
          canonical: entry.canonical,
          medicationId: entry.id,
          confidence: 0.75,
          matchType: 'prefix',
          isUncertain: true
        };
      }
    }
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by score
  candidates.sort((a, b) => b.score - a.score);
  
  const best = candidates[0];
  const isUncertain = candidates.length >= 2 && (best.score - candidates[1].score) < AMBIGUITY_DELTA;
  
  return {
    canonical: best.entry.canonical,
    medicationId: best.entry.id,
    confidence: best.score,
    matchType: best.type,
    isUncertain,
    alternatives: isUncertain ? candidates.slice(1, 3).map(c => c.entry.canonical) : undefined
  };
}

/**
 * Handle split tokens (e.g., "suma triptan" → "sumatriptan")
 */
function tryMatchSplitTokens(
  tokens: string[],
  startIdx: number,
  lexicon: UserMedicationLexicon
): { match: MedicationMatch; consumedTokens: number } | null {
  if (startIdx >= tokens.length - 1) return null;
  
  // Try combining 2-3 consecutive tokens
  for (let len = 2; len <= Math.min(3, tokens.length - startIdx); len++) {
    const combined = tokens.slice(startIdx, startIdx + len).join('');
    const match = findBestMedicationMatch(combined, lexicon, true);
    
    if (match && match.confidence >= 0.85) {
      return {
        match: { ...match, matchType: 'split_token' },
        consumedTokens: len
      };
    }
  }
  
  return null;
}

// ============================================
// Main API: Extract Medications from Transcript
// ============================================

/**
 * Find all medication mentions in a transcript
 * Returns matches with positions and confidence
 */
export function findMedicationMentions(
  transcript: string,
  lexicon: UserMedicationLexicon
): TranscriptMedicationHit[] {
  const hits: TranscriptMedicationHit[] = [];
  const foundCanonicals = new Set<string>();
  
  // Tokenize
  const tokens = transcript.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  
  // Negation words
  const NEGATION_WORDS = new Set(['kein', 'keine', 'keinen', 'keiner', 'keinem', 'nicht', 'ohne']);
  
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    
    // Skip common words
    if (SKIP_WORDS.has(token) || token.length < 3) {
      i++;
      continue;
    }
    
    // NEGATION GUARD: check if negation word is ≤2 tokens before
    const hasNegation = (
      (i >= 1 && NEGATION_WORDS.has(tokens[i - 1])) ||
      (i >= 2 && NEGATION_WORDS.has(tokens[i - 2]))
    );
    if (hasNegation) {
      i++;
      continue;
    }
    
    // Check for split token match first
    const splitResult = tryMatchSplitTokens(tokens, i, lexicon);
    if (splitResult) {
      // Also check negation for split tokens
      const splitNegation = (
        (i >= 1 && NEGATION_WORDS.has(tokens[i - 1])) ||
        (i >= 2 && NEGATION_WORDS.has(tokens[i - 2]))
      );
      if (!splitNegation) {
        const raw = tokens.slice(i, i + splitResult.consumedTokens).join(' ');
        if (!foundCanonicals.has(splitResult.match.canonical)) {
          foundCanonicals.add(splitResult.match.canonical);
          hits.push({
            raw,
            match: splitResult.match,
            startIndex: i,
            endIndex: i + splitResult.consumedTokens - 1
          });
        }
      }
      i += splitResult.consumedTokens;
      continue;
    }
    
    // Single token match
    const hasContext = hasMedicationContext(tokens, i);
    const match = findBestMedicationMatch(token, lexicon, hasContext);
    
    if (match && !foundCanonicals.has(match.canonical)) {
      foundCanonicals.add(match.canonical);
      hits.push({
        raw: token,
        match,
        startIndex: i,
        endIndex: i
      });
    }
    
    i++;
  }
  
  return hits;
}

/**
 * Apply medication corrections to transcript
 * Returns corrected text with replacements
 */
export function correctMedicationsInTranscript(
  transcript: string,
  lexicon: UserMedicationLexicon
): { corrected: string; corrections: Array<{ original: string; corrected: string; confidence: number }> } {
  const hits = findMedicationMentions(transcript, lexicon);
  
  if (hits.length === 0) {
    return { corrected: transcript, corrections: [] };
  }
  
  const corrections: Array<{ original: string; corrected: string; confidence: number }> = [];
  let corrected = transcript;
  
  // Sort by position descending to replace from end
  const sortedHits = [...hits].sort((a, b) => b.startIndex - a.startIndex);
  
  for (const hit of sortedHits) {
    if (hit.match && hit.match.confidence >= 0.8) {
      // Only replace if actually different
      const regex = new RegExp(`\\b${hit.raw}\\b`, 'gi');
      const newText = corrected.replace(regex, hit.match.canonical);
      
      if (newText !== corrected) {
        corrections.push({
          original: hit.raw,
          corrected: hit.match.canonical,
          confidence: hit.match.confidence
        });
        corrected = newText;
      }
    }
  }
  
  return { corrected, corrections };
}
