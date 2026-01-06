/**
 * Query Repair System
 * Improves incomplete or misspelled analytics queries before showing errors
 * 
 * Features:
 * - Fuzzy medication matching (Triplan → Triptan)
 * - Auto-complete partial questions
 * - Suggests normalized query for confirmation
 * - Integrates with user medication list
 */

import { matchMedication, formatMedicationName, type UserMedication } from './medicationMatcher';

// Query templates for auto-completion
const QUERY_TEMPLATES: Record<string, { pattern: RegExp; template: string }> = {
  triptan_days: {
    pattern: /wie\s*(?:viele?)?\s*(?:triptane?|triptan)/i,
    template: 'Wie viele Triptane habe ich in den letzten 30 Tagen eingenommen?'
  },
  last_intake: {
    pattern: /wann\s*(?:habe?\s*ich\s*)?\s*(?:zuletzt|letzte?)\s*(\w+)/i,
    template: 'Wann habe ich das letzte Mal {med} genommen?'
  },
  med_days: {
    pattern: /wie\s*(?:viele?)?\s*(?:tage)?\s*(sumatriptan|rizatriptan|ibuprofen|paracetamol|triptan)/i,
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

/**
 * Find the best medication match for a potentially misspelled word
 * Uses the new medicationMatcher module
 */
export function findMedicationMatch(
  word: string, 
  userMeds: UserMedication[] = []
): { match: string; original: string; confidence: number } | null {
  if (word.length < 3) return null;
  
  const result = matchMedication(word, userMeds);
  
  if (result.matched && result.canonicalName.toLowerCase() !== word.toLowerCase()) {
    return {
      match: result.canonicalName,
      original: word,
      confidence: result.confidence
    };
  }
  
  return null;
}

/**
 * Repair a query by fixing misspellings and suggesting completions
 */
export function repairQuery(
  transcript: string,
  userMeds: UserMedication[] = []
): {
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
    const match = findMedicationMatch(word, userMeds);
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
  
  // Check for "last intake" pattern first
  const lastIntakeMatch = repaired.match(/wann\s*(?:habe?\s*ich\s*)?\s*(?:zuletzt|letzte?(?:\s*mal)?)\s*(\w+)/i);
  if (lastIntakeMatch && lastIntakeMatch[1]) {
    const medMatch = matchMedication(lastIntakeMatch[1], userMeds);
    suggestedQuery = `Wann habe ich das letzte Mal ${medMatch.canonicalName} genommen?`;
  }
  
  // Check other templates
  if (!suggestedQuery) {
    for (const [, template] of Object.entries(QUERY_TEMPLATES)) {
      if (template.pattern.test(repaired)) {
        // Extract medication if present
        const medMatch = repaired.match(/(sumatriptan|rizatriptan|ibuprofen|paracetamol|triptan|aspirin|naproxen|diclofenac)/i);
        if (medMatch) {
          const formatted = formatMedicationName(medMatch[1]);
          suggestedQuery = template.template.replace('{med}', formatted);
        } else {
          suggestedQuery = template.template.replace('{med}', 'Medikament');
        }
        break;
      }
    }
  }
  
  // Step 3: If we have corrections but no template, create a suggestion
  if (!suggestedQuery && corrections.length > 0) {
    const hasMed = corrections.some(c => {
      const lower = c.corrected.toLowerCase();
      return lower.includes('triptan') || lower.includes('ibuprofen') || 
             lower.includes('paracetamol') || lower.includes('aspirin');
    });
    if (hasMed) {
      const medName = corrections[0].corrected;
      // Check if this looks like a "last intake" question
      if (/zuletzt|letzte|wann/i.test(repaired)) {
        suggestedQuery = `Wann habe ich das letzte Mal ${medName} genommen?`;
      } else {
        suggestedQuery = `Wie oft habe ich ${medName} in den letzten 30 Tagen eingenommen?`;
      }
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
  return 'Versuche z.B.:\n• "Wann habe ich zuletzt Triptan genommen?"\n• "Wie viele schmerzfreie Tage in den letzten 30 Tagen?"\n• "Wie oft Ibuprofen letzten Monat?"';
}
