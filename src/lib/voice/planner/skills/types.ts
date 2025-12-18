/**
 * Skill Registry Types
 * 
 * Jede Skill definiert eine spezifische Voice-Aktion
 */

import type { VoicePlan, PlanDiagnostics } from '../types';

// ============================================
// Skill Categories
// ============================================

export type SkillCategory = 
  | 'NAV'      // Navigation zu einem Screen
  | 'QUERY'    // Daten abfragen (read-only)
  | 'ACTION'   // Daten erstellen
  | 'EDIT'     // Daten bearbeiten
  | 'DELETE'   // Daten löschen
  | 'RATE'     // Bewertung abgeben
  | 'HELP';    // Hilfe anzeigen

// ============================================
// Slot Definition
// ============================================

export interface SlotDefinition {
  name: string;
  type: 'string' | 'number' | 'date' | 'time' | 'medication' | 'timeRange' | 'rating';
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  suggestions?: string[];
}

// ============================================
// Match Result
// ============================================

export interface SkillMatchResult {
  confidence: number;
  slots: Record<string, unknown>;
  reasons: string[];
}

// ============================================
// User Context
// ============================================

export interface VoiceUserContext {
  userMeds: Array<{ id?: string; name: string }>;
  recentEntryIds?: number[];
  lastEntryId?: number;
  timezone?: string;
  language?: string;
}

// ============================================
// Skill Interface
// ============================================

export interface Skill {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Category for risk assessment */
  category: SkillCategory;
  
  /** Example phrases that trigger this skill */
  examples: string[];
  
  /** Required slots that must be filled */
  requiredSlots: SlotDefinition[];
  
  /** Optional slots */
  optionalSlots: SlotDefinition[];
  
  /** Keywords that strongly indicate this skill */
  keywords: string[];
  
  /** Anti-keywords that indicate this skill should NOT match */
  antiKeywords?: string[];
  
  /**
   * Match function: checks if transcript matches this skill
   * Returns confidence score and extracted slots
   */
  match(
    transcript: string,
    canonicalized: string,
    context: VoiceUserContext
  ): SkillMatchResult;
  
  /**
   * Build function: creates a VoicePlan from extracted slots
   */
  buildPlan(
    slots: Record<string, unknown>,
    context: VoiceUserContext,
    confidence: number
  ): VoicePlan;
}

// ============================================
// Skill Registry
// ============================================

export interface SkillRegistry {
  /** All registered skills */
  skills: Map<string, Skill>;
  
  /** Register a new skill */
  register(skill: Skill): void;
  
  /** Get skill by ID */
  get(id: string): Skill | undefined;
  
  /** Get all skills in a category */
  getByCategory(category: SkillCategory): Skill[];
  
  /** Find matching skills for a transcript */
  findMatches(
    transcript: string,
    canonicalized: string,
    context: VoiceUserContext
  ): Array<{
    skill: Skill;
    match: SkillMatchResult;
  }>;
}

// ============================================
// Skill Builder Helpers
// ============================================

export function createSlot(
  name: string,
  type: SlotDefinition['type'],
  required: boolean,
  options?: Partial<SlotDefinition>
): SlotDefinition {
  return {
    name,
    type,
    required,
    ...options,
  };
}

export function requiredSlot(
  name: string,
  type: SlotDefinition['type'],
  options?: Partial<SlotDefinition>
): SlotDefinition {
  return createSlot(name, type, true, options);
}

export function optionalSlot(
  name: string,
  type: SlotDefinition['type'],
  options?: Partial<SlotDefinition>
): SlotDefinition {
  return createSlot(name, type, false, options);
}

// ============================================
// Match Scoring Helpers
// ============================================

export function calculateKeywordScore(
  text: string,
  keywords: string[],
  antiKeywords: string[] = []
): number {
  const lower = text.toLowerCase();
  
  // Count keyword matches
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      matches++;
    }
  }
  
  // Penalty for anti-keywords
  let antiMatches = 0;
  for (const akw of antiKeywords) {
    if (lower.includes(akw.toLowerCase())) {
      antiMatches++;
    }
  }
  
  if (keywords.length === 0) return 0;
  
  const baseScore = matches / keywords.length;
  const penalty = antiMatches * 0.3;
  
  return Math.max(0, baseScore - penalty);
}

export function calculateExampleScore(
  text: string,
  examples: string[]
): number {
  const lower = text.toLowerCase();
  let bestScore = 0;
  
  for (const example of examples) {
    const exampleLower = example.toLowerCase();
    
    // Check word overlap
    const textWords = new Set(lower.split(/\s+/));
    const exampleWords = exampleLower.split(/\s+/);
    
    let overlap = 0;
    for (const word of exampleWords) {
      if (textWords.has(word)) {
        overlap++;
      }
    }
    
    const score = exampleWords.length > 0 
      ? overlap / exampleWords.length 
      : 0;
    
    if (score > bestScore) {
      bestScore = score;
    }
  }
  
  return bestScore;
}

export function combineScores(
  keywordScore: number,
  exampleScore: number,
  bonusScore: number = 0
): number {
  // Weight keyword matches higher than example matches
  const weighted = (keywordScore * 0.5) + (exampleScore * 0.3) + (bonusScore * 0.2);
  return Math.min(1, weighted);
}
