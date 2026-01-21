/**
 * Daily Impact Check Constants
 * Alltagsbelastung durch Kopfschmerzen - Eigener Kurzcheck
 * 
 * WICHTIG: Dies ist ein eigenständiger Fragebogen, KEIN HIT-6 Klon!
 * - 7 eigene Fragen (nicht 6)
 * - Eigene Formulierungen
 * - Eigene Skala 0-4 (nicht 6-13)
 * - Eigener Score 0-28 (nicht 36-78)
 */

// ═══════════════════════════════════════════════════════════════════════════
// FRAGEN (7 Stück, eigenständig formuliert)
// ═══════════════════════════════════════════════════════════════════════════

export const DAILY_IMPACT_QUESTION_KEYS = [
  'q1_overall',
  'q2_work',
  'q3_rest',
  'q4_fatigue',
  'q5_mood',
  'q6_concentration',
  'q7_control',
] as const;

export type DailyImpactQuestionKey = typeof DAILY_IMPACT_QUESTION_KEYS[number];

export const DAILY_IMPACT_QUESTIONS: Record<DailyImpactQuestionKey, string> = {
  q1_overall: 'Wie stark haben dich Kopfschmerzen insgesamt im Alltag belastet?',
  q2_work: 'Wie sehr haben dich Kopfschmerzen bei Arbeit/Haushalt/Schule/Studium eingeschränkt?',
  q3_rest: 'Wie oft hattest du wegen Kopfschmerzen das Bedürfnis, dich hinzulegen oder zurückzuziehen?',
  q4_fatigue: 'Wie erschöpft oder müde hast du dich durch Kopfschmerzen gefühlt?',
  q5_mood: 'Wie stark haben Kopfschmerzen deine Stimmung beeinflusst (z. B. gereizt, genervt)?',
  q6_concentration: 'Wie sehr haben Kopfschmerzen deine Konzentration beeinträchtigt?',
  q7_control: 'Wie stark hattest du das Gefühl, dass Kopfschmerzen deinen Tag „bestimmen"?',
};

// ═══════════════════════════════════════════════════════════════════════════
// ANTWORTOPTIONEN (5 Stufen, 0-4)
// ═══════════════════════════════════════════════════════════════════════════

export type DailyImpactAnswer = 0 | 1 | 2 | 3 | 4;

export const DAILY_IMPACT_ANSWER_OPTIONS: DailyImpactAnswer[] = [0, 1, 2, 3, 4];

export const DAILY_IMPACT_ANSWER_LABELS: Record<DailyImpactAnswer, string> = {
  0: 'gar nicht',
  1: 'leicht',
  2: 'mittel',
  3: 'stark',
  4: 'sehr stark',
};

// ═══════════════════════════════════════════════════════════════════════════
// ANTWORT-OBJEKT
// ═══════════════════════════════════════════════════════════════════════════

export type DailyImpactAnswers = Record<DailyImpactQuestionKey, DailyImpactAnswer | null>;

export const EMPTY_DAILY_IMPACT_ANSWERS: DailyImpactAnswers = {
  q1_overall: null,
  q2_work: null,
  q3_rest: null,
  q4_fatigue: null,
  q5_mood: null,
  q6_concentration: null,
  q7_control: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// SCORE-BERECHNUNG (eigene Logik, 0-28)
// ═══════════════════════════════════════════════════════════════════════════

export function calculateDailyImpactScore(answers: DailyImpactAnswers): number | null {
  const values = DAILY_IMPACT_QUESTION_KEYS.map(k => answers[k]);
  
  // Alle Fragen müssen beantwortet sein
  if (values.some(v => v === null)) return null;
  
  // Summe: 7 Fragen × max 4 = max 28
  return values.reduce((sum, v) => sum + (v ?? 0), 0);
}

export function isDailyImpactComplete(answers: DailyImpactAnswers): boolean {
  return DAILY_IMPACT_QUESTION_KEYS.every(k => answers[k] !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// BELASTUNGS-KATEGORIE (für Nutzerfreundlichkeit)
// ═══════════════════════════════════════════════════════════════════════════

export type ImpactCategory = 'low' | 'medium' | 'high';

export function getImpactCategory(score: number): ImpactCategory {
  if (score <= 6) return 'low';
  if (score <= 15) return 'medium';
  return 'high';
}

export const IMPACT_CATEGORY_LABELS: Record<ImpactCategory, string> = {
  low: 'geringe Belastung',
  medium: 'mittlere Belastung',
  high: 'hohe Belastung',
};
