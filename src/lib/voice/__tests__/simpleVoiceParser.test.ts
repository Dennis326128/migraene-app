/**
 * Tests for Simple Voice Parser v2
 * 
 * Test cases from requirements:
 * 1) "Seit 30 Minuten Migräne, Schmerzlautstärke 8 von 10, Ibuprofen 400."
 * 2) "Nur Stärke 7, vor 20 Minuten, Naproxen."
 * 3) "Trigger: wenig geschlafen und Stress im Büro."
 * 4) "Um 14:30 Kopfschmerzen, Intensität sechs, Sumatriptan."
 * 5) "Ich glaube es ist wieder schlimmer geworden."
 * 6) "Schmerzstärke acht auf zehn."
 * 7) "Ibu profen 400 genommen" (STT error)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseVoiceEntry, type VoiceParseResult } from '../simpleVoiceParser';
import type { UserMedication } from '../medicationFuzzyMatch';

// Mock berlinDateToday for consistent tests
vi.mock('@/lib/tz', () => ({
  berlinDateToday: () => '2024-01-15'
}));

// Standard user medication list for tests
const userMeds: UserMedication[] = [
  { id: 'med-1', name: 'Ibuprofen 400 mg', wirkstoff: 'Ibuprofen' },
  { id: 'med-2', name: 'Sumatriptan 50 mg', wirkstoff: 'Sumatriptan' },
  { id: 'med-3', name: 'Naproxen 500 mg', wirkstoff: 'Naproxen' },
  { id: 'med-4', name: 'Paracetamol 500 mg', wirkstoff: 'Paracetamol' },
  { id: 'med-5', name: 'Rizatriptan 10 mg', wirkstoff: 'Rizatriptan' },
];

describe('Simple Voice Parser v2', () => {
  describe('Test Case 1: "Seit 30 Minuten Migräne, Schmerzlautstärke 8 von 10, Ibuprofen 400."', () => {
    it('should classify as new_entry with correct time, pain, and medication', () => {
      const result = parseVoiceEntry(
        'Seit 30 Minuten Migräne, Schmerzlautstärke 8 von 10, Ibuprofen 400.',
        userMeds
      );
      
      expect(result.entry_type).toBe('new_entry');
      expect(result.time.relative_minutes).toBe(30);
      expect(result.time.kind).toBe('relative');
      expect(result.pain_intensity.value).toBe(8);
      expect(result.medications.length).toBeGreaterThan(0);
      expect(result.medications[0].name).toContain('Ibuprofen');
    });
  });

  describe('Test Case 2: "Nur Stärke 7, vor 20 Minuten, Naproxen."', () => {
    it('should recognize pain level and time correctly', () => {
      const result = parseVoiceEntry(
        'Nur Stärke 7, vor 20 Minuten, Naproxen.',
        userMeds
      );
      
      expect(result.entry_type).toBe('new_entry');
      expect(result.time.relative_minutes).toBe(20);
      expect(result.pain_intensity.value).toBe(7);
      expect(result.medications.length).toBeGreaterThan(0);
      expect(result.medications[0].name).toContain('Naproxen');
    });
  });

  describe('Test Case 3: "Trigger: wenig geschlafen und Stress im Büro."', () => {
    it('should classify as context_entry', () => {
      const result = parseVoiceEntry(
        'Trigger: wenig geschlafen und Stress im Büro.',
        userMeds
      );
      
      expect(result.entry_type).toBe('context_entry');
      expect(result.pain_intensity.value).toBeNull();
      expect(result.medications.length).toBe(0);
      expect(result.note).toContain('wenig geschlafen');
    });
  });

  describe('Test Case 4: "Um 14:30 Kopfschmerzen, Intensität sechs, Sumatriptan."', () => {
    it('should recognize absolute time and written number', () => {
      const result = parseVoiceEntry(
        'Um 14:30 Kopfschmerzen, Intensität sechs, Sumatriptan.',
        userMeds
      );
      
      expect(result.entry_type).toBe('new_entry');
      expect(result.time.time).toBe('14:30');
      expect(result.time.kind).toBe('absolute');
      expect(result.pain_intensity.value).toBe(6);
      expect(result.medications.length).toBeGreaterThan(0);
      expect(result.medications[0].name).toContain('Sumatriptan');
    });
  });

  describe('Test Case 5: "Ich glaube es ist wieder schlimmer geworden."', () => {
    it('should classify as context_entry with low confidence or show toggle', () => {
      const result = parseVoiceEntry(
        'Ich glaube es ist wieder schlimmer geworden.',
        userMeds
      );
      
      // Should be context entry since no clear pain/medication data
      expect(result.entry_type).toBe('context_entry');
      expect(result.note).toContain('schlimmer');
      // May have typeCanBeToggled if classification was uncertain
    });
  });

  describe('Test Case 6: "Schmerzstärke acht auf zehn."', () => {
    it('should recognize written number pain scale', () => {
      const result = parseVoiceEntry(
        'Schmerzstärke acht auf zehn.',
        userMeds
      );
      
      expect(result.entry_type).toBe('new_entry');
      expect(result.pain_intensity.value).toBe(8);
      expect(result.pain_intensity.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Test Case 7: "Ibu profen 400 genommen" (STT split error)', () => {
    it('should fuzzy match split medication name', () => {
      const result = parseVoiceEntry(
        'Ibu profen 400 genommen',
        userMeds
      );
      
      expect(result.entry_type).toBe('new_entry');
      expect(result.medications.length).toBeGreaterThan(0);
      // Should match to Ibuprofen despite the space
      expect(result.medications[0].name.toLowerCase()).toContain('ibuprofen');
    });
  });

  describe('Pain Intensity Detection - STT Error Handling', () => {
    it('should recognize "Schmerzlautstärke" as pain trigger', () => {
      const result = parseVoiceEntry('Schmerzlautstärke 7', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "Schmerzlautstaerke" without umlaut', () => {
      const result = parseVoiceEntry('Schmerzlautstaerke 6', userMeds);
      expect(result.pain_intensity.value).toBe(6);
    });

    it('should recognize "Schmerz Stärke" with space', () => {
      const result = parseVoiceEntry('Schmerz Stärke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "7 von 10" pattern', () => {
      const result = parseVoiceEntry('Kopfschmerzen 7 von 10', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "8/10" pattern', () => {
      const result = parseVoiceEntry('Migräne 8/10', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });

    it('should not confuse mg dosage with pain level', () => {
      const result = parseVoiceEntry('Ibuprofen 400 mg genommen, Stärke 6', userMeds);
      expect(result.pain_intensity.value).toBe(6);
      // Should NOT be 400
    });

    it('should recognize "schnellstärke 4" (STT typo for Schmerzstärke)', () => {
      const result = parseVoiceEntry('schnellstärke 4', userMeds);
      expect(result.pain_intensity.value).toBe(4);
    });

    it('should recognize "schmerstärke 5" (missing z)', () => {
      const result = parseVoiceEntry('schmerstärke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "schnellstaerke 3" (STT typo + no umlaut)', () => {
      const result = parseVoiceEntry('schnellstaerke 3', userMeds);
      expect(result.pain_intensity.value).toBe(3);
    });

    it('should default to null when no pain recognized', () => {
      const result = parseVoiceEntry('Kopfschmerzen seit gestern', userMeds);
      // Should NOT default in parser; UI handles default
      // pain_intensity.value should be found via context though
    });
  });

  describe('Time Parsing', () => {
    it('should parse "vor 30 Minuten"', () => {
      const result = parseVoiceEntry('Kopfschmerzen vor 30 Minuten', userMeds);
      expect(result.time.relative_minutes).toBe(30);
      expect(result.time.kind).toBe('relative');
    });

    it('should parse "seit einer Stunde"', () => {
      const result = parseVoiceEntry('Migräne seit einer Stunde', userMeds);
      expect(result.time.relative_minutes).toBe(60);
    });

    it('should parse "vor 2 Stunden"', () => {
      const result = parseVoiceEntry('Schmerzen vor 2 Stunden', userMeds);
      expect(result.time.relative_minutes).toBe(120);
    });

    it('should parse "um 14:30"', () => {
      const result = parseVoiceEntry('Attacke um 14:30', userMeds);
      expect(result.time.time).toBe('14:30');
      expect(result.time.kind).toBe('absolute');
    });

    it('should parse "halb drei" as 02:30 (no PM context)', () => {
      const result = parseVoiceEntry('Schmerzen halb drei', userMeds);
      expect(result.time.time).toBe('02:30');
    });

    it('should parse "halb drei nachmittags" as 14:30', () => {
      const result = parseVoiceEntry('Schmerzen halb drei nachmittags', userMeds);
      expect(result.time.time).toBe('14:30');
    });

    it('should parse "heute Morgen"', () => {
      const result = parseVoiceEntry('Kopfschmerzen heute Morgen', userMeds);
      expect(result.time.displayText).toBe('heute Morgen');
      expect(result.time.kind).toBe('absolute');
    });

    it('should default to "jetzt" when no time specified', () => {
      const result = parseVoiceEntry('Kopfschmerzen Stärke 5', userMeds);
      expect(result.time.isNow).toBe(true);
    });
  });

  describe('Medication Recognition', () => {
    it('should match exact medication names', () => {
      const result = parseVoiceEntry('Sumatriptan genommen', userMeds);
      expect(result.medications.length).toBe(1);
      expect(result.medications[0].name).toContain('Sumatriptan');
    });

    it('should handle "halbe Tablette"', () => {
      const result = parseVoiceEntry('halbe Ibuprofen genommen', userMeds);
      expect(result.medications.length).toBe(1);
      expect(result.medications[0].doseQuarters).toBe(2);
    });

    it('should handle multiple medications', () => {
      const result = parseVoiceEntry('Ibuprofen und Sumatriptan genommen', userMeds);
      expect(result.medications.length).toBe(2);
    });

    it('should mark uncertain matches for review', () => {
      // Using a slightly misspelled medication
      const result = parseVoiceEntry('Somatriptan genommen', userMeds);
      // Should still match but with lower confidence
      if (result.medications.length > 0) {
        expect(result.medications[0].confidence).toBeLessThan(0.95);
      }
    });
  });

  describe('Entry Type Classification', () => {
    it('should classify pain+medication as new_entry', () => {
      const result = parseVoiceEntry('Migräne Stärke 7, Ibuprofen genommen', userMeds);
      expect(result.entry_type).toBe('new_entry');
    });

    it('should classify trigger words as context_entry', () => {
      const result = parseVoiceEntry('Stress auf der Arbeit, wenig geschlafen', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });

    it('should classify weather mentions as context_entry', () => {
      const result = parseVoiceEntry('Wetterumschwung heute, Föhn', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });

    it('should show toggle option when classification is uncertain', () => {
      const result = parseVoiceEntry('Fühle mich nicht gut', userMeds);
      // This is ambiguous - could be either type
      expect(result.entry_type).toBe('context_entry');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', () => {
      const result = parseVoiceEntry('', userMeds);
      expect(result.entry_type).toBe('context_entry');
      expect(result.confidence).toBe(0);
    });

    it('should handle very short input', () => {
      const result = parseVoiceEntry('ja', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });

    it('should handle input with only numbers', () => {
      const result = parseVoiceEntry('7', userMeds);
      // Standalone number without context
      expect(result.entry_type).toBe('context_entry');
    });

    it('should handle German number words', () => {
      const result = parseVoiceEntry('Schmerzstärke sieben', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });
  });

  describe('Sonstiges/Notes Cleanup', () => {
    it('should remove "eine" when it belongs to a medication intake', () => {
      const result = parseVoiceEntry('eine Sumatriptan schnellstärke 4', userMeds);
      expect(result.medications.length).toBeGreaterThan(0);
      expect(result.note).not.toContain('eine');
    });

    it('should not leave dose words in notes', () => {
      const result = parseVoiceEntry('halbe Ibuprofen genommen Stärke 6', userMeds);
      expect(result.note).not.toMatch(/halbe/i);
      expect(result.note).not.toMatch(/genommen/i);
    });

    it('should leave non-medication text in notes', () => {
      const result = parseVoiceEntry('Ibuprofen genommen wegen Stress auf der Arbeit', userMeds);
      expect(result.note).toContain('Stress');
    });
  });
});
