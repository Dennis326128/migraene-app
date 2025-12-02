import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMedicationEffectVoice } from '../hooks/useMedicationEffectVoice';
import type { ParsedMedicationEffect } from '@/types/medicationEffect.types';

interface EffectVoiceButtonProps {
  entryId: number;
  medName: string;
  onResult: (result: ParsedMedicationEffect) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export function EffectVoiceButton({
  entryId,
  medName,
  onResult,
  onError,
  disabled,
  className
}: EffectVoiceButtonProps) {
  const {
    isRecording,
    transcript,
    isParsing,
    isProcessing,
    error,
    isPaused,
    remainingSeconds,
    startRecording,
    stopRecording
  } = useMedicationEffectVoice({
    entryId,
    medName,
    onSuccess: onResult,
    onError
  });

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'outline'}
        size="lg"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className={cn(
          'w-full h-auto py-3 text-left flex items-center gap-3 transition-all',
          isRecording && 'animate-pulse',
          className
        )}
      >
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isRecording ? (
          <MicOff className="w-5 h-5" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
        
        <div className="flex-1">
          <div className="font-medium">
            {isRecording ? 'Aufnahme läuft...' : 'Wirkung einsprechen'}
          </div>
          {isRecording && transcript && (
            <div className="text-xs opacity-80 mt-1 line-clamp-1">
              {transcript}
            </div>
          )}
          {isParsing && (
            <div className="text-xs opacity-80 mt-1">
              Wird verarbeitet...
            </div>
          )}
          {!isRecording && !isParsing && (
            <div className="text-xs opacity-70 mt-0.5">
              Z.B. "Hat kaum geholfen, mir war übel"
            </div>
          )}
        </div>
      </Button>

      {isPaused && remainingSeconds !== undefined && (
        <Badge variant="outline" className="w-full justify-center">
          Pause erkannt – stoppt in {remainingSeconds}s
        </Badge>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
