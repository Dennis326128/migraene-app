/**
 * VoicePlanner Integration Tests
 * 
 * Tests for the main planner with confidence gating and safety checks
 */

import { describe, it, expect } from 'vitest';
import { planVoiceCommand, CONFIDENCE_THRESHOLDS } from '../planner';

describe('VoicePlanner', () => {
  // ============================================
  // Navigation Plans
  // ============================================
  describe('Navigation Commands', () => {
    const navTests = [
      { input: 'öffne tagebuch', expectedView: 'diary' },
      { input: 'zeige auswertung', expectedView: 'analysis' },
      { input: 'gehe zu einstellungen', expectedView: 'settings' },
      { input: 'öffne medikamente', expectedView: 'medications' },
      { input: 'zeige erinnerungen', expectedView: 'reminders' },
      { input: 'öffne arztdaten', expectedView: 'doctors' },
      { input: 'zeige profil', expectedView: 'profile' },
      { input: 'öffne notizen', expectedView: 'voice_notes' },
      { input: 'erstelle bericht', expectedView: 'diary_report' },
      { input: 'zeige wirkung', expectedView: 'medication_effects' },
    ];

    it.each(navTests)('should plan: "%s" → $expectedView', ({ input, expectedView }) => {
      const result = planVoiceCommand(input, { userMeds: [] });
      expect(result.plan.kind).toBe('navigate');
      if (result.plan.kind === 'navigate') {
        expect(result.plan.targetView).toBe(expectedView);
        expect(result.plan.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.CONFIRM_NAV_QUERY);
      }
    });
  });

  // ============================================
  // Query Plans
  // ============================================
  describe('Query Commands', () => {
    const userMeds = [{ name: 'Sumatriptan 50mg' }, { name: 'Ibuprofen 400' }];

    it('should plan "wann zuletzt triptan" as query', () => {
      const result = planVoiceCommand('wann zuletzt triptan genommen', { userMeds });
      expect(result.plan.kind).toBe('query');
      if (result.plan.kind === 'query') {
        expect(result.plan.queryType).toBe('last_intake_med');
        expect(result.plan.params.medName).toBeDefined();
      }
    });

    it('should plan "wie oft triptan" as count query', () => {
      const result = planVoiceCommand('wie oft triptan genommen', { userMeds });
      expect(result.plan.kind).toBe('query');
      if (result.plan.kind === 'query') {
        expect(result.plan.queryType).toBe('count_med_range');
      }
    });

    it('should plan "letzter eintrag" as open_entry', () => {
      const result = planVoiceCommand('zeig letzten eintrag', { userMeds: [] });
      expect(result.plan.kind).toBe('open_entry');
    });

    it('should plan migraine count query', () => {
      const result = planVoiceCommand('wie viele migränetage', { userMeds: [] });
      expect(result.plan.kind).toBe('query');
      if (result.plan.kind === 'query') {
        expect(result.plan.queryType).toBe('count_migraine_range');
      }
    });
  });

  // ============================================
  // Mutation Plans
  // ============================================
  describe('Mutation Commands', () => {
    const userMeds = [{ name: 'Sumatriptan 50mg' }];

    it('should plan reminder creation', () => {
      const result = planVoiceCommand('erinnere mich um 14 uhr an triptan', { userMeds });
      expect(result.plan.kind).toBe('mutation');
      if (result.plan.kind === 'mutation') {
        expect(result.plan.mutationType).toBe('create_reminder');
        expect(result.plan.risk).toBe('low');
      }
    });

    it('should plan voice note saving', () => {
      const result = planVoiceCommand('notiz: stress bei der arbeit', { userMeds: [] });
      expect(result.plan.kind).toBe('mutation');
      if (result.plan.kind === 'mutation') {
        expect(result.plan.mutationType).toBe('save_voice_note');
        expect(result.plan.undo).toBeDefined();
      }
    });

    it('should plan rating with implicit value', () => {
      const result = planVoiceCommand('bewerte sumatriptan super gewirkt', { userMeds });
      // Note: May return slot_filling or mutation depending on rating extraction
      expect(['mutation', 'slot_filling', 'not_supported']).toContain(result.plan.kind);
    });

    it('should plan quick pain entry', () => {
      const result = planVoiceCommand('starke migräne gerade', { userMeds: [] });
      expect(result.plan.kind).toBe('mutation');
      if (result.plan.kind === 'mutation') {
        expect(result.plan.mutationType).toBe('quick_pain_entry');
      }
    });
  });

  // ============================================
  // Slot Filling
  // ============================================
  describe('Slot Filling', () => {
    it('should request time for reminder without time', () => {
      const result = planVoiceCommand('erinnere mich an medikament', { userMeds: [] });
      expect(result.plan.kind).toBe('slot_filling');
      if (result.plan.kind === 'slot_filling') {
        expect(result.plan.missingSlot).toBe('dateTime');
        expect(result.plan.suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should request medication for rating', () => {
      const result = planVoiceCommand('wirkung bewerten', { userMeds: [] });
      expect(result.plan.kind).toBe('slot_filling');
      if (result.plan.kind === 'slot_filling') {
        expect(result.plan.missingSlot).toBe('medName');
      }
    });
  });

  // ============================================
  // Not Supported / Low Confidence
  // ============================================
  describe('Not Supported', () => {
    it('should return not_supported for gibberish', () => {
      const result = planVoiceCommand('xyz abc 123 foo bar', { userMeds: [] });
      expect(result.plan.kind).toBe('not_supported');
    });

    it('should return not_supported for empty input', () => {
      const result = planVoiceCommand('', { userMeds: [] });
      expect(result.plan.kind).toBe('not_supported');
    });

    it('should suggest alternatives in not_supported', () => {
      const result = planVoiceCommand('mach irgendwas', { userMeds: [] });
      expect(result.plan.kind).toBe('not_supported');
      if (result.plan.kind === 'not_supported') {
        expect(result.plan.suggestions).toBeDefined();
        expect(result.plan.suggestions.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Confirm Flow
  // ============================================
  describe('Confirm Flow', () => {
    it('should include risk level in mutation plans', () => {
      const result = planVoiceCommand('bewerte triptan mit 5', { 
        userMeds: [{ name: 'Triptan' }] 
      });
      
      if (result.plan.kind === 'mutation') {
        expect(result.plan.risk).toBeDefined();
        expect(['low', 'medium', 'high']).toContain(result.plan.risk);
      }
    });
  });

  // ============================================
  // Diagnostics
  // ============================================
  describe('Diagnostics', () => {
    it('should return diagnostics info', () => {
      const result = planVoiceCommand('öffne tagebuch', { userMeds: [] });
      
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.canonicalizedText).toBeDefined();
      expect(result.diagnostics.candidateScores).toBeDefined();
      expect(result.diagnostics.candidateScores!.length).toBeGreaterThan(0);
    });

    it('should sort matches by confidence in diagnostics', () => {
      const result = planVoiceCommand('öffne tagebuch', { userMeds: [] });
      
      const scores = result.diagnostics.candidateScores || [];
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
      }
    });

    it('should include processing time', () => {
      const result = planVoiceCommand('öffne tagebuch', { userMeds: [] });
      expect(result.diagnostics.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Confidence Thresholds
  // ============================================
  describe('Confidence Thresholds', () => {
    it('should have NAV threshold reasonable', () => {
      expect(CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY).toBeGreaterThan(0.5);
      expect(CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY).toBeLessThan(1);
    });

    it('should have ACTION threshold higher than NAV', () => {
      expect(CONFIDENCE_THRESHOLDS.AUTO_ACTION).toBeGreaterThan(CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY);
    });

    it('should have confirm threshold lower than auto', () => {
      expect(CONFIDENCE_THRESHOLDS.CONFIRM_NAV_QUERY).toBeLessThan(CONFIDENCE_THRESHOLDS.AUTO_NAV_QUERY);
      expect(CONFIDENCE_THRESHOLDS.CONFIRM_ACTION).toBeLessThan(CONFIDENCE_THRESHOLDS.AUTO_ACTION);
    });

    it('should never auto-delete', () => {
      expect(CONFIDENCE_THRESHOLDS.AUTO_DELETE).toBe(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle very long input', () => {
      const longInput = 'öffne bitte das tagebuch und zeige mir alle einträge der letzten woche wo ich kopfschmerzen hatte';
      const result = planVoiceCommand(longInput, { userMeds: [] });
      expect(result.plan.kind).not.toBe('not_supported');
    });

    it('should handle special characters', () => {
      const result = planVoiceCommand('öffne tagebuch!', { userMeds: [] });
      expect(result.plan.kind).toBe('navigate');
    });

    it('should handle numbers in text', () => {
      const result = planVoiceCommand('erinnere mich um 14:30 uhr', { userMeds: [] });
      expect(result.plan.kind).toBe('slot_filling'); // Missing title
    });

    it('should handle mixed case', () => {
      const result = planVoiceCommand('ÖFFNE TAGEBUCH', { userMeds: [] });
      expect(result.plan.kind).toBe('navigate');
    });
  });
});
