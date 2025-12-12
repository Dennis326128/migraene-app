/**
 * Draft Composer Type Definitions
 * Types for the draft review system
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DraftSectionType = 
  | 'attack'      // Kopfschmerz/Attacke
  | 'medication'  // Medikation (kann mehrere Intakes haben)
  | 'effect'      // Wirkung
  | 'symptoms'    // Symptome
  | 'triggers'    // Trigger
  | 'notes'       // Notizen
  | 'other';      // Sonstiges

export interface DraftField<T = string> {
  value: T | null;
  confidence: ConfidenceLevel;
  source: 'parsed' | 'user' | 'default';
  originalText?: string;  // Originaler Textausschnitt
  needsConfirmation?: boolean;
}

export interface MedicationIntake {
  id: string;
  medicationName: DraftField<string>;
  medicationId?: string;  // Matched user_medication ID
  time: DraftField<string>;  // HH:mm format
  dosage?: DraftField<string>;
  effect?: DraftField<'none' | 'low' | 'medium' | 'good' | 'excellent'>;
  effectScore?: DraftField<number>;  // 0-10 numeric score
  sideEffects?: DraftField<string[]>;  // Side effects array
  effectNotes?: string;
}

export interface AttackDraft {
  date: DraftField<string>;  // YYYY-MM-DD
  time: DraftField<string>;  // HH:mm
  painLevel: DraftField<number>;  // 1-10
  painLocation?: DraftField<string>;
  duration?: DraftField<string>;  // z.B. "ganzer Tag", "3 Stunden"
}

export interface DraftResult {
  // Original input
  originalText: string;
  parsedAt: string;  // ISO timestamp
  
  // Sections
  attack?: AttackDraft;
  medications: MedicationIntake[];
  symptoms: DraftField<string[]>;
  triggers: DraftField<string[]>;
  notes: DraftField<string>;
  
  // Meta
  hasUncertainFields: boolean;
  missingRequiredFields: string[];
  activeSections: DraftSectionType[];
}

export interface DraftEngineResult {
  draft: DraftResult;
  errors: string[];
  warnings: string[];
}

// Speech Provider types
export type SpeechProviderType = 'none' | 'web_speech' | 'native' | 'cloud';

export interface SpeechProviderConfig {
  type: SpeechProviderType;
  language: string;
  continuous: boolean;
}

export interface SpeechResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface SpeechProviderInterface {
  isSupported: () => boolean;
  start: () => Promise<void>;
  stop: () => void;
  onResult: (callback: (result: SpeechResult) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  onEnd: (callback: () => void) => void;
}

// Effect mapping for German phrases
export const EFFECT_PHRASES: Record<string, 'none' | 'low' | 'medium' | 'good' | 'excellent'> = {
  'gar nicht': 'none',
  'nicht geholfen': 'none',
  'kein effekt': 'none',
  'ohne wirkung': 'none',
  'ein bisschen': 'low',
  'kaum': 'low',
  'wenig': 'low',
  'etwas': 'medium',
  'mittel': 'medium',
  'mäßig': 'medium',
  'geholfen': 'good',
  'gut geholfen': 'good',
  'gut': 'good',
  'sehr gut': 'excellent',
  'super': 'excellent',
  'perfekt': 'excellent',
  'ganz gut': 'good',
  'ganz gut geholfen': 'good',
};

// Common German medication synonyms for matching
export const MEDICATION_SYNONYMS: Record<string, string[]> = {
  'sumatriptan': ['suma', 'imigran'],
  'rizatriptan': ['riza', 'maxalt'],
  'zolmitriptan': ['zolmi', 'ascotop'],
  'naratriptan': ['nara', 'naramig'],
  'ibuprofen': ['ibu', 'ib'],
  'paracetamol': ['para', 'parazet', 'ben-u-ron'],
  'aspirin': ['ass', 'azetylsalizylsäure'],
  'diclofenac': ['diclo', 'voltaren'],
  'naproxen': ['naprox', 'dolormin'],
  'metamizol': ['novalgin', 'novaminsulfon'],
  'topiramat': ['topi', 'topamax'],
  'propranolol': ['propra', 'dociton'],
  'metoprolol': ['meto', 'beloc'],
  'amitriptylin': ['ami', 'saroten'],
  'flunarizin': ['fluna', 'sibelium'],
  'valproat': ['valpro', 'ergenyl'],
  'botox': ['botulinumtoxin', 'onabotulinumtoxin'],
  'diazepam': ['valium'],
  'domperidon': ['motilium'],
  'metoclopramid': ['mcp', 'paspertin'],
};
