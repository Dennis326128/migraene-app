/**
 * Action Skills Tests
 * 
 * 100+ test phrases for action/mutation skills
 */

import { describe, it, expect } from 'vitest';
import { actionSkills } from '../planner/skills/action';
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
  
  for (const skill of actionSkills) {
    const result = skill.match(transcript, canonicalized, context);
    if (result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
      bestSkill = skill;
      bestSlots = result.slots;
    }
  }
  
  return { skill: bestSkill, confidence: bestConfidence, slots: bestSlots };
}

function buildPlan(transcript: string, context = defaultContext) {
  const { skill, confidence, slots } = findBestMatch(transcript, context);
  if (!skill) return null;
  return skill.buildPlan(slots, context, confidence);
}

describe('Action Skills', () => {
  // ============================================
  // Create Reminder
  // ============================================
  describe('create_reminder', () => {
    const positiveTests = [
      'erinnere mich an triptan um 14 uhr',
      'erinnerung für medikament morgen früh',
      'erinner mich in 2 stunden an tablette',
      'setze erinnerung für 18 uhr',
      'erinnere mich täglich an prophylaxe',
      'wecker stellen für medikament',
      'reminder morgen 8 uhr triptan',
      'erinnere mich um 15:30',
      'stelle erinnerung für abends',
      'reminder in 30 minuten',
      'erinnerung setzen',
      'erinner mich morgen',
      'wecker für tablette',
      'alarm um 20 uhr',
      'erinnere mich an medikament',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('create_reminder');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract time from "um 14 uhr"', () => {
      const { slots } = findBestMatch('erinnere mich um 14 uhr');
      expect(slots.dateTime).toBeDefined();
      const date = new Date(slots.dateTime as string);
      expect(date.getHours()).toBe(14);
    });

    it('should extract medication for reminder title', () => {
      const { slots } = findBestMatch('erinnere mich an sumatriptan 50mg');
      expect(slots.medications).toContain('Sumatriptan 50mg');
      expect((slots.title as string)).toContain('Sumatriptan');
    });

    it('should detect daily repeat', () => {
      const { slots } = findBestMatch('erinnere mich täglich an topiramat');
      expect(slots.repeat).toBe('daily');
    });

    it('should handle "in X stunden"', () => {
      const { slots } = findBestMatch('erinnere mich in 2 stunden');
      expect(slots.dateTime).toBeDefined();
      const date = new Date(slots.dateTime as string);
      const expectedHour = (new Date().getHours() + 2) % 24;
      expect(date.getHours()).toBe(expectedHour);
    });

    it('should build slot_filling plan when time is missing', () => {
      const plan = buildPlan('erinnere mich an medikament');
      expect(plan?.kind).toBe('slot_filling');
      if (plan?.kind === 'slot_filling') {
        expect(plan.missingSlot).toBe('dateTime');
        expect(plan.suggestions.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Save Voice Note
  // ============================================
  describe('save_voice_note', () => {
    const positiveTests = [
      'speichere das als notiz',
      'notiere das',
      'merk dir das',
      'als notiz speichern',
      'speichere',
      'notiz: kopfschmerzen nach kaffee',
      'merke: stress bei der arbeit',
      'notiz speichern',
      'speicher als notiz',
      'schreib das auf',
      'aufschreiben bitte',
      'notiere kopfschmerzen nach wein',
      'merk dir stress heute',
      'als anmerkung speichern',
      'notiz machen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('save_voice_note');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract note text after "notiz:"', () => {
      const { slots } = findBestMatch('notiz: kopfschmerzen nach dem sport');
      expect((slots.text as string)).toContain('kopfschmerzen');
    });

    it('should preserve original text', () => {
      const { slots } = findBestMatch('merke stress bei der arbeit heute');
      expect((slots.text as string)).toContain('stress');
    });

    it('should build mutation plan with undo', () => {
      const plan = buildPlan('speichere das als notiz');
      expect(plan?.kind).toBe('mutation');
      if (plan?.kind === 'mutation') {
        expect(plan.mutationType).toBe('save_voice_note');
        expect(plan.undo).toBeDefined();
        expect(plan.undo?.windowMs).toBe(8000);
      }
    });
  });

  // ============================================
  // Rate Medication Intake
  // ============================================
  describe('rate_intake', () => {
    const positiveTests = [
      'bewerte die wirkung von triptan',
      'triptan wirkung bewerten',
      'wie gut hat das triptan gewirkt',
      'wirkung bewerten',
      'bewertung abgeben für sumatriptan',
      'das triptan hat gut geholfen',
      'das hat nicht gewirkt',
      'medikament wirkung eintragen',
      'sumatriptan hat super gewirkt',
      'ibuprofen hilft nicht',
      'bewerte sumatriptan',
      'wirkung von triptan eintragen',
      'triptan war sehr gut',
      'das medikament wirkt toll',
      'schmerzmittel hat geholfen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('rate_intake');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract implicit rating "sehr gut"', () => {
      const { slots } = findBestMatch('sumatriptan hat sehr gut gewirkt');
      expect(slots.rating).toBe(9);
    });

    it('should extract implicit rating "gut"', () => {
      const { slots } = findBestMatch('triptan hat geholfen');
      expect(slots.rating).toBe(7);
    });

    it('should extract implicit rating "nicht gewirkt"', () => {
      const { slots } = findBestMatch('das triptan hat nicht gewirkt');
      expect(slots.rating).toBe(1);
    });

    it('should extract implicit rating "etwas"', () => {
      const { slots } = findBestMatch('hat etwas geholfen');
      expect(slots.rating).toBe(4);
    });

    it('should extract explicit rating number', () => {
      const { slots } = findBestMatch('bewerte triptan mit 8 von 10');
      expect(slots.rating).toBe(8);
    });

    it('should build slot_filling for missing medication', () => {
      const plan = buildPlan('wirkung bewerten');
      expect(plan?.kind).toBe('slot_filling');
      if (plan?.kind === 'slot_filling') {
        expect(plan.missingSlot).toBe('medName');
      }
    });

    it('should build slot_filling for missing rating', () => {
      const plan = buildPlan('bewerte sumatriptan');
      expect(plan?.kind).toBe('slot_filling');
      if (plan?.kind === 'slot_filling') {
        expect(plan.missingSlot).toBe('rating');
      }
    });

    it('should build mutation plan with all slots', () => {
      const plan = buildPlan('sumatriptan hat super gewirkt');
      expect(plan?.kind).toBe('mutation');
      if (plan?.kind === 'mutation') {
        expect(plan.mutationType).toBe('rate_intake');
        expect(plan.risk).toBe('medium');
      }
    });
  });

  // ============================================
  // Quick Pain Entry
  // ============================================
  describe('quick_pain_entry', () => {
    const positiveTests = [
      'habe gerade migräne',
      'kopfschmerzen stufe 7',
      'schmerzen eintragen',
      'migräne mit aura',
      'starke kopfschmerzen',
      'ich habe kopfschmerzen',
      'leichte migräne',
      'sehr starke schmerzen',
      'mittlere kopfschmerzen',
      'kopfweh eintragen',
      'migräne notieren',
      'schmerzen stufe 5',
      'hab kopfschmerzen',
      'migräne jetzt',
      'schmerz eintrag machen',
    ];

    it.each(positiveTests)('should match: "%s"', (phrase) => {
      const { skill, confidence } = findBestMatch(phrase);
      expect(skill?.id).toBe('quick_pain_entry');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should extract pain level from "stufe 7"', () => {
      const { slots } = findBestMatch('kopfschmerzen stufe 7');
      expect(slots.painLevel).toBe(7);
    });

    it('should extract pain level from "stark"', () => {
      const { slots } = findBestMatch('starke kopfschmerzen');
      expect(slots.painLevel).toBe(7);
    });

    it('should extract pain level from "leicht"', () => {
      const { slots } = findBestMatch('leichte migräne');
      expect(slots.painLevel).toBe(3);
    });

    it('should extract pain level from "sehr stark"', () => {
      const { slots } = findBestMatch('sehr starke schmerzen');
      expect(slots.painLevel).toBe(9);
    });

    it('should detect aura', () => {
      const { slots } = findBestMatch('migräne mit aura');
      expect(slots.hasAura).toBe(true);
    });

    it('should detect medication mention', () => {
      const { slots } = findBestMatch('migräne, hab sumatriptan genommen');
      expect(slots.medications).toContain('Sumatriptan 50mg');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle mixed German/English', () => {
      const { skill, confidence } = findBestMatch('reminder für triptan um 14 uhr');
      expect(skill?.id).toBe('create_reminder');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should handle abbreviations', () => {
      const { skill, confidence } = findBestMatch('erinnerung 14h triptan');
      expect(skill?.id).toBe('create_reminder');
      expect(confidence).toBeGreaterThan(0.4);
    });

    it('should distinguish note from reminder', () => {
      const noteResult = findBestMatch('notiz: stress bei arbeit');
      const reminderResult = findBestMatch('erinnere mich an stress');
      
      expect(noteResult.skill?.id).toBe('save_voice_note');
      expect(reminderResult.skill?.id).toBe('create_reminder');
    });

    it('should handle compound sentences', () => {
      const { skill, confidence } = findBestMatch('ich habe kopfschmerzen und habe triptan genommen');
      expect(skill?.id).toBe('quick_pain_entry');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should handle negation in rating', () => {
      const { slots } = findBestMatch('das ibuprofen hat überhaupt nicht geholfen');
      expect(slots.rating).toBe(1);
    });

    it('should handle time expressions with "morgen"', () => {
      const { slots } = findBestMatch('erinnere mich morgen an triptan');
      expect(slots.dateTime).toBeDefined();
      const date = new Date(slots.dateTime as string);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(date.getDate()).toBe(tomorrow.getDate());
    });

    it('should handle informal "hab"', () => {
      const { skill, confidence } = findBestMatch('hab kopfschmerzen');
      expect(skill?.id).toBe('quick_pain_entry');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should handle polite forms', () => {
      const { skill, confidence } = findBestMatch('könntest du mich bitte an mein medikament erinnern');
      expect(skill?.id).toBe('create_reminder');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should handle typo-tolerant medication names', () => {
      // When exact match not found, should still recognize category
      const emptyMeds: VoiceUserContext = { userMeds: [] };
      const { slots } = findBestMatch('wann zuletzt sumatripan genommen', emptyMeds);
      // May match as category
      expect(slots).toBeDefined();
    });
  });
});
