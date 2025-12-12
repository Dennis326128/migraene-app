/**
 * useSpeechInput Hook
 * Manages Web Speech API integration for voice input
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  createSpeechProvider, 
  isWebSpeechSupported,
  getCurrentProviderType 
} from '../engine/speechProvider';
import type { SpeechProviderInterface, SpeechResult } from '../types/draft.types';

interface UseSpeechInputReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  confidence: number;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
  providerType: string;
}

export function useSpeechInput(
  onTranscriptChange?: (transcript: string) => void
): UseSpeechInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const providerRef = useRef<SpeechProviderInterface | null>(null);
  const finalTranscriptRef = useRef('');
  
  const isSupported = isWebSpeechSupported();
  const providerType = getCurrentProviderType();
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.stop();
      }
    };
  }, []);
  
  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError('Spracherkennung wird in diesem Browser nicht unterstützt');
      return;
    }
    
    setError(null);
    setIsListening(true);
    finalTranscriptRef.current = '';
    
    try {
      const provider = createSpeechProvider({
        language: 'de-DE',
        continuous: true,
      });
      
      providerRef.current = provider;
      
      provider.onResult((result: SpeechResult) => {
        setConfidence(result.confidence);
        
        if (result.isFinal) {
          finalTranscriptRef.current += result.transcript + ' ';
          setTranscript(finalTranscriptRef.current.trim());
          setInterimTranscript('');
          onTranscriptChange?.(finalTranscriptRef.current.trim());
        } else {
          setInterimTranscript(result.transcript);
        }
      });
      
      provider.onError((err) => {
        console.error('Speech recognition error:', err);
        setError(err.message);
        setIsListening(false);
      });
      
      provider.onEnd(() => {
        setIsListening(false);
      });
      
      await provider.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError(err instanceof Error ? err.message : 'Spracherkennung fehlgeschlagen');
      setIsListening(false);
    }
  }, [isSupported, onTranscriptChange]);
  
  const stopListening = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.stop();
      providerRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);
  
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    setConfidence(0);
    setError(null);
  }, []);
  
  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    confidence,
    error,
    startListening,
    stopListening,
    resetTranscript,
    providerType,
  };
}
