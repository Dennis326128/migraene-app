import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseOccurredAt } from '../timeOnly';

describe('parseOccurredAt - Zeitparser', () => {
  beforeEach(() => {
    // Mock: 2025-10-16 14:37:00 Berlin (12:37:00 UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-16T12:37:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Relative Zeitangaben', () => {
    it('Relativ: "vor 2 Stunden" → 12:45 Berlin (10:45 UTC)', () => {
      const result = parseOccurredAt('Hatte vor 2 Stunden Kopfschmerzen');
      // 14:37 - 2h = 12:37 → gerundet 12:45 Berlin = 10:45 UTC
      expect(result).toBe('2025-10-16T10:45:00.000Z');
    });

    it('Relativ: "vor 30 Minuten" → 14:00 Berlin (12:00 UTC)', () => {
      const result = parseOccurredAt('vor 30 Minuten Suma genommen');
      // 14:37 - 30min = 14:07 → gerundet 14:00 Berlin = 12:00 UTC
      expect(result).toBe('2025-10-16T12:00:00.000Z');
    });

    it('Relativ: "vor 5 Minuten" → 14:30 Berlin (12:30 UTC)', () => {
      const result = parseOccurredAt('vor 5 Minuten hatte ich Schmerzen');
      // 14:37 - 5min = 14:32 → gerundet 14:30 Berlin = 12:30 UTC
      expect(result).toBe('2025-10-16T12:30:00.000Z');
    });

    it('Relativ: "vor 1 Tag" → gestern 14:45 Berlin', () => {
      const result = parseOccurredAt('vor 1 Tag Migräne gehabt');
      // 15.10. 14:37 → gerundet 14:45 Berlin = 12:45 UTC
      expect(result).toBe('2025-10-15T12:45:00.000Z');
    });
  });

  describe('Absolute Zeitangaben mit Tagen', () => {
    it('Gestern Abend → 20:00 Berlin (18:00 UTC)', () => {
      const result = parseOccurredAt('gestern Abend hatte ich starke Schmerzen');
      // 15.10. 20:00 Berlin = 18:00 UTC
      expect(result).toBe('2025-10-15T18:00:00.000Z');
    });

    it('Vorgestern + Tageszeit: "vorgestern Abend" → 14.10. 20:00', () => {
      const result = parseOccurredAt('vorgestern Abend Migräne');
      // 14.10. 20:00 Berlin = 18:00 UTC
      expect(result).toBe('2025-10-14T18:00:00.000Z');
    });
  });

  describe('Exakte Uhrzeiten', () => {
    it('Exakte Zeit: "um 14:30" → 14:30 Berlin (12:30 UTC)', () => {
      const result = parseOccurredAt('um 14:30 Uhr Ibu genommen');
      expect(result).toBe('2025-10-16T12:30:00.000Z');
    });

    it('Nur Stunde: "14 Uhr" → 14:00 Berlin (12:00 UTC)', () => {
      const result = parseOccurredAt('14 Uhr Schmerzen bekommen');
      expect(result).toBe('2025-10-16T12:00:00.000Z');
    });

    it('Zeit mit Doppelpunkt: "9:15" → 09:15 Berlin (07:15 UTC)', () => {
      const result = parseOccurredAt('9:15 aufgewacht mit Kopfweh');
      expect(result).toBe('2025-10-16T07:15:00.000Z');
    });
  });

  describe('Tageszeiten', () => {
    it('Tageszeit: "morgens" → 08:00 Berlin (06:00 UTC)', () => {
      const result = parseOccurredAt('morgens aufgewacht mit Kopfweh');
      expect(result).toBe('2025-10-16T06:00:00.000Z');
    });

    it('Tageszeit: "nachmittags" → 15:00 Berlin (13:00 UTC)', () => {
      const result = parseOccurredAt('nachmittags wurde es schlimmer');
      expect(result).toBe('2025-10-16T13:00:00.000Z');
    });

    it('Tageszeit: "abends" → 20:00 Berlin (18:00 UTC)', () => {
      const result = parseOccurredAt('abends Schmerzen bekommen');
      expect(result).toBe('2025-10-16T18:00:00.000Z');
    });

    it('Tageszeit: "nachts" → 02:00 Berlin (00:00 UTC)', () => {
      const result = parseOccurredAt('nachts aufgewacht');
      expect(result).toBe('2025-10-16T00:00:00.000Z');
    });
  });

  describe('Fallback & Rundung', () => {
    it('Fallback: Keine Zeitangabe → jetzt (gerundet auf 15 Min)', () => {
      const result = parseOccurredAt('Hatte starke Kopfschmerzen');
      // 14:37 → gerundet 14:45 Berlin = 12:45 UTC
      expect(result).toBe('2025-10-16T12:45:00.000Z');
    });

    it('Rundung: 14:37 → 14:45', () => {
      const result = parseOccurredAt('jetzt gerade');
      expect(result).toBe('2025-10-16T12:45:00.000Z');
    });

    it('Rundung: 14:08 → 14:00', () => {
      vi.setSystemTime(new Date('2025-10-16T12:08:00.000Z')); // 14:08 Berlin
      const result = parseOccurredAt('gerade eben');
      expect(result).toBe('2025-10-16T12:00:00.000Z'); // 14:00 Berlin
    });
  });

  describe('Sommerzeit / Winterzeit (DST)', () => {
    it('DST-Wechsel: 31.03.2025 02:30 (nach Umstellung auf CEST)', () => {
      // Am 31.03.2025 um 02:00 wird auf 03:00 umgestellt (UTC+2)
      vi.setSystemTime(new Date('2025-03-31T01:30:00.000Z')); // 03:30 CEST
      const result = parseOccurredAt('um 4 Uhr');
      // 04:00 CEST = 02:00 UTC
      expect(result).toBe('2025-03-31T02:00:00.000Z');
    });

    it('DST-Wechsel: 26.10.2025 (Winterzeit UTC+1)', () => {
      // Am 26.10.2025 um 03:00 wird auf 02:00 zurückgestellt (UTC+1)
      vi.setSystemTime(new Date('2025-10-26T13:00:00.000Z')); // 14:00 CET
      const result = parseOccurredAt('um 15 Uhr');
      // 15:00 CET = 14:00 UTC
      expect(result).toBe('2025-10-26T14:00:00.000Z');
    });
  });

  describe('Edge Cases', () => {
    it('Kombination: "gestern um 14:30"', () => {
      const result = parseOccurredAt('gestern um 14:30 Schmerzen');
      // Gestern 14:30 Berlin = gestern 12:30 UTC
      expect(result).toBe('2025-10-15T12:30:00.000Z');
    });

    it('Mehrere Zeitangaben: nimmt erste', () => {
      const result = parseOccurredAt('vor 2 Stunden um 14 Uhr');
      // "vor 2 Stunden" wird zuerst gematcht
      expect(result).toBe('2025-10-16T10:45:00.000Z');
    });

    it('Unvollständige Zeit wird ignoriert', () => {
      const result = parseOccurredAt('irgendwann heute');
      // Fallback: jetzt gerundet
      expect(result).toBe('2025-10-16T12:45:00.000Z');
    });
  });
});
