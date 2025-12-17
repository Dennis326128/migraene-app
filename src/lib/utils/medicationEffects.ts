/**
 * Medication Effect Label Mapping (0-5 Score → German Text)
 * Used for displaying effect levels consistently across the app
 */

/**
 * Converts old 0-10 score to new 0-5 scale
 */
export function convertOldScoreToNew(oldScore: number | null | undefined): number {
  if (oldScore === null || oldScore === undefined) return 0;
  // Map 0-10 to 0-5: divide by 2 and round
  return Math.round(oldScore / 2);
}

/**
 * Converts old text-based effect_rating to numeric score (0-5)
 * For backwards compatibility with existing data
 */
export function effectRatingToScore(rating: string | null | undefined): number | null {
  if (!rating) return null;
  
  switch (rating) {
    case 'none': return 0;
    case 'poor': return 1;
    case 'moderate': return 2;
    case 'good': return 3;
    case 'very_good': return 4;
    default: return null;
  }
}

/**
 * Gets the effective score from effect_score or effect_rating (for backwards compatibility)
 * Returns 0-5 scale
 */
export function getEffectiveScore(effect_score: number | null | undefined, effect_rating?: string | null): number | null {
  if (effect_score !== null && effect_score !== undefined) {
    // If old 0-10 score, convert to 0-5
    if (effect_score > 5) {
      return convertOldScoreToNew(effect_score);
    }
    return effect_score;
  }
  return effectRatingToScore(effect_rating);
}

export function getEffectLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'Nicht bewertet';
  }

  switch (score) {
    case 0: return 'Keine Wirkung';
    case 1: return 'Gering';
    case 2: return 'Mittel';
    case 3: return 'Gut';
    case 4: return 'Sehr gut';
    case 5: return 'Perfekt';
    default: return 'Nicht bewertet';
  }
}

export function getEffectColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'hsl(var(--muted))';
  
  switch (score) {
    case 0: return 'hsl(var(--destructive))';
    case 1: return 'hsl(0, 84%, 60%)';
    case 2: return 'hsl(24, 100%, 50%)';
    case 3: return 'hsl(45, 93%, 47%)';
    case 4: return 'hsl(142, 76%, 36%)';
    case 5: return 'hsl(var(--success))';
    default: return 'hsl(var(--muted))';
  }
}

export function getEffectEmoji(score: number | null | undefined): string {
  if (score === null || score === undefined) return '⏳';
  
  switch (score) {
    case 0: return '❌';
    case 1: return '🔴';
    case 2: return '🟠';
    case 3: return '🟡';
    case 4: return '🟢';
    case 5: return '⭐';
    default: return '⏳';
  }
}

/**
 * Common side effects list for quick selection
 */
export const COMMON_SIDE_EFFECTS = [
  'Übelkeit',
  'Müdigkeit',
  'Schwindel',
  'Kopfschmerzen',
  'Magenschmerzen',
  'Herzrasen',
  'Schwitzen',
  'Durchfall',
  'Verstopfung',
  'Appetitlosigkeit',
  'Mundtrockenheit',
  'Schlafstörungen',
] as const;
