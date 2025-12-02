/**
 * Medication Effect Label Mapping (0-10 Score → German Text)
 * Used for displaying effect levels consistently across the app
 */

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
 * Gets the effective score from effect_score or effect_rating (for backwards compatibility)
 */
export function getEffectiveScore(effect_score: number | null | undefined, effect_rating?: string | null): number | null {
  if (effect_score !== null && effect_score !== undefined) {
    return effect_score;
  }
  return effectRatingToScore(effect_rating);
}

export function getEffectLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'Nicht bewertet';
  }

  if (score === 0) return 'Keine Wirkung';
  if (score <= 2) return 'Kaum geholfen';
  if (score <= 4) return 'Wenig geholfen';
  if (score <= 6) return 'Mäßig geholfen';
  if (score <= 8) return 'Gut geholfen';
  if (score <= 9) return 'Sehr gut geholfen';
  return 'Nahezu beschwerdefrei';
}

export function getEffectColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'hsl(var(--muted))';
  if (score === 0) return 'hsl(var(--destructive))';
  if (score <= 2) return 'hsl(0, 84%, 60%)';
  if (score <= 4) return 'hsl(24, 100%, 50%)';
  if (score <= 6) return 'hsl(45, 93%, 47%)';
  if (score <= 8) return 'hsl(142, 76%, 36%)';
  return 'hsl(var(--success))';
}

export function getEffectEmoji(score: number | null | undefined): string {
  if (score === null || score === undefined) return '⏳';
  if (score === 0) return '❌';
  if (score <= 2) return '🔴';
  if (score <= 4) return '🟠';
  if (score <= 6) return '🟡';
  if (score <= 8) return '🟢';
  if (score <= 9) return '✅';
  return '⭐';
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
