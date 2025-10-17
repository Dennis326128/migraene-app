import React from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useVoiceCapture } from '@/hooks/useVoiceCapture';

export function VoiceNoteButton() {
  const { isSaving, onSpeechFinalized } = useVoiceCapture();
  
  const { state, startRecording, stopRecording } = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    interimResults: true,
    pauseThreshold: 3,
    onTranscriptReady: onSpeechFinalized,
    onError: (error) => {
      console.error('🚨 Voice Error:', error);
    }
  });

  const handleToggle = async () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleToggle}
        disabled={isSaving}
        size="lg"
        className={state.isRecording ? 'bg-red-500 hover:bg-red-600' : ''}
      >
        {state.isRecording ? (
          <>
            <Square className="mr-2 h-5 w-5" />
            Stopp
          </>
        ) : (
          <>
            <Mic className="mr-2 h-5 w-5" />
            Voice-Notiz aufnehmen
          </>
        )}
      </Button>

      {state.isRecording && (
        <div className="text-sm text-muted-foreground">
          {state.isPaused && state.remainingSeconds !== undefined ? (
            <span>⏸️ Pause... ({state.remainingSeconds}s)</span>
          ) : (
            <span>🎤 Aufnahme läuft...</span>
          )}
        </div>
      )}

      {state.transcript && (
        <div className="p-3 bg-muted rounded-lg text-sm">
          <strong>Transkript:</strong> {state.transcript}
        </div>
      )}
    </div>
  );
}
