/**
 * Tests für Navigation Intent Parser
 */

import { describe, it, expect } from 'vitest';
import { detectNavigationIntent } from '../navigationIntents';

const mockUserMeds = [
  { name: 'Sumatriptan' },
  { name: 'Ibuprofen' },
  { name: 'Ajovy' },
  { name: 'Topiramat' },
];

describe('detectNavigationIntent', () => {
  describe('Reminder Intents', () => {
    it('should detect reminder creation intent', () => {
      const testCases = [
        'Erinnere mich morgen um acht an meine Ajovy-Spritze',
        'Neue Erinnerung für Sumatriptan heute Abend',
        'Erinnere mich an meine Tabletten',
        'Nicht vergessen: Medikament nehmen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_reminder_create');
      });
    });

    it('should extract date and time from reminder', () => {
      const result = detectNavigationIntent(
        'Erinnere mich morgen um 8 Uhr an Sumatriptan',
        mockUserMeds
      );
      
      expect(result?.type).toBe('navigate_reminder_create');
      const payload = result?.payload as any;
      expect(payload?.time).toBe('08:00');
      expect(payload?.medications).toContain('Sumatriptan');
    });
  });

  describe('Appointment Intents', () => {
    it('should detect appointment creation intent', () => {
      const testCases = [
        'Neuen Arzttermin nächsten Dienstag um 9 Uhr beim Dr. Müller anlegen',
        'Arzttermin beim Neurologen am 3. April',
        'Termin bei Dr. Schmidt eintragen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_appointment_create');
      });
    });
  });

  describe('Profile/Doctor Edit Intents', () => {
    it('should detect profile edit intent', () => {
      const testCases = [
        'Ich möchte meine persönlichen Daten bearbeiten',
        'Adresse ändern',
        'Meine Kontaktdaten aktualisieren',
        'Profil bearbeiten',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_profile_edit');
      });
    });

    it('should detect doctor edit intent', () => {
      const testCases = [
        'Ich möchte meine Arztdaten eingeben',
        'Neurologe hinzufügen',
        'Arzt hinzufügen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_doctor_edit');
      });
    });
  });

  describe('Diary Intents', () => {
    it('should detect diary navigation intent', () => {
      const testCases = [
        'Zeig mir mein Kopfschmerztagebuch',
        'Einträge der letzten sieben Tage anzeigen',
        'Tagebuch anzeigen',
        'Meine Einträge zeigen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_diary');
      });
    });

    it('should extract period from diary request', () => {
      const result = detectNavigationIntent(
        'Zeig mir mein Tagebuch der letzten Woche',
        mockUserMeds
      );
      
      expect(result?.type).toBe('navigate_diary');
      const payload = result?.payload as any;
      expect(payload?.period).toBe('week');
    });
  });

  describe('Analysis Intents', () => {
    it('should detect analysis navigation intent', () => {
      const testCases = [
        'Ich möchte meine Auswertung sehen',
        'Analyse vom letzten Monat anzeigen',
        'Zeig mir Muster meiner Migräne',
        'Statistik anzeigen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_analysis');
      });
    });
  });

  describe('Report Intents', () => {
    it('should detect report navigation intent', () => {
      const testCases = [
        'Arztbericht für Oktober erstellen',
        'PDF fürs nächste Arztgespräch machen',
        'Bericht der letzten drei Monate',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('navigate_report');
      });
    });
  });

  describe('Help Intent', () => {
    it('should detect help intent', () => {
      const testCases = [
        'Was kann ich hier sagen?',
        'Welche Sprachbefehle gibt es?',
        'Hilfe',
        'Beispiele zeigen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('help');
      });
    });
  });

  describe('No Match', () => {
    it('should return null for non-navigation intents', () => {
      const testCases = [
        'Kopfschmerzen Stärke 7',
        'Ich habe Migräne',
        'Sumatriptan genommen',
      ];

      testCases.forEach(text => {
        const result = detectNavigationIntent(text, mockUserMeds);
        expect(result).toBeNull();
      });
    });
  });
});
