/**
 * Medication Effect Label Mapping (0-10 Score → German Text)
 * Used for displaying effect levels consistently across the app
 */

/**
 * Gets the effect label for a 0-10 score
 */
export function getEffectLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'Nicht bewertet';
  }

  if (score <= 1) return 'Keine Wirkung';
  if (score <= 3) return 'Gering';
  if (score <= 5) return 'Mittel';
  if (score <= 7) return 'Gut';
  if (score <= 9) return 'Sehr gut';
  return 'Perfekt';
}

export function getEffectColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'hsl(var(--muted))';
  
  if (score <= 1) return 'hsl(var(--destructive))';
  if (score <= 3) return 'hsl(0, 84%, 60%)';
  if (score <= 5) return 'hsl(24, 100%, 50%)';
  if (score <= 7) return 'hsl(45, 93%, 47%)';
  if (score <= 9) return 'hsl(142, 76%, 36%)';
  return 'hsl(var(--success))';
}

export function getEffectEmoji(score: number | null | undefined): string {
  if (score === null || score === undefined) return '⏳';
  
  if (score <= 1) return '❌';
  if (score <= 3) return '🔴';
  if (score <= 5) return '🟠';
  if (score <= 7) return '🟡';
  if (score <= 9) return '🟢';
  return '⭐';
}

/**
 * Gets the effective score from effect_score or effect_rating (for backwards compatibility)
 * Returns 0-10 scale
 */
export function getEffectiveScore(effect_score: number | null | undefined, effect_rating?: string | null): number | null {
  if (effect_score !== null && effect_score !== undefined) {
    return effect_score;
  }
  return effectRatingToScore(effect_rating);
}

/**
 * Converts old text-based effect_rating to numeric score (0-10)
 * For backwards compatibility with existing data
 */
export function effectRatingToScore(rating: string | null | undefined): number | null {
  if (!rating) return null;
  
  switch (rating) {
    case 'none': return 0;
    case 'poor': return 2;
    case 'moderate': return 5;
    case 'good': return 7;
    case 'very_good': return 9;
    default: return null;
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
