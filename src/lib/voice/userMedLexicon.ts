/**
 * User Medication Lexicon
 * Generates synonyms/variants from user's medications for ASR correction
 * 
 * Privacy: Only used in-memory, not persisted
 */

export interface MedVariant {
  canonical: string;  // The actual medication name
  variants: string[]; // All possible variations
}

export interface UserMedLexicon {
  medications: MedVariant[];
  prefixMap: Map<string, string[]>; // prefix -> list of canonical names
}

/**
 * Build a lexicon from user's medications
 */
export function buildUserMedLexicon(userMeds: Array<{ name: string }>): UserMedLexicon {
  const medications: MedVariant[] = [];
  const prefixMap = new Map<string, string[]>();
  
  for (const med of userMeds) {
    const name = med.name.trim();
    if (!name || name.length < 3) continue;
    
    const variants = generateVariants(name);
    medications.push({
      canonical: name,
      variants
    });
    
    // Build prefix map (first 3-6 chars)
    for (let len = 3; len <= Math.min(6, name.length); len++) {
      const prefix = normalizeForMatch(name.substring(0, len));
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      const existing = prefixMap.get(prefix)!;
      if (!existing.includes(name)) {
        existing.push(name);
      }
    }
  }
  
  return { medications, prefixMap };
}

/**
 * Generate variants for a medication name
 */
function generateVariants(name: string): string[] {
  const variants = new Set<string>();
  const lower = name.toLowerCase();
  const normalized = normalizeForMatch(name);
  
  variants.add(lower);
  variants.add(normalized);
  
  // Remove strength suffix (e.g., "Sumatriptan 50 mg" -> "sumatriptan")
  const withoutStrength = lower.replace(/\s*\d+\s*(mg|ml|mcg|µg|g)\s*$/i, '').trim();
  if (withoutStrength && withoutStrength !== lower) {
    variants.add(withoutStrength);
    variants.add(normalizeForMatch(withoutStrength));
  }
  
  // First 4-6 characters as prefix
  if (lower.length >= 4) {
    variants.add(lower.substring(0, 4));
    variants.add(normalized.substring(0, 4));
  }
  if (lower.length >= 6) {
    variants.add(lower.substring(0, 6));
    variants.add(normalized.substring(0, 6));
  }
  
  // Common ASR errors
  addCommonASRVariants(lower, variants);
  
  return Array.from(variants);
}

/**
 * Add common ASR transcription errors
 */
function addCommonASRVariants(name: string, variants: Set<string>): void {
  // Triptan variants
  if (name.includes('triptan')) {
    variants.add(name.replace('triptan', 'tryptan'));
    variants.add(name.replace('suma', 'soma'));
    variants.add(name.replace('suma', 'zuma'));
    variants.add(name.replace('riza', 'risa'));
  }
  
  // Ibuprofen variants
  if (name.includes('ibuprofen')) {
    variants.add('iboprofen');
    variants.add('ibuproffen');
    variants.add('ibu');
  }
  
  // Paracetamol variants
  if (name.includes('paracetamol')) {
    variants.add('parazitamol');
    variants.add('paracetamoll');
    variants.add('para');
  }
  
  // Aspirin variants
  if (name.includes('aspirin')) {
    variants.add('asprin');
    variants.add('asperin');
  }
}

/**
 * Normalize a string for matching
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
 * Try to correct a word using the lexicon
 * Returns the canonical name if found, or null if no match
 */
export function correctWithLexicon(
  word: string, 
  lexicon: UserMedLexicon
): string | null {
  const normalized = normalizeForMatch(word);
  
  // Exact match check
  for (const med of lexicon.medications) {
    if (med.variants.some(v => normalizeForMatch(v) === normalized)) {
      return med.canonical;
    }
  }
  
  // Prefix match (only if unambiguous)
  if (normalized.length >= 3) {
    const candidates = lexicon.prefixMap.get(normalized.substring(0, 3));
    if (candidates && candidates.length === 1) {
      // Only auto-correct if exactly one match
      return candidates[0];
    }
  }
  
  // Fuzzy match for longer prefixes (4+ chars)
  if (normalized.length >= 4) {
    const candidates = lexicon.prefixMap.get(normalized.substring(0, 4));
    if (candidates && candidates.length === 1) {
      return candidates[0];
    }
  }
  
  return null;
}

/**
 * Apply lexicon correction to entire transcript
 * Returns { corrected, corrections } where corrections lists what was changed
 */
export function applyLexiconCorrections(
  transcript: string,
  lexicon: UserMedLexicon
): { corrected: string; corrections: Array<{ original: string; corrected: string }> } {
  if (!lexicon.medications.length) {
    return { corrected: transcript, corrections: [] };
  }
  
  const corrections: Array<{ original: string; corrected: string }> = [];
  const words = transcript.split(/\s+/);
  const correctedWords: string[] = [];
  
  for (const word of words) {
    // Only try to correct words that look like medication names (4+ chars, not numbers)
    if (word.length >= 3 && !/^\d+$/.test(word)) {
      const correction = correctWithLexicon(word, lexicon);
      if (correction && correction.toLowerCase() !== word.toLowerCase()) {
        corrections.push({ original: word, corrected: correction });
        correctedWords.push(correction);
        continue;
      }
    }
    correctedWords.push(word);
  }
  
  return {
    corrected: correctedWords.join(' '),
    corrections
  };
}
