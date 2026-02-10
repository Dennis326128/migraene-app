/**
 * Tests for Simple Voice Parser v2
 * 
 * Comprehensive test suite covering:
 * - Pain intensity (triggers, number words, scale patterns, mg filter, prepositions)
 * - Medication matching (fuzzy, split tokens, doses)
 * - Time parsing (relative, absolute, German clock phrases)
 * - Notes cleanup (slot-noise removal, context preservation)
 * - Edge cases
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
  // Pain intensity: disambiguation
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

    it('should not confuse "400 mg" as pain level', () => {
      const result = parseVoiceEntry('Ibuprofen 400 mg genommen', userMeds);
      expect(result.pain_intensity.value).toBeNull();
    });

    it('should not confuse "vor 2 Stunden" as pain 2', () => {
      const result = parseVoiceEntry('Kopfschmerzen vor 2 Stunden', userMeds);
      // Pain should be null (no explicit pain level)
      // or if standalone number detection kicks in, it should NOT be 2
      if (result.pain_intensity.value !== null) {
        expect(result.pain_intensity.value).not.toBe(2);
      }
    });
  });

  // ================================================
  // Pain intensity: scale patterns
  // ================================================
  describe('Pain intensity: scale patterns', () => {
    it('should recognize "5 von 10"', () => {
      const result = parseVoiceEntry('Kopfschmerzen 5 von 10', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "8/10"', () => {
      const result = parseVoiceEntry('Migräne 8/10', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });

    it('should recognize "3 auf 10"', () => {
      const result = parseVoiceEntry('Kopfschmerzen 3 auf 10', userMeds);
      expect(result.pain_intensity.value).toBe(3);
    });

    it('should recognize "7 von zehn"', () => {
      const result = parseVoiceEntry('Migräne 7 von zehn', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });
  });

  // ================================================
  // Pain intensity: number words
  // ================================================
  describe('Pain intensity: German number words', () => {
    it('should recognize "Schmerzstärke sieben"', () => {
      const result = parseVoiceEntry('Schmerzstärke sieben', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "Intensität sechs"', () => {
      const result = parseVoiceEntry('Kopfschmerzen Intensität sechs', userMeds);
      expect(result.pain_intensity.value).toBe(6);
    });

    it('should recognize "Stärke drei"', () => {
      const result = parseVoiceEntry('Stärke drei', userMeds);
      expect(result.pain_intensity.value).toBe(3);
    });

    it('should recognize "schmerzstärke acht auf zehn"', () => {
      const result = parseVoiceEntry('Schmerzstärke acht auf zehn.', userMeds);
      expect(result.pain_intensity.value).toBe(8);
    });

    it('should recognize "schmerzstärke fünf"', () => {
      const result = parseVoiceEntry('schmerzstärke fünf', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });
  });

  // ================================================
  // Pain intensity: STT errors
  // ================================================
  describe('Pain Intensity STT Error Handling', () => {
    it('should recognize "Schmerzlautstärke 7"', () => {
      const result = parseVoiceEntry('Schmerzlautstärke 7', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "Schmerz Stärke 5"', () => {
      const result = parseVoiceEntry('Schmerz Stärke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "schnellstärke 4" (STT typo)', () => {
      const result = parseVoiceEntry('schnellstärke 4', userMeds);
      expect(result.pain_intensity.value).toBe(4);
    });

    it('should recognize "schmerzstrecke 5" (STT typo)', () => {
      const result = parseVoiceEntry('schmerzstrecke 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "schmerzstarke 6" (STT typo)', () => {
      const result = parseVoiceEntry('schmerzstarke 6', userMeds);
      expect(result.pain_intensity.value).toBe(6);
    });
  });

  // ================================================
  // Pain intensity: intensity words
  // ================================================
  describe('Pain intensity: descriptive words', () => {
    it('should recognize "starke Kopfschmerzen" as ~7', () => {
      const result = parseVoiceEntry('starke Kopfschmerzen genommen', userMeds);
      expect(result.pain_intensity.value).toBe(7);
    });

    it('should recognize "leichte Migräne" as ~3', () => {
      const result = parseVoiceEntry('leichte Migräne', userMeds);
      expect(result.pain_intensity.value).toBe(3);
    });

    it('should NOT interpret "wenig geschlafen" as pain level', () => {
      const result = parseVoiceEntry('wenig geschlafen und Stress', userMeds);
      expect(result.pain_intensity.value).toBeNull();
    });

    it('should recognize "extreme Kopfschmerzen" as ~9', () => {
      const result = parseVoiceEntry('extreme Kopfschmerzen seit heute', userMeds);
      expect(result.pain_intensity.value).toBe(9);
    });

    it('should default to null when no pain recognized', () => {
      const result = parseVoiceEntry('habe gut geschlafen', userMeds);
      expect(result.pain_intensity.value).toBeNull();
    });
  });

  // ================================================
  // Pain intensity: preposition patterns
  // ================================================
  describe('Pain intensity: "bei X" / "auf X" patterns', () => {
    it('should recognize "Kopfschmerzen bei 5"', () => {
      const result = parseVoiceEntry('Kopfschmerzen bei 5', userMeds);
      expect(result.pain_intensity.value).toBe(5);
    });

    it('should recognize "Migräne auf 8"', () => {
      const result = parseVoiceEntry('Migräne auf 8', userMeds);
      expect(result.pain_intensity.value).toBe(8);
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

  // ================================================
  // Time Parsing
  // ================================================
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

    it('should parse "vor einer halben Stunde"', () => {
      const result = parseVoiceEntry('Kopfschmerzen vor einer halben Stunde', userMeds);
      expect(result.time.relative_minutes).toBe(30);
    });

    it('should parse "vor einer Viertelstunde"', () => {
      const result = parseVoiceEntry('Migräne vor einer Viertelstunde', userMeds);
      expect(result.time.relative_minutes).toBe(15);
    });

    it('should parse "heute morgen"', () => {
      const result = parseVoiceEntry('Kopfschmerzen heute morgen', userMeds);
      expect(result.time.isNow).toBe(false);
    });

    it('should parse "gestern abend"', () => {
      const result = parseVoiceEntry('Migräne gestern abend', userMeds);
      expect(result.time.isNow).toBe(false);
    });

    it('should parse "um 8" without "uhr"', () => {
      const result = parseVoiceEntry('Kopfschmerzen um 8', userMeds);
      expect(result.time.time).toBe('08:00');
      expect(result.time.isNow).toBe(false);
    });

    it('should parse "viertel nach 3"', () => {
      const result = parseVoiceEntry('Kopfschmerzen viertel nach 3', userMeds);
      expect(result.time.time).toBe('03:15');
    });

    it('should parse "viertel vor 5"', () => {
      const result = parseVoiceEntry('Kopfschmerzen viertel vor 5', userMeds);
      expect(result.time.time).toBe('04:45');
    });

    it('should parse "anderthalb Stunden"', () => {
      const result = parseVoiceEntry('Migräne anderthalb Stunden', userMeds);
      expect(result.time.relative_minutes).toBe(90);
    });
  });

  // ================================================
  // Medication Recognition
  // ================================================
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

    it('should handle "eine Sumatriptan" as qty=1', () => {
      const result = parseVoiceEntry('eine Sumatriptan genommen', userMeds);
      expect(result.medications.length).toBe(1);
      expect(result.medications[0].doseQuarters).toBe(4); // 1 full tablet
    });

    it('should handle "zwei Tabletten Ibuprofen" as qty=2', () => {
      const result = parseVoiceEntry('zwei Tabletten Ibuprofen genommen', userMeds);
      expect(result.medications.length).toBe(1);
      expect(result.medications[0].doseQuarters).toBe(8);
    });

    it('should recognize medication with dose "Ibuprofen 800"', () => {
      const result = parseVoiceEntry('Ibuprofen 800 genommen', userMeds);
      expect(result.medications.length).toBeGreaterThanOrEqual(1);
    });

    it('should recognize Paracetamol', () => {
      const result = parseVoiceEntry('Paracetamol genommen wegen Kopfschmerzen', userMeds);
      expect(result.medications.length).toBe(1);
      expect(result.medications[0].name).toContain('Paracetamol');
    });
  });

  // ================================================
  // Notes Cleanup
  // ================================================
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

    it('should produce empty notes for pure slot input', () => {
      const result = parseVoiceEntry('schmerzstärke 7 Ibuprofen vor 10 Minuten', userMeds);
      expect(result.note.trim()).toBe('');
    });

    it('should keep "Übelkeit" as context', () => {
      const result = parseVoiceEntry('schmerzstärke 5 Übelkeit und Lichtempfindlichkeit', userMeds);
      expect(result.note).toContain('Übelkeit');
    });

    it('should keep "linksseitig" as context', () => {
      const result = parseVoiceEntry('Kopfschmerzen schmerzstärke 6 linksseitig', userMeds);
      expect(result.note).toContain('linksseitig');
    });

    it('should keep "wegen Wetter" as context', () => {
      const result = parseVoiceEntry('Migräne Stärke 5 wegen Wetter', userMeds);
      expect(result.note).toContain('Wetter');
    });
  });

  // ================================================
  // Fuzzy slot-noise cleanup in notes
  // ================================================
  describe('Fuzzy slot-noise cleanup in notes', () => {
    it('should remove "schmerzstrecke" (STT error for schmerzstärke) from notes', () => {
      const result = parseVoiceEntry('schmerzstrecke 5 wegen stress', userMeds);
      expect(result.note).not.toMatch(/schmerzstrecke/i);
      expect(result.note).toContain('stress');
    });

    it('should remove "schmerzstarke" from notes', () => {
      const result = parseVoiceEntry('schmerzstarke 7 Ibuprofen', userMeds);
      expect(result.note).not.toMatch(/schmerzstarke/i);
    });

    it('should produce empty notes when only slot data present with STT errors', () => {
      const result = parseVoiceEntry('vor 10 minuten schmerzstrecke 5 ibuprofen 800 mg', userMeds);
      expect(result.note).toBe('');
    });

    it('should keep genuine context alongside STT-mangled pain keyword', () => {
      const result = parseVoiceEntry('schmerzstrecke 5 übelkeit und lichtempfindlich', userMeds);
      expect(result.note).toContain('übelkeit');
      expect(result.note).toContain('lichtempfindlich');
      expect(result.note).not.toMatch(/schmerzstrecke/i);
    });
  });

  // ================================================
  // Classification
  // ================================================
  describe('Entry Classification', () => {
    it('should classify pain + med as new_entry', () => {
      const result = parseVoiceEntry('Schmerzstärke 5 Sumatriptan', userMeds);
      expect(result.entry_type).toBe('new_entry');
    });

    it('should classify pure trigger as context_entry', () => {
      const result = parseVoiceEntry('Wetter war schlecht, wenig geschlafen', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });

    it('should classify med-only as new_entry', () => {
      const result = parseVoiceEntry('Ibuprofen genommen', userMeds);
      expect(result.entry_type).toBe('new_entry');
    });

    it('should classify pain-only with context as new_entry', () => {
      const result = parseVoiceEntry('Kopfschmerzen Stärke 8', userMeds);
      expect(result.entry_type).toBe('new_entry');
    });
  });

  // ================================================
  // Compound real-world inputs
  // ================================================
  describe('Real-world compound inputs', () => {
    it('should handle "Migräne seit heute morgen Stärke 6 Sumatriptan genommen"', () => {
      const result = parseVoiceEntry('Migräne seit heute morgen Stärke 6 Sumatriptan genommen', userMeds);
      expect(result.entry_type).toBe('new_entry');
      expect(result.pain_intensity.value).toBe(6);
      expect(result.medications.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle "Kopfschmerzen 4/10 vor einer Stunde Paracetamol"', () => {
      const result = parseVoiceEntry('Kopfschmerzen 4/10 vor einer Stunde Paracetamol', userMeds);
      expect(result.pain_intensity.value).toBe(4);
      expect(result.time.relative_minutes).toBe(60);
      expect(result.medications.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle "leichte Kopfschmerzen wegen Stress"', () => {
      const result = parseVoiceEntry('leichte Kopfschmerzen wegen Stress', userMeds);
      expect(result.pain_intensity.value).toBe(3); // leicht
      expect(result.note).toContain('Stress');
    });
  });

  // ================================================
  // Edge Cases
  // ================================================
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

    it('should handle input with only numbers', () => {
      const result = parseVoiceEntry('5', userMeds);
      expect(result.entry_type).toBe('context_entry');
    });

    it('should handle no user meds gracefully', () => {
      const result = parseVoiceEntry('schmerzstärke 5 Ibuprofen', []);
      expect(result.pain_intensity.value).toBe(5);
      // No user meds → no medication match
      expect(result.medications.length).toBe(0);
    });
  });
});
