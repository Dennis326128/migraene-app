/**
 * Skill Registry - All Skills
 * 
 * Registriert alle verfügbaren Skills
 */

import { registerSkills, skillRegistry } from './registry';
import { navigationSkills } from './nav';
import { helpSkills } from './help';
import { querySkills } from './query';
import { actionSkills } from './action';

// ============================================
// Register All Skills
// ============================================

export function initializeSkills(): void {
  console.log('[Skills] Initializing skill registry...');
  
  // Navigation Skills
  registerSkills(navigationSkills);
  
  // Help Skills
  registerSkills(helpSkills);
  
  // Query Skills (Phase 2)
  registerSkills(querySkills);
  
  // Action Skills (Phase 3)
  registerSkills(actionSkills);
  
  console.log(`[Skills] Registered ${skillRegistry.getAll().length} skills`);
}

// ============================================
// Re-exports
// ============================================

export { skillRegistry, registerSkill, registerSkills, debugSkillMatches } from './registry';
export type { Skill, SkillMatchResult, SkillCategory, VoiceUserContext } from './types';
export { navigationSkills } from './nav';
export { helpSkills } from './help';
export { querySkills } from './query';
export { actionSkills } from './action';
