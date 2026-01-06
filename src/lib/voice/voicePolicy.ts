/**
 * Voice Safety Policy
 * Central rules for auto-execute decisions
 * 
 * Principles:
 * - Mutations need confirmation unless extremely confident
 * - Navigation/Analytics can execute directly at lower threshold
 * - Dictation fallback NEVER auto-mutates
 */

export type ActionCategory = 'navigation' | 'analytics' | 'mutation' | 'unknown';
export type InputSource = 'stt' | 'dictation_fallback' | 'typed';

export interface PolicyDecision {
  action: 'auto_execute' | 'confirm' | 'disambiguation' | 'slot_filling' | 'action_picker';
  reason: string;
}

export interface PolicyInput {
  source: InputSource;
  confidence: number;
  intentType: string;
  top2ScoreDiff?: number;  // Difference between top 1 and top 2 scores
  hasMissingSlots?: boolean;
  isAmbiguous?: boolean;  // e.g., just a number with no context
}

// ============================================
// Thresholds
// ============================================

const THRESHOLDS = {
  // Navigation/Analytics can auto-execute at lower confidence
  NAV_AUTO: 0.75,
  ANALYTICS_AUTO: 0.75,
  
  // Mutations need higher confidence
  MUTATION_AUTO: 0.90,
  MUTATION_CONFIRM: 0.65,
  
  // Disambiguation if scores are close
  DISAMBIGUATION_DIFF: 0.12,
  
  // Below this, show action picker
  MINIMUM: 0.40,
};

// ============================================
// Category Detection
// ============================================

export function getActionCategory(intentType: string): ActionCategory {
  // Navigation intents
  if (intentType.startsWith('navigate_') || intentType === 'help') {
    return 'navigation';
  }
  
  // Analytics/Questions
  if (intentType === 'analytics_query') {
    return 'analytics';
  }
  
  // Mutations (DB writes)
  if ([
    'create_pain_entry',
    'create_quick_entry',
    'create_medication_update',
    'create_medication_effect',
    'add_medication',
    'create_note',
  ].includes(intentType)) {
    return 'mutation';
  }
  
  return 'unknown';
}

// ============================================
// Policy Decision
// ============================================

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { source, confidence, intentType, top2ScoreDiff, hasMissingSlots, isAmbiguous } = input;
  const category = getActionCategory(intentType);
  
  // Rule 1: Ambiguous input (just numbers, fragments) -> disambiguation
  if (isAmbiguous) {
    return {
      action: 'disambiguation',
      reason: 'Ambiguous input needs clarification'
    };
  }
  
  // Rule 2: Missing required slots -> slot filling
  if (hasMissingSlots) {
    return {
      action: 'slot_filling',
      reason: 'Missing required information'
    };
  }
  
  // Rule 3: Top-2 scores very close -> disambiguation
  if (top2ScoreDiff !== undefined && 
      top2ScoreDiff < THRESHOLDS.DISAMBIGUATION_DIFF && 
      confidence < THRESHOLDS.MUTATION_AUTO) {
    return {
      action: 'disambiguation',
      reason: `Scores too close (diff: ${Math.round(top2ScoreDiff * 100)}%)`
    };
  }
  
  // Rule 4: Dictation fallback NEVER auto-mutates
  if (source === 'dictation_fallback' && category === 'mutation') {
    return {
      action: 'confirm',
      reason: 'Dictation fallback requires confirmation for mutations'
    };
  }
  
  // Rule 5: Unknown intent -> action picker
  if (intentType === 'unknown' || category === 'unknown') {
    return {
      action: 'action_picker',
      reason: 'Intent not recognized'
    };
  }
  
  // Rule 6: Very low confidence -> action picker
  if (confidence < THRESHOLDS.MINIMUM) {
    return {
      action: 'action_picker',
      reason: `Confidence too low (${Math.round(confidence * 100)}%)`
    };
  }
  
  // ============================================
  // Category-specific rules
  // ============================================
  
  // Navigation: auto-execute at lower threshold
  if (category === 'navigation') {
    if (confidence >= THRESHOLDS.NAV_AUTO) {
      return {
        action: 'auto_execute',
        reason: `High confidence navigation (${Math.round(confidence * 100)}%)`
      };
    } else {
      return {
        action: 'confirm',
        reason: `Navigation needs confirmation (${Math.round(confidence * 100)}%)`
      };
    }
  }
  
  // Analytics: auto-execute at lower threshold
  if (category === 'analytics') {
    if (confidence >= THRESHOLDS.ANALYTICS_AUTO) {
      return {
        action: 'auto_execute',
        reason: `High confidence analytics (${Math.round(confidence * 100)}%)`
      };
    } else {
      return {
        action: 'confirm',
        reason: `Analytics needs confirmation (${Math.round(confidence * 100)}%)`
      };
    }
  }
  
  // Mutations: highest threshold
  if (category === 'mutation') {
    if (confidence >= THRESHOLDS.MUTATION_AUTO) {
      return {
        action: 'auto_execute',
        reason: `Very high confidence mutation (${Math.round(confidence * 100)}%)`
      };
    } else if (confidence >= THRESHOLDS.MUTATION_CONFIRM) {
      return {
        action: 'confirm',
        reason: `Mutation needs confirmation (${Math.round(confidence * 100)}%)`
      };
    } else {
      return {
        action: 'action_picker',
        reason: `Mutation confidence too low (${Math.round(confidence * 100)}%)`
      };
    }
  }
  
  // Fallback
  return {
    action: 'action_picker',
    reason: 'Fallback to action picker'
  };
}

// ============================================
// Exports for testing
// ============================================

export const POLICY_THRESHOLDS = THRESHOLDS;
