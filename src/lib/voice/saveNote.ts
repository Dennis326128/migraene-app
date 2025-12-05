import { parseOccurredAt } from './timeOnly';
import { supabase } from '@/integrations/supabase/client';

export interface SaveVoiceNoteOptions {
  rawText: string;
  sttConfidence?: number;
  source?: 'voice' | 'manual' | 'import';
}

/**
 * Speichert Voice-Notiz in DB
 * - Parst Zeitpunkt aus Text
 * - Validiert Input
 * - Gibt neue ID zurück
 */
export async function saveVoiceNote(options: SaveVoiceNoteOptions): Promise<string> {
  const { rawText, sttConfidence, source = 'voice' } = options;
  
  // User-ID holen
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Nicht eingeloggt');
  }

  // Check if user has voice notes enabled
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('voice_notes_enabled')
    .single();

  if (profileError || !profile?.voice_notes_enabled) {
    throw new Error('Voice-Notizen sind in den Einstellungen deaktiviert');
  }

  // Validierung
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Voice-Notiz darf nicht leer sein');
  }
  if (trimmed.length > 5000) {
    throw new Error(`Voice-Notiz zu lang (max. 5000 Zeichen, aktuell: ${trimmed.length})`);
  }

  // Zeit parsen
  const occurred_at = parseOccurredAt(trimmed);

  // In DB speichern
  const { data, error } = await supabase
    .from('voice_notes')
    .insert({
      user_id: user.id,
      text: trimmed,
      occurred_at,
      stt_confidence: sttConfidence ?? null,
      source,
      tz: 'Europe/Berlin'
    })
    .select('id')
    .single();

  if (error) {
    console.error('❌ Voice-Notiz speichern fehlgeschlagen:', error);
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  }

  console.log('✅ Voice-Notiz gespeichert:', data.id);
  return data.id;
}
