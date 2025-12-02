/**
 * Medication Effect Label Mapping (0-10 Score → German Text)
 * Used for displaying effect levels consistently across the app
 */

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
