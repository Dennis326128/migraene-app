/**
 * ME/CFS Severity constants and mappings.
 * Central source of truth for label ↔ score conversions.
 */

export type MeCfsSeverityLevel = 'none' | 'mild' | 'moderate' | 'severe';

export interface MeCfsSeverityOption {
  label: string;
  level: MeCfsSeverityLevel;
  score: number;
}

/** MVP mapping: label → score (0/3/7/10) */
export const ME_CFS_OPTIONS: MeCfsSeverityOption[] = [
  { label: 'keine',  level: 'none',     score: 0 },
  { label: 'leicht', level: 'mild',     score: 3 },
  { label: 'mittel', level: 'moderate', score: 7 },
  { label: 'schwer', level: 'severe',   score: 10 },
];

export const ME_CFS_SCORE_TO_LEVEL: Record<number, MeCfsSeverityLevel> = {
  0: 'none',
  3: 'mild',
  7: 'moderate',
  10: 'severe',
};

export const ME_CFS_LEVEL_TO_SCORE: Record<MeCfsSeverityLevel, number> = {
  none: 0,
  mild: 3,
  moderate: 7,
  severe: 10,
};

/**
 * Derive the closest severity level from any 0–10 score.
 * Used for future slider support.
 */
export function scoreToLevel(score: number): MeCfsSeverityLevel {
  if (score <= 1) return 'none';
  if (score <= 5) return 'mild';
  if (score <= 8) return 'moderate';
  return 'severe';
}

/**
 * Derive label (DE) from score.
 */
export function scoreToLabel(score: number): string {
  const opt = ME_CFS_OPTIONS.find(o => o.score === score);
  if (opt) return opt.label;
  // Fallback for future slider values
  const level = scoreToLevel(score);
  return ME_CFS_OPTIONS.find(o => o.level === level)?.label ?? 'keine';
}
