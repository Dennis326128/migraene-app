import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import type { ParsedMedicationEffect } from '@/types/medicationEffect.types';

interface UseMedicationEffectVoiceOptions {
  entryId: number;
  medName: string;
  onSuccess?: (result: ParsedMedicationEffect) => void;
  onError?: (error: string) => void;
}

export function useMedicationEffectVoice({ 
  entryId, 
  medName, 
  onSuccess, 
  onError 
}: UseMedicationEffectVoiceOptions) {
  const [isParsing, setIsParsing] = useState(false);

  const { state, startRecording, stopRecording, resetTranscript } = useSpeechRecognition({
    language: 'de-DE',
    continuous: false,
    interimResults: true,
    pauseThreshold: 3,
    onTranscriptReady: async (transcript, confidence) => {
      if (!transcript.trim()) {
        onError?.('Keine Sprache erkannt. Bitte noch einmal versuchen.');
        return;
      }

      setIsParsing(true);

      try {
        // Call edge function to parse medication effect
        const { data, error } = await supabase.functions.invoke('parse-medication-effect', {
          body: { 
            transcript: transcript.trim(),
            entryId,
            medName
          }
        });

        if (error) {
          console.error('Parse error:', error);
          onError?.('Fehler beim Verarbeiten der Spracheingabe.');
          return;
        }

        const result: ParsedMedicationEffect = {
          effectScore: data.effectScore ?? null,
          sideEffects: data.sideEffects || [],
          notesSummary: data.notesSummary || '',
          confidence: data.confidence || 'medium'
        };

        onSuccess?.(result);
        resetTranscript();
      } catch (error) {
        console.error('Voice parsing error:', error);
        onError?.('Fehler beim Verarbeiten der Spracheingabe.');
      } finally {
        setIsParsing(false);
      }
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
      onError?.(error);
    }
  });

  return {
    isRecording: state.isRecording,
    transcript: state.transcript,
    isParsing,
    isProcessing: state.isProcessing || isParsing,
    error: state.error,
    confidence: state.confidence,
    isPaused: state.isPaused,
    remainingSeconds: state.remainingSeconds,
    startRecording,
    stopRecording,
    resetTranscript
  };
}
