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
  
  // Pause-resilient refs
  const userStoppedRef = useRef(false);
  const lastFinalSegmentRef = useRef('');
  const autoRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const isSupported = isWebSpeechSupported();
  const providerType = getCurrentProviderType();
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.stop();
      }
      if (autoRestartTimeoutRef.current) {
        clearTimeout(autoRestartTimeoutRef.current);
      }
    };
  }, []);
  
  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError('Spracherkennung wird in diesem Browser nicht unterstützt');
      return;
    }
    
    // If already listening, don't restart
    if (isListening && providerRef.current) return;
    
    setError(null);
    setIsListening(true);
    
    // Don't reset finalTranscriptRef - keep accumulated text!
    // Only reset on explicit resetTranscript call
    userStoppedRef.current = false;
    
    // Clear any pending auto-restart
    if (autoRestartTimeoutRef.current) {
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }
    
    try {
      const provider = createSpeechProvider({
        language: 'de-DE',
        continuous: true,
      });
      
      providerRef.current = provider;
      
      provider.onResult((result: SpeechResult) => {
        setConfidence(result.confidence);
        
        if (result.isFinal) {
          const segment = result.transcript.trim();
          
          // Dedup: skip if same as last final segment
          if (segment && segment !== lastFinalSegmentRef.current) {
            lastFinalSegmentRef.current = segment;
            
            // Append only the new segment
            const separator = finalTranscriptRef.current.length > 0 && !finalTranscriptRef.current.endsWith(' ') ? ' ' : '';
            finalTranscriptRef.current += separator + segment;
            
            setTranscript(finalTranscriptRef.current.trim());
            onTranscriptChange?.(finalTranscriptRef.current.trim());
          }
          
          setInterimTranscript('');
        } else {
          setInterimTranscript(result.transcript);
        }
      });
      
      provider.onError((err) => {
        console.error('Speech recognition error:', err);
        
        // no-speech: Just clear interim, don't stop completely
        if (err.message.includes('no-speech')) {
          setInterimTranscript('');
          return;
        }
        
        setError(err.message);
        setIsListening(false);
      });
      
      provider.onEnd(() => {
        setIsListening(false);
        setInterimTranscript('');
        
        // Auto-restart if user didn't explicitly stop
        if (!userStoppedRef.current && isSupported) {
          autoRestartTimeoutRef.current = setTimeout(() => {
            if (!userStoppedRef.current) {
              console.log('[useSpeechInput] Auto-restarting after pause...');
              startListening();
            }
          }, 400);
        }
      });
      
      await provider.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError(err instanceof Error ? err.message : 'Spracherkennung fehlgeschlagen');
      setIsListening(false);
    }
  }, [isSupported, isListening, onTranscriptChange]);
  
  const stopListening = useCallback(() => {
    // Mark that user explicitly stopped
    userStoppedRef.current = true;
    
    // Clear any pending auto-restart
    if (autoRestartTimeoutRef.current) {
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }
    
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
    lastFinalSegmentRef.current = '';
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
