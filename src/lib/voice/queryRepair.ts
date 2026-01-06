/**
 * Query Repair System
 * Improves incomplete or misspelled analytics queries before showing errors
 * 
 * Features:
 * - Fuzzy medication matching (Triplan → Triptan)
 * - Auto-complete partial questions
 * - Suggests normalized query for confirmation
 */

// Common medication categories with fuzzy variants
const MEDICATION_CATEGORIES: Record<string, { canonical: string; variants: string[] }> = {
  triptan: {
    canonical: 'Triptan',
    variants: [
      'triptan', 'triptane', 'triptans', 'triplan', 'tryptan', 
      'tripptan', 'tripten', 'triptain', 'triptam'
    ]
  },
  sumatriptan: {
    canonical: 'Sumatriptan',
    variants: [
      'sumatriptan', 'sumatripten', 'somatriptan', 'suma triptan',
      'zuma triptan', 'sumatryptan', 'sumitriptan', 'sumatripton'
    ]
  },
  rizatriptan: {
    canonical: 'Rizatriptan',
    variants: [
      'rizatriptan', 'risatriptan', 'rizatryptan', 'riza triptan',
      'risatryptan', 'rizatripton', 'maxalt'
    ]
  },
  ibuprofen: {
    canonical: 'Ibuprofen',
    variants: [
      'ibuprofen', 'iboprofen', 'ibuproffen', 'ibu profen',
      'ibuprophen', 'ibu', 'ibobrofen'
    ]
  },
  paracetamol: {
    canonical: 'Paracetamol',
    variants: [
      'paracetamol', 'parazitamol', 'paracetamoll', 'para cetamol',
      'parazetamol', 'para'
    ]
  },
  schmerzmittel: {
    canonical: 'Schmerzmittel',
    variants: [
      'schmerzmittel', 'schmerz mittel', 'schmerzmitteln',
      'schmerzmedikament', 'schmerzmedikamente', 'schmerztablette'
    ]
  }
};

// Query templates for auto-completion
const QUERY_TEMPLATES: Record<string, { pattern: RegExp; template: string }> = {
  triptan_days: {
    pattern: /wie\s*(?:viele?)?\s*(?:triptane?|triptan)/i,
    template: 'Wie viele Triptane habe ich in den letzten 30 Tagen eingenommen?'
  },
  med_days: {
    pattern: /wie\s*(?:viele?)?\s*(?:tage)?\s*(sumatriptan|rizatriptan|ibuprofen|paracetamol)/i,
    template: 'Wie oft habe ich {med} in den letzten 30 Tagen eingenommen?'
  },
  pain_free_days: {
    pattern: /schmerzfrei\w*\s*(?:tage?)?|(?:tage?)?\s*ohne\s*(?:kopf)?schmerz/i,
    template: 'Wie viele schmerzfreie Tage hatte ich in den letzten 30 Tagen?'
  },
  headache_days: {
    pattern: /migräne\s*(?:tage?)?|kopfschmerz\s*(?:tage?)?/i,
    template: 'Wie viele Kopfschmerztage hatte ich in den letzten 30 Tagen?'
  },
  entries_count: {
    pattern: /wie\s*(?:viele?)?\s*(?:einträge?|attacken?|anfälle?)/i,
    template: 'Wie viele Einträge hatte ich in den letzten 30 Tagen?'
  }
};

// Levenshtein distance for fuzzy matching
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

/**
 * Find the best medication match for a potentially misspelled word
 */
export function findMedicationMatch(word: string): { match: string; original: string; confidence: number } | null {
  const lower = word.toLowerCase().trim();
  if (lower.length < 3) return null;
  
  let bestMatch: { match: string; original: string; distance: number } | null = null;
  
  for (const [, category] of Object.entries(MEDICATION_CATEGORIES)) {
    for (const variant of category.variants) {
      // Exact match
      if (lower === variant) {
        return { match: category.canonical, original: word, confidence: 1.0 };
      }
      
      // Fuzzy match
      const distance = levenshteinDistance(lower, variant);
      const maxDistance = Math.floor(variant.length * 0.3); // 30% tolerance
      
      if (distance <= maxDistance) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { match: category.canonical, original: word, distance };
        }
      }
    }
  }
  
  if (bestMatch) {
    const confidence = 1 - (bestMatch.distance / word.length);
    return { match: bestMatch.match, original: bestMatch.original, confidence: Math.max(0.7, confidence) };
  }
  
  return null;
}

/**
 * Repair a query by fixing misspellings and suggesting completions
 */
export function repairQuery(transcript: string): {
  isRepaired: boolean;
  original: string;
  repaired: string;
  corrections: Array<{ original: string; corrected: string }>;
  suggestedQuery: string | null;
  confidence: number;
} {
  const words = transcript.split(/\s+/);
  const corrections: Array<{ original: string; corrected: string }> = [];
  const repairedWords: string[] = [];
  let totalConfidence = 1.0;
  
  // Step 1: Fix medication misspellings
  for (const word of words) {
    const match = findMedicationMatch(word);
    if (match && match.original.toLowerCase() !== match.match.toLowerCase()) {
      corrections.push({ original: match.original, corrected: match.match });
      repairedWords.push(match.match);
      totalConfidence = Math.min(totalConfidence, match.confidence);
    } else {
      repairedWords.push(word);
    }
  }
  
  const repaired = repairedWords.join(' ');
  
  // Step 2: Find matching template for auto-completion
  let suggestedQuery: string | null = null;
  for (const [, template] of Object.entries(QUERY_TEMPLATES)) {
    if (template.pattern.test(repaired)) {
      // Extract medication if present
      const medMatch = repaired.match(/(sumatriptan|rizatriptan|ibuprofen|paracetamol|triptan)/i);
      if (medMatch) {
        suggestedQuery = template.template.replace('{med}', medMatch[1]);
      } else {
        suggestedQuery = template.template;
      }
      break;
    }
  }
  
  // Step 3: If no template matches but we have time context, add default template
  if (!suggestedQuery && corrections.length > 0) {
    const hasMed = corrections.some(c => 
      ['triptan', 'sumatriptan', 'rizatriptan', 'ibuprofen', 'paracetamol'].some(
        m => c.corrected.toLowerCase().includes(m)
      )
    );
    if (hasMed) {
      const medName = corrections[0].corrected;
      suggestedQuery = `Wie oft habe ich ${medName} in den letzten 30 Tagen eingenommen?`;
    }
  }
  
  return {
    isRepaired: corrections.length > 0,
    original: transcript,
    repaired,
    corrections,
    suggestedQuery,
    confidence: totalConfidence
  };
}

/**
 * Check if query is incomplete and needs completion
 */
export function isIncompleteQuery(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  
  // Very short queries
  if (lower.split(/\s+/).length < 3) {
    return true;
  }
  
  // Missing verb patterns
  const hasMedMention = /triptan|ibuprofen|paracetamol|schmerzmittel/i.test(lower);
  const hasVerb = /(genommen|eingenommen|hatte|habe|war|ist)/i.test(lower);
  const hasTimeRef = /tag|woche|monat|letzt/i.test(lower);
  
  // Has medication but no verb and no time reference
  if (hasMedMention && !hasVerb && !hasTimeRef) {
    return true;
  }
  
  return false;
}

/**
 * Generate a helpful error message with examples
 */
export function getQueryHelpMessage(): string {
  return 'Versuche z.B.:\n• "Wie viele schmerzfreie Tage in den letzten 30 Tagen?"\n• "Wie oft Triptan letzten Monat?"\n• "Zeig mir meine Statistik"';
}
