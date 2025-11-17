import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mic } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface VoiceNoteReviewModalProps {
  open: boolean;
  onClose: () => void;
  transcript: string;
  onSave: (text: string) => Promise<void>;
}

export function VoiceNoteReviewModal({
  open,
  onClose,
  transcript,
  onSave
}: VoiceNoteReviewModalProps) {
  const [text, setText] = useState(transcript);
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    if (open) {
      setText(transcript);
    }
  }, [open, transcript]);
  
  async function handleSave() {
    if (!text.trim()) {
      toast({
        title: 'Fehler',
        description: 'Notiz-Text darf nicht leer sein',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(text);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast({ 
        title: 'Fehler', 
        description: 'Notiz konnte nicht gespeichert werden',
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
          <DialogTitle>🎙️ Voice-Notiz überprüfen</DialogTitle>
        </DialogHeader>
        
        {/* Info-Banner */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
          <Mic className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Aus Spracheingabe erkannt
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Bitte überprüfe den Text und klicke auf Speichern.
            </p>
          </div>
        </div>
        
        {/* Text Editor */}
        <div>
          <Label htmlFor="note-text">Notiz-Text</Label>
          <Textarea
            id="note-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Notiz-Text..."
            className="resize-none mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {text.length} / 5000 Zeichen
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !text.trim()}>
            {isSaving ? 'Speichere...' : '✅ Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
