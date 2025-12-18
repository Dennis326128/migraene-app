/**
 * Help Skill
 * 
 * Zeigt Hilfe und verfügbare Befehle an
 */

import type { Skill, SkillMatchResult, VoiceUserContext } from '../types';
import type { NavigatePlan } from '../../types';
import { OPERATORS } from '../../lexicon/de';
import { calculateKeywordScore, calculateExampleScore, combineScores } from '../types';

// ============================================
// Help Skill
// ============================================

export const helpSkill: Skill = {
  id: 'help',
  name: 'Hilfe',
  category: 'HELP',
  
  examples: [
    'hilfe',
    'was kann ich sagen',
    'welche befehle gibt es',
    'wie funktioniert das',
    'zeige mir die befehle',
    'was kannst du',
    'hilf mir',
    'anleitung',
    'tutorial',
  ],
  
  requiredSlots: [],
  optionalSlots: [],
  
  keywords: [
    'hilfe', 'help', 
    'befehle', 'kommandos', 'funktionen',
    'anleitung', 'tutorial',
    'wie', 'was', 'kannst',
  ],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const reasons: string[] = [];
    
    // Check for help operator words
    const hasHelpOperator = OPERATORS.HELP.some(op => 
      canonicalized.includes(op.toLowerCase())
    );
    if (hasHelpOperator) {
      reasons.push('HELP operator detected');
    }
    
    // Direct "hilfe" match is very strong
    if (canonicalized.includes('hilfe') || canonicalized.includes('help')) {
      return {
        confidence: 0.95,
        slots: {},
        reasons: ['Direct help keyword'],
      };
    }
    
    // "was kann ich sagen" pattern
    if (/was\s+kann\s+ich\s+(hier\s+)?sagen/.test(canonicalized)) {
      return {
        confidence: 0.95,
        slots: {},
        reasons: ['Help phrase pattern'],
      };
    }
    
    // "wie funktioniert" pattern
    if (/wie\s+funktioniert/.test(canonicalized)) {
      return {
        confidence: 0.85,
        slots: {},
        reasons: ['How-to pattern'],
      };
    }
    
    // Calculate scores
    const keywordScore = calculateKeywordScore(canonicalized, this.keywords);
    const exampleScore = calculateExampleScore(canonicalized, this.examples);
    
    const confidence = combineScores(keywordScore, exampleScore, hasHelpOperator ? 0.2 : 0);
    
    return {
      confidence,
      slots: {},
      reasons,
    };
  },
  
  buildPlan(slots: Record<string, unknown>, context: VoiceUserContext, confidence: number): NavigatePlan {
    return {
      kind: 'navigate',
      targetView: 'settings', // Help is shown as overlay, but we navigate to settings as fallback
      payload: { showHelp: true },
      summary: 'Hilfe anzeigen',
      confidence,
    };
  },
};

// ============================================
// Export
// ============================================

export const helpSkills: Skill[] = [helpSkill];
