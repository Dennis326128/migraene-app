/**
 * Intent Scoring System
 * Lightweight scoring to determine the most likely intent from a transcript
 * 
 * Replaces hard if/else chains with feature-based scoring
 */

import { normalizeTranscript, hasAddMedicationVerb, hasPainKeywords, hasAnalyticsKeywords, hasDosagePattern, extractMedNameNearDosage } from './normalizeTranscript';
import type { UserMedLexicon } from './userMedLexicon';

// Known medication aliases for higher confidence scoring
const KNOWN_MED_ALIASES = new Set([
  'sumatriptan', 'rizatriptan', 'naratriptan', 'eletriptan', 'zolmitriptan', 'almotriptan', 'frovatriptan',
  'ibuprofen', 'paracetamol', 'aspirin', 'diclofenac', 'naproxen', 'novalgin', 'metamizol',
  'maxalt', 'imigran', 'relpax', 'voltaren',
]);

export type ScoredIntent = 
  | 'add_medication'
  | 'pain_entry'
  | 'medication_update'
  | 'medication_effect'
  | 'reminder'
  | 'analytics_query'
  | 'note'
  | 'navigation'
  | 'unknown';

export interface IntentScores {
  add_medication: number;
  pain_entry: number;
  medication_update: number;
  medication_effect: number;
  reminder: number;
  analytics_query: number;
  note: number;
  navigation: number;
}

export interface ScoringResult {
  intent: ScoredIntent;
  confidence: number;
  scores: IntentScores;
  features: string[];
}

/**
 * Score a transcript against all possible intents
 * Returns the highest-scoring intent with confidence
 */
export function scoreIntents(transcript: string, userMeds: Array<{ name: string }> = []): ScoringResult {
  const { normalized, tokens } = normalizeTranscript(transcript);
  const features: string[] = [];
  
  // Initialize scores
  const scores: IntentScores = {
    add_medication: 0,
    pain_entry: 0,
    medication_update: 0,
    medication_effect: 0,
    reminder: 0,
    analytics_query: 0,
    note: 0.3, // Base score for notes (fallback)
    navigation: 0,
  };

  // ============================================
  // Feature Detection
  // ============================================

  // Add-verb detection (highest weight for add_medication)
  if (hasAddMedicationVerb(normalized)) {
    scores.add_medication += 0.5;
    features.push('has_add_verb');
  }

  // Explicit "neues medikament" or "medikament hinzufuegen"
  if (/\bneues?\s+medikament\b/.test(normalized) || /\bmedikament\s+(hinzu|anlegen)\b/.test(normalized)) {
    scores.add_medication += 0.35;
    features.push('explicit_new_med');
  }

  // Dosage pattern (e.g., "500 mg") - strong indicator for medication context
  if (hasDosagePattern(normalized)) {
    scores.add_medication += 0.25;
    scores.pain_entry += 0.1; // Can also indicate intake in pain entry
    features.push('has_dosage_pattern');
    
    // If dosage + add verb -> very likely add_medication
    if (hasAddMedicationVerb(normalized)) {
      scores.add_medication += 0.15;
      features.push('dosage_with_add_verb');
    }
  }

  // Known medication alias in text
  const medNameNearDosage = extractMedNameNearDosage(normalized);
  if (medNameNearDosage && KNOWN_MED_ALIASES.has(medNameNearDosage.toLowerCase())) {
    scores.add_medication += 0.2;
    features.push('known_med_alias');
  }

  // Check user's medications
  const userMedNames = userMeds.map(m => m.name.toLowerCase());
  for (const token of tokens) {
    if (userMedNames.some(name => name.includes(token) || token.includes(name.substring(0, 4)))) {
      scores.pain_entry += 0.15;
      scores.medication_update += 0.1;
      features.push('user_med_match');
      break;
    }
  }

  // Pain keywords
  if (hasPainKeywords(normalized)) {
    scores.pain_entry += 0.45;
    features.push('has_pain_keywords');
    
    // If both add verb AND pain keywords, pain context takes precedence
    // unless it's explicitly "füge medikament X hinzu" style
    if (hasAddMedicationVerb(normalized)) {
      // Check if pain is more prominent
      const painCount = (normalized.match(/schmerz|migraene|kopf|attacke|anfall/g) || []).length;
      const addContext = /fuege\s+\w+\s+(hinzu|an)\b/.test(normalized);
      
      if (painCount > 1 && !addContext) {
        scores.pain_entry += 0.2;
        features.push('pain_context_dominant');
      }
    }
  }

  // Pain level number (0-10 context)
  if (/\b([0-9]|10)\s*(von\s*10|\/10)?\b/.test(normalized) && hasPainKeywords(normalized)) {
    scores.pain_entry += 0.2;
    features.push('has_pain_level');
  }

  // Analytics/question detection
  if (hasAnalyticsKeywords(normalized)) {
    scores.analytics_query += 0.5;
    features.push('has_analytics_keywords');
  }

  // Question mark or W-question start
  if (transcript.includes('?') || /^(wie|was|wann|welche|wo|wieviel)\s/.test(normalized)) {
    scores.analytics_query += 0.3;
    features.push('is_question');
  }

  // Time range mention (letzten X tage)
  if (/letzt\w*\s+\d+\s+(tag|woche|monat)/.test(normalized) || /letzten?\s+(monat|woche)\b/.test(normalized)) {
    scores.analytics_query += 0.25;
    features.push('has_time_range');
  }

  // Medication update patterns
  const updatePatterns = [
    /abgesetzt/,
    /nicht\s+mehr\s+(nehm|einnehm)/,
    /aufgehoert/,  // normalized
    /stopp\w*\s+\w+/,
    /kein\w*\s+\w+\s+mehr/,
    /nicht\s+vertragen/,
    /unvertraeglich/,  // normalized
    /nebenwirkung/,
  ];
  if (updatePatterns.some(p => p.test(normalized))) {
    scores.medication_update += 0.6;
    features.push('has_update_pattern');
  }

  // Medication effect patterns
  const effectPatterns = [
    /\b(hat|haben)\s+(gut|sehr gut|super|nicht|kaum)\s+(geholfen|gewirkt)/,
    /wirkung/,
    /wirksam/,
    /effektiv/,
    /besser\s+geworden/,
  ];
  if (effectPatterns.some(p => p.test(normalized))) {
    scores.medication_effect += 0.5;
    features.push('has_effect_pattern');
  }

  // Intake patterns ("genommen", "eingenommen")
  if (/\b(genommen|eingenommen)\b/.test(normalized)) {
    scores.pain_entry += 0.25; // Intake often part of pain documentation
    features.push('has_intake_verb');
  }

  // Reminder patterns
  const reminderPatterns = [
    /erinner/,
    /termin/,
    /arztbesuch/,
    /\bum\s+\d{1,2}\s*(uhr|:)/,
    /morgen\s+um/,
    /uebermorgen/,  // normalized
  ];
  if (reminderPatterns.some(p => p.test(normalized))) {
    scores.reminder += 0.5;
    features.push('has_reminder_pattern');
  }

  // Navigation patterns
  const navPatterns = [
    /\b(oeffne|zeig|geh\s+zu|navigiere)\b/,  // öffne normalized
    /\btagebuch\b/,
    /\beinstellungen\b/,
    /\banalyse\b/,
    /\buebersicht\b/,  // übersicht normalized
    /\bhilfe\b/,
  ];
  if (navPatterns.some(p => p.test(normalized))) {
    scores.navigation += 0.5;
    features.push('has_nav_pattern');
  }

  // ============================================
  // Determine Winner
  // ============================================

  let maxIntent: ScoredIntent = 'unknown';
  let maxScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent as ScoredIntent;
    }
  }

  // Map score to confidence (0-1 range)
  const confidence = Math.min(0.95, maxScore);

  // If no clear winner, default to note or unknown
  if (maxScore < 0.3) {
    if (transcript.trim().length > 10) {
      maxIntent = 'note';
      return { intent: maxIntent, confidence: 0.6, scores, features };
    }
    return { intent: 'unknown', confidence: 0.2, scores, features };
  }

  return {
    intent: maxIntent,
    confidence,
    scores,
    features
  };
}

/**
 * Get top N intents by score
 */
export function getTopIntents(scores: IntentScores, n: number = 3): Array<{ intent: ScoredIntent; score: number }> {
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([intent, score]) => ({ intent: intent as ScoredIntent, score }));
}
