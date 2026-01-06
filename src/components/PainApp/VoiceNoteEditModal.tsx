import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface VoiceNote {
  id: string;
  text: string;
  occurred_at: string;
  stt_confidence: number | null;
}

interface Props {
  note: VoiceNote | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function VoiceNoteEditModal({ note, open, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [occurredDate, setOccurredDate] = useState('');
  const [occurredTime, setOccurredTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form when note changes
  useEffect(() => {
    if (note) {
      setText(note.text);
      const berlinTime = toZonedTime(new Date(note.occurred_at), 'Europe/Berlin');
      setOccurredDate(format(berlinTime, 'yyyy-MM-dd'));
      setOccurredTime(format(berlinTime, 'HH:mm'));
    }
  }, [note]);

  async function handleSave() {
    if (!note) return;
    
    const trimmedText = text.trim();
    
    if (!trimmedText) {
      toast({ 
        title: '❌ Fehler', 
        description: 'Text darf nicht leer sein', 
        variant: 'destructive' 
      });
      return;
    }

    if (trimmedText.length > 5000) {
      toast({ 
        title: '❌ Fehler', 
        description: 'Text darf maximal 5000 Zeichen haben', 
        variant: 'destructive' 
      });
      return;
    }

    setIsSaving(true);
    try {
      // Convert local Berlin time to UTC for storage
      const localDateTime = `${occurredDate}T${occurredTime}:00`;
      const utcDate = fromZonedTime(new Date(localDateTime), 'Europe/Berlin');

      const { error } = await supabase
        .from('voice_notes')
        .update({
          text: trimmedText,
          occurred_at: utcDate.toISOString()
        })
        .eq('id', note.id);

      if (error) throw error;

      toast({ 
        title: 'Gespeichert', 
        description: 'Voice-Notiz wurde aktualisiert' 
      });
      onSaved();
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast({ 
        title: '❌ Fehler', 
        description: error instanceof Error ? error.message : 'Speichern fehlgeschlagen',
        variant: 'destructive' 
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>✏️ Voice-Notiz bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={occurredDate}
                onChange={(e) => setOccurredDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="time">Uhrzeit</Label>
              <Input
                id="time"
                type="time"
                value={occurredTime}
                onChange={(e) => setOccurredTime(e.target.value)}
              />
            </div>
          </div>

          {/* Text */}
          <div>
            <Label htmlFor="text">Notiz-Text</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Notiz-Text..."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {text.length} / 5000 Zeichen
            </p>
          </div>

          {/* Confidence Display */}
          {note?.stt_confidence && (
            <div className="text-xs text-muted-foreground">
              🎤 Erkennungsgenauigkeit: {Math.round(note.stt_confidence * 100)}%
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichere...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
