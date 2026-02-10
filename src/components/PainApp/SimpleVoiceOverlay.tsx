/**
 * SimpleVoiceOverlay - Radikal vereinfachte Spracheingabe V2
 * 
 * Migräne-optimierte Design-Prinzipien:
 * - Kein Transkript während der Aufnahme
 * - Nur 1 sichtbarer Hauptbutton
 * - Nach Aufnahme IMMER interaktiver Review-Dialog
 * - Nutzer kann erkannte Werte korrigieren (Slider + Meds + Sonstiges)
 * - Ruhige, dunkle Darstellung
 * - Adaptive Auto-Stop mit Satzende-Erkennung
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMeds, useRecentMeds } from '@/features/meds/hooks/useMeds';
import { 
  parseVoiceEntry,
  formatTimeDisplay,
  type VoiceParseResult 
} from '@/lib/voice/simpleVoiceParser';
import { buildUserMedicationLexicon, correctMedicationsInTranscript } from '@/lib/voice/medicationFuzzyMatch';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { 
  VOICE_MIGRAINE_PROFILE, 
  getAdaptiveSilenceThreshold, 
  canAutoStop 
} from '@/lib/voice/voiceTimingConfig';
import { useLanguage } from '@/hooks/useLanguage';
import { EntryReviewSheet, type EntryReviewState } from './EntryReviewSheet';
import { DEFAULT_DOSE_QUARTERS } from '@/lib/utils/doseFormatter';

// ============================================
// Types
// ============================================

type OverlayState = 'idle' | 'recording' | 'processing' | 'review';

/** Unified save payload for voice entries */
export interface VoiceSavePayload {
  painLevel: number;
  date: string;
  time: string;
  medications: Array<{ name: string; medicationId?: string; doseQuarters: number }>;
  notes: string;
}

interface SimpleVoiceOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: VoiceSavePayload) => void;
}

// ============================================
// Component
// ============================================

export function SimpleVoiceOverlay({
  open,
  onOpenChange,
  onSave,
}: SimpleVoiceOverlayProps) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  
  // State
  const [state, setState] = useState<OverlayState>('idle');
  const [reviewState, setReviewState] = useState<EntryReviewState | null>(null);
  const [emptyTranscript, setEmptyTranscript] = useState(false);
  const [showIdleHint, setShowIdleHint] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noSpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoStartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);
  const stateRef = useRef<OverlayState>('idle');
  const recordingStartRef = useRef<number>(0);
  const lastSpeechRef = useRef<number>(0);
  const isAutoStartRef = useRef(false);
  
  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  
  // Hooks
  const { data: userMeds = [] } = useMeds();
  const { data: recentMeds = [] } = useRecentMeds(5);
  const isSttSupported = isBrowserSttSupported();
  
  // Build lexicon
  const lexicon = React.useMemo(() => {
    return buildUserMedicationLexicon(userMeds.map(m => ({ 
      id: m.id, 
      name: m.name, 
      wirkstoff: m.wirkstoff 
    })));
  }, [userMeds]);

  // Medication options for the review sheet
  const medicationOptions = React.useMemo(() => 
    userMeds.map(m => ({ id: m.id, name: m.name })),
    [userMeds]
  );

  const recentMedOptions = React.useMemo(() =>
    recentMeds.map(m => ({ id: m.id, name: m.name, use_count: m.use_count || 0 })),
    [recentMeds]
  );
  
  // ============================================
  // Auto-Stop Timer (Adaptive, Migraine-Friendly)
  // ============================================
  
  const clearAllTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
    if (noSpeechTimeoutRef.current) {
      clearTimeout(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }
    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
  }, []);
  
  // ============================================
  // Build Review State from Parse Result
  // ============================================

  const buildReviewState = useCallback((result: VoiceParseResult): EntryReviewState => {
    const now = new Date();
    
    // Map parsed medications to selection map
    const selectedMeds = new Map<string, { doseQuarters: number; medicationId?: string }>();
    for (const med of result.medications) {
      selectedMeds.set(med.name, {
        doseQuarters: med.doseQuarters || DEFAULT_DOSE_QUARTERS,
        medicationId: med.medicationId,
      });
    }

    // Determine notes text: cleaned rest text or full transcript
    const notesText = result.note || result.raw_text || '';

    // Time display
    const timeDisplay = formatTimeDisplay(result.time);

    return {
      painLevel: result.pain_intensity.value ?? 7, // Default 7
      selectedMedications: selectedMeds,
      notesText,
      occurredAt: {
        date: result.time.date || now.toISOString().slice(0, 10),
        time: result.time.time || now.toTimeString().slice(0, 5),
        displayText: result.time.isNow 
          ? 'Jetzt' 
          : timeDisplay || undefined,
      },
    };
  }, []);
  
  // ============================================
  // Finish Recording & Parse
  // ============================================
  
  const finishRecording = useCallback(() => {
    clearAllTimers();
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }
    
    const finalText = committedTextRef.current.trim();
    const isEmpty = !finalText;
    
    setState('processing');
    setEmptyTranscript(isEmpty);
    
    // Parse the transcript (even if empty - we still show review)
    setTimeout(() => {
      const result = parseVoiceEntry(
        finalText,
        userMeds.map(m => ({ id: m.id, name: m.name, wirkstoff: m.wirkstoff }))
      );
      
      const review = buildReviewState(result);
      setReviewState(review);
      setState('review');
    }, 400);
  }, [clearAllTimers, userMeds, buildReviewState]);
  
  /**
   * Adaptive Auto-Stop Timer
   */
  const startAutoStopTimer = useCallback(() => {
    clearAllTimers();
    
    const text = committedTextRef.current.trim();
    const recordingDuration = Date.now() - recordingStartRef.current;
    
    if (!canAutoStop(text, recordingDuration)) {
      autoStopTimerRef.current = setTimeout(() => {
        if (hasSpokenRef.current && committedTextRef.current.trim()) {
          startAutoStopTimer();
        }
      }, 500);
      return;
    }
    
    const silenceThreshold = getAdaptiveSilenceThreshold(text, recordingDuration);
    
    autoStopTimerRef.current = setTimeout(() => {
      if (hasSpokenRef.current && committedTextRef.current.trim()) {
        finishRecording();
      }
    }, silenceThreshold);
  }, [clearAllTimers, finishRecording]);
  
  /**
   * Start hard timeout (safety limit)
   */
  const startHardTimeout = useCallback(() => {
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
    }
    
    hardTimeoutRef.current = setTimeout(() => {
      if (stateRef.current === 'recording') {
        finishRecording();
      }
    }, VOICE_MIGRAINE_PROFILE.hardTimeoutMs);
  }, [finishRecording]);
  
  // ============================================
  // Speech Recognition
  // ============================================
  
  const startRecording = useCallback(() => {
    if (!isSttSupported) {
      onOpenChange(false);
      return;
    }
    
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      onOpenChange(false);
      return;
    }
    
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    recordingStartRef.current = Date.now();
    lastSpeechRef.current = Date.now();
    setReviewState(null);
    setEmptyTranscript(false);
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = currentLanguage === 'en' ? 'en-US' : 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setState('recording');
      startHardTimeout();
      
      if (isAutoStartRef.current) {
        noSpeechTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'recording' && !hasSpokenRef.current) {
            clearAllTimers();
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch (e) { /* ignore */ }
              recognitionRef.current = null;
            }
            setState('idle');
            setShowIdleHint(true);
            isAutoStartRef.current = false;
          }
        }, 3500);
      }
    };
    
    recognition.onresult = (event: any) => {
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
        noSpeechTimeoutRef.current = null;
      }
      
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      
      lastSpeechRef.current = Date.now();
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript || '';
          const { corrected } = correctMedicationsInTranscript(text, lexicon);
          
          committedTextRef.current += (committedTextRef.current ? ' ' : '') + corrected;
          hasSpokenRef.current = true;
          
          startAutoStopTimer();
        }
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[SimpleVoice] Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        clearAllTimers();
        onOpenChange(false);
        return;
      }
    };
    
    recognition.onend = () => {
      if (stateRef.current === 'recording' && hasSpokenRef.current && committedTextRef.current.trim()) {
        finishRecording();
      }
    };
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('[SimpleVoice] Start failed:', e);
      onOpenChange(false);
    }
  }, [isSttSupported, lexicon, currentLanguage, clearAllTimers, startAutoStopTimer, startHardTimeout, finishRecording, onOpenChange]);
  
  const stopRecording = useCallback(() => {
    clearAllTimers();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }
  }, [clearAllTimers]);
  
  // ============================================
  // Lifecycle
  // ============================================
  
  useEffect(() => {
    if (open) {
      setState('idle');
      setReviewState(null);
      setEmptyTranscript(false);
      setShowIdleHint(false);
      setSaving(false);
      committedTextRef.current = '';
      hasSpokenRef.current = false;
      isAutoStartRef.current = false;
      
      autoStartTimerRef.current = setTimeout(() => {
        if (stateRef.current === 'idle' && isSttSupported) {
          isAutoStartRef.current = true;
          startRecording();
        }
      }, 400);
    } else {
      clearAllTimers();
      stopRecording();
    }
  }, [open, stopRecording, startRecording, isSttSupported, clearAllTimers]);
  
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);
  
  // ============================================
  // Actions
  // ============================================
  
  const handleMicTap = useCallback(() => {
    if (state === 'idle') {
      setShowIdleHint(false);
      isAutoStartRef.current = false;
      startRecording();
    } else if (state === 'recording') {
      finishRecording();
    }
  }, [state, startRecording, finishRecording]);
  
  const handleSave = useCallback(async () => {
    if (!reviewState) return;
    
    setSaving(true);
    try {
      const medications = Array.from(reviewState.selectedMedications.entries()).map(
        ([name, data]) => ({
          name,
          medicationId: data.medicationId,
          doseQuarters: data.doseQuarters,
        })
      );

      onSave({
        painLevel: reviewState.painLevel,
        date: reviewState.occurredAt.date,
        time: reviewState.occurredAt.time,
        medications,
        notes: reviewState.notesText,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('[SimpleVoice] Save failed:', error);
    } finally {
      setSaving(false);
    }
  }, [reviewState, onSave, onOpenChange]);
  
  const handleDiscard = useCallback(() => {
    // Verwerfen: close without saving anything
    clearAllTimers();
    stopRecording();
    setState('idle');
    setReviewState(null);
    setEmptyTranscript(false);
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    onOpenChange(false);
  }, [clearAllTimers, stopRecording, onOpenChange]);

  const handleRetryVoice = useCallback(() => {
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    setReviewState(null);
    setEmptyTranscript(false);
    setState('idle');
  }, []);

  const handleClose = useCallback(() => {
    clearAllTimers();
    stopRecording();
    setState('idle');
    setReviewState(null);
    setEmptyTranscript(false);
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    onOpenChange(false);
  }, [clearAllTimers, stopRecording, onOpenChange]);
  
  // ESC key support for desktop
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);
  
  // ============================================
  // Don't render if not open
  // ============================================
  
  if (!open) return null;
  
  // ============================================
  // Render Idle State
  // ============================================
  
  const renderIdleState = () => (
    <div className="flex flex-col items-center justify-center flex-1 pb-24">
      <button
        onClick={handleMicTap}
        className="w-32 h-32 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center transition-all hover:bg-primary/20 hover:scale-105 active:scale-95 focus:outline-none"
        aria-label={t('voice.tapToSpeak')}
      >
        <Mic className="w-14 h-14 text-primary" />
      </button>
      
      {showIdleHint && (
        <p className="mt-10 text-sm text-muted-foreground/50">
          {t('voice.tapToSpeak')}
        </p>
      )}
    </div>
  );
  
  // ============================================
  // Render Recording State
  // ============================================
  
  const renderRecordingState = () => (
    <div className="flex flex-col items-center justify-center flex-1 pb-24">
      <button
        onClick={handleMicTap}
        className="relative w-32 h-32 focus:outline-none"
        aria-label={t('common.done')}
      >
        <div 
          className="absolute inset-0 rounded-full bg-primary/15 animate-ping" 
          style={{ animationDuration: '2.5s' }} 
        />
        <div 
          className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" 
          style={{ animationDuration: '2s' }} 
        />
        
        <div className="relative w-full h-full rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <Mic className="w-14 h-14 text-primary" />
        </div>
      </button>
    </div>
  );

  // ============================================
  // Render Processing State
  // ============================================

  const renderProcessingState = () => (
    <div className="flex flex-col items-center justify-center flex-1 pb-24">
      <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="mt-5 text-sm text-muted-foreground/60">{t('voice.understood')}</p>
    </div>
  );
  
  // ============================================
  // Render Review State (Interactive!)
  // ============================================
  
  const renderReviewState = () => {
    if (!reviewState) return null;
    
    return (
      <>
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-background/80"
          style={{ animation: 'fadeIn 0.25s ease-out' }}
        />
        
        {/* Bottom Sheet */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl border-t border-border/20 shadow-2xl max-h-[85vh] overflow-y-auto"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0.8; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-card rounded-t-3xl z-10">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          
          {/* Content */}
          <div className="px-6 pb-8 pt-2">
            <EntryReviewSheet
              state={reviewState}
              onChange={setReviewState}
              onSave={handleSave}
              onDiscard={handleDiscard}
              onRetryVoice={handleRetryVoice}
              medications={medicationOptions}
              recentMedications={recentMedOptions}
              saving={saving}
              emptyTranscript={emptyTranscript}
            />
          </div>
        </div>
      </>
    );
  };
  
  // ============================================
  // Main Render
  // ============================================
  
  // Show cancel button in idle, recording, and processing states
  const showCancelButton = state === 'idle' || state === 'recording' || state === 'processing';
  
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {state === 'idle' && renderIdleState()}
        {state === 'recording' && renderRecordingState()}
        {state === 'processing' && renderProcessingState()}
        {state === 'review' && renderReviewState()}
      </div>
      
      {/* Bottom cancel button - large, clearly labeled, always visible */}
      {showCancelButton && (
        <div className="pb-safe px-6 pb-8">
          <button
            onClick={handleClose}
            className="w-full h-14 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
