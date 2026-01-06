/**
 * Analytics Question Detection Tests
 */

import { describe, it, expect } from 'vitest';
import { analyzeVoiceTranscript } from '../voiceNlp';

const createUserContext = () => ({
  userMeds: [
    { name: 'Sumatriptan 50 mg' },
    { name: 'Ibuprofen 400 mg' },
    { name: 'Rizatriptan' },
  ],
  timezone: 'Europe/Berlin',
  language: 'de-DE',
});

describe('Analytics Question Detection', () => {
  describe('pain_free_days queries', () => {
    it('recognizes "Wie viele schmerzfreie Tage in den letzten 30 Tagen?"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele schmerzfreie Tage in den letzten 30 Tagen?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
      expect(result.analyticsQuery?.queryType).toBe('pain_free_days');
    });

    it('recognizes "schmerzfreie Tage letzten Monat"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele schmerzfreie Tage letzten Monat?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
    });

    it('recognizes "Tage ohne Kopfschmerzen letzte Woche"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Tage ohne Kopfschmerzen letzte Woche?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
    });

    it('recognizes "Tage ohne Schmerzen in den letzten 14 Tagen"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Tage ohne Schmerzen in den letzten 14 Tagen?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
    });
  });

  describe('headache_days queries', () => {
    it('recognizes "Wie viele Migränetage letzten Monat?"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Migränetage letzten Monat?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
      expect(result.analyticsQuery?.queryType).toBe('headache_days');
    });

    it('recognizes "Kopfschmerztage in den letzten 30 Tagen"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Kopfschmerztage in den letzten 30 Tagen?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
    });
  });

  describe('medication queries', () => {
    it('recognizes "Wie oft Triptan letzten Monat?"', () => {
      const result = analyzeVoiceTranscript(
        'Wie oft Triptan letzten Monat?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
      expect(result.analyticsQuery?.queryType).toBe('triptan_days');
    });

    it('recognizes "Wie oft Sumatriptan in den letzten 30 Tagen?"', () => {
      const result = analyzeVoiceTranscript(
        'Wie oft Sumatriptan in den letzten 30 Tagen?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
      expect(result.analyticsQuery?.queryType).toBe('med_days');
      expect(result.analyticsQuery?.medName).toBe('sumatriptan');
    });
  });

  describe('average queries', () => {
    it('recognizes "durchschnittliche Schmerzstärke letzte Woche"', () => {
      const result = analyzeVoiceTranscript(
        'Was war die durchschnittliche Schmerzstärke letzte Woche?',
        createUserContext()
      );
      expect(result.intent).toBe('analytics_query');
      expect(result.analyticsQuery?.queryType).toBe('avg_pain');
    });
  });

  describe('time range extraction', () => {
    it('extracts 30 days from "letzten 30 Tage"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Einträge in den letzten 30 Tagen?',
        createUserContext()
      );
      expect(result.analyticsQuery?.timeRangeDays).toBe(30);
    });

    it('extracts 7 days from "letzte Woche"', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele Einträge letzte Woche?',
        createUserContext()
      );
      expect(result.analyticsQuery?.timeRangeDays).toBe(7);
    });

    it('defaults to 30 days when no range specified', () => {
      const result = analyzeVoiceTranscript(
        'Wie viele schmerzfreie Tage hatte ich?',
        createUserContext()
      );
      expect(result.analyticsQuery?.timeRangeDays).toBe(30);
    });
  });
});
