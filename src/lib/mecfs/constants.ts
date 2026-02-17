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

/** Mapping: label → score (0/3/6/9) – 4 diskrete Stufen mit klarem Abstand */
export const ME_CFS_OPTIONS: MeCfsSeverityOption[] = [
  { label: 'keine',  level: 'none',     score: 0 },
  { label: 'leicht', level: 'mild',     score: 3 },
  { label: 'mittel', level: 'moderate', score: 6 },
  { label: 'schwer', level: 'severe',   score: 9 },
];

export const ME_CFS_SCORE_TO_LEVEL: Record<number, MeCfsSeverityLevel> = {
  0: 'none',
  3: 'mild',
  6: 'moderate',
  9: 'severe',
};

export const ME_CFS_LEVEL_TO_SCORE: Record<MeCfsSeverityLevel, number> = {
  none: 0,
  mild: 3,
  moderate: 6,
  severe: 9,
};

/**
 * Derive the closest severity level from any 0–10 score.
 * Bucket-based: works for both 4-step selector AND future slider.
 * Clamps input to 0..10.
 */
export function scoreToLevel(score: number): MeCfsSeverityLevel {
  const clamped = Math.max(0, Math.min(10, score));
  if (clamped <= 0) return 'none';
  if (clamped <= 4) return 'mild';
  if (clamped <= 7) return 'moderate';
  return 'severe';
}

/** German label for a severity level */
export function levelToLabelDe(level: MeCfsSeverityLevel): string {
  const opt = ME_CFS_OPTIONS.find(o => o.level === level);
  return opt?.label ?? 'keine';
}

/**
 * Derive label (DE) from score via bucket mapping.
 * Works for any 0–10 value (not just {0,3,6,9}).
 */
export function scoreToLabel(score: number): string {
  return levelToLabelDe(scoreToLevel(score));
}
