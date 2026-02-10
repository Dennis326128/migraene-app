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
 * 8) REGRESSION: "vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg" → pain must be 5, NOT 10
 */

import { describe, it, expect, vi } from 'vitest';
import { parseVoiceEntry } from '../simpleVoiceParser';
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
  // ================================================
  // REGRESSION TEST: The critical bug
  // ================================================
  describe('REGRESSION: "vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg"', () => {
    it('should detect pain level 5, NOT 10 from time expression', () => {
      const result = parseVoiceEntry(
        'vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg',
        userMeds
      );
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should produce empty notes (all structured data removed)', () => {
      const result = parseVoiceEntry(
        'vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg',
        userMeds
      );
      expect(result.note.trim()).toBe('');
    });

    it('should detect time as 10 minutes ago', () => {
      const result = parseVoiceEntry(
        'vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg',
        userMeds
      );
      expect(result.time.kind).toBe('relative');
      expect(result.time.relative_minutes).toBe(10);
    });

    it('should detect Ibuprofen medication', () => {
      const result = parseVoiceEntry(
        'vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg',
        userMeds
      );
      expect(result.medications.length).toBeGreaterThanOrEqual(1);
    });

    it('should classify as new_entry', () => {
      const result = parseVoiceEntry(
        'vor 10 Minuten schmerzstärke 5 Ibuprofen 800 mg',
        userMeds
      );
      expect(result.entry_type).toBe('new_entry');
    });
  });

  // ================================================
  // Pain intensity disambiguation
  // ================================================
  describe('Pain intensity: must not confuse time/dose numbers', () => {
    it('should not confuse "vor 10 Minuten" with pain 10', () => {
      const result = parseVoiceEntry('vor 10 Minuten schmerzstärke 3', userMeds);
      expect(result.pain_intensity.value).toBe(3);
    });

    it('should not confuse "800 mg" with pain level', () => {
      const result = parseVoiceEntry('Ibuprofen 800 mg schmerzstärke 4', userMeds);
      expect(result.pain_intensity.value).toBe(4);
    });

    it('should not confuse "vor 5 Stunden" with pain 5 when "schmerzstärke 8" present', () => {
      const result = parseVoiceEntry('vor 5 Stunden schmerzstärke 8', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });

    it('should prefer number AFTER trigger over number before', () => {
      const result = parseVoiceEntry('vor 10 Minuten schmerzstärke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });
  });

  // ================================================
  // Original test cases
  // ================================================
  describe('Test Case 1: Full entry with STT error "Schmerzlautstärke"', () => {
    it('should classify as new_entry with correct time, pain, and medication', () => {
      const result = parseVoiceEntry(
        'Seit 30 Minuten Migräne, Schmerzlautstärke 8 von 10, Ibuprofen 400.',
        userMeds
      );
      expect(result.entry_type).toBe('new_entry');
      expect(result.time.relative_minutes).toBe(30);
      expect(result.pain_intensity.value).toBe(8);
      expect(result.medications.length).toBeGreaterThan(0);
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
    });
  });

  describe('Test Case 3: Context entry', () => {
    it('should classify as context_entry', () => {
      const result = parseVoiceEntry(
        'Trigger: wenig geschlafen und Stress im Büro.',
        userMeds
      );
      expect(result.entry_type).toBe('context_entry');
      expect(result.pain_intensity.value).toBeNull();
      expect(result.note).toContain('wenig geschlafen');
    });
  });

  describe('Test Case 4: Absolute time with written number', () => {
    it('should recognize absolute time and written number', () => {
      const result = parseVoiceEntry(
        'Um 14:30 Kopfschmerzen, Intensität sechs, Sumatriptan.',
        userMeds
      );
      expect(result.entry_type).toBe('new_entry');
      expect(result.time.time).toBe('14:30');
      expect(result.pain_intensity.value).toBe(6);
      expect(result.medications.length).toBeGreaterThan(0);
    });
  });

  describe('Test Case 5: Vague statement', () => {
    it('should classify as context_entry', () => {
      const result = parseVoiceEntry(
        'Ich glaube es ist wieder schlimmer geworden.',
        userMeds
      );
      expect(result.entry_type).toBe('context_entry');
    });
  });

  describe('Test Case 6: Written number on scale', () => {
    it('should recognize written number pain scale', () => {
      const result = parseVoiceEntry('Schmerzstärke acht auf zehn.', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });
  });

  describe('Pain Intensity STT Error Handling', () => {
    it('should recognize "Schmerzlautstärke 7"', () => {
      const result = parseVoiceEntry('Schmerzlautstärke 7', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "Schmerz Stärke 5"', () => {
      const result = parseVoiceEntry('Schmerz Stärke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "7 von 10"', () => {
      const result = parseVoiceEntry('Kopfschmerzen 7 von 10', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "8/10"', () => {
      const result = parseVoiceEntry('Migräne 8/10', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });

    it('should recognize "schnellstärke 4" (STT typo)', () => {
      const result = parseVoiceEntry('schnellstärke 4', userMeds);
      expect(result.pain_intensity.value).toBe(4);
    });

    it('should recognize German number words', () => {
      const result = parseVoiceEntry('Schmerzstärke sieben', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should default to null when no pain recognized', () => {
      const result = parseVoiceEntry('habe gut geschlafen', userMeds);
      expect(result.pain_intensity.value).toBeNull();
    });
  });

  describe('Time Parsing', () => {
    it('should parse "vor 30 Minuten"', () => {
      const result = parseVoiceEntry('Kopfschmerzen vor 30 Minuten', userMeds);
      expect(result.time.relative_minutes).toBe(30);
    });

    it('should parse "seit einer Stunde"', () => {
      const result = parseVoiceEntry('Migräne seit einer Stunde', userMeds);
      expect(result.time.relative_minutes).toBe(60);
    });

    it('should parse "halb drei" as 02:30', () => {
      const result = parseVoiceEntry('Schmerzen halb drei', userMeds);
      expect(result.time.time).toBe('02:30');
    });

    it('should parse "halb drei nachmittags" as 14:30', () => {
      const result = parseVoiceEntry('Schmerzen halb drei nachmittags', userMeds);
      expect(result.time.time).toBe('14:30');
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
  });

  describe('Notes Cleanup', () => {
    it('should not contain "schmerzstärke" in notes', () => {
      const result = parseVoiceEntry('schmerzstärke 5 Kopfschmerz', userMeds);
      expect(result.note.toLowerCase()).not.toContain('schmerzstärke');
    });

    it('should not contain time expressions in notes', () => {
      const result = parseVoiceEntry('vor 10 Minuten Kopfschmerz schmerzstärke 5', userMeds);
      expect(result.note.toLowerCase()).not.toContain('vor 10 minuten');
    });

    it('should preserve free-text context like "wegen Stress"', () => {
      const result = parseVoiceEntry('schmerzstärke 6 Ibuprofen wegen Stress', userMeds);
      expect(result.note).toContain('Stress');
    });

    it('should not leave dose words in notes', () => {
      const result = parseVoiceEntry('halbe Ibuprofen genommen Stärke 6', userMeds);
      expect(result.note).not.toMatch(/halbe/i);
      expect(result.note).not.toMatch(/genommen/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = parseVoiceEntry('', userMeds);
      expect(result.entry_type).toBe('context_entry');
      expect(result.confidence).toBe(0);
    });

    it('should handle very short input', () => {
      const result = parseVoiceEntry('ja', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });
  });
});
