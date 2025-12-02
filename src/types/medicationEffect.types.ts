/**
 * Voice-based Medication Effect Types
 */

export interface ParsedMedicationEffect {
  effectScore: number | null; // 0-10, null if not recognized
  sideEffects: string[];
  notesSummary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface VoiceMedicationEffectInput {
  transcript: string;
  entryId: number;
  medName: string;
}
