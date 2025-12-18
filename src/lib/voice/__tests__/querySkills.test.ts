/**
 * Query Skills Tests
 * 
 * 100+ test phrases for query skills
 */

import { describe, it, expect } from 'vitest';
import { querySkills } from '../planner/skills/query';
import { canonicalizeText } from '../planner/lexicon/de';
import type { VoiceUserContext } from '../planner/skills/types';

const defaultContext: VoiceUserContext = {
  userMeds: [
    { name: 'Sumatriptan 50mg' },
    { name: 'Ibuprofen 400' },
    { name: 'Topiramat 25mg' },
  ],
};

function findBestMatch(transcript: string, context = defaultContext) {
  const canonicalized = canonicalizeText(transcript);
  let bestSkill = null;
  let bestConfidence = 0;
  let bestSlots: Record<string, unknown> = {};
  
  for (const skill of querySkills) {
    const result = skill.match(transcript, canonicalized, context);
    if (result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
      bestSkill = skill;
      bestSlots = result.slots;
    }
  }
  
  return { skill: bestSkill, confidence: bestConfidence, slots: bestSlots };
}

describe('Query Skills', () => {
  // ============================================
  // Last Entry (Letzter Eintrag)
  // ============================================
  describe('last_entry', () => {
    const positiveTests = [
      'zeig mir meinen letzten eintrag',
      'öffne den letzten eintrag',
      'letzter eintrag',
      'was war mein letzter eintrag',
      'zeig letzten schmerzeintrag',
      'öffne meinen letzten migräneeintrag',
      'wann war mein letzter eintrag',
      'den letzten eintrag bitte',
      'zeige letzten eintrag',
      'letzter kopfschmerzeintrag',
      'mein letzter eintrag',
      'öffne vorherigen eintrag',
      'den vorletzten eintrag',
      'zeig mal den letzten',
      'was habe ich zuletzt eingetragen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('last_entry');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract ordinal "vorletzten"', () => {
      const { slots } = findBestMatch('zeig mir den vorletzten eintrag');
      expect(slots.ordinal).toBe(2);
    });

    it('should extract ordinal "drittletzten"', () => {
      const { slots } = findBestMatch('öffne den drittletzten eintrag');
      expect(slots.ordinal).toBe(3);
    });
  });

  // ============================================
  // Last Entry with Medication
  // ============================================
  describe('last_entry_with_med', () => {
    const positiveTests = [
      'zeig den letzten eintrag mit sumatriptan',
      'öffne letzten eintrag mit triptan',
      'letzter eintrag mit ibuprofen',
      'zeig mir den letzten wo ich triptan genommen habe',
      'öffne den eintrag wo ich zuletzt schmerzmittel hatte',
      'letzter migräneeintrag mit medikament',
      'wann hatte ich zuletzt eintrag mit sumatriptan',
      'öffne letzten eintrag wo ich sumatriptan genommen hab',
      'eintrag mit ibuprofen anzeigen',
      'letzter eintrag sumatriptan',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('last_entry_with_med');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract medication from user meds', () => {
      const { slots } = findBestMatch('letzter eintrag mit sumatriptan 50mg');
      expect(slots.medication).toBe('Sumatriptan 50mg');
    });

    it('should match category keyword', () => {
      const { slots } = findBestMatch('letzter eintrag mit triptan');
      expect(slots.medication).toBe('triptan');
    });
  });

  // ============================================
  // Last Medication Intake (Wann zuletzt?)
  // ============================================
  describe('last_intake_med', () => {
    const positiveTests = [
      'wann habe ich zuletzt triptan genommen',
      'wann war die letzte triptan einnahme',
      'wann zuletzt sumatriptan',
      'wann habe ich das letzte mal ibuprofen genommen',
      'letzte einnahme triptan',
      'wann nahm ich zuletzt schmerzmittel',
      'wann hab ich zuletzt medikament genommen',
      'wann war meine letzte tabletteneinnahme',
      'letzte triptan einnahme',
      'wann zuletzt ibuprofen eingenommen',
      'wann triptan genommen',
      'letzte einnahme sumatriptan',
      'wann war das letzte mal triptan',
      'wie lange ist triptan her',
      'wann zuletzt tablette',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('last_intake_med');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract specific medication', () => {
      const { slots } = findBestMatch('wann zuletzt sumatriptan 50mg genommen');
      expect(slots.medication).toBe('Sumatriptan 50mg');
    });
  });

  // ============================================
  // Count Medication Days
  // ============================================
  describe('count_med_range', () => {
    const positiveTests = [
      'wie oft habe ich triptan genommen',
      'wie viele triptantage hatte ich',
      'an wie vielen tagen triptan',
      'wie oft ibuprofen in den letzten 30 tagen',
      'zähle triptaneinnahmen',
      'wie viele tage mit schmerzmittel',
      'anzahl triptan tage diesen monat',
      'wie viele sumatriptan einnahmen',
      'triptan tage zählen',
      'wie oft ibuprofen genommen',
      'anzahl tage mit triptan',
      'wie viele einnahmen triptan',
      'triptantage im letzten monat',
      'wie oft schmerzmittel genommen',
      'zähle sumatriptan tage',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('count_med_range');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract time range "letzte 7 tage"', () => {
      const { slots } = findBestMatch('wie oft triptan letzte 7 tage');
      expect(slots.days).toBe(7);
    });

    it('should extract time range "letzten monat"', () => {
      const { slots } = findBestMatch('triptan einnahmen letzten monat');
      expect(slots.days).toBe(30);
    });

    it('should default to 30 days', () => {
      const { slots } = findBestMatch('wie oft triptan genommen');
      expect(slots.days).toBe(30);
    });
  });

  // ============================================
  // Count Migraine Days
  // ============================================
  describe('count_migraine_range', () => {
    const positiveTests = [
      'wie viele migränetage hatte ich',
      'wie oft hatte ich kopfschmerzen',
      'an wie vielen tagen migräne',
      'zähle meine kopfschmerztage',
      'wie viele schmerztage diesen monat',
      'anzahl migränetage letzte 30 tage',
      'wie viele tage kopfschmerzen',
      'migränetage zählen',
      'wie oft migräne gehabt',
      'schmerztage diesen monat',
      'wie viele kopfschmerzen',
      'anzahl migräne tage',
      'wie oft schmerzen gehabt',
      'zähle migräne',
      'kopfschmerztage letzte woche',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('count_migraine_range');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should not match when medication is mentioned', () => {
      const { skill } = findBestMatch('wie viele tage mit triptan');
      expect(skill?.id).toBe('count_med_range'); // Should match med skill instead
    });
  });

  // ============================================
  // Average Pain Range
  // ============================================
  describe('avg_pain_range', () => {
    const positiveTests = [
      'wie stark waren meine schmerzen im durchschnitt',
      'durchschnittliche schmerzstärke',
      'mittlere schmerzintensität',
      'durchschnittlicher schmerz letzte woche',
      'wie war mein durchschnitt',
      'durchschnittliche intensität',
      'mittelwert schmerzen',
      'durchschnittliche migräne stärke',
      'schmerz durchschnitt',
      'wie stark im schnitt',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('avg_pain_range');
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle empty user meds gracefully', () => {
      const emptyContext: VoiceUserContext = { userMeds: [] };
      const { skill, confidence } = findBestMatch('wann zuletzt triptan genommen', emptyContext);
      expect(skill?.id).toBe('last_intake_med');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should prefer specific med match over category', () => {
      const { slots } = findBestMatch('wann zuletzt sumatriptan 50mg');
      expect(slots.medication).toBe('Sumatriptan 50mg');
    });

    it('should handle Swiss German variants', () => {
      const { confidence } = findBestMatch('wänn hani zletscht triptan gno');
      // May or may not match, but should not crash
      expect(confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle "genommen" variants', () => {
      const { skill, confidence } = findBestMatch('triptan eingenommen wann');
      expect(skill?.id).toBe('last_intake_med');
      expect(confidence).toBeGreaterThan(0.4);
    });

    it('should handle informal speech', () => {
      const { confidence } = findBestMatch('zeig mal wann ich triptan hatte');
      expect(confidence).toBeGreaterThan(0.4);
    });

    it('should handle question without question mark', () => {
      const { skill, confidence } = findBestMatch('wie oft triptan');
      expect(skill?.id).toBe('count_med_range');
      expect(confidence).toBeGreaterThan(0.4);
    });

    it('should handle medication at start of sentence', () => {
      const { skill, confidence } = findBestMatch('triptan wann zuletzt');
      expect(skill?.id).toBe('last_intake_med');
      expect(confidence).toBeGreaterThan(0.4);
    });

    it('should distinguish between entry and intake queries', () => {
      const intakeResult = findBestMatch('wann zuletzt triptan genommen');
      const entryResult = findBestMatch('letzter eintrag mit triptan');
      
      expect(intakeResult.skill?.id).toBe('last_intake_med');
      expect(entryResult.skill?.id).toBe('last_entry_with_med');
    });
  });
});
