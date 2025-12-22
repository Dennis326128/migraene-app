/**
 * HIT-6™ Fragebogen - Offizielle DE Version 1.1
 * 
 * Scoring und Texte exakt nach QualityMetric/GlaxoSmithKline Vorlage.
 * ©2000, 2001 QualityMetric, Inc. and GlaxoSmithKline Group of Companie(s)
 */

// Type-safe answer options
export type Hit6Answer = 'nie' | 'selten' | 'manchmal' | 'sehr_oft' | 'immer';

// Scoring: Spalten 1-5 (6, 8, 10, 11, 13 Punkte)
export const HIT6_SCORES: Record<Hit6Answer, number> = {
  nie: 6,
  selten: 8,
  manchmal: 10,
  sehr_oft: 11,
  immer: 13,
} as const;

// Answer labels for UI display
export const HIT6_ANSWER_LABELS: Record<Hit6Answer, string> = {
  nie: 'Nie',
  selten: 'Selten',
  manchmal: 'Manchmal',
  sehr_oft: 'Sehr oft',
  immer: 'Immer',
} as const;

// All answer options in order
export const HIT6_ANSWER_OPTIONS: Hit6Answer[] = [
  'nie',
  'selten',
  'manchmal',
  'sehr_oft',
  'immer',
] as const;

// Question keys
export type Hit6QuestionKey = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6';

// Official German questions (HIT-6™ Germany German Version 1.1)
export const HIT6_QUESTIONS: Record<Hit6QuestionKey, string> = {
  q1: 'Wenn Sie Kopfschmerzen haben, wie oft sind die Schmerzen stark?',
  q2: 'Wie oft werden Sie durch Kopfschmerzen in Ihren normalen täglichen Aktivitäten eingeschränkt, z.B. in der Hausarbeit, im Beruf, in der Schule/im Studium, oder bei Kontakten und Unternehmungen mit anderen Menschen?',
  q3: 'Wenn Sie Kopfschmerzen haben, wie oft wünschen Sie sich, dass Sie sich hinlegen könnten?',
  q4: 'Wie oft fühlten Sie sich in den letzten 4 Wochen aufgrund von Kopfschmerzen zu müde zum Arbeiten oder für Ihre täglichen Aktivitäten?',
  q5: 'Wie oft waren Sie in den letzten 4 Wochen aufgrund von Kopfschmerzen gereizt oder hatten alles satt?',
  q6: 'Wie oft haben Kopfschmerzen in den letzten 4 Wochen Ihre Fähigkeit eingeschränkt, sich auf die Arbeit oder die täglichen Aktivitäten zu konzentrieren?',
} as const;

// Question keys in order
export const HIT6_QUESTION_KEYS: Hit6QuestionKey[] = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

// Answer record type
export type Hit6Answers = Record<Hit6QuestionKey, Hit6Answer | null>;

// Empty answers
export const EMPTY_HIT6_ANSWERS: Hit6Answers = {
  q1: null,
  q2: null,
  q3: null,
  q4: null,
  q5: null,
  q6: null,
};

/**
 * Calculate HIT-6 total score
 * @returns score 36-78 or null if incomplete
 */
export function calculateHit6Score(answers: Hit6Answers): number | null {
  const allAnswered = HIT6_QUESTION_KEYS.every(key => answers[key] !== null);
  if (!allAnswered) return null;
  
  return HIT6_QUESTION_KEYS.reduce((total, key) => {
    const answer = answers[key];
    if (!answer) return total;
    return total + HIT6_SCORES[answer];
  }, 0);
}

/**
 * Check if all questions are answered
 */
export function isHit6Complete(answers: Hit6Answers): boolean {
  return HIT6_QUESTION_KEYS.every(key => answers[key] !== null);
}

// PDF text constants - official wording
export const HIT6_PDF_TITLE = 'HIT-6™ FRAGEBOGEN ZU AUSWIRKUNGEN VON KOPFSCHMERZEN';

export const HIT6_PDF_INSTRUCTION = `Dieser Fragebogen soll Ihnen dabei helfen, die Auswirkungen Ihrer Kopfschmerzen auf Ihren Alltag zu beschreiben und Ihrem Arzt/Ihrer Ärztin mitzuteilen.

Bitte kreuzen Sie zu jeder Frage eine der folgenden Antworten an:`;

export const HIT6_PDF_SCORING_INSTRUCTION = `Auswertung
Um den Gesamtwert Ihres HIT-6™ zu erfahren, schreiben Sie für jede der von Ihnen gemachten Ankreuzungen die Punktzahl, die über den von Ihnen angekreuzten Antworten steht, in die rechte Spalte. Sie können den Wert für jede Spalte in der folgenden Zeile ablesen:

Spalte 1 (je Kreuz 6 Punkte)
Spalte 2 (je Kreuz 8 Punkte)
Spalte 3 (je Kreuz 10 Punkte)
Spalte 4 (je Kreuz 11 Punkte)
Spalte 5 (je Kreuz 13 Punkte)

Addieren Sie dann bitte die Zahlen in der rechten Spalte.`;

export const HIT6_PDF_INTERPRETATION = `Eine höhere Punktzahl bedeutet stärkere Auswirkungen der Kopfschmerzen auf Ihr Leben.
Die Punktzahlen liegen zwischen 36 und 78.`;

export const HIT6_PDF_COPYRIGHT = 'HIT-6™ Germany (German) Version 1.1\n©2000, 2001 QualityMetric, Inc. and GlaxoSmithKline Group of Companie(s)';
