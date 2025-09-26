import { useState, useRef, useCallback } from 'react';

interface SpeechRecognitionState {
  isRecording: boolean;
  transcript: string;
  isProcessing: boolean;
  error: string | null;
  confidence: number;
}

interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onTranscriptReady?: (transcript: string, confidence: number) => void;
  onError?: (error: string) => void;
  onDebugLog?: (message: string) => void;
}

interface UseSpeechRecognitionReturn {
  state: SpeechRecognitionState;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetTranscript: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const {
    language = 'de-DE',
    continuous = true,
    interimResults = true,
    onTranscriptReady,
    onError,
    onDebugLog
  } = options;

  const [state, setState] = useState<SpeechRecognitionState>({
    isRecording: false,
    transcript: '',
    isProcessing: false,
    error: null,
    confidence: 0
  });

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const fullTranscriptRef = useRef<string>('');

  const log = useCallback((message: string) => {
    console.log(`[SpeechRecognition] ${message}`);
    onDebugLog?.(message);
  }, [onDebugLog]);

  const handleError = useCallback((error: string) => {
    log(`❌ Error: ${error}`);
    setState(prev => ({ ...prev, error, isRecording: false, isProcessing: false }));
    onError?.(error);
  }, [log, onError]);

  const startRecording = useCallback(async () => {
    try {
      // Check browser support
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Browser unterstützt keine Spracherkennung');
      }

      // Reset state
      setState({
        isRecording: false,
        transcript: '',
        isProcessing: true,
        error: null,
        confidence: 0
      });
      finalTranscriptRef.current = '';
      fullTranscriptRef.current = '';

      log('🎙️ Initialisiere Spracherkennung...');

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create recognition instance
      const recognition = new SpeechRecognition();
      recognition.lang = language;
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        log('✅ Aufnahme gestartet');
        setState(prev => ({ ...prev, isRecording: true, isProcessing: false, error: null }));
      };

      recognition.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';
        let maxConfidence = 0;

        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence || 0;
          maxConfidence = Math.max(maxConfidence, confidence);

          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        // Store transcripts in refs (State-First approach)
        finalTranscriptRef.current = finalText;
        const fullText = finalText + interimText;
        fullTranscriptRef.current = fullText;

        // Update UI state
        setState(prev => ({
          ...prev,
          transcript: fullText,
          confidence: maxConfidence
        }));

        log(`📝 Transcript: "${fullText.slice(0, 50)}..." (conf: ${maxConfidence.toFixed(2)})`);
      };

      recognition.onerror = (event: any) => {
        let errorMessage = 'Unbekannter Fehler';
        
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'Keine Sprache erkannt';
            break;
          case 'audio-capture':
            errorMessage = 'Mikrofon-Zugriff fehlgeschlagen';
            break;
          case 'not-allowed':
            errorMessage = 'Mikrofon-Berechtigung verweigert';
            break;
          case 'network':
            errorMessage = 'Netzwerkfehler';
            break;
          case 'service-not-allowed':
            errorMessage = 'Service nicht verfügbar';
            break;
          default:
            errorMessage = `Spracherkennung Fehler: ${event.error}`;
        }
        
        handleError(errorMessage);
      };

      recognition.onend = () => {
        log('🏁 Aufnahme beendet');
        
        // Use the stored transcript from refs (no race condition)
        const finalText = finalTranscriptRef.current;
        const fullText = fullTranscriptRef.current;
        const bestTranscript = fullText || finalText;

        log(`📖 Verarbeite Transcript: "${bestTranscript}" (${bestTranscript.length} Zeichen)`);

        setState(prev => ({
          ...prev,
          isRecording: false,
          transcript: bestTranscript
        }));

        // Call callback with final result
        if (bestTranscript.trim()) {
          onTranscriptReady?.(bestTranscript, state.confidence);
        } else {
          handleError('Kein Text erkannt');
        }
      };

      // Store reference and start
      recognitionRef.current = recognition;
      recognition.start();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      handleError(message);
    }
  }, [language, continuous, interimResults, log, handleError, onTranscriptReady, state.confidence]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && state.isRecording) {
      log('⏹️ Stoppe Aufnahme...');
      recognitionRef.current.stop();
    }
  }, [state.isRecording, log]);

  const resetTranscript = useCallback(() => {
    setState(prev => ({ ...prev, transcript: '', error: null, confidence: 0 }));
    finalTranscriptRef.current = '';
    fullTranscriptRef.current = '';
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    resetTranscript
  };
}