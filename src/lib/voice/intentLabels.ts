/**
 * Intent Labels and Entity Display
 * German labels for intent types and entity formatting
 */

import type { ScoredIntent } from './intentScoring';
import type { VoiceRouterResultType } from './voiceIntentRouter';
import { Mic, Zap, PlusCircle, Pill, Bell, MessageCircle, Save, BookOpen, BarChart3, Settings, HelpCircle } from 'lucide-react';

// ============================================
// Intent Labels (German)
// ============================================

export const INTENT_LABELS: Record<ScoredIntent | VoiceRouterResultType | string, string> = {
  // Scored intents
  add_medication: 'Neues Medikament',
  pain_entry: 'Schmerz-Eintrag',
  medication_update: 'Medikament aktualisieren',
  medication_effect: 'Medikamenten-Wirkung',
  reminder: 'Erinnerung',
  analytics_query: 'Frage/Auswertung',
  note: 'Notiz',
  navigation: 'Navigation',
  unknown: 'Nicht erkannt',
  
  // Router result types
  navigate_reminder_create: 'Erinnerung erstellen',
  navigate_appointment_create: 'Termin erstellen',
  navigate_profile_edit: 'Profil bearbeiten',
  navigate_doctor_edit: 'Arzt bearbeiten',
  navigate_diary: 'Tagebuch öffnen',
  navigate_analysis: 'Auswertung öffnen',
  navigate_report: 'Bericht erstellen',
  navigate_medications: 'Medikamente',
  navigate_settings: 'Einstellungen',
  help: 'Hilfe',
  create_pain_entry: 'Schmerz-Eintrag',
  create_quick_entry: 'Schnell-Eintrag',
  create_medication_update: 'Medikament aktualisieren',
  create_medication_effect: 'Wirkung bewerten',
  create_note: 'Notiz speichern',
};

export function getIntentLabel(intent: string): string {
  return INTENT_LABELS[intent] || intent;
}

// ============================================
// Intent Icons
// ============================================

export const INTENT_ICONS: Record<string, typeof Mic> = {
  add_medication: PlusCircle,
  pain_entry: Zap,
  create_pain_entry: Zap,
  create_quick_entry: Zap,
  medication_update: Pill,
  create_medication_update: Pill,
  medication_effect: Pill,
  create_medication_effect: Pill,
  reminder: Bell,
  navigate_reminder_create: Bell,
  navigate_appointment_create: Bell,
  analytics_query: BarChart3,
  note: Save,
  create_note: Save,
  navigation: BookOpen,
  navigate_diary: BookOpen,
  navigate_analysis: BarChart3,
  navigate_medications: Pill,
  navigate_settings: Settings,
  help: HelpCircle,
  unknown: MessageCircle,
};

export function getIntentIcon(intent: string): typeof Mic {
  return INTENT_ICONS[intent] || MessageCircle;
}

// ============================================
// Entity Formatting
// ============================================

export interface ExtractedEntities {
  medicationName?: string;
  medicationStrength?: number;
  medicationUnit?: string;
  painLevel?: number;
  time?: string;
}

/**
 * Format entities for display in live preview
 * Returns a short summary string
 */
export function formatEntitiesPreview(entities: ExtractedEntities): string {
  const parts: string[] = [];
  
  if (entities.medicationName) {
    if (entities.medicationStrength && entities.medicationUnit) {
      parts.push(`${entities.medicationName} ${entities.medicationStrength} ${entities.medicationUnit}`);
    } else if (entities.medicationStrength) {
      parts.push(`${entities.medicationName} ${entities.medicationStrength} mg`);
    } else {
      parts.push(entities.medicationName);
    }
  }
  
  if (entities.painLevel !== undefined) {
    parts.push(`Stärke ${entities.painLevel}`);
  }
  
  if (entities.time) {
    parts.push(entities.time);
  }
  
  return parts.join(' • ');
}

/**
 * Quick entity extraction for live preview
 * Lightweight - only basic patterns
 */
export function extractEntitiesForPreview(normalizedText: string): ExtractedEntities {
  const entities: ExtractedEntities = {};
  
  // Pain level (0-10)
  const painMatch = normalizedText.match(/\bstaerke\s*(\d{1,2})\b|\b(\d{1,2})\s*(von\s*10)?/);
  if (painMatch) {
    const level = parseInt(painMatch[1] || painMatch[2], 10);
    if (level >= 0 && level <= 10) {
      entities.painLevel = level;
    }
  }
  
  // Medication + strength
  const medMatch = normalizedText.match(/\b([a-z]{4,})\s+(\d{1,4})\s*(mg|milligramm|mcg|ml)/i);
  if (medMatch) {
    entities.medicationName = capitalizeFirst(medMatch[1]);
    entities.medicationStrength = parseInt(medMatch[2], 10);
    entities.medicationUnit = medMatch[3].toLowerCase() === 'milligramm' ? 'mg' : medMatch[3].toLowerCase();
  } else {
    // Just medication name without strength
    const medOnlyMatch = normalizedText.match(/\b(sumatriptan|rizatriptan|ibuprofen|paracetamol|aspirin|maxalt|imigran)\b/i);
    if (medOnlyMatch) {
      entities.medicationName = capitalizeFirst(medOnlyMatch[1]);
    }
  }
  
  // Time references
  if (/\bjetzt\b/.test(normalizedText)) {
    entities.time = 'Jetzt';
  } else if (/\bgestern\b/.test(normalizedText)) {
    entities.time = 'Gestern';
  } else if (/\bheute\s*morgen\b/.test(normalizedText)) {
    entities.time = 'Heute Morgen';
  } else if (/\bvor\s+(\d+)\s*(stunde|std|h|minute|min)\b/.test(normalizedText)) {
    const timeMatch = normalizedText.match(/\bvor\s+(\d+)\s*(stunde|std|h|minute|min)/);
    if (timeMatch) {
      const unit = timeMatch[2].startsWith('min') ? 'Min' : 'Std';
      entities.time = `Vor ${timeMatch[1]} ${unit}`;
    }
  }
  
  return entities;
}

function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
