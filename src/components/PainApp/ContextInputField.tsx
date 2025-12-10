import { useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Mic, MicOff, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/lib/utils';

interface ContextInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ContextInputField({ 
  value, 
  onChange, 
  disabled = false,
  className 
}: ContextInputFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleTranscriptReady = useCallback((transcript: string) => {
    if (transcript.trim()) {
      const newValue = value 
        ? `${value}\n${transcript.trim()}` 
        : transcript.trim();
      onChange(newValue);
    }
  }, [value, onChange]);

  const { 
    state, 
    startRecording, 
    stopRecording 
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
      // Auto-expand when starting recording
      if (!isExpanded) {
        setIsExpanded(true);
      }
    }
  };

  const hasContent = value.trim().length > 0;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header with toggle */}
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary/70" />
          <Label className="cursor-pointer text-sm font-medium">
            Zusätzlicher Kontext (optional)
          </Label>
          {hasContent && !isExpanded && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {value.length} Zeichen
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Collapsed hint */}
      {!isExpanded && (
        <p className="text-xs text-muted-foreground">
          Erzähle frei, was heute wichtig war – Medikamente, Schlaf, Stress, Essen...
        </p>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
          <p className="text-xs text-muted-foreground">
            Du kannst hier frei erzählen oder diktieren, was heute wichtig war – z.B. Medikamente, 
            Tagesablauf, Schlaf, Stress, Essen, Kaffee, Besonderheiten. Je mehr Kontext, desto 
            besser kann die KI Muster erkennen.
          </p>

          {/* Voice recording button */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={state.isRecording ? 'destructive' : 'outline'}
              size="sm"
              onClick={handleToggleRecording}
              disabled={disabled || state.isProcessing}
              className="gap-2"
            >
              {state.isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verarbeite...
                </>
              ) : state.isRecording ? (
                <>
                  <MicOff className="h-4 w-4" />
                  Aufnahme beenden
                  {state.remainingSeconds !== undefined && (
                    <span className="ml-1 text-xs opacity-80">
                      ({state.remainingSeconds}s)
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Per Sprache diktieren
                </>
              )}
            </Button>

            {state.isRecording && state.isPaused && (
              <span className="text-xs text-amber-600 animate-pulse">
                Pause erkannt...
              </span>
            )}
          </div>

          {/* Live transcript display during recording */}
          {state.isRecording && state.transcript && (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Live-Transkript:</p>
              <p className="text-sm">{state.transcript}</p>
            </div>
          )}

          {/* Textarea */}
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="z.B. 'Heute um 8 Sumatriptan genommen, hat gar nicht geholfen. Musste dann Diazepam nehmen. Habe heute nichts gegessen aber viel Kaffee getrunken. Am nächsten Morgen wieder mit Migräne aufgewacht.'"
            disabled={disabled || state.isRecording}
            className="min-h-[120px] resize-y"
            maxLength={5000}
          />

          {/* Character count */}
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {value.length > 0 && `${value.length}/5000 Zeichen`}
            </span>
            {state.confidence > 0 && (
              <span>
                Erkennungssicherheit: {Math.round(state.confidence * 100)}%
              </span>
            )}
          </div>

          {/* Error display */}
          {state.error && (
            <p className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
