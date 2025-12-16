/**
 * VoiceAssistantOverlay - Unified voice input dialog
 * Opens immediately on "Spracheingabe" click with:
 * - Auto-starting voice recording
 * - Editable text field (always visible)
 * - Live transcription preview
 * - Action tiles (always visible for manual selection)
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
  Save,
  X,
  Check,
  Loader2
} from 'lucide-react';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { cn } from '@/lib/utils';

interface VoiceAssistantOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: 'pain_entry' | 'quick_entry' | 'medication' | 'reminder' | 'diary' | 'note', draftText: string) => void;
}

export function VoiceAssistantOverlay({
  open,
  onOpenChange,
  onSelectAction,
}: VoiceAssistantOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [committedText, setCommittedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isSttSupported = isBrowserSttSupported();
  const autoStartedRef = useRef(false);

  // Insert text at cursor position or append
  const insertAtCursor = useCallback((insertText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // Fallback: append
      const separator = committedText.length > 0 && !committedText.endsWith(' ') ? ' ' : '';
      setCommittedText(prev => prev + separator + insertText);
      return;
    }

    const start = textarea.selectionStart ?? committedText.length;
    const end = textarea.selectionEnd ?? committedText.length;
    
    // Add space if needed
    const needsSpaceBefore = start > 0 && committedText[start - 1] !== ' ' && !insertText.startsWith(' ');
    const textToInsert = (needsSpaceBefore ? ' ' : '') + insertText;
    
    const newText = committedText.slice(0, start) + textToInsert + committedText.slice(end);
    setCommittedText(newText);
    
    // Set cursor after inserted text
    const newCursorPos = start + textToInsert.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [committedText]);

  // Start recording
  const startRecording = useCallback(() => {
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
      console.error('Voice recording error:', event.error);
      // Don't stop on 'no-speech' - just continue
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsRecording(false);
        setInterimText('');
      }
    };

    recognition.onend = () => {
      // Only set not recording if we didn't explicitly stop
      if (recognitionRef.current) {
        // Restart if still supposed to be recording (for continuous mode)
        try {
          recognition.start();
        } catch (e) {
          setIsRecording(false);
          setInterimText('');
        }
      } else {
        setIsRecording(false);
        setInterimText('');
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [isSttSupported, isRecording, insertAtCursor]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null; // Clear ref first to prevent restart
      recognition.stop();
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  // Auto-start recording when dialog opens
  useEffect(() => {
    if (open && isSttSupported && !autoStartedRef.current) {
      autoStartedRef.current = true;
      // Small delay to let dialog render
      const timer = setTimeout(() => {
        startRecording();
      }, 300);
      return () => clearTimeout(timer);
    }
    
    if (!open) {
      autoStartedRef.current = false;
      stopRecording();
      setCommittedText('');
      setInterimText('');
    }
  }, [open, isSttSupported, startRecording, stopRecording]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Handle action selection
  const handleSelectAction = useCallback((action: 'pain_entry' | 'quick_entry' | 'medication' | 'reminder' | 'diary' | 'note') => {
    stopRecording();
    onSelectAction(action, committedText);
    onOpenChange(false);
  }, [stopRecording, onSelectAction, committedText, onOpenChange]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    stopRecording();
    onOpenChange(false);
  }, [stopRecording, onOpenChange]);

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
      icon: Save,
      color: 'text-voice',
    },
  ];

  const hasText = committedText.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRecording ? (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  <div className="absolute w-5 h-5 rounded-full bg-destructive/30 animate-ping" />
                </div>
                <span>Aufnahme läuft…</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 text-voice" />
                <span>Spracheingabe</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-left">
            {isRecording 
              ? 'Sprich in deinem Tempo. Klicke "Fertig" wenn du fertig bist.'
              : 'Tippe oder diktiere, dann wähle eine Aktion.'}
          </DialogDescription>
        </DialogHeader>

        {/* Text Input Area */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            {hasText ? 'Erkannter Text (bearbeitbar)' : 'Dein Text erscheint hier…'}
          </label>
          <Textarea
            ref={textareaRef}
            value={committedText}
            onChange={(e) => setCommittedText(e.target.value)}
            placeholder="Tippe oder sprich…"
            className={cn(
              "min-h-[80px] resize-none transition-colors",
              isRecording && "border-voice/50 bg-voice/5"
            )}
          />
          
          {/* Live interim preview */}
          {interimText && (
            <p className="text-xs text-muted-foreground italic px-1 py-1 bg-muted/30 rounded">
              Live: {interimText}
            </p>
          )}

          {/* Recording toggle button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-full",
              isRecording 
                ? "border-destructive/50 text-destructive hover:bg-destructive/10" 
                : "border-voice/30 text-voice hover:bg-voice/10"
            )}
            onClick={toggleRecording}
            disabled={!isSttSupported}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4 mr-2" />
                Diktat pausieren
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                {hasText ? 'Weiter diktieren' : 'Diktat starten'}
              </>
            )}
          </Button>
          
          {!isSttSupported && (
            <p className="text-xs text-muted-foreground text-center">
              Spracheingabe nicht verfügbar. Bitte tippe.
            </p>
          )}
        </div>

        {/* Action Selection */}
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2">Aktion auswählen:</p>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                className="h-auto flex-col items-start p-3 gap-1 text-left hover:bg-muted/50"
                onClick={() => handleSelectAction(action.id)}
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
        </div>

        {/* Bottom Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handleCancel}
          >
            <X className="w-4 h-4 mr-2" />
            Abbrechen
          </Button>
          {isRecording && (
            <Button
              variant="default"
              className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
              onClick={stopRecording}
            >
              <Check className="w-4 h-4 mr-2" />
              Fertig
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
