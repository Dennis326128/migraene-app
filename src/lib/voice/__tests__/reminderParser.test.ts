import { describe, it, expect } from 'vitest';
import { parseGermanReminderEntry, isReminderTrigger } from '../reminderParser';
import { format, addDays } from 'date-fns';

const mockUserMeds = [
  { name: 'Aspirin' },
  { name: 'Ibuprofen' },
  { name: 'Paracetamol' },
];

describe('reminderParser', () => {
  describe('isReminderTrigger', () => {
    it('should detect reminder trigger words', () => {
      expect(isReminderTrigger('Erinnere mich morgens')).toBe(true);
      expect(isReminderTrigger('reminder für morgen')).toBe(true);
      expect(isReminderTrigger('nicht vergessen: Termin')).toBe(true);
      expect(isReminderTrigger('Alarm für 8 Uhr')).toBe(true);
      expect(isReminderTrigger('Benachrichtige mich')).toBe(true);
    });

    it('should not trigger on non-reminder phrases', () => {
      expect(isReminderTrigger('Schmerzen 7 von 10')).toBe(false);
      expect(isReminderTrigger('Ich habe Kopfschmerzen')).toBe(false);
      expect(isReminderTrigger('Heute sehr müde')).toBe(false);
    });
  });

  describe('parseGermanReminderEntry - Medication Reminders', () => {
    it('should parse simple morning medication reminder', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich morgens an Aspirin',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Aspirin');
      expect(result.timeOfDay).toBe('morning');
      expect(result.time).toBe('08:00');
      expect(result.repeat).toBe('none');
    });

    it('should parse multiple medications', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich an Aspirin und Ibuprofen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Aspirin');
      expect(result.medications).toContain('Ibuprofen');
      expect(result.medications).toHaveLength(2);
    });

    it('should parse daily evening medication', () => {
      const result = parseGermanReminderEntry(
        'Täglich abends Ibuprofen nehmen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Ibuprofen');
      expect(result.timeOfDay).toBe('evening');
      expect(result.time).toBe('18:00');
      expect(result.repeat).toBe('daily');
    });

    it('should parse medication at specific time', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich um 14:30 an Paracetamol',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Paracetamol');
      expect(result.time).toBe('14:30');
      expect(result.timeOfDay).toBe('evening');
    });

    it('should parse noon medication', () => {
      const result = parseGermanReminderEntry(
        'Mittags Aspirin einnehmen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Aspirin');
      expect(result.timeOfDay).toBe('noon');
      expect(result.time).toBe('12:00');
    });

    it('should parse night medication', () => {
      const result = parseGermanReminderEntry(
        'Nachts Ibuprofen nehmen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Ibuprofen');
      expect(result.timeOfDay).toBe('night');
      expect(result.time).toBe('22:00');
    });
  });

  describe('parseGermanReminderEntry - Appointment Reminders', () => {
    it('should parse tomorrow appointment with time', () => {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const result = parseGermanReminderEntry(
        'Erinnere mich morgen um 14 Uhr an Arzttermin',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.date).toBe(tomorrow);
      expect(result.time).toBe('14:00');
      expect(result.title).toContain('Arzttermin');
    });

    it('should parse today appointment', () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const result = parseGermanReminderEntry(
        'Heute um 10:00 Zahnarzt',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.date).toBe(today);
      expect(result.time).toBe('10:00');
    });

    it('should parse appointment in X days', () => {
      const inThreeDays = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const result = parseGermanReminderEntry(
        'In 3 Tagen um 15:30 Physiotherapie',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.date).toBe(inThreeDays);
      expect(result.time).toBe('15:30');
    });

    it('should parse meeting reminder', () => {
      const result = parseGermanReminderEntry(
        'Nicht vergessen: Meeting um 16 Uhr',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.time).toBe('16:00');
      expect(result.title).toContain('Meeting');
    });
  });

  describe('parseGermanReminderEntry - Repeat Patterns', () => {
    it('should detect daily repeat', () => {
      const result = parseGermanReminderEntry(
        'Täglich morgens Aspirin',
        mockUserMeds
      );

      expect(result.repeat).toBe('daily');
    });

    it('should detect weekly repeat', () => {
      const result = parseGermanReminderEntry(
        'Wöchentlich zum Arzt',
        mockUserMeds
      );

      expect(result.repeat).toBe('weekly');
    });

    it('should detect monthly repeat', () => {
      const result = parseGermanReminderEntry(
        'Monatlich Kontrolle',
        mockUserMeds
      );

      expect(result.repeat).toBe('monthly');
    });

    it('should default to none for one-time reminders', () => {
      const result = parseGermanReminderEntry(
        'Morgen Termin',
        mockUserMeds
      );

      expect(result.repeat).toBe('none');
    });
  });

  describe('parseGermanReminderEntry - Confidence Scores', () => {
    it('should have high confidence for complete medication reminder', () => {
      const result = parseGermanReminderEntry(
        'Täglich morgens um 8 Uhr Aspirin nehmen',
        mockUserMeds
      );

      expect(result.confidence.type).toBe('high');
      expect(result.confidence.time).toBe('high');
      expect(result.confidence.medications).toBe('high');
    });

    it('should have low medication confidence when no meds detected', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich an Medikament',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.confidence.medications).toBe('low');
    });

    it('should have high confidence for appointments', () => {
      const result = parseGermanReminderEntry(
        'Morgen um 14 Uhr Arzttermin',
        mockUserMeds
      );

      expect(result.confidence.type).toBe('high');
      expect(result.confidence.time).toBe('high');
      expect(result.confidence.medications).toBe('high'); // Not needed for appointments
    });
  });

  describe('parseGermanReminderEntry - Edge Cases', () => {
    it('should handle time without minutes', () => {
      const result = parseGermanReminderEntry(
        'Um 14 Uhr Termin',
        mockUserMeds
      );

      expect(result.time).toBe('14:00');
    });

    it('should handle "Uhr" keyword', () => {
      const result = parseGermanReminderEntry(
        'Um 8 Uhr morgens Aspirin',
        mockUserMeds
      );

      expect(result.time).toBe('08:00');
    });

    it('should handle unknown medication names', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich an Unbekanntes Medikament',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toHaveLength(0);
    });

    it('should extract notes from input', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich morgens an Aspirin wegen Kopfschmerzen',
        mockUserMeds
      );

      expect(result.notes).toContain('wegen Kopfschmerzen');
    });

    it('should generate proper title for medication', () => {
      const result = parseGermanReminderEntry(
        'Morgens Aspirin und Ibuprofen',
        mockUserMeds
      );

      expect(result.title).toBe('Aspirin, Ibuprofen');
    });

    it('should generate fallback title when no specifics found', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich an etwas',
        []
      );

      expect(result.title).toBe('Erinnerung');
    });
  });

  describe('parseGermanReminderEntry - Real World Examples', () => {
    it('Example 1: Daily morning medication', () => {
      const result = parseGermanReminderEntry(
        'Erinnere mich täglich morgens um 8 Uhr an Aspirin und Ibuprofen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toEqual(expect.arrayContaining(['Aspirin', 'Ibuprofen']));
      expect(result.time).toBe('08:00');
      expect(result.timeOfDay).toBe('morning');
      expect(result.repeat).toBe('daily');
    });

    it('Example 2: One-time appointment tomorrow', () => {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const result = parseGermanReminderEntry(
        'Nicht vergessen morgen um 14:30 Zahnarzttermin',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.date).toBe(tomorrow);
      expect(result.time).toBe('14:30');
      expect(result.repeat).toBe('none');
    });

    it('Example 3: Evening medication without specific time', () => {
      const result = parseGermanReminderEntry(
        'Abends Paracetamol einnehmen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Paracetamol');
      expect(result.timeOfDay).toBe('evening');
      expect(result.time).toBe('18:00');
    });

    it('Example 4: Weekly appointment', () => {
      const result = parseGermanReminderEntry(
        'Wöchentlich Freitag um 10 Uhr Physiotherapie',
        mockUserMeds
      );

      expect(result.type).toBe('appointment');
      expect(result.time).toBe('10:00');
      expect(result.repeat).toBe('weekly');
    });

    it('Example 5: Multiple times of day implied', () => {
      const result = parseGermanReminderEntry(
        'Täglich morgens und abends Ibuprofen',
        mockUserMeds
      );

      expect(result.type).toBe('medication');
      expect(result.medications).toContain('Ibuprofen');
      expect(result.repeat).toBe('daily');
      // Note: Parser nimmt die erste erkannte Tageszeit
      expect(result.timeOfDay).toBe('morning');
    });
  });
});
