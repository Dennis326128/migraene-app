/**
 * DraftInput Component
 * Text area with optional speech-to-text functionality
 */

import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Keyboard, Send, Loader2 } from 'lucide-react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { cn } from '@/lib/utils';

interface DraftInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isProcessing?: boolean;
  placeholder?: string;
}

export function DraftInput({
  value,
  onChange,
  onSubmit,
  isProcessing = false,
  placeholder = 'Beschreibe deine Migräne... z.B. "Gestern den ganzen Tag Migräne, um 19 Uhr Sumatriptan genommen, hat gut geholfen"',
}: DraftInputProps) {
  const [showSpeechHint, setShowSpeechHint] = useState(false);
  
  const {
    isSupported: speechSupported,
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechInput((newTranscript) => {
    onChange(newTranscript);
  });
  
  // Sync transcript changes to value
  useEffect(() => {
    if (transcript && transcript !== value) {
      onChange(transcript);
    }
  }, [transcript, value, onChange]);
  
  const handleMicClick = async () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      await startListening();
    }
  };
  
  const handleSubmit = () => {
    if (isListening) {
      stopListening();
    }
    if (value.trim()) {
      onSubmit();
    }
  };
  
  const displayValue = isListening && interimTranscript 
    ? `${value} ${interimTranscript}`.trim()
    : value;
  
  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-4">
        {/* Header with hints */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            Freitext-Eingabe
          </span>
          <div className="flex items-center gap-2">
            {speechSupported ? (
              <Badge variant="outline" className="text-xs">
                <Mic className="h-3 w-3 mr-1" />
                Sprache verfügbar
              </Badge>
            ) : (
              <Badge 
                variant="outline" 
                className="text-xs text-muted-foreground cursor-help"
                onClick={() => setShowSpeechHint(true)}
              >
                <Keyboard className="h-3 w-3 mr-1" />
                Tastatur-Diktat nutzen
              </Badge>
            )}
          </div>
        </div>
        
        {/* Keyboard dictation hint */}
        {showSpeechHint && !speechSupported && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            💡 Tipp: Du kannst die Diktierfunktion deiner Tastatur nutzen 
            (auf iOS/Android: Mikrofon-Symbol auf der Tastatur).
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 ml-2 text-xs"
              onClick={() => setShowSpeechHint(false)}
            >
              Verstanden
            </Button>
          </div>
        )}
        
        {/* Text input */}
        <div className="relative">
          <Textarea
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "min-h-[120px] pr-12 resize-none text-base",
              isListening && "border-red-500 ring-2 ring-red-200"
            )}
            disabled={isProcessing}
          />
          
          {/* Mic button inside textarea */}
          {speechSupported && (
            <Button
              type="button"
              size="icon"
              variant={isListening ? "destructive" : "ghost"}
              className={cn(
                "absolute right-2 top-2 h-8 w-8",
                isListening && "animate-pulse"
              )}
              onClick={handleMicClick}
              disabled={isProcessing}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        
        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            Ich höre zu... Sprich jetzt.
          </div>
        )}
        
        {/* Speech error */}
        {speechError && (
          <div className="text-sm text-destructive">
            ⚠️ {speechError}
          </div>
        )}
        
        {/* Submit button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!value.trim() || isProcessing}
            className="gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verarbeite...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Entwurf erstellen
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
