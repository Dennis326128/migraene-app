import { useState } from 'react';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { toast } from '@/hooks/use-toast';

export function useVoiceCapture() {
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Called after speech recognition finishes
   * - Saves to DB
   * - Shows success toast
   */
  async function onSpeechFinalized(transcript: string, confidence?: number) {
    if (!transcript.trim()) {
      toast({
        title: '⚠️ Keine Aufnahme',
        description: 'Nichts erkannt. Bitte erneut versuchen.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const noteId = await saveVoiceNote({
        rawText: transcript,
        sttConfidence: confidence
      });

      console.log('✅ Voice-Notiz gespeichert:', noteId);

      toast({
        title: '✅ Gespeichert',
        description: 'Voice-Notiz wurde angelegt',
        duration: 3000
      });

      // Event für Liste-Update triggern
      window.dispatchEvent(new CustomEvent('voice-note-saved', { 
        detail: { noteId } 
      }));

    } catch (error) {
      console.error('❌ Fehler beim Speichern:', error);
      toast({
        title: '❌ Fehler',
        description: error instanceof Error ? error.message : 'Speichern fehlgeschlagen',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }

  return { 
    isSaving, 
    onSpeechFinalized 
  };
}
