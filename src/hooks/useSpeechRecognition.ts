import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSttConfig, isBrowserSttSupported, type SttResult } from '@/lib/voice/sttConfig';
import { VOICE_TIMING } from '@/lib/voice/voiceTimingConfig';

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
  pauseThreshold?: number;
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
    // Use generous pause threshold from config (default 30s)
    pauseThreshold = VOICE_TIMING.PAUSE_THRESHOLD_SECONDS,
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

  /**
   * Pause detection - MIGRAINE FRIENDLY
   * 
   * Philosophy: User must click "Fertig" to stop. We only show a countdown
   * after VERY long silence (30+ seconds) as a gentle hint.
   * 
   * This allows users to:
   * - Think between words/sentences
   * - Pause to collect their thoughts
   * - Speak at their own pace without stress
   */
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
            log('⏹️ Auto-stopping after very long pause (30s+)');
            recognitionRef.current.stop();
          }
        }
      }, 1000);
    };

    // MIGRAINE-FRIENDLY: Wait 15 seconds of silence before even considering it a pause
    // Then wait another pauseThreshold (30s) before auto-stopping
    // Total: 45 seconds of silence before auto-stop
    pauseTimerRef.current = setTimeout(startCountdown, VOICE_TIMING.INITIAL_SILENCE_GRACE_MS);
  }, [pauseThreshold, onPauseDetected, clearTimers, log]);

  const resetPauseDetection = useCallback(() => {
    clearTimers();
    setState(prev => ({ ...prev, isPaused: false, remainingSeconds: undefined }));
    lastSpeechTimeRef.current = Date.now();
  }, [clearTimers]);

  const startRecording = useCallback(async () => {
    if (!isBrowserSttSupported()) {
      setState(prev => ({ 
        ...prev, 
        error: 'Sprachfunktion ist in deinem Browser nicht verfügbar. Nutze bitte die manuelle Eingabe.' 
      }));
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      const sttConfig = getSttConfig();
      
      recognitionRef.current.lang = sttConfig.language;
      recognitionRef.current.continuous = continuous;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.maxAlternatives = 1;

      finalTranscriptRef.current = '';
      fullTranscriptRef.current = '';

      log('🎤 Starting speech recognition...');
      setState(prev => ({ 
        ...prev, 
        isRecording: true, 
        error: null, 
        transcript: '',
        confidence: 0,
        isPaused: false
      }));

      recognitionRef.current.onstart = () => {
        log('✅ Speech recognition started');
        lastSpeechTimeRef.current = Date.now();
      };

      recognitionRef.current.onresult = (event: any) => {
        resetPauseDetection();
        
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;

          if (result.isFinal) {
            finalTranscript += transcript + ' ';
            finalTranscriptRef.current += transcript + ' ';
            const confidence = result[0].confidence || 0.8;
            log(`✅ Final: "${transcript}" (confidence: ${confidence.toFixed(2)})`);
          } else {
            interimTranscript += transcript;
            log(`... Interim: "${transcript}"`);
          }
        }

        fullTranscriptRef.current = finalTranscriptRef.current + interimTranscript;
        
        setState(prev => ({ 
          ...prev, 
          transcript: fullTranscriptRef.current.trim(),
          confidence: event.results[event.results.length - 1][0].confidence || 0.8
        }));

        if (continuous && pauseThreshold > 0) {
          startPauseDetection();
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        log(`❌ Recognition error: ${event.error}`);
        clearTimers();
        
        let errorMessage = 'Speech recognition error';
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'Keine Sprache erkannt. Bitte noch einmal versuchen.';
            break;
          case 'audio-capture':
            errorMessage = 'Mikrofon nicht verfügbar. Bitte Mikrofon-Zugriff erlauben.';
            break;
          case 'not-allowed':
            errorMessage = 'Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.';
            break;
          case 'network':
            errorMessage = 'Netzwerkfehler. Bitte Internetverbindung prüfen.';
            break;
          default:
            errorMessage = `Spracherkennungsfehler: ${event.error}`;
        }
        
        handleError(errorMessage);
      };

      recognitionRef.current.onend = async () => {
        log('🏁 Speech recognition ended');
        clearTimers();
        
        const finalText = finalTranscriptRef.current.trim();
        
        setState(prev => ({ 
          ...prev, 
          isRecording: false,
          transcript: finalText,
          isPaused: false
        }));

        const sttConfig = getSttConfig();

        if (sttConfig.mode === 'browser_only') {
          log('📱 Browser-only mode: Using browser transcript directly');
          
          const cleanTranscript = finalText.trim();
          
          if (cleanTranscript.length === 0) {
            log('⚠️ Browser transcript is empty');
            setState(prev => ({ 
              ...prev, 
              error: 'Wir konnten nichts verstehen. Bitte noch einmal deutlich sprechen oder näher ans Mikrofon gehen.' 
            }));
            onTranscriptReady?.('', 0);
            return;
          }

          try {
            const result = await transcribeWithBrowserText(cleanTranscript);
            
            if (result.error === 'NO_TRANSCRIPT') {
              setState(prev => ({ 
                ...prev, 
                error: 'Wir konnten nichts verstehen. Bitte noch einmal deutlich sprechen.' 
              }));
            } else {
              setState(prev => ({ 
                ...prev, 
                transcript: result.transcript,
                confidence: result.confidence
              }));
              onTranscriptReady?.(result.transcript, result.confidence);
            }
          } catch (error) {
            console.error('❌ Transcription error:', error);
            onTranscriptReady?.(cleanTranscript, 0.7);
          }
        } else {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            log(`📦 Audio recorded: ${audioBlob.size} bytes`);
            
            const transcribedText = await transcribeAudio(audioBlob, finalText);
            
            setState(prev => ({ 
              ...prev, 
              transcript: transcribedText 
            }));

            onTranscriptReady?.(transcribedText, state.confidence);
          } else {
            onTranscriptReady?.(finalText, state.confidence);
          }
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.start();
        log('🎙️ Audio recording started');
      } catch (error) {
        log(`⚠️ Could not start audio recording: ${error}`);
      }

      recognitionRef.current.start();
    } catch (error) {
      log(`❌ Failed to start recognition: ${error}`);
      handleError(error instanceof Error ? error.message : 'Failed to start speech recognition');
    }
  }, [language, continuous, interimResults, log, handleError, onTranscriptReady, pauseThreshold, startPauseDetection, resetPauseDetection, clearTimers, state.confidence]);

  const stopRecording = useCallback(() => {
    log('⏹️ Stopping recording...');
    clearTimers();
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        log(`⚠️ Error stopping recognition: ${error}`);
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        log(`⚠️ Error stopping media recorder: ${error}`);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setState(prev => ({ ...prev, isRecording: false, isPaused: false }));
  }, [log, clearTimers]);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = '';
    fullTranscriptRef.current = '';
    setState(prev => ({ ...prev, transcript: '', confidence: 0, error: null }));
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    resetTranscript
  };
}

async function transcribeWithBrowserText(browserTranscript: string): Promise<SttResult> {
  try {
    console.log('📤 Sending browser transcript to edge function...');
    
    const { data, error } = await supabase.functions.invoke('transcribe-voice', {
      body: { 
        browserTranscript: browserTranscript.trim(),
        language: 'de-DE'
      }
    });

    if (error) {
      console.error('❌ Edge function error:', error);
      return {
        transcript: browserTranscript,
        source: 'browser',
        confidence: 0.7,
      };
    }

    console.log('✅ Edge function result:', data);
    return data as SttResult;
  } catch (error) {
    console.error('❌ Failed to call edge function:', error);
    return {
      transcript: browserTranscript,
      source: 'browser',
      confidence: 0.7,
    };
  }
}

async function transcribeAudio(audioBlob: Blob, browserTranscript: string): Promise<string> {
  try {
    console.log('📤 Sending audio for transcription...');
    
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
    });
    
    reader.readAsDataURL(audioBlob);
    const audioBase64 = await base64Promise;

    const { data, error } = await supabase.functions.invoke('transcribe-voice', {
      body: { 
        audioBase64,
        browserTranscript,
        language: 'de-DE'
      }
    });

    if (error) {
      console.error('❌ Transcription error:', error);
      return browserTranscript;
    }

    console.log('✅ Transcription result:', data);
    const result = data as SttResult;
    return result.transcript || browserTranscript;
  } catch (error) {
    console.error('❌ Failed to transcribe audio:', error);
    return browserTranscript;
  }
}
