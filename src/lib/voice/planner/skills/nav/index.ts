/**
 * Navigation Skills
 * 
 * Skills für das Öffnen von Screens/Views
 */

import type { Skill, SkillMatchResult, VoiceUserContext } from '../types';
import type { NavigatePlan, TargetView } from '../../types';
import { OPERATORS, OBJECTS, canonicalizeText } from '../../lexicon/de';
import { calculateKeywordScore, calculateExampleScore, combineScores } from '../types';

// ============================================
// Base Navigation Skill Factory
// ============================================

function createNavSkill(config: {
  id: string;
  name: string;
  targetView: TargetView;
  keywords: string[];
  examples: string[];
  antiKeywords?: string[];
}): Skill {
  return {
    id: config.id,
    name: config.name,
    category: 'NAV',
    examples: config.examples,
    requiredSlots: [],
    optionalSlots: [],
    keywords: config.keywords,
    antiKeywords: config.antiKeywords,
    
    match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
      const reasons: string[] = [];
      
      // Check for OPEN operator
      const hasOpenOperator = OPERATORS.OPEN.some(op => 
        canonicalized.includes(op.toLowerCase())
      );
      if (hasOpenOperator) {
        reasons.push('OPEN operator detected');
      }
      
      // Calculate scores
      const keywordScore = calculateKeywordScore(
        canonicalized, 
        config.keywords, 
        config.antiKeywords
      );
      const exampleScore = calculateExampleScore(canonicalized, config.examples);
      
      // Bonus for explicit open operator + relevant object
      const bonusScore = hasOpenOperator && keywordScore > 0.3 ? 0.3 : 0;
      
      const confidence = combineScores(keywordScore, exampleScore, bonusScore);
      
      if (keywordScore > 0.3) {
        reasons.push(`Keyword match: ${(keywordScore * 100).toFixed(0)}%`);
      }
      if (exampleScore > 0.3) {
        reasons.push(`Example match: ${(exampleScore * 100).toFixed(0)}%`);
      }
      
      return {
        confidence,
        slots: {},
        reasons,
      };
    },
    
    buildPlan(slots: Record<string, unknown>, context: VoiceUserContext, confidence: number): NavigatePlan {
      return {
        kind: 'navigate',
        targetView: config.targetView,
        summary: `${config.name} öffnen`,
        confidence,
      };
    },
  };
}

// ============================================
// Navigation Skills
// ============================================

export const navAnalysisSkill = createNavSkill({
  id: 'nav_analysis',
  name: 'Auswertung',
  targetView: 'analysis',
  keywords: ['auswertung', 'analyse', 'statistik', 'trends', 'muster', 'übersicht'],
  examples: [
    'öffne auswertung',
    'zeige mir die analyse',
    'gehe zu statistiken',
    'öffne die übersicht',
    'auswertung anzeigen',
  ],
  antiKeywords: ['bericht', 'pdf', 'export'],
});

export const navDiarySkill = createNavSkill({
  id: 'nav_diary',
  name: 'Tagebuch',
  targetView: 'diary',
  keywords: ['tagebuch', 'einträge', 'diary', 'aufzeichnungen', 'verlauf'],
  examples: [
    'öffne tagebuch',
    'zeige einträge',
    'gehe zum tagebuch',
    'meine einträge anzeigen',
    'kopfschmerztagebuch öffnen',
  ],
});

export const navMedicationsSkill = createNavSkill({
  id: 'nav_medications',
  name: 'Medikamente',
  targetView: 'medications',
  keywords: ['medikamente', 'medikamentenliste', 'tabletten', 'medikation'],
  examples: [
    'öffne medikamente',
    'zeige meine medikamente',
    'medikamentenliste anzeigen',
    'gehe zu medikamenten',
  ],
});

export const navRemindersSkill = createNavSkill({
  id: 'nav_reminders',
  name: 'Erinnerungen',
  targetView: 'reminders',
  keywords: ['erinnerungen', 'reminder', 'termine', 'wecker'],
  examples: [
    'öffne erinnerungen',
    'zeige meine termine',
    'erinnerungen anzeigen',
    'gehe zu reminder',
  ],
});

export const navSettingsSkill = createNavSkill({
  id: 'nav_settings',
  name: 'Einstellungen',
  targetView: 'settings',
  keywords: ['einstellungen', 'settings', 'konfiguration', 'optionen'],
  examples: [
    'öffne einstellungen',
    'gehe zu settings',
    'einstellungen anzeigen',
  ],
});

export const navDoctorsSkill = createNavSkill({
  id: 'nav_doctors',
  name: 'Ärzte',
  targetView: 'doctors',
  keywords: ['ärzte', 'arzt', 'arztdaten', 'ärzteliste', 'neurologe', 'hausarzt'],
  examples: [
    'öffne arztdaten',
    'zeige meine ärzte',
    'ärzteliste anzeigen',
    'gehe zu arzt',
  ],
});

export const navProfileSkill = createNavSkill({
  id: 'nav_profile',
  name: 'Profil',
  targetView: 'profile',
  keywords: ['profil', 'persönliche daten', 'stammdaten', 'patientendaten'],
  examples: [
    'öffne profil',
    'meine daten anzeigen',
    'persönliche daten bearbeiten',
    'profil bearbeiten',
  ],
});

export const navVoiceNotesSkill = createNavSkill({
  id: 'nav_voice_notes',
  name: 'Sprachnotizen',
  targetView: 'voice_notes',
  keywords: ['sprachnotizen', 'notizen', 'kontextnotizen', 'anmerkungen'],
  examples: [
    'öffne notizen',
    'zeige sprachnotizen',
    'meine notizen anzeigen',
    'kontextnotizen öffnen',
  ],
});

export const navReportSkill = createNavSkill({
  id: 'nav_report',
  name: 'Bericht',
  targetView: 'diary_report',
  keywords: ['bericht', 'arztbericht', 'pdf', 'export', 'report'],
  examples: [
    'erstelle bericht',
    'arztbericht generieren',
    'pdf erstellen',
    'bericht für arzt',
    'export starten',
  ],
});

export const navMedicationEffectsSkill = createNavSkill({
  id: 'nav_medication_effects',
  name: 'Medikamentenwirkung',
  targetView: 'medication_effects',
  keywords: ['wirkung', 'medikamentenwirkung', 'effekt', 'bewertungen'],
  examples: [
    'öffne wirkung',
    'medikamentenwirkung anzeigen',
    'zeige bewertungen',
    'effekte anzeigen',
  ],
});

// ============================================
// Export All Navigation Skills
// ============================================

export const navigationSkills: Skill[] = [
  navAnalysisSkill,
  navDiarySkill,
  navMedicationsSkill,
  navRemindersSkill,
  navSettingsSkill,
  navDoctorsSkill,
  navProfileSkill,
  navVoiceNotesSkill,
  navReportSkill,
  navMedicationEffectsSkill,
];
