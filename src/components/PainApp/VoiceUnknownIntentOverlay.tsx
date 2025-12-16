/**
 * Voice Unknown Intent Overlay
 * Zeigt Fallback-Optionen wenn der Sprachbefehl nicht erkannt wurde
 * Erweitert um editierbares Textfeld und Append-Modus für "Nochmal sprechen"
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Mic, 
  MicOff,
  PlusCircle, 
  Zap, 
  Pill, 
  Bell, 
  BookOpen,
  HelpCircle,
  X,
  Check
} from 'lucide-react';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';

interface VoiceUnknownIntentOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  draftText: string;
  onDraftTextChange: (text: string) => void;
  onSelectAction: (action: 'pain_entry' | 'quick_entry' | 'medication' | 'reminder' | 'diary' | 'note' | 'retry', draftText: string) => void;
}

export function VoiceUnknownIntentOverlay({
  open,
  onOpenChange,
  transcript,
  draftText,
  onDraftTextChange,
  onSelectAction,
}: VoiceUnknownIntentOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const isSttSupported = isBrowserSttSupported();

  // Insert text at cursor position or append
  const insertAtCursor = useCallback((insertText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // Fallback: append
      const separator = draftText.length > 0 && !draftText.endsWith(' ') ? ' ' : '';
      onDraftTextChange(draftText + separator + insertText);
      return;
    }

    const start = textarea.selectionStart ?? draftText.length;
    const end = textarea.selectionEnd ?? draftText.length;
    
    // Add space if needed
    const needsSpaceBefore = start > 0 && draftText[start - 1] !== ' ' && !insertText.startsWith(' ');
    const textToInsert = (needsSpaceBefore ? ' ' : '') + insertText;
    
    const newText = draftText.slice(0, start) + textToInsert + draftText.slice(end);
    onDraftTextChange(newText);
    
    // Set cursor after inserted text
    const newCursorPos = start + textToInsert.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [draftText, onDraftTextChange]);

  // Start dictation (append mode)
  const startDictation = useCallback(() => {
    if (!isSttSupported || isRecording) return;

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimText('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        insertAtCursor(final.trim());
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Dictation error:', event.error);
      setIsRecording(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSttSupported, isRecording, insertAtCursor]);

  // Stop dictation
  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopDictation();
    }
  }, [open, stopDictation]);

  // Handle "Nochmal sprechen" button
  const handleRetry = useCallback(() => {
    if (isRecording) {
      stopDictation();
    } else {
      startDictation();
    }
  }, [isRecording, startDictation, stopDictation]);

  const actions = [
    {
      id: 'pain_entry' as const,
      label: 'Migräne-Eintrag',
      description: 'Detaillierte Dokumentation',
      icon: PlusCircle,
      color: 'text-success',
    },
    {
      id: 'quick_entry' as const,
      label: 'Schnell-Eintrag',
      description: 'Kurz & schnell',
      icon: Zap,
      color: 'text-destructive',
    },
    {
      id: 'medication' as const,
      label: 'Medikament',
      description: 'Wirkung bewerten',
      icon: Pill,
      color: 'text-primary',
    },
    {
      id: 'reminder' as const,
      label: 'Erinnerung',
      description: 'Termin/Medikament',
      icon: Bell,
      color: 'text-warning',
    },
    {
      id: 'diary' as const,
      label: 'Tagebuch',
      description: 'Einträge ansehen',
      icon: BookOpen,
      color: 'text-muted-foreground',
    },
    {
      id: 'note' as const,
      label: 'Als Notiz speichern',
      description: 'Für später',
      icon: HelpCircle,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-voice" />
            Nicht sicher verstanden
          </DialogTitle>
          <DialogDescription className="text-left">
            Bitte wähle eine Aktion aus:
          </DialogDescription>
        </DialogHeader>

        {/* Editable Text Field */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Erkannter Text (bearbeitbar)
          </label>
          <Textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => onDraftTextChange(e.target.value)}
            placeholder="Text korrigieren oder ergänzen…"
            className="min-h-[80px] resize-none"
            disabled={isRecording}
          />
          {/* Live interim preview */}
          {interimText && (
            <p className="text-xs text-muted-foreground italic px-1">
              Live: {interimText}
            </p>
          )}
          {/* Dictation toggle button */}
          {isSttSupported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`w-full ${isRecording ? 'border-destructive text-destructive' : 'border-voice/30 text-voice'}`}
              onClick={handleRetry}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-4 h-4 mr-2" />
                  Diktat beenden
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 mr-2" />
                  Text diktieren (ergänzen)
                </>
              )}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 py-4">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto flex-col items-start p-3 gap-1 text-left hover:bg-muted/50"
              onClick={() => {
                stopDictation();
                onSelectAction(action.id, draftText);
                onOpenChange(false);
              }}
            >
              <div className="flex items-center gap-2 w-full">
                <action.icon className={`w-4 h-4 ${action.color}`} />
                <span className="font-medium text-sm">{action.label}</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">
                {action.description}
              </span>
            </Button>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              stopDictation();
              onOpenChange(false);
            }}
          >
            <X className="w-4 h-4 mr-2" />
            Abbrechen
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-voice/30 text-voice hover:bg-voice/10"
            onClick={handleRetry}
          >
            {isRecording ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Nochmal sprechen
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
