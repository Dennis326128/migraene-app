/**
 * Skill Registry Implementation
 * 
 * Zentrale Registry für alle Voice Skills
 */

import type { 
  Skill, 
  SkillRegistry, 
  SkillCategory, 
  SkillMatchResult,
  VoiceUserContext 
} from './types';

// ============================================
// Registry Implementation
// ============================================

class SkillRegistryImpl implements SkillRegistry {
  skills: Map<string, Skill> = new Map();
  
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      console.warn(`[SkillRegistry] Overwriting skill: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
    console.log(`[SkillRegistry] Registered skill: ${skill.id} (${skill.category})`);
  }
  
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }
  
  getByCategory(category: SkillCategory): Skill[] {
    return Array.from(this.skills.values())
      .filter(skill => skill.category === category);
  }
  
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }
  
  findMatches(
    transcript: string,
    canonicalized: string,
    context: VoiceUserContext
  ): Array<{ skill: Skill; match: SkillMatchResult }> {
    const matches: Array<{ skill: Skill; match: SkillMatchResult }> = [];
    
    for (const skill of this.skills.values()) {
      try {
        const match = skill.match(transcript, canonicalized, context);
        
        // Only include if confidence is above minimum threshold
        if (match.confidence > 0.2) {
          matches.push({ skill, match });
        }
      } catch (error) {
        console.error(`[SkillRegistry] Error matching skill ${skill.id}:`, error);
      }
    }
    
    // Sort by confidence descending
    matches.sort((a, b) => b.match.confidence - a.match.confidence);
    
    return matches;
  }
}

// ============================================
// Singleton Instance
// ============================================

export const skillRegistry = new SkillRegistryImpl();

// ============================================
// Registration Helper
// ============================================

export function registerSkill(skill: Skill): void {
  skillRegistry.register(skill);
}

export function registerSkills(skills: Skill[]): void {
  for (const skill of skills) {
    skillRegistry.register(skill);
  }
}

// ============================================
// Debug Helpers
// ============================================

export function debugSkillMatches(
  transcript: string,
  canonicalized: string,
  context: VoiceUserContext
): void {
  console.group('[SkillRegistry] Debug Match');
  console.log('Transcript:', transcript);
  console.log('Canonicalized:', canonicalized);
  
  const matches = skillRegistry.findMatches(transcript, canonicalized, context);
  
  console.log('Matches:', matches.length);
  for (const { skill, match } of matches.slice(0, 5)) {
    console.log(`  ${skill.id}: ${(match.confidence * 100).toFixed(1)}%`);
    console.log(`    Slots:`, match.slots);
    console.log(`    Reasons:`, match.reasons);
  }
  
  console.groupEnd();
}
