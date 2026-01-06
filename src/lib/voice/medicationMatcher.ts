/**
 * Medication Matcher
 * Unified fuzzy matching for medication names in voice input
 * 
 * Features:
 * - Levenshtein distance with configurable tolerance
 * - User medication list priority
 * - Common ASR error correction
 * - Proper capitalization in results
 */

// ============================================
// Types
// ============================================

export interface MedicationMatchResult {
  matched: boolean;
  canonicalName: string;        // Properly formatted name from DB or normalized
  originalInput: string;        // What the user said
  confidence: number;           // 0-1 match confidence
  matchType: 'exact' | 'fuzzy' | 'category' | 'none';
  needsConfirmation: boolean;   // True if multiple close matches
  alternatives?: string[];      // Other possible matches if ambiguous
}

export interface UserMedication {
  id?: string;
  name: string;
  wirkstoff?: string | null;
}

// ============================================
// Constants
// ============================================

// Common medication categories with known variants
const MEDICATION_CATEGORIES: Record<string, { 
  canonical: string; 
  variants: string[];
  category: string;
}> = {
  triptan: {
    canonical: 'Triptan',
    variants: [
      'triptan', 'triptane', 'triptans', 'triplan', 'tryptan', 
      'tripptan', 'tripten', 'triptain', 'triptam', 'tripton'
    ],
    category: 'migraene_triptan'
  },
  sumatriptan: {
    canonical: 'Sumatriptan',
    variants: [
      'sumatriptan', 'sumatripten', 'somatriptan', 'suma triptan',
      'zuma triptan', 'sumatryptan', 'sumitriptan', 'sumatripton',
      'sumatrypten', 'sumatritan', 'sumotriptan'
    ],
    category: 'migraene_triptan'
  },
  rizatriptan: {
    canonical: 'Rizatriptan',
    variants: [
      'rizatriptan', 'risatriptan', 'rizatryptan', 'riza triptan',
      'risatryptan', 'rizatripton', 'maxalt', 'risotriptan'
    ],
    category: 'migraene_triptan'
  },
  zolmitriptan: {
    canonical: 'Zolmitriptan',
    variants: [
      'zolmitriptan', 'zolmitryptan', 'zolmatriptan', 'zolmi triptan',
      'ascotop', 'zolmitripton'
    ],
    category: 'migraene_triptan'
  },
  ibuprofen: {
    canonical: 'Ibuprofen',
    variants: [
      'ibuprofen', 'iboprofen', 'ibuproffen', 'ibu profen',
      'ibuprophen', 'ibu', 'ibobrofen', 'ibuprofen', 'iboproffen'
    ],
    category: 'schmerzmittel_nsar'
  },
  paracetamol: {
    canonical: 'Paracetamol',
    variants: [
      'paracetamol', 'parazitamol', 'paracetamoll', 'para cetamol',
      'parazetamol', 'para', 'paracetemol', 'paracetamoll', 'ben u ron'
    ],
    category: 'schmerzmittel_nsar'
  },
  aspirin: {
    canonical: 'Aspirin',
    variants: [
      'aspirin', 'asprin', 'asperin', 'aspirien', 'ass', 'acetylsalicylsäure'
    ],
    category: 'schmerzmittel_nsar'
  },
  naproxen: {
    canonical: 'Naproxen',
    variants: [
      'naproxen', 'naproxan', 'naproxin', 'neproxen', 'aleve'
    ],
    category: 'schmerzmittel_nsar'
  },
  diclofenac: {
    canonical: 'Diclofenac',
    variants: [
      'diclofenac', 'diclofenack', 'diclofenak', 'voltaren', 'diclo'
    ],
    category: 'schmerzmittel_nsar'
  },
};

// ============================================
// Levenshtein Distance
// ============================================

function levenshteinDistance(a: string, b: string): number {
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
 * Normalize text for matching (lowercase, no umlauts, no special chars)
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\d+\s*(mg|ml|g|µg|mcg|tabletten?|kapseln?|stück|st\.?|tab\.?)/gi, '')
    .replace(/[®™©\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Capitalize first letter properly
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get max allowed distance based on word length
 * Shorter words need stricter matching
 */
function getMaxDistance(wordLength: number): number {
  if (wordLength <= 4) return 1;
  if (wordLength <= 6) return 1;
  if (wordLength <= 9) return 2;
  return 3;
}

// ============================================
// Core Matching Functions
// ============================================

/**
 * Match against known medication categories
 */
function matchKnownMedication(input: string): {
  canonical: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy';
} | null {
  const normalized = normalizeForMatch(input);
  
  let bestMatch: { canonical: string; distance: number } | null = null;
  
  for (const [, category] of Object.entries(MEDICATION_CATEGORIES)) {
    for (const variant of category.variants) {
      const variantNorm = normalizeForMatch(variant);
      
      // Exact match
      if (normalized === variantNorm) {
        return { canonical: category.canonical, confidence: 1.0, matchType: 'exact' };
      }
      
      // Contains match (for compound words like "triptantage")
      if (normalized.includes(variantNorm) && variantNorm.length >= 4) {
        return { canonical: category.canonical, confidence: 0.95, matchType: 'exact' };
      }
      
      // Fuzzy match
      const distance = levenshteinDistance(normalized, variantNorm);
      const maxDist = getMaxDistance(variantNorm.length);
      
      if (distance <= maxDist) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { canonical: category.canonical, distance };
        }
      }
    }
  }
  
  if (bestMatch) {
    const confidence = Math.max(0.7, 1 - (bestMatch.distance / 10));
    return { canonical: bestMatch.canonical, confidence, matchType: 'fuzzy' };
  }
  
  return null;
}

/**
 * Match against user's medication list
 */
function matchUserMedication(
  input: string, 
  userMeds: UserMedication[]
): {
  canonical: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy';
  alternatives?: string[];
} | null {
  if (!userMeds.length) return null;
  
  const normalized = normalizeForMatch(input);
  const matches: Array<{ name: string; distance: number }> = [];
  
  for (const med of userMeds) {
    const medNorm = normalizeForMatch(med.name);
    
    // Exact match
    if (normalized === medNorm) {
      return { canonical: med.name, confidence: 1.0, matchType: 'exact' };
    }
    
    // Contains match
    if (medNorm.includes(normalized) || normalized.includes(medNorm)) {
      if (Math.min(medNorm.length, normalized.length) >= 4) {
        matches.push({ name: med.name, distance: 0 });
        continue;
      }
    }
    
    // Wirkstoff match
    if (med.wirkstoff) {
      const wirkstoffNorm = normalizeForMatch(med.wirkstoff);
      if (normalized === wirkstoffNorm || wirkstoffNorm.includes(normalized)) {
        matches.push({ name: med.name, distance: 0 });
        continue;
      }
    }
    
    // Fuzzy match
    const distance = levenshteinDistance(normalized, medNorm);
    const maxDist = getMaxDistance(medNorm.length);
    
    if (distance <= maxDist) {
      matches.push({ name: med.name, distance });
    }
  }
  
  if (matches.length === 0) return null;
  
  // Sort by distance
  matches.sort((a, b) => a.distance - b.distance);
  
  const bestMatch = matches[0];
  const confidence = bestMatch.distance === 0 ? 0.98 : Math.max(0.75, 1 - (bestMatch.distance / 8));
  
  // Check for ambiguity
  const alternatives = matches
    .slice(1, 3)
    .filter(m => m.distance - bestMatch.distance <= 1)
    .map(m => m.name);
  
  return {
    canonical: bestMatch.name,
    confidence,
    matchType: bestMatch.distance === 0 ? 'exact' : 'fuzzy',
    alternatives: alternatives.length > 0 ? alternatives : undefined
  };
}

// ============================================
// Main API
// ============================================

/**
 * Match a medication name from voice input
 * 
 * Priority:
 * 1. User's medications (highest priority)
 * 2. Known medication categories
 * 3. Return properly capitalized input as fallback
 */
export function matchMedication(
  input: string,
  userMeds: UserMedication[] = []
): MedicationMatchResult {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 2) {
    return {
      matched: false,
      canonicalName: capitalizeFirst(trimmed),
      originalInput: input,
      confidence: 0,
      matchType: 'none',
      needsConfirmation: false
    };
  }
  
  // 1. Try user medications first (highest priority)
  const userMatch = matchUserMedication(trimmed, userMeds);
  if (userMatch) {
    return {
      matched: true,
      canonicalName: userMatch.canonical,
      originalInput: input,
      confidence: userMatch.confidence,
      matchType: userMatch.matchType,
      needsConfirmation: (userMatch.alternatives?.length ?? 0) > 0,
      alternatives: userMatch.alternatives
    };
  }
  
  // 2. Try known medication categories
  const knownMatch = matchKnownMedication(trimmed);
  if (knownMatch) {
    return {
      matched: true,
      canonicalName: knownMatch.canonical,
      originalInput: input,
      confidence: knownMatch.confidence,
      matchType: knownMatch.matchType,
      needsConfirmation: knownMatch.matchType === 'fuzzy' && knownMatch.confidence < 0.85
    };
  }
  
  // 3. No match - return capitalized input
  return {
    matched: false,
    canonicalName: capitalizeFirst(trimmed),
    originalInput: input,
    confidence: 0.5,
    matchType: 'none',
    needsConfirmation: false
  };
}

/**
 * Extract medication name from a transcript and match it
 */
export function extractAndMatchMedication(
  transcript: string,
  userMeds: UserMedication[] = []
): MedicationMatchResult | null {
  const lower = transcript.toLowerCase();
  
  // Common patterns for medication extraction
  const patterns = [
    // "wann habe ich zuletzt X genommen"
    /(?:wann|wie\s*oft|wie\s*viel)\s+(?:habe?\s+ich\s+)?(?:zuletzt\s+)?(\w+)\s+(?:genommen|eingenommen|nehme|genomen)/i,
    // "letzte einnahme von X"
    /letzte?\s+einnahme\s+(?:von\s+)?(\w+)/i,
    // "X einnahme" / "X tage"
    /(\w+)(?:-?(?:einnahme|tage|tablette|kapsel))/i,
    // "mit X" (e.g., "Tage mit Triptan")
    /(?:mit|wegen)\s+(\w+)/i,
    // Generic: first word that looks like a medication
    /\b([a-zäöü]{4,}(?:triptan|profen|tamol|pirin|xen|fan))\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const result = matchMedication(match[1], userMeds);
      if (result.matched || result.confidence >= 0.5) {
        return result;
      }
    }
  }
  
  // Check for any known medication category keywords
  for (const [key, category] of Object.entries(MEDICATION_CATEGORIES)) {
    for (const variant of category.variants) {
      if (lower.includes(variant)) {
        return {
          matched: true,
          canonicalName: category.canonical,
          originalInput: variant,
          confidence: 0.9,
          matchType: 'exact',
          needsConfirmation: false
        };
      }
    }
  }
  
  return null;
}

/**
 * Get properly formatted medication name
 * Always returns capitalized, clean name
 */
export function formatMedicationName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  
  // Check known medications for proper casing
  const normalized = normalizeForMatch(trimmed);
  for (const [, category] of Object.entries(MEDICATION_CATEGORIES)) {
    if (category.variants.some(v => normalizeForMatch(v) === normalized)) {
      return category.canonical;
    }
  }
  
  // Capitalize first letter
  return capitalizeFirst(trimmed);
}
