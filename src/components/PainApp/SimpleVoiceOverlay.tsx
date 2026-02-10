/**
 * SimpleVoiceOverlay - Voice Capture V2 (Migränefreundlich)
 * 
 * Design-Prinzipien:
 * - Auto-Start: Aufnahme beginnt sofort beim Öffnen
 * - Nutzer-gesteuertes Ende: "Fertig"-Button als primärer Stop
 * - Großzügiger Stille-Fallback (12–15s), kein aggressiver Auto-Stop
 * - Auto-Restart bei unerwartetem API-Ende
 * - "Weiter sprechen" Append-Modus
 * - Ruhige, dunkle Darstellung
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, ChevronLeft } from 'lucide-react';
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
import { mergeVoiceAppend, type UserEditedFlags } from '@/lib/voice/mergeVoiceAppend';
import { DEFAULT_DOSE_QUARTERS } from '@/lib/utils/doseFormatter';

// ============================================
// Types
// ============================================

type OverlayState = 'recording' | 'processing' | 'review' | 'paused';
type VoiceMode = 'new' | 'append';

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
  const [state, setState] = useState<OverlayState>('recording');
  const [reviewState, setReviewState] = useState<EntryReviewState | null>(null);
  const [emptyTranscript, setEmptyTranscript] = useState(false);
  const [painDefaultUsed, setPainDefaultUsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('new');
  
  // User edit tracking
  const [userEdited, setUserEdited] = useState<UserEditedFlags>({ pain: false, meds: false, notes: false });
  
  // Transcript storage for append mode
  const baseTranscriptRef = useRef('');
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<OverlayState>('recording');
  const recordingStartRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const continueSpeakingUsedRef = useRef(false);
  
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
  // Timer Management
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
  }, []);
  
  // ============================================
  // Build Review State from Parse Result
  // ============================================

  const buildReviewState = useCallback((result: VoiceParseResult): EntryReviewState => {
    const now = new Date();
    
    const selectedMeds = new Map<string, { doseQuarters: number; medicationId?: string }>();
    for (const med of result.medications) {
      selectedMeds.set(med.name, {
        doseQuarters: med.doseQuarters || DEFAULT_DOSE_QUARTERS,
        medicationId: med.medicationId,
      });
    }

    const notesText = result.note || result.raw_text || '';
    const timeDisplay = formatTimeDisplay(result.time);

    return {
      painLevel: result.pain_intensity.value ?? 7,
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
    // State wird bereits vom Caller gesetzt (handleFertig),
    // aber als Sicherheit auch hier nochmal erzwingen
    setState('processing');
    
    clearAllTimers();
    intentionalStopRef.current = true;
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }
    
    const currentText = committedTextRef.current.trim();
    
    // Fallback-Timer: Falls Parsing hängt, nach 1500ms trotzdem Review öffnen
    const fallbackTimer = setTimeout(() => {
      if (stateRef.current === 'processing') {
        console.warn('[SimpleVoice] Fallback triggered – forcing review');
        setEmptyTranscript(true);
        setPainDefaultUsed(true);
        setReviewState({
          painLevel: 7,
          selectedMedications: new Map(),
          notesText: '',
          occurredAt: {
            date: new Date().toISOString().slice(0, 10),
            time: new Date().toTimeString().slice(0, 5),
          },
        });
        setVoiceMode('new');
        setState('review');
      }
    }, 1500);
    
    setTimeout(() => {
      if (voiceMode === 'append' && baseTranscriptRef.current) {
        // Append mode: combine transcripts and merge
        const combinedTranscript = (baseTranscriptRef.current + ' ' + currentText).trim();
        const result = parseVoiceEntry(
          combinedTranscript,
          userMeds.map(m => ({ id: m.id, name: m.name, wirkstoff: m.wirkstoff }))
        );
        
        if (reviewState) {
          const merged = mergeVoiceAppend(reviewState, result, userEdited);
          setReviewState(merged.state);
          setPainDefaultUsed(merged.painDefaultUsed);
          setEmptyTranscript(!combinedTranscript);
        }
        
        // Update base transcript for potential further appends
        baseTranscriptRef.current = combinedTranscript;
      } else {
        // New mode: fresh parse
        const isEmpty = !currentText;
        setEmptyTranscript(isEmpty);
        
        const result = parseVoiceEntry(
          currentText,
          userMeds.map(m => ({ id: m.id, name: m.name, wirkstoff: m.wirkstoff }))
        );
        
        const review = buildReviewState(result);
        setReviewState(review);
        setPainDefaultUsed(result.pain_intensity.value === null);
        
        // Store base transcript for potential appends
        baseTranscriptRef.current = currentText;
      }
      
      setVoiceMode('new');
      setState('review');
      clearTimeout(fallbackTimer);
    }, 400);
  }, [clearAllTimers, userMeds, buildReviewState, voiceMode, reviewState, userEdited]);
  
  // ============================================
  // Auto-Stop Timer (generous fallback only)
  // ============================================
  
  const startAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    
    // Don't auto-stop if "Weiter sprechen" was recently used
    if (continueSpeakingUsedRef.current) return;
    
    const text = committedTextRef.current.trim();
    const recordingDuration = Date.now() - recordingStartRef.current;
    
    if (!canAutoStop(text, recordingDuration)) {
      // Retry check later
      autoStopTimerRef.current = setTimeout(() => {
        if (hasSpokenRef.current && committedTextRef.current.trim()) {
          startAutoStopTimer();
        }
      }, 2000);
      return;
    }
    
    const silenceThreshold = getAdaptiveSilenceThreshold(text, recordingDuration);
    
    autoStopTimerRef.current = setTimeout(() => {
      if (hasSpokenRef.current && committedTextRef.current.trim() && stateRef.current === 'recording') {
        finishRecording();
      }
    }, silenceThreshold);
  }, [finishRecording]);
  
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
    intentionalStopRef.current = false;
    continueSpeakingUsedRef.current = false;
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = currentLanguage === 'en' ? 'en-US' : 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setState('recording');
      startHardTimeout();
    };
    
    recognition.onresult = (event: any) => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript || '';
          const { corrected } = correctMedicationsInTranscript(text, lexicon);
          
          committedTextRef.current += (committedTextRef.current ? ' ' : '') + corrected;
          hasSpokenRef.current = true;
          
          // Restart generous auto-stop timer after each speech segment
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
      // For other errors (network, etc): show paused state
      if (event.error === 'no-speech' || event.error === 'network') {
        // Don't stop, let onend handle restart
      }
    };
    
    recognition.onend = () => {
      // If the user intentionally stopped, don't restart
      if (intentionalStopRef.current) return;
      
      // If we're still in recording state, the API ended unexpectedly
      // Auto-restart to keep listening
      if (stateRef.current === 'recording') {
        try {
          const newRecognition = new SpeechRecognitionAPI();
          newRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'de-DE';
          newRecognition.continuous = true;
          newRecognition.interimResults = false;
          newRecognition.onstart = recognition.onstart;
          newRecognition.onresult = recognition.onresult;
          newRecognition.onerror = recognition.onerror;
          newRecognition.onend = recognition.onend;
          recognitionRef.current = newRecognition;
          newRecognition.start();
        } catch (e) {
          // Auto-restart failed, show paused state
          console.warn('[SimpleVoice] Auto-restart failed, showing paused state');
          setState('paused');
        }
      }
    };
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('[SimpleVoice] Start failed:', e);
      onOpenChange(false);
    }
  }, [isSttSupported, lexicon, currentLanguage, clearAllTimers, startAutoStopTimer, startHardTimeout, onOpenChange]);
  
  const stopRecording = useCallback(() => {
    clearAllTimers();
    intentionalStopRef.current = true;
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
  // Lifecycle: Auto-start on open
  // ============================================
  
  useEffect(() => {
    if (open) {
      setState('recording');
      setReviewState(null);
      setEmptyTranscript(false);
      setPainDefaultUsed(false);
      setSaving(false);
      setVoiceMode('new');
      setUserEdited({ pain: false, meds: false, notes: false });
      committedTextRef.current = '';
      hasSpokenRef.current = false;
      baseTranscriptRef.current = '';
      intentionalStopRef.current = false;
      continueSpeakingUsedRef.current = false;
      
      // Auto-start recording immediately
      const timer = setTimeout(() => {
        if (isSttSupported) {
          startRecording();
        }
      }, 200);
      
      return () => clearTimeout(timer);
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
  // Review state change tracking (for userEdited flags)
  // ============================================
  
  const handleReviewChange = useCallback((newState: EntryReviewState) => {
    if (reviewState) {
      setUserEdited(prev => ({
        pain: prev.pain || newState.painLevel !== reviewState.painLevel,
        meds: prev.meds || newState.selectedMedications !== reviewState.selectedMedications,
        notes: prev.notes || newState.notesText !== reviewState.notesText,
      }));
    }
    setReviewState(newState);
  }, [reviewState]);
  
  // ============================================
  // Actions
  // ============================================
  
  const handleFertig = useCallback(() => {
    // SOFORT sichtbares Feedback – vor allem anderen
    setState('processing');
    
    // Dann Recording stoppen & parsen
    finishRecording();
  }, [finishRecording]);
  
  const handleResumeRecording = useCallback(() => {
    intentionalStopRef.current = false;
    startRecording();
  }, [startRecording]);
  
  const handleContinueSpeaking = useCallback(() => {
    // Switch to append mode and reopen recording
    setVoiceMode('append');
    continueSpeakingUsedRef.current = true;
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    intentionalStopRef.current = false;
    setState('recording');
    
    const timer = setTimeout(() => {
      startRecording();
    }, 200);
    
    return () => clearTimeout(timer);
  }, [startRecording]);
  
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
    clearAllTimers();
    stopRecording();
    onOpenChange(false);
  }, [clearAllTimers, stopRecording, onOpenChange]);

  const handleClose = useCallback(() => {
    clearAllTimers();
    stopRecording();
    onOpenChange(false);
  }, [clearAllTimers, stopRecording, onOpenChange]);
  
  // ESC key support
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
  // Render Recording State
  // ============================================
  
  const renderRecordingState = () => (
    <div className="flex flex-col items-center justify-center flex-1 pb-32">
      {/* Pulsing mic indicator */}
      <div className="relative w-32 h-32 mb-8">
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
      </div>
      
      {/* Status text */}
      <p className="text-base text-muted-foreground mb-2">
        {voiceMode === 'append' ? 'Ergänze deine Eingabe …' : 'Ich höre zu …'}
      </p>
      <p className="text-xs text-muted-foreground/50">
        Tippe auf „Fertig", wenn du fertig bist.
      </p>
    </div>
  );
  
  // ============================================
  // Render Paused State (unexpected API stop)
  // ============================================
  
  const renderPausedState = () => (
    <div className="flex flex-col items-center justify-center flex-1 pb-32">
      <div className="w-32 h-32 rounded-full bg-muted/30 border-2 border-muted-foreground/20 flex items-center justify-center mb-8">
        <Mic className="w-14 h-14 text-muted-foreground/50" />
      </div>
      
      <p className="text-base text-muted-foreground mb-6">Aufnahme pausiert</p>
      
      <button
        onClick={handleResumeRecording}
        className="px-6 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
      >
        Weiter aufnehmen
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
  // Render Review State
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
              onChange={handleReviewChange}
              onSave={handleSave}
              onDiscard={handleDiscard}
              onContinueSpeaking={handleContinueSpeaking}
              medications={medicationOptions}
              recentMedications={recentMedOptions}
              saving={saving}
              emptyTranscript={emptyTranscript}
              painDefaultUsed={painDefaultUsed}
              hideTimeDisplay={true}
            />
          </div>
        </div>
      </>
    );
  };
  
  // ============================================
  // Main Render
  // ============================================
  
  const showBottomButtons = state === 'recording' || state === 'paused';
  
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header with back arrow */}
      {(state === 'recording' || state === 'paused' || state === 'processing') && (
        <div className="flex items-center px-4 pt-4 pb-2">
          <button
            onClick={handleClose}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted/50 active:bg-muted transition-colors -ml-1"
            aria-label={t('common.back')}
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>
        </div>
      )}
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {state === 'recording' && renderRecordingState()}
        {state === 'paused' && renderPausedState()}
        {state === 'processing' && renderProcessingState()}
        {state === 'review' && renderReviewState()}
      </div>
      
      {/* Bottom buttons for recording/paused states */}
      {showBottomButtons && (
        <div className="pb-safe px-6 pb-8 space-y-3">
          {state === 'recording' && (
            <button
              onClick={handleFertig}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 hover:bg-primary/90 active:scale-[0.98]"
            >
              Fertig
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-full h-12 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground text-sm font-medium transition-colors focus:outline-none"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
