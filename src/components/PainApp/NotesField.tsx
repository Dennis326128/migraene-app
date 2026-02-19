/**
 * NotesField - Unified notes input with dictation + privacy toggle
 * Migraine-friendly: minimal text, no countdown, no live transcript
 */

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Mic, MicOff, Loader2, Lock } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/lib/utils';

interface NotesFieldProps {
  notes: string;
  onNotesChange: (value: string) => void;
  isPrivate: boolean;
  onPrivateChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function NotesField({
  notes,
  onNotesChange,
  isPrivate,
  onPrivateChange,
  disabled = false,
  className,
}: NotesFieldProps) {
  const [showPrivacyPrompt, setShowPrivacyPrompt] = useState(false);

  const handleTranscriptReady = useCallback((transcript: string) => {
    if (transcript.trim()) {
      const newValue = notes
        ? `${notes}\n${transcript.trim()}`
        : transcript.trim();
      onNotesChange(newValue);
      setShowPrivacyPrompt(true);
    }
  }, [notes, onNotesChange]);

  const {
    state,
    startRecording,
    stopRecording,
  } = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    pauseThreshold: 4,
    onTranscriptReady: handleTranscriptReady,
  });

  const handleToggleRecording = async () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const handlePrivacyPromptPrivate = () => {
    onPrivateChange(true);
    setShowPrivacyPrompt(false);
  };

  const handlePrivacyPromptShare = () => {
    setShowPrivacyPrompt(false);
  };

  const hasContent = notes.trim().length > 0;

  return (
    <Card className={cn("p-6 mb-4", className)}>
      <div className="space-y-3">
        {/* Label + Dictation button */}
        <div className="flex items-center justify-between">
          <Label htmlFor="notes-input" className="text-base font-medium">
            Notizen (optional)
          </Label>
          <div className="flex items-center gap-2">
            {state.isRecording && (
              <span className="text-xs text-muted-foreground">Aufnahme läuft</span>
            )}
            <Button
              type="button"
              variant={state.isRecording ? 'destructive' : 'outline'}
              size="sm"
              onClick={handleToggleRecording}
              disabled={disabled || state.isProcessing}
              className="gap-1.5 h-8 text-xs"
            >
              {state.isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verarbeite…
                </>
              ) : state.isRecording ? (
                <>
                  <MicOff className="h-3.5 w-3.5" />
                  Stopp
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Diktieren
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Textarea */}
        <Textarea
          id="notes-input"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="z.B. Stress, Stimmung, Schlafqualität…"
          disabled={disabled || state.isRecording}
          className="min-h-[80px] resize-y"
          maxLength={5000}
          aria-label="Notizen zum Eintrag"
        />

        {/* Character count – only near limit */}
        {notes.length >= 4500 && (
          <div className="text-xs text-muted-foreground text-right">
            {notes.length}/5000
          </div>
        )}

        {/* Privacy prompt after dictation */}
        {showPrivacyPrompt && !isPrivate && (
          <div className="flex items-center gap-3 py-1.5 animate-in fade-in duration-200">
            <p className="text-sm text-muted-foreground flex-1">Privat speichern?</p>
            <Button variant="ghost" size="sm" onClick={handlePrivacyPromptShare} className="h-7 text-xs">
              Teilen
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrivacyPromptPrivate} className="h-7 text-xs">
              Privat
            </Button>
          </div>
        )}

        {/* Privacy toggle (only when notes have content) */}
        {hasContent && (
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Nur für mich</span>
              <InfoTooltip content="Wird beim Teilen nicht angezeigt." side="top" />
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={onPrivateChange}
              disabled={disabled}
            />
          </div>
        )}

        {/* Error display */}
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
      </div>
    </Card>
  );
}