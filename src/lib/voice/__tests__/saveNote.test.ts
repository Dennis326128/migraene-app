import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveVoiceNote } from '../saveNote';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client — must mirror actual production calls:
// 1. supabase.auth.getUser()
// 2. supabase.from('user_profiles').select().single()
// 3. supabase.from('voice_notes').insert().select().single()
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn()
  }
}));

const MOCK_USER_ID = 'user-abc-123';

/**
 * Helper: set up the standard successful mock chain.
 * Returns the insert spy so tests can assert on it.
 */
function setupSuccessMock(returnId = 'test-uuid-123') {
  // auth.getUser → authenticated user
  (supabase.auth.getUser as any).mockResolvedValue({
    data: { user: { id: MOCK_USER_ID } },
    error: null
  });

  const mockInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: returnId },
        error: null
      })
    }))
  }));

  // from() must handle both 'user_profiles' (select) and 'voice_notes' (insert)
  (supabase.from as any).mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { voice_notes_enabled: true },
            error: null
          })
        }))
      };
    }
    // voice_notes
    return { insert: mockInsert };
  });

  return mockInsert;
}

/**
 * Helper: set up DB-error mock (auth + profile succeed, insert fails)
 */
function setupDbErrorMock(mockError: { message: string; code?: string }) {
  (supabase.auth.getUser as any).mockResolvedValue({
    data: { user: { id: MOCK_USER_ID } },
    error: null
  });

  const mockInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: mockError
      })
    }))
  }));

  (supabase.from as any).mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { voice_notes_enabled: true },
            error: null
          })
        }))
      };
    }
    return { insert: mockInsert };
  });

  return mockInsert;
}

describe('saveVoiceNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock: 2025-10-16 14:37:00 Berlin (UTC+2)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-16T12:37:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Erfolgreiche Speicherung', () => {
    it('Speichert korrekt mit Text und Metadaten', async () => {
      const mockInsert = setupSuccessMock('test-uuid-123');

      const noteId = await saveVoiceNote({
        rawText: 'Hatte vor 2 Stunden Kopfschmerzen',
        sttConfidence: 0.92
      });

      expect(noteId).toBe('test-uuid-123');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hatte vor 2 Stunden Kopfschmerzen',
          stt_confidence: 0.92,
          source: 'voice',
          tz: 'Europe/Berlin'
        })
      );
    });

    it('Speichert ohne Confidence (null)', async () => {
      const mockInsert = setupSuccessMock('test-uuid-456');

      await saveVoiceNote({ rawText: 'Kopfschmerzen' });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Kopfschmerzen',
          stt_confidence: null,
          source: 'voice',
          tz: 'Europe/Berlin'
        })
      );
    });

    it('Speichert mit source="manual"', async () => {
      const mockInsert = setupSuccessMock('test-uuid-789');

      await saveVoiceNote({
        rawText: 'Manueller Eintrag',
        source: 'manual'
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'manual' })
      );
    });

    it('Trimmt Leerzeichen am Anfang/Ende', async () => {
      const mockInsert = setupSuccessMock();

      await saveVoiceNote({ rawText: '   Text mit Leerzeichen   ' });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Text mit Leerzeichen' })
      );
    });
  });

  describe('Validierung: Fehlerhafte Eingaben', () => {
    it('Leerer Text wirft Fehler', async () => {
      setupSuccessMock();
      await expect(saveVoiceNote({ rawText: '' }))
        .rejects.toThrow('Voice-Notiz darf nicht leer sein');
    });

    it('Nur Leerzeichen wirft Fehler', async () => {
      setupSuccessMock();
      await expect(saveVoiceNote({ rawText: '   ' }))
        .rejects.toThrow('Voice-Notiz darf nicht leer sein');
    });

    it('Zu langer Text (>5000 Zeichen) wirft Fehler', async () => {
      setupSuccessMock();
      const longText = 'x'.repeat(5001);
      await expect(saveVoiceNote({ rawText: longText }))
        .rejects.toThrow('Voice-Notiz zu lang');
    });

    it('Genau 5000 Zeichen ist erlaubt', async () => {
      setupSuccessMock();
      const exactText = 'x'.repeat(5000);
      await expect(saveVoiceNote({ rawText: exactText }))
        .resolves.toBeDefined();
    });
  });

  describe('Auth / Feature-Gate', () => {
    it('Nicht eingeloggt wirft Fehler', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: null },
        error: null
      });

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow('Nicht eingeloggt');
    });

    it('Voice-Notizen deaktiviert wirft Fehler', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: MOCK_USER_ID } },
        error: null
      });
      (supabase.from as any).mockImplementation(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { voice_notes_enabled: false },
            error: null
          })
        }))
      }));

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow('Voice-Notizen sind in den Einstellungen deaktiviert');
    });
  });

  describe('Datenbank-Fehler', () => {
    it('DB-Fehler wird korrekt weitergegeben', async () => {
      setupDbErrorMock({ message: 'DB connection failed', code: '500' });

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow('Speichern fehlgeschlagen: DB connection failed');
    });

    it('RLS-Verletzung wird als Fehler geworfen', async () => {
      setupDbErrorMock({
        message: 'new row violates row-level security policy',
        code: '42501'
      });

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow(/row-level security/);
    });
  });

  describe('Console Logging', () => {
    it('Loggt erfolgreiche Speicherung', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setupSuccessMock('test-uuid-log');

      await saveVoiceNote({ rawText: 'Test' });

      expect(consoleSpy).toHaveBeenCalledWith('✅ Voice-Notiz gespeichert:', 'test-uuid-log');
      consoleSpy.mockRestore();
    });

    it('Loggt Fehler bei Speicher-Fehlschlag', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = { message: 'Test error' };
      setupDbErrorMock(mockError);

      try {
        await saveVoiceNote({ rawText: 'Test' });
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Voice-Notiz speichern fehlgeschlagen:',
        mockError
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
