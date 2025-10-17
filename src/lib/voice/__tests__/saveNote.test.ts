import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveVoiceNote } from '../saveNote';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }
}));

describe('saveVoiceNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock: 2025-10-16 14:37:00 Berlin
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-16T12:37:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Erfolgreiche Speicherung', () => {
    it('Speichert korrekt mit Zeit-Parsing', async () => {
      const mockId = 'test-uuid-123';
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: mockId },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      const noteId = await saveVoiceNote({
        rawText: 'Hatte vor 2 Stunden Kopfschmerzen',
        sttConfidence: 0.92
      });

      expect(noteId).toBe(mockId);
      expect(mockInsert).toHaveBeenCalledWith({
        text: 'Hatte vor 2 Stunden Kopfschmerzen',
        occurred_at: '2025-10-16T10:45:00.000Z', // 12:37 Berlin - 2h = 10:37 → 10:45
        stt_confidence: 0.92,
        source: 'voice',
        tz: 'Europe/Berlin'
      });
    });

    it('Speichert ohne Confidence (null)', async () => {
      const mockId = 'test-uuid-456';
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: mockId },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: 'Kopfschmerzen'
      });

      expect(mockInsert).toHaveBeenCalledWith({
        text: 'Kopfschmerzen',
        occurred_at: '2025-10-16T12:45:00.000Z', // jetzt gerundet
        stt_confidence: null,
        source: 'voice',
        tz: 'Europe/Berlin'
      });
    });

    it('Speichert mit source="manual"', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid-789' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: 'Manueller Eintrag',
        source: 'manual'
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'manual'
        })
      );
    });

    it('Trimmt Leerzeichen am Anfang/Ende', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: '   Text mit Leerzeichen   '
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Text mit Leerzeichen'
        })
      );
    });
  });

  describe('Validierung: Fehlerhafte Eingaben', () => {
    it('Leerer Text wirft Fehler', async () => {
      await expect(saveVoiceNote({ rawText: '' }))
        .rejects.toThrow('Voice-Notiz darf nicht leer sein');
    });

    it('Nur Leerzeichen wirft Fehler', async () => {
      await expect(saveVoiceNote({ rawText: '   ' }))
        .rejects.toThrow('Voice-Notiz darf nicht leer sein');
    });

    it('Zu langer Text (>5000 Zeichen) wirft Fehler', async () => {
      const longText = 'x'.repeat(5001);
      await expect(saveVoiceNote({ rawText: longText }))
        .rejects.toThrow('Voice-Notiz zu lang (max. 5000 Zeichen)');
    });

    it('Genau 5000 Zeichen ist erlaubt', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      const exactText = 'x'.repeat(5000);
      await expect(saveVoiceNote({ rawText: exactText }))
        .resolves.toBeDefined();
    });
  });

  describe('Datenbank-Fehler', () => {
    it('DB-Fehler wird korrekt weitergegeben', async () => {
      const mockError = { message: 'DB connection failed', code: '500' };
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow('Speichern fehlgeschlagen: DB connection failed');
    });

    it('RLS-Verletzung wird als Fehler geworfen', async () => {
      const mockError = { 
        message: 'new row violates row-level security policy', 
        code: '42501' 
      };
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await expect(saveVoiceNote({ rawText: 'Test' }))
        .rejects.toThrow(/row-level security/);
    });
  });

  describe('Zeitpunkt-Parsing Integration', () => {
    it('Parst "gestern Abend" korrekt', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: 'gestern Abend Migräne'
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          occurred_at: '2025-10-15T18:00:00.000Z' // 15.10. 20:00 Berlin
        })
      );
    });

    it('Parst "vor 30 Minuten" korrekt', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: 'vor 30 Minuten Suma genommen'
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          occurred_at: '2025-10-16T12:00:00.000Z' // 14:07 → 14:00 Berlin
        })
      );
    });

    it('Parst "morgens" korrekt', async () => {
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'test-uuid' },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({
        rawText: 'morgens Kopfschmerzen gehabt'
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          occurred_at: '2025-10-16T06:00:00.000Z' // 08:00 Berlin
        })
      );
    });
  });

  describe('Console Logging', () => {
    it('Loggt erfolgreiche Speicherung', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const mockId = 'test-uuid-log';
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: mockId },
            error: null
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      await saveVoiceNote({ rawText: 'Test' });

      expect(consoleSpy).toHaveBeenCalledWith('✅ Voice-Notiz gespeichert:', mockId);
      
      consoleSpy.mockRestore();
    });

    it('Loggt Fehler bei Speicher-Fehlschlag', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockError = { message: 'Test error' };
      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        }))
      }));

      (supabase.from as any).mockReturnValue({
        insert: mockInsert
      });

      try {
        await saveVoiceNote({ rawText: 'Test' });
      } catch (error) {
        // Expected error
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Voice-Notiz speichern fehlgeschlagen:', 
        mockError
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
});
