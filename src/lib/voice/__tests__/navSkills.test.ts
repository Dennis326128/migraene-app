/**
 * Navigation Skills Tests
 * 
 * 100+ test phrases for navigation skills
 */

import { describe, it, expect } from 'vitest';
import { navigationSkills } from '../planner/skills/nav';
import { canonicalizeText } from '../planner/lexicon/de';
import type { VoiceUserContext } from '../planner/skills/types';

const defaultContext: VoiceUserContext = {
  userMeds: [],
};

function findBestMatch(transcript: string) {
  const canonicalized = canonicalizeText(transcript);
  let bestSkill = null;
  let bestConfidence = 0;
  
  for (const skill of navigationSkills) {
    const result = skill.match(transcript, canonicalized, defaultContext);
    if (result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
      bestSkill = skill;
    }
  }
  
  return { skill: bestSkill, confidence: bestConfidence };
}

describe('Navigation Skills', () => {
  // ============================================
  // Analysis / Auswertung
  // ============================================
  describe('nav_analysis', () => {
    const positiveTests = [
      'öffne auswertung',
      'zeige mir die auswertung',
      'gehe zur auswertung',
      'auswertung anzeigen',
      'analyse öffnen',
      'zeig mir die analyse',
      'statistiken anzeigen',
      'gehe zu statistiken',
      'öffne die statistik',
      'trends anzeigen',
      'zeige trends',
      'muster anzeigen',
      'gib mir eine übersicht',
      'zur auswertung',
      'auswertungsseite öffnen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_analysis');
      expect(confidence).toBeGreaterThan(0.5);
    });

    const negativeTests = [
      'bericht erstellen',
      'pdf exportieren',
      'arztbericht generieren',
    ];

    it.each(negativeTests)('should NOT match (has antiKeywords): "%s"', (phrase) => {
      const { skill } = findBestMatch(phrase);
      expect(skill?.id).not.toBe('nav_analysis');
    });
  });

  // ============================================
  // Diary / Tagebuch
  // ============================================
  describe('nav_diary', () => {
    const positiveTests = [
      'öffne tagebuch',
      'zeige mein tagebuch',
      'gehe zum tagebuch',
      'tagebuch anzeigen',
      'meine einträge zeigen',
      'öffne die einträge',
      'einträge anzeigen',
      'zeig mir meine aufzeichnungen',
      'kopfschmerztagebuch öffnen',
      'zum tagebuch gehen',
      'diary öffnen',
      'zeige verlauf',
      'verlauf anzeigen',
      'mein migränetagebuch',
      'alle einträge zeigen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_diary');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Medications / Medikamente
  // ============================================
  describe('nav_medications', () => {
    const positiveTests = [
      'öffne medikamente',
      'zeige meine medikamente',
      'gehe zu medikamenten',
      'medikamentenliste anzeigen',
      'alle medikamente zeigen',
      'meine tabletten anzeigen',
      'medikamentenübersicht',
      'zur medikamentenliste',
      'öffne medikation',
      'zeig mir die medikamente',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_medications');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Reminders / Erinnerungen
  // ============================================
  describe('nav_reminders', () => {
    const positiveTests = [
      'öffne erinnerungen',
      'zeige meine erinnerungen',
      'gehe zu erinnerungen',
      'meine termine anzeigen',
      'erinnerungen verwalten',
      'öffne reminder',
      'zeig mir die reminder',
      'wecker anzeigen',
      'alle erinnerungen',
      'erinnerungsliste öffnen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_reminders');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Settings / Einstellungen
  // ============================================
  describe('nav_settings', () => {
    const positiveTests = [
      'öffne einstellungen',
      'gehe zu einstellungen',
      'einstellungen anzeigen',
      'settings öffnen',
      'zeige settings',
      'zur konfiguration',
      'optionen anzeigen',
      'einstellungen verwalten',
      'gehe zu optionen',
      'app einstellungen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_settings');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Doctors / Ärzte
  // ============================================
  describe('nav_doctors', () => {
    const positiveTests = [
      'öffne arztdaten',
      'zeige meine ärzte',
      'gehe zu ärzten',
      'ärzteliste anzeigen',
      'meine arztdaten',
      'öffne ärzte',
      'neurologe anzeigen',
      'hausarzt daten',
      'arzt informationen',
      'ärzte verwalten',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_doctors');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Profile / Profil
  // ============================================
  describe('nav_profile', () => {
    const positiveTests = [
      'öffne profil',
      'zeige mein profil',
      'gehe zu profil',
      'meine daten anzeigen',
      'persönliche daten',
      'stammdaten öffnen',
      'patientendaten anzeigen',
      'profil bearbeiten',
      'meine persönlichen daten',
      'profildaten zeigen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_profile');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Voice Notes / Sprachnotizen
  // ============================================
  describe('nav_voice_notes', () => {
    const positiveTests = [
      'öffne notizen',
      'zeige sprachnotizen',
      'meine notizen anzeigen',
      'kontextnotizen öffnen',
      'alle notizen zeigen',
      'gehe zu notizen',
      'anmerkungen anzeigen',
      'sprachnotizen öffnen',
      'meine anmerkungen',
      'notizenliste',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_voice_notes');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Report / Bericht
  // ============================================
  describe('nav_report', () => {
    const positiveTests = [
      'erstelle bericht',
      'arztbericht generieren',
      'pdf erstellen',
      'bericht für arzt',
      'export starten',
      'report erstellen',
      'bericht exportieren',
      'arztbericht erstellen',
      'pdf bericht',
      'bericht generieren',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_report');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Medication Effects / Medikamentenwirkung
  // ============================================
  describe('nav_medication_effects', () => {
    const positiveTests = [
      'öffne wirkung',
      'medikamentenwirkung anzeigen',
      'zeige bewertungen',
      'effekte anzeigen',
      'wirkungsübersicht',
      'alle bewertungen zeigen',
      'medikamenteneffekte',
      'wirkung anzeigen',
      'bewertungen öffnen',
      'effekt übersicht',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('nav_medication_effects');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Edge Cases & Disambiguation
  // ============================================
  describe('Edge Cases', () => {
    it('should handle mixed case', () => {
      const { skill } = findBestMatch('ÖFFNE TAGEBUCH');
      expect(skill?.id).toBe('nav_diary');
    });

    it('should handle extra whitespace', () => {
      const { skill } = findBestMatch('  öffne   einstellungen  ');
      expect(skill?.id).toBe('nav_settings');
    });

    it('should prefer specific match over generic', () => {
      const { skill } = findBestMatch('öffne medikamentenwirkung');
      expect(skill?.id).toBe('nav_medication_effects');
    });

    it('should handle typos gracefully', () => {
      const { confidence } = findBestMatch('öffne tagebch');
      // May or may not match, but should not crash
      expect(confidence).toBeGreaterThanOrEqual(0);
    });

    it('should return low confidence for nonsense', () => {
      const { confidence } = findBestMatch('xyz abc 123');
      expect(confidence).toBeLessThan(0.5);
    });

    it('should handle polite forms', () => {
      const { skill } = findBestMatch('könntest du bitte das tagebuch öffnen');
      expect(skill?.id).toBe('nav_diary');
    });

    it('should handle informal language', () => {
      const { skill } = findBestMatch('zeig mal die einträge');
      expect(skill?.id).toBe('nav_diary');
    });
  });
});
