/**
 * Voice Golden Dataset – Tagged test corpus (K1..K10)
 * 
 * Each case covers a real-world pattern class.
 * Used by the voice quality metrics runner for CI gates.
 */

import type { UserMedication } from '../medicationFuzzyMatch';

// ============================================
// Types
// ============================================

export type PatternClass = 
  | 'K1'  // Schmerz-Descriptor ohne Zahl
  | 'K2'  // Schmerz mit Zahl
  | 'K3'  // Schmerz + Medikament
  | 'K4'  // Voller Alltagssatz
  | 'K5'  // Zeit + Schmerz (+ optional Med)
  | 'K6'  // Kontext ohne Schmerz (DARF NICHT triggern)
  | 'K7'  // STT-Fehler bei Pain-Context
  | 'K8'  // STT-Fehler bei Medikamenten
  | 'K9'  // Mischmasch / echtes Leben
  | 'K10'; // Negation / Kein Medikament

export interface GoldenExpected {
  pain: { value: number | null; isEstimated?: boolean };
  time?: { kind?: 'absolute' | 'relative' | 'none'; relative_minutes?: number };
  medications?: string[]; // expected canonical names (partial match ok)
  entry_type: 'new_entry' | 'context_entry';
  notes: {
    mustContain?: string[];
    mustNotContain?: string[];
    canBeEmpty?: boolean;
    mustBeEmpty?: boolean;
  };
}

export interface GoldenCase {
  id: string;
  classTag: PatternClass;
  transcript: string;
  expected: GoldenExpected;
}

// ============================================
// Standard User Medication List
// ============================================

export const GOLDEN_USER_MEDS: UserMedication[] = [
  { id: 'med-1', name: 'Ibuprofen 400 mg', wirkstoff: 'Ibuprofen' },
  { id: 'med-2', name: 'Sumatriptan 50 mg', wirkstoff: 'Sumatriptan' },
  { id: 'med-3', name: 'Naproxen 500 mg', wirkstoff: 'Naproxen' },
  { id: 'med-4', name: 'Paracetamol 500 mg', wirkstoff: 'Paracetamol' },
  { id: 'med-5', name: 'Rizatriptan 10 mg', wirkstoff: 'Rizatriptan' },
  { id: 'med-6', name: 'Ibuprofen 800 mg', wirkstoff: 'Ibuprofen' },
  { id: 'med-7', name: 'Sumatriptan 100 mg', wirkstoff: 'Sumatriptan' },
  { id: 'med-8', name: 'Almotriptan 12,5 mg', wirkstoff: 'Almotriptan' },
];

// ============================================
// Golden Dataset
// ============================================

export const GOLDEN_DATASET: GoldenCase[] = [
  // ================================================
  // K1: Schmerz-Descriptor ohne Zahl (20 cases)
  // ================================================
  { id: 'K1-01', classTag: 'K1', transcript: 'sehr starke Schmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-02', classTag: 'K1', transcript: 'leichte Kopfschmerzen', expected: { pain: { value: 3, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-03', classTag: 'K1', transcript: 'mittelstarke Migräne', expected: { pain: { value: 5, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-04', classTag: 'K1', transcript: 'extreme Kopfschmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-05', classTag: 'K1', transcript: 'starke Schmerzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-06', classTag: 'K1', transcript: 'heftige Migräne', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-07', classTag: 'K1', transcript: 'schlimme Kopfschmerzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-08', classTag: 'K1', transcript: 'brutale Migräne', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-09', classTag: 'K1', transcript: 'höllische Kopfschmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-10', classTag: 'K1', transcript: 'kaum spürbare Kopfschmerzen', expected: { pain: { value: 1, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-11', classTag: 'K1', transcript: 'unerträgliche Schmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-12', classTag: 'K1', transcript: 'moderate Kopfschmerzen', expected: { pain: { value: 5, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-13', classTag: 'K1', transcript: 'schwache Schmerzen', expected: { pain: { value: 3, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-14', classTag: 'K1', transcript: 'keine Kopfschmerzen', expected: { pain: { value: 0 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-15', classTag: 'K1', transcript: 'massive Migräne', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-16', classTag: 'K1', transcript: 'ein bisschen Kopfschmerzen', expected: { pain: { value: 3, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-17', classTag: 'K1', transcript: 'so mittel Kopfweh', expected: { pain: { value: 5, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-18', classTag: 'K1', transcript: 'mäßige Kopfschmerzen', expected: { pain: { value: 5, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-19', classTag: 'K1', transcript: 'dezente Schmerzen', expected: { pain: { value: 3, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K1-20', classTag: 'K1', transcript: 'richtig schlimme Migräne', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K2: Schmerz mit Zahl (20 cases)
  // ================================================
  { id: 'K2-01', classTag: 'K2', transcript: 'Schmerzstärke 7', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-02', classTag: 'K2', transcript: 'Stärke fünf', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-03', classTag: 'K2', transcript: 'Kopfschmerzen 7 von 10', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-04', classTag: 'K2', transcript: 'Migräne 8/10', expected: { pain: { value: 8 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-05', classTag: 'K2', transcript: 'Kopfschmerzen bei 6', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-06', classTag: 'K2', transcript: 'Migräne auf 8', expected: { pain: { value: 8 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-07', classTag: 'K2', transcript: 'Schmerz Level 4', expected: { pain: { value: 4 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-08', classTag: 'K2', transcript: 'Intensität sechs', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-09', classTag: 'K2', transcript: 'Schmerzstärke acht auf zehn', expected: { pain: { value: 8 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-10', classTag: 'K2', transcript: 'Schmerzskala 3', expected: { pain: { value: 3 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-11', classTag: 'K2', transcript: 'Kopfschmerzen Stärke 9', expected: { pain: { value: 9 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-12', classTag: 'K2', transcript: 'Schmerzstärke sieben', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-13', classTag: 'K2', transcript: 'Stärke 3', expected: { pain: { value: 3 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-14', classTag: 'K2', transcript: 'Schmerzen 5 von 10', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-15', classTag: 'K2', transcript: 'Kopfschmerzen 4 auf 10', expected: { pain: { value: 4 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-16', classTag: 'K2', transcript: 'Schmerzstärke fünf', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-17', classTag: 'K2', transcript: 'Migräne Level 6', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-18', classTag: 'K2', transcript: 'Schmerzen bei 7', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-19', classTag: 'K2', transcript: 'Kopfschmerzen 10 von 10', expected: { pain: { value: 10 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K2-20', classTag: 'K2', transcript: 'Stärke zwei', expected: { pain: { value: 2 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K3: Schmerz + Medikament (25 cases)
  // ================================================
  { id: 'K3-01', classTag: 'K3', transcript: 'starke Kopfschmerzen Sumatriptan genommen', expected: { pain: { value: 7, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-02', classTag: 'K3', transcript: 'Migräne Ibuprofen 800 mg', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-03', classTag: 'K3', transcript: 'Schmerzstärke 7 Ibuprofen', expected: { pain: { value: 7 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-04', classTag: 'K3', transcript: 'Kopfschmerzen Stärke 5 Sumatriptan und Ibuprofen', expected: { pain: { value: 5 }, medications: ['Sumatriptan', 'Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-05', classTag: 'K3', transcript: 'heftige Migräne Rizatriptan genommen', expected: { pain: { value: 7, isEstimated: true }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-06', classTag: 'K3', transcript: 'Paracetamol genommen wegen Kopfschmerzen', expected: { pain: { value: null }, medications: ['Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K3-07', classTag: 'K3', transcript: 'Ibuprofen 400 mg genommen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-08', classTag: 'K3', transcript: 'mittelstarke Schmerzen eine Sumatriptan', expected: { pain: { value: 5, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-09', classTag: 'K3', transcript: 'Schmerzstärke 8 halbe Ibuprofen', expected: { pain: { value: 8 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-10', classTag: 'K3', transcript: 'extreme Kopfschmerzen zwei Tabletten Ibuprofen', expected: { pain: { value: 9, isEstimated: true }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-11', classTag: 'K3', transcript: 'Naproxen genommen Stärke 6', expected: { pain: { value: 6 }, medications: ['Naproxen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-12', classTag: 'K3', transcript: 'leichte Kopfschmerzen Paracetamol 500 mg', expected: { pain: { value: 3, isEstimated: true }, medications: ['Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-13', classTag: 'K3', transcript: 'Ibuprofen 800 Stärke 7', expected: { pain: { value: 7 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-14', classTag: 'K3', transcript: 'Sumatriptan eingenommen starke Migräne', expected: { pain: { value: 7, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-15', classTag: 'K3', transcript: 'Kopfschmerzen 6 von 10 Rizatriptan', expected: { pain: { value: 6 }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-16', classTag: 'K3', transcript: 'starke Kopfschmerzen Ibuprofen wegen Stress', expected: { pain: { value: 7, isEstimated: true }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustContain: ['Stress'], mustNotContain: ['Kopfschmerzen', 'Ibuprofen', 'genommen'] } } },
  { id: 'K3-17', classTag: 'K3', transcript: 'Kopfschmerzen Ibuprofen und Übelkeit', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustContain: ['Übelkeit'] } } },
  { id: 'K3-18', classTag: 'K3', transcript: 'schlimme Migräne Almotriptan genommen', expected: { pain: { value: 7, isEstimated: true }, medications: ['Almotriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-19', classTag: 'K3', transcript: 'sehr starke Schmerzen und eine Sumatriptan 100 mg', expected: { pain: { value: 9, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-20', classTag: 'K3', transcript: 'Ibuprofen und Sumatriptan genommen Stärke 7', expected: { pain: { value: 7 }, medications: ['Ibuprofen', 'Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-21', classTag: 'K3', transcript: 'Kopfschmerzen Schmerzstärke 5 Ibuprofen 800 mg', expected: { pain: { value: 5 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-22', classTag: 'K3', transcript: 'mittelstarke Kopfschmerzen und eine Ibuprofen 800 mg', expected: { pain: { value: 5, isEstimated: true }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-23', classTag: 'K3', transcript: 'starke Migräne Sumatriptan Übelkeit und Lichtempfindlichkeit', expected: { pain: { value: 7, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustContain: ['Lichtempfindlichkeit'], mustNotContain: ['Sumatriptan', 'starke', 'Migräne'] } } },
  { id: 'K3-24', classTag: 'K3', transcript: 'Paracetamol und Ibuprofen genommen Kopfschmerzen', expected: { pain: { value: null }, medications: ['Paracetamol', 'Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K3-25', classTag: 'K3', transcript: 'Rizatriptan 10 mg Schmerzstärke 8', expected: { pain: { value: 8 }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K4: Voller Alltagssatz (20 cases)
  // ================================================
  { id: 'K4-01', classTag: 'K4', transcript: 'ich habe sehr starke Kopfschmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-02', classTag: 'K4', transcript: 'ich hab leichte Migräne', expected: { pain: { value: 3, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-03', classTag: 'K4', transcript: 'ich habe gerade mittelstarke Kopfschmerzen und eine Ibuprofen 800 mg', expected: { pain: { value: 5, isEstimated: true }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-04', classTag: 'K4', transcript: 'ich habe starke Schmerzen und Übelkeit', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustContain: ['Übelkeit'], mustNotContain: ['ich habe', 'starke', 'Schmerzen'] } } },
  { id: 'K4-05', classTag: 'K4', transcript: 'mir ist schlecht und ich habe Kopfschmerzen', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustContain: ['schlecht'] } } },
  { id: 'K4-06', classTag: 'K4', transcript: 'es ist gerade sehr schlimm mit den Kopfschmerzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-07', classTag: 'K4', transcript: 'ich hab Sumatriptan genommen wegen Migräne', expected: { pain: { value: null }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K4-08', classTag: 'K4', transcript: 'ich habe wegen Stress Kopfschmerzen', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustContain: ['Stress'], mustNotContain: ['ich habe'] } } },
  { id: 'K4-09', classTag: 'K4', transcript: 'habe gerade sehr starke Kopfschmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-10', classTag: 'K4', transcript: 'ich habe', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-11', classTag: 'K4', transcript: 'ich habe gerade', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-12', classTag: 'K4', transcript: 'ich hab sehr starke Schmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-13', classTag: 'K4', transcript: 'ich habe Kopfschmerzen Schmerzstärke 6', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-14', classTag: 'K4', transcript: 'ich habe starke Kopfschmerzen und lichtempfindlich', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustContain: ['lichtempfindlich'], mustNotContain: ['ich habe'] } } },
  { id: 'K4-15', classTag: 'K4', transcript: 'es hämmert im Kopf', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { canBeEmpty: false } } },
  { id: 'K4-16', classTag: 'K4', transcript: 'ich hab mir eine Ibuprofen genommen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true, mustNotContain: ['ich hab', 'genommen'] } } },
  { id: 'K4-17', classTag: 'K4', transcript: 'das ist gerade eine 7 auf der Schmerzskala', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-18', classTag: 'K4', transcript: 'ich hab mittelstarke Migräne und Sumatriptan genommen', expected: { pain: { value: 5, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K4-19', classTag: 'K4', transcript: 'mir geht es nicht gut ich habe starke Kopfschmerzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K4-20', classTag: 'K4', transcript: 'ich hab gerade Ibuprofen 400 eingenommen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K5: Zeit + Schmerz (+ optional Med) (20 cases)
  // ================================================
  { id: 'K5-01', classTag: 'K5', transcript: 'seit 30 Minuten Kopfschmerzen', expected: { pain: { value: null }, time: { kind: 'relative', relative_minutes: 30 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-02', classTag: 'K5', transcript: 'vor 2 Stunden starke Migräne', expected: { pain: { value: 7, isEstimated: true }, time: { kind: 'relative', relative_minutes: 120 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-03', classTag: 'K5', transcript: 'vor 10 Minuten Schmerzstärke 5 Ibuprofen 800 mg', expected: { pain: { value: 5 }, time: { kind: 'relative', relative_minutes: 10 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-04', classTag: 'K5', transcript: 'heute Morgen Kopfschmerzen angefangen', expected: { pain: { value: null }, time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K5-05', classTag: 'K5', transcript: 'gestern Abend Migräne Stärke 8', expected: { pain: { value: 8 }, time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-06', classTag: 'K5', transcript: 'um 14:30 Kopfschmerzen Intensität sechs Sumatriptan', expected: { pain: { value: 6 }, time: { kind: 'absolute' }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-07', classTag: 'K5', transcript: 'vor einer Stunde Kopfschmerzen Stärke 4', expected: { pain: { value: 4 }, time: { kind: 'relative', relative_minutes: 60 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-08', classTag: 'K5', transcript: 'seit heute früh Migräne', expected: { pain: { value: null }, time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-09', classTag: 'K5', transcript: 'vor einer halben Stunde Ibuprofen genommen', expected: { pain: { value: null }, time: { kind: 'relative', relative_minutes: 30 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-10', classTag: 'K5', transcript: 'vor einer Viertelstunde Kopfschmerzen angefangen', expected: { pain: { value: null }, time: { kind: 'relative', relative_minutes: 15 }, entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K5-11', classTag: 'K5', transcript: 'seit 2 Stunden leichte Kopfschmerzen', expected: { pain: { value: 3, isEstimated: true }, time: { kind: 'relative', relative_minutes: 120 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-12', classTag: 'K5', transcript: 'vor 45 Minuten Schmerzstärke 6', expected: { pain: { value: 6 }, time: { kind: 'relative', relative_minutes: 45 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-13', classTag: 'K5', transcript: 'gestern Mittag heftige Migräne Sumatriptan genommen', expected: { pain: { value: 7, isEstimated: true }, time: { kind: 'absolute' }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-14', classTag: 'K5', transcript: 'seit anderthalb Stunden Kopfschmerzen', expected: { pain: { value: null }, time: { kind: 'relative', relative_minutes: 90 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-15', classTag: 'K5', transcript: 'um 8 Uhr Kopfschmerzen Stärke 5', expected: { pain: { value: 5 }, time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-16', classTag: 'K5', transcript: 'heute Nachmittag starke Migräne Ibuprofen', expected: { pain: { value: 7, isEstimated: true }, time: { kind: 'absolute' }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-17', classTag: 'K5', transcript: 'halb drei nachmittags Kopfschmerzen Stärke 7', expected: { pain: { value: 7 }, time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-18', classTag: 'K5', transcript: 'vor 5 Minuten leichte Kopfschmerzen', expected: { pain: { value: 3, isEstimated: true }, time: { kind: 'relative', relative_minutes: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-19', classTag: 'K5', transcript: 'seit heute morgen Schmerzstärke 4 Paracetamol', expected: { pain: { value: 4 }, time: { kind: 'absolute' }, medications: ['Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K5-20', classTag: 'K5', transcript: 'letzte Nacht Migräne Stärke 8 Rizatriptan', expected: { pain: { value: 8 }, time: { kind: 'absolute' }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K6: Kontext ohne Schmerz – DARF NICHT Schmerz triggern (20 cases)
  // ================================================
  { id: 'K6-01', classTag: 'K6', transcript: 'sehr stark gestresst', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-02', classTag: 'K6', transcript: 'extrem müde heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-03', classTag: 'K6', transcript: 'schlecht geschlafen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-04', classTag: 'K6', transcript: 'wenig geschlafen und Stress', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-05', classTag: 'K6', transcript: 'Wetter war schlecht', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-06', classTag: 'K6', transcript: 'Trigger: wenig geschlafen und Stress im Büro', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { mustContain: ['geschlafen'] } } },
  { id: 'K6-07', classTag: 'K6', transcript: 'viel Kaffee getrunken', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-08', classTag: 'K6', transcript: 'Wetterumschwung heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-09', classTag: 'K6', transcript: 'Periode begonnen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-10', classTag: 'K6', transcript: 'leicht übel', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-11', classTag: 'K6', transcript: 'viel gearbeitet heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-12', classTag: 'K6', transcript: 'Alkohol gestern Abend', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-13', classTag: 'K6', transcript: 'Sport gemacht', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-14', classTag: 'K6', transcript: 'ich bin sehr stark gestresst', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-15', classTag: 'K6', transcript: 'habe gut geschlafen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-16', classTag: 'K6', transcript: 'Ich glaube es ist wieder schlimmer geworden', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-17', classTag: 'K6', transcript: 'starker Wind heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-18', classTag: 'K6', transcript: 'Menstruation seit gestern', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-19', classTag: 'K6', transcript: 'dehydriert seit gestern', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-20', classTag: 'K6', transcript: 'Föhn heute den ganzen Tag', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  // 20 additional K6 cases (K6-21 to K6-40) – realistic context, must NOT trigger pain
  { id: 'K6-21', classTag: 'K6', transcript: 'Bildschirmarbeit den ganzen Tag', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-22', classTag: 'K6', transcript: 'Nacken steif seit heute morgen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-23', classTag: 'K6', transcript: 'spät ins Bett gegangen gestern', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-24', classTag: 'K6', transcript: 'Stress auf der Arbeit gehabt', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-25', classTag: 'K6', transcript: 'wenig getrunken den ganzen Tag', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-26', classTag: 'K6', transcript: 'Rotwein getrunken gestern Abend', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-27', classTag: 'K6', transcript: 'Föhnlage seit drei Tagen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-28', classTag: 'K6', transcript: 'Periode erwartet in zwei Tagen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-29', classTag: 'K6', transcript: 'den ganzen Tag Termine gehabt', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-30', classTag: 'K6', transcript: 'Schultern verspannt vom Sitzen', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-31', classTag: 'K6', transcript: 'lange Zugfahrt heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-32', classTag: 'K6', transcript: 'viel Arbeit diese Woche', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-33', classTag: 'K6', transcript: 'Gewitter heute Nachmittag', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-34', classTag: 'K6', transcript: 'Augen angestrengt vom Bildschirm', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-35', classTag: 'K6', transcript: 'kaltes Wetter heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-36', classTag: 'K6', transcript: 'nicht genug Wasser getrunken', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-37', classTag: 'K6', transcript: 'Überstunden auf der Arbeit', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-38', classTag: 'K6', transcript: 'langes Autofahren gehabt', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-39', classTag: 'K6', transcript: 'Regelblutung seit gestern', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K6-40', classTag: 'K6', transcript: 'Lärm den ganzen Tag ausgesetzt', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },

  // ================================================
  // K7: STT-Fehler bei Pain-Context (20 cases)
  // ================================================
  { id: 'K7-01', classTag: 'K7', transcript: 'sehr stark gekoppelschmerzen', expected: { pain: { value: 9, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-02', classTag: 'K7', transcript: 'kopfschmerzn Stärke 5', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-03', classTag: 'K7', transcript: 'migrene seit heute morgen', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K7-04', classTag: 'K7', transcript: 'kopf schmerzen Stärke 7', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-05', classTag: 'K7', transcript: 'schmerzstrecke 5', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-06', classTag: 'K7', transcript: 'schnellstärke 4', expected: { pain: { value: 4 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-07', classTag: 'K7', transcript: 'Schmerzlautstärke 8 von 10', expected: { pain: { value: 8 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-08', classTag: 'K7', transcript: 'schmerzstarke 6', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-09', classTag: 'K7', transcript: 'sehr stark gekoppelschmerzen und eine Sumatriptan 100mg', expected: { pain: { value: 9, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-10', classTag: 'K7', transcript: 'Kopfschmärzen Stärke 5', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-11', classTag: 'K7', transcript: 'Migraene Stärke 7', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-12', classTag: 'K7', transcript: 'schmerzstaerke 4', expected: { pain: { value: 4 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-13', classTag: 'K7', transcript: 'kopfschmerz 6 von 10', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-14', classTag: 'K7', transcript: 'schmertz stärke 5', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-15', classTag: 'K7', transcript: 'heftige migrane', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-16', classTag: 'K7', transcript: 'Schmerz Stärke 5', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-17', classTag: 'K7', transcript: 'kopf Weh Stärke 3', expected: { pain: { value: 3 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-18', classTag: 'K7', transcript: 'Schmerzlautsärke 7', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-19', classTag: 'K7', transcript: 'Schmerz-Stärke 9', expected: { pain: { value: 9 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K7-20', classTag: 'K7', transcript: 'starke kopfschmertzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K8: STT-Fehler bei Medikamenten (20 cases)
  // ================================================
  { id: 'K8-01', classTag: 'K8', transcript: 'Ibu genommen Kopfschmerzen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-02', classTag: 'K8', transcript: 'Suma genommen starke Migräne', expected: { pain: { value: 7, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-03', classTag: 'K8', transcript: 'Para 500 Kopfschmerzen', expected: { pain: { value: null }, medications: ['Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-04', classTag: 'K8', transcript: 'Ibuprofen 800 genommen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-05', classTag: 'K8', transcript: 'Naproxen eingenommen Stärke 6', expected: { pain: { value: 6 }, medications: ['Naproxen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-06', classTag: 'K8', transcript: 'halbe Ibuprofen genommen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-07', classTag: 'K8', transcript: 'zwei Tabletten Ibuprofen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-08', classTag: 'K8', transcript: 'eine Sumatriptan genommen', expected: { pain: { value: null }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-09', classTag: 'K8', transcript: 'Rizatriptan Stärke 7', expected: { pain: { value: 7 }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-10', classTag: 'K8', transcript: 'Almotriptan eingenommen Migräne', expected: { pain: { value: null }, medications: ['Almotriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-11', classTag: 'K8', transcript: 'Ibu 400 mg Kopfschmerzen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-12', classTag: 'K8', transcript: 'Ibu 800 Stärke 5', expected: { pain: { value: 5 }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-13', classTag: 'K8', transcript: 'Sumatriptan 100 mg Schmerzstärke 8', expected: { pain: { value: 8 }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-14', classTag: 'K8', transcript: 'Paracetamol genommen', expected: { pain: { value: null }, medications: ['Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-15', classTag: 'K8', transcript: 'ganze Ibuprofen geschluckt', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-16', classTag: 'K8', transcript: 'Suma 50 mg Migräne Stärke 6', expected: { pain: { value: 6 }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-17', classTag: 'K8', transcript: 'eine halbe Sumatriptan', expected: { pain: { value: null }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-18', classTag: 'K8', transcript: 'anderthalb Tabletten Ibuprofen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-19', classTag: 'K8', transcript: 'dreiviertel Rizatriptan genommen', expected: { pain: { value: null }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K8-20', classTag: 'K8', transcript: 'Ibuprofen und Sumatriptan genommen Kopfschmerzen', expected: { pain: { value: null }, medications: ['Ibuprofen', 'Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },

  // ================================================
  // K9: Mischmasch / echtes Leben (20 cases)
  // ================================================
  { id: 'K9-01', classTag: 'K9', transcript: 'also äh ich habe gerade ziemlich starke Kopfschmerzen', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustBeEmpty: true, mustNotContain: ['also', 'äh', 'ich habe'] } } },
  { id: 'K9-02', classTag: 'K9', transcript: 'und dann hab ich Ibuprofen genommen weil es so weh tat', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustNotContain: ['genommen'] } } },
  { id: 'K9-03', classTag: 'K9', transcript: 'ja also Schmerzstärke 7 und äh Sumatriptan', expected: { pain: { value: 7 }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-04', classTag: 'K9', transcript: 'hm also seit heute früh Kopfschmerzen und dann Ibuprofen genommen Stärke 5', expected: { pain: { value: 5 }, medications: ['Ibuprofen'], time: { kind: 'absolute' }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-05', classTag: 'K9', transcript: 'also ich hab gerade so mittelstarke Kopfschmerzen nehm mal eine Ibu', expected: { pain: { value: 5, isEstimated: true }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-06', classTag: 'K9', transcript: 'ja äh Kopfschmerzen', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K9-07', classTag: 'K9', transcript: 'also äh wenig geschlafen und dann Stress', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { mustContain: ['geschlafen'] } } },
  { id: 'K9-08', classTag: 'K9', transcript: 'glaube ich habe so Stärke 6 oder 7 Kopfschmerzen', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-09', classTag: 'K9', transcript: 'ja also gerade eben Ibuprofen 800 weil Kopfschmerzen', expected: { pain: { value: null }, medications: ['Ibuprofen'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-10', classTag: 'K9', transcript: 'bitte Sumatriptan und starke Kopfschmerzen notieren', expected: { pain: { value: 7, isEstimated: true }, medications: ['Sumatriptan'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-11', classTag: 'K9', transcript: 'Schmerzstärke 7 und noch Übelkeit und lichtempfindlich', expected: { pain: { value: 7 }, entry_type: 'new_entry', notes: { mustContain: ['Übelkeit', 'lichtempfindlich'] } } },
  { id: 'K9-12', classTag: 'K9', transcript: 'äh Kopfschmerzen seit heute morgen wegen Stress und wenig Schlaf', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustContain: ['Stress'] } } },
  { id: 'K9-13', classTag: 'K9', transcript: 'also äh ja starke Migräne linksseitig pulsierend', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustContain: ['linksseitig', 'pulsierend'] } } },
  { id: 'K9-14', classTag: 'K9', transcript: 'also Ibuprofen 400 genommen und Paracetamol', expected: { pain: { value: null }, medications: ['Ibuprofen', 'Paracetamol'], entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K9-15', classTag: 'K9', transcript: 'hm ich glaub die Kopfschmerzen kommen wegen dem Wetter', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustContain: ['Wetter'] } } },
  { id: 'K9-16', classTag: 'K9', transcript: 'also äh Stärke 5 und so Übelkeit und Schwindel', expected: { pain: { value: 5 }, entry_type: 'new_entry', notes: { mustContain: ['Übelkeit', 'Schwindel'] } } },
  { id: 'K9-17', classTag: 'K9', transcript: 'naja also Kopfschmerzen halt', expected: { pain: { value: null }, entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K9-18', classTag: 'K9', transcript: 'ich nehm mal eine Rizatriptan weil ich glaub das wird schlimmer', expected: { pain: { value: null }, medications: ['Rizatriptan'], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K9-19', classTag: 'K9', transcript: 'äh gestern noch gut gewesen und heute Migräne Stärke 6', expected: { pain: { value: 6 }, entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K9-20', classTag: 'K9', transcript: 'also starke Kopfschmerzen hinterm Auge rechts', expected: { pain: { value: 7, isEstimated: true }, entry_type: 'new_entry', notes: { mustContain: ['hinterm Auge', 'rechts'] } } },

  // ================================================
  // K10: Negation / Kein Medikament (20 cases)
  // ================================================
  { id: 'K10-01', classTag: 'K10', transcript: 'nichts genommen', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-02', classTag: 'K10', transcript: 'kein Medikament genommen', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-03', classTag: 'K10', transcript: 'Kopfschmerzen Stärke 5 ohne Tablette', expected: { pain: { value: 5 }, medications: [], entry_type: 'new_entry', notes: { mustBeEmpty: true, canBeEmpty: true } } },
  { id: 'K10-04', classTag: 'K10', transcript: 'keine Kopfschmerzen', expected: { pain: { value: 0 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K10-05', classTag: 'K10', transcript: 'Migräne aber kein Medikament', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-06', classTag: 'K10', transcript: 'Kopfschmerzen Stärke 3 kein Medikament genommen', expected: { pain: { value: 3 }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-07', classTag: 'K10', transcript: 'heute keine Schmerzen', expected: { pain: { value: 0 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K10-08', classTag: 'K10', transcript: 'schmerzfrei seit gestern', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K10-09', classTag: 'K10', transcript: 'ohne Medikament durchgehalten', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K10-10', classTag: 'K10', transcript: 'keine Migräne heute', expected: { pain: { value: 0 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K10-11', classTag: 'K10', transcript: 'kein Kopfweh', expected: { pain: { value: 0 }, entry_type: 'new_entry', notes: { mustBeEmpty: true } } },
  { id: 'K10-12', classTag: 'K10', transcript: 'Kopfschmerzen ohne Medikament Stärke 4', expected: { pain: { value: 4 }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-13', classTag: 'K10', transcript: 'kein Triptan genommen', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-14', classTag: 'K10', transcript: 'heute war alles gut', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K10-15', classTag: 'K10', transcript: 'bin schmerzfrei', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: false } } },
  { id: 'K10-16', classTag: 'K10', transcript: 'Kopfschmerzen aber nichts genommen', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-17', classTag: 'K10', transcript: 'starke Migräne ohne Medikament', expected: { pain: { value: 7, isEstimated: true }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-18', classTag: 'K10', transcript: 'keine Tablette heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-19', classTag: 'K10', transcript: 'Kopfschmerzen aber will nichts nehmen', expected: { pain: { value: null }, medications: [], entry_type: 'new_entry', notes: { canBeEmpty: true } } },
  { id: 'K10-20', classTag: 'K10', transcript: 'kein Anfall heute', expected: { pain: { value: null }, entry_type: 'context_entry', notes: { canBeEmpty: true } } },
];
