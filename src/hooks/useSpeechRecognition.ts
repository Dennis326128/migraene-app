import { useState, useRef, useCallback } from 'react';

interface SpeechRecognitionState {
  isRecording: boolean;
  transcript: string;
  isProcessing: boolean;
  error: string | null;
  confidence: number;
  remainingSeconds?: number;
  isPaused: boolean;
}

interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  pauseThreshold?: number; // seconds of silence before ending
  onTranscriptReady?: (transcript: string, confidence: number) => void;
  onError?: (error: string) => void;
  onDebugLog?: (message: string) => void;
  onPauseDetected?: (remainingSeconds: number) => void;
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
    pauseThreshold = 3, // 3 seconds of silence
    onTranscriptReady,
    onError,
    onDebugLog,
    onPauseDetected
  } = options;

  const [state, setState] = useState<SpeechRecognitionState>({
    isRecording: false,
    transcript: '',
    isProcessing: false,
    error: null,
    confidence: 0,
    isPaused: false
  });

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const fullTranscriptRef = useRef<string>('');
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  const log = useCallback((message: string) => {
    console.log(`[SpeechRecognition] ${message}`);
    onDebugLog?.(message);
  }, [onDebugLog]);

  const clearTimers = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const handleError = useCallback((error: string) => {
    log(`❌ Error: ${error}`);
    clearTimers();
    setState(prev => ({ ...prev, error, isRecording: false, isProcessing: false, isPaused: false }));
    onError?.(error);
  }, [log, onError, clearTimers]);

  const startPauseDetection = useCallback(() => {
    clearTimers();
    
    const startCountdown = () => {
      let remainingSeconds = pauseThreshold;
      setState(prev => ({ ...prev, isPaused: true, remainingSeconds }));
      
      countdownTimerRef.current = setInterval(() => {
        remainingSeconds--;
        setState(prev => ({ ...prev, remainingSeconds }));
        onPauseDetected?.(remainingSeconds);
        
        if (remainingSeconds <= 0) {
          clearTimers();
          if (recognitionRef.current) {
            log('⏹️ Auto-stopping after pause threshold');
            recognitionRef.current.stop();
          }
        }
      }, 1000);
    };

    pauseTimerRef.current = setTimeout(startCountdown, 1000); // Start countdown after 1 second of silence
  }, [pauseThreshold, onPauseDetected, clearTimers, log]);

  const resetPauseDetection = useCallback(() => {
    clearTimers();
    setState(prev => ({ ...prev, isPaused: false, remainingSeconds: undefined }));
    lastSpeechTimeRef.current = Date.now();
  }, [clearTimers]);

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
        confidence: 0,
        isPaused: false
      });
      finalTranscriptRef.current = '';
      fullTranscriptRef.current = '';
      clearTimers();

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
        lastSpeechTimeRef.current = Date.now();
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

        // Handle pause detection
        if (fullText.trim()) {
          resetPauseDetection(); // Reset when new speech detected
        } else if (finalText.trim()) {
          startPauseDetection(); // Start pause detection after final speech
        }

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
        clearTimers();
        
        // Use the stored transcript from refs (no race condition)
        const finalText = finalTranscriptRef.current;
        const fullText = fullTranscriptRef.current;
        const bestTranscript = fullText || finalText;

        log(`📖 Verarbeite Transcript: "${bestTranscript}" (${bestTranscript.length} Zeichen)`);

        setState(prev => ({
          ...prev,
          isRecording: false,
          transcript: bestTranscript,
          isPaused: false,
          remainingSeconds: undefined
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
  }, [language, continuous, interimResults, log, handleError, onTranscriptReady, state.confidence, resetPauseDetection, startPauseDetection]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && state.isRecording) {
      log('⏹️ Stoppe Aufnahme...');
      clearTimers();
      recognitionRef.current.stop();
    }
  }, [state.isRecording, log, clearTimers]);

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