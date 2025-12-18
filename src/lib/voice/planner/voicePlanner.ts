/**
 * Voice Planner
 * 
 * Zentrale Planungs-Logik für Voice OS
 * Nimmt Transkript + Kontext und erzeugt einen strukturierten VoicePlan
 */

import type { 
  VoicePlan, 
  PlanDiagnostics,
  NotSupportedPlan,
  ConfirmPlan,
  NavigatePlan,
} from './types';
import { 
  CONFIDENCE_THRESHOLDS, 
  createNotSupportedPlan,
  shouldAutoExecute,
  shouldConfirm,
  getPlanRisk,
} from './types';
import { 
  canonicalizeText, 
  detectOperator, 
  detectObject,
  extractOrdinal,
  extractTimeRange,
  extractRating,
  hasExplicitOperator,
  type OperatorType,
} from './lexicon/de';
import { skillRegistry, initializeSkills } from './skills';
import type { VoiceUserContext, SkillMatchResult } from './skills/types';

// ============================================
// Initialization
// ============================================

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    initializeSkills();
    initialized = true;
  }
}

// ============================================
// Main Planner Function
// ============================================

export interface PlannerResult {
  plan: VoicePlan;
  diagnostics: PlanDiagnostics;
}

export function planVoiceCommand(
  transcript: string,
  context: VoiceUserContext
): PlannerResult {
  const startTime = performance.now();
  ensureInitialized();
  
  console.log('[VoicePlanner] Planning:', transcript.substring(0, 80));
  
  // 1. Canonicalize text
  const canonicalized = canonicalizeText(transcript);
  console.log('[VoicePlanner] Canonicalized:', canonicalized);
  
  // 2. Detect operator and object
  const detectedOperator = detectOperator(canonicalized);
  const detectedObject = detectObject(canonicalized);
  
  console.log('[VoicePlanner] Operator:', detectedOperator, 'Object:', detectedObject);
  
  // 3. Extract entities
  const extractedEntities = extractEntities(transcript, canonicalized, context);
  
  // 4. Find matching skills
  const matches = skillRegistry.findMatches(transcript, canonicalized, context);
  
  console.log('[VoicePlanner] Matches:', matches.slice(0, 3).map(m => 
    `${m.skill.id}: ${(m.match.confidence * 100).toFixed(0)}%`
  ));
  
  // 5. Build diagnostics
  const diagnostics: PlanDiagnostics = {
    canonicalizedText: canonicalized,
    detectedOperator: detectedOperator || undefined,
    candidateScores: matches.slice(0, 5).map(m => ({
      skillId: m.skill.id,
      score: m.match.confidence,
      reasons: m.match.reasons,
    })),
    extractedEntities,
    processingTimeMs: 0, // Will be set at the end
  };
  
  // 6. Determine plan based on matches
  let plan: VoicePlan;
  
  if (matches.length === 0) {
    // No matches - not supported
    plan = createNotSupportedPlan(
      'Ich konnte den Befehl nicht verstehen.',
      [
        { label: 'Hilfe anzeigen' },
        { label: 'Tagebuch öffnen' },
        { label: 'Auswertung öffnen' },
      ]
    );
  } else {
    const topMatch = matches[0];
    const secondMatch = matches[1];
    
    // Check if top match is confident enough
    if (topMatch.match.confidence >= CONFIDENCE_THRESHOLDS.CONFIRM_NAV_QUERY) {
      // Check for ambiguity (two close matches)
      const isAmbiguous = secondMatch && 
        (topMatch.match.confidence - secondMatch.match.confidence) < 0.15;
      
      if (isAmbiguous) {
        // Create ambiguous confirmation with choices
        plan = createAmbiguousConfirmation(
          matches.slice(0, 3),
          context,
          topMatch.match.confidence
        );
      } else {
        // Build plan from top match
        plan = topMatch.skill.buildPlan(
          topMatch.match.slots,
          context,
          topMatch.match.confidence
        );
        
        // Apply safety checks
        plan = applySafetyChecks(plan, transcript, detectedOperator);
      }
    } else {
      // Confidence too low - show action picker
      plan = createActionPicker(matches.slice(0, 4), context);
    }
  }
  
  // Set processing time
  diagnostics.processingTimeMs = performance.now() - startTime;
  diagnostics.matchedSkillId = matches[0]?.skill.id;
  
  // Attach diagnostics to plan
  plan.diagnostics = diagnostics;
  
  console.log('[VoicePlanner] Plan:', plan.kind, plan.summary, 
    `(${(plan.confidence * 100).toFixed(0)}%, ${diagnostics.processingTimeMs.toFixed(1)}ms)`);
  
  return { plan, diagnostics };
}

// ============================================
// Entity Extraction
// ============================================

function extractEntities(
  transcript: string,
  canonicalized: string,
  context: VoiceUserContext
): PlanDiagnostics['extractedEntities'] {
  const entities: PlanDiagnostics['extractedEntities'] = {};
  
  // Extract medications
  const medications = extractMedications(canonicalized, context.userMeds);
  if (medications.length > 0) {
    entities.medications = medications;
  }
  
  // Extract time range
  const timeRange = extractTimeRange(canonicalized);
  if (timeRange) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - timeRange.days);
    entities.timeRange = {
      from: from.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
      days: timeRange.days,
    };
  }
  
  // Extract ordinals
  const ordinal = extractOrdinal(canonicalized);
  if (ordinal !== null) {
    entities.ordinals = [ordinal];
  }
  
  // Extract numbers (for ratings, pain levels)
  const numbers = extractNumbers(canonicalized);
  if (numbers.length > 0) {
    entities.numbers = numbers;
  }
  
  return entities;
}

function extractMedications(
  text: string,
  userMeds: Array<{ name: string }>
): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  
  for (const med of userMeds) {
    const medLower = med.name.toLowerCase();
    // Check for exact match or partial match (at least 4 chars)
    if (lower.includes(medLower) || 
        (medLower.length > 4 && lower.includes(medLower.substring(0, 4)))) {
      found.push(med.name);
    }
  }
  
  return found;
}

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  
  // Match explicit numbers
  const matches = text.match(/\b(\d+)\b/g);
  if (matches) {
    for (const m of matches) {
      const num = parseInt(m, 10);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        numbers.push(num);
      }
    }
  }
  
  // Match German number words
  const numberWords: Record<string, number> = {
    'null': 0, 'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4,
    'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10,
  };
  
  const lower = text.toLowerCase();
  for (const [word, value] of Object.entries(numberWords)) {
    if (lower.includes(word)) {
      numbers.push(value);
    }
  }
  
  return [...new Set(numbers)]; // Remove duplicates
}

// ============================================
// Safety Checks
// ============================================

function applySafetyChecks(
  plan: VoicePlan,
  transcript: string,
  detectedOperator: OperatorType | null
): VoicePlan {
  // Rule: DELETE/EDIT/RATE only if operator is explicit
  if (plan.kind === 'mutation') {
    const { mutationType } = plan;
    
    // DELETE requires explicit DELETE operator
    if (mutationType.startsWith('delete')) {
      if (!hasExplicitOperator(transcript, 'DELETE')) {
        console.log('[VoicePlanner] Safety: DELETE without explicit operator, downgrading');
        return createNotSupportedPlan(
          'Zum Löschen sage bitte explizit "lösche" oder "entferne".',
          [
            { label: 'Abbrechen' },
          ]
        );
      }
      // DELETE always requires confirmation
      return wrapInConfirmation(plan, 'danger', 'Wirklich löschen?');
    }
    
    // EDIT requires explicit EDIT operator
    if (mutationType === 'edit_entry') {
      if (!hasExplicitOperator(transcript, 'EDIT')) {
        console.log('[VoicePlanner] Safety: EDIT without explicit operator, downgrading');
        return createNotSupportedPlan(
          'Zum Bearbeiten sage bitte explizit "ändere" oder "bearbeite".',
          [
            { label: 'Abbrechen' },
          ]
        );
      }
    }
    
    // RATE requires explicit RATE operator
    if (mutationType === 'rate_intake') {
      if (!hasExplicitOperator(transcript, 'RATE')) {
        console.log('[VoicePlanner] Safety: RATE without explicit operator, downgrading');
        return createNotSupportedPlan(
          'Zum Bewerten sage bitte explizit "bewerte" oder "wirkung".',
          [
            { label: 'Abbrechen' },
          ]
        );
      }
    }
  }
  
  return plan;
}

function wrapInConfirmation(
  plan: VoicePlan,
  confirmType: 'danger' | 'ambiguous',
  question: string
): ConfirmPlan {
  return {
    kind: 'confirm',
    confirmType,
    question,
    pending: plan,
    summary: question,
    confidence: plan.confidence,
  };
}

// ============================================
// Action Picker / Ambiguity Handling
// ============================================

function createAmbiguousConfirmation(
  matches: Array<{ skill: { id: string; name: string; buildPlan: Function }; match: SkillMatchResult }>,
  context: VoiceUserContext,
  topConfidence: number
): ConfirmPlan {
  const suggestions = matches.slice(0, 3).map(m => ({
    label: m.skill.name,
    plan: m.skill.buildPlan(m.match.slots, context, m.match.confidence) as VoicePlan,
  }));
  
  return {
    kind: 'confirm',
    confirmType: 'ambiguous',
    question: 'Meinst du:',
    pending: suggestions[0].plan,
    summary: 'Mehrere Möglichkeiten erkannt',
    confidence: topConfidence,
    diagnostics: {
      canonicalizedText: '',
      candidateScores: matches.map(m => ({
        skillId: m.skill.id,
        score: m.match.confidence,
        reasons: m.match.reasons,
      })),
    },
  };
}

function createActionPicker(
  matches: Array<{ skill: { id: string; name: string; buildPlan: Function }; match: SkillMatchResult }>,
  context: VoiceUserContext
): NotSupportedPlan {
  const suggestions: Array<{ label: string; plan?: VoicePlan }> = matches.map(m => ({
    label: m.skill.name,
    plan: m.skill.buildPlan(m.match.slots, context, m.match.confidence) as VoicePlan,
  }));
  
  // Add help as fallback
  suggestions.push({ label: 'Hilfe anzeigen' });
  
  return {
    kind: 'not_supported',
    reason: 'Ich bin mir nicht sicher, was du meinst.',
    suggestions: suggestions.slice(0, 4),
    summary: 'Befehl nicht eindeutig',
    confidence: matches[0]?.match.confidence || 0,
  };
}

// ============================================
// Export
// ============================================

export { ensureInitialized as initPlanner };
