/**
 * SimpleVoiceOverlay - Radikal vereinfachte Spracheingabe
 * 
 * Migräne-optimierte Design-Prinzipien:
 * - Kein Transkript während der Aufnahme
 * - Nur 1 sichtbarer Hauptbutton
 * - Keine erklärenden Texte
 * - Keine Modus-Auswahl sichtbar
 * - Ruhige, dunkle Darstellung
 * - Adaptive Auto-Stop mit Satzende-Erkennung
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Check, Clock, Activity, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { 
  parseVoiceEntry,
  formatDoseQuarters, 
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

// ============================================
// Types
// ============================================

type OverlayState = 'idle' | 'recording' | 'processing' | 'review';

interface SimpleVoiceOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavePainEntry: (data: {
    painLevel?: number;
    date?: string;
    time?: string;
    medications?: Array<{ name: string; medicationId?: string; doseQuarters: number }>;
    notes?: string;
  }) => void;
  onSaveContextNote: (text: string, timestamp?: string) => void;
}

// ============================================
// Component
// ============================================

export function SimpleVoiceOverlay({
  open,
  onOpenChange,
  onSavePainEntry,
  onSaveContextNote
}: SimpleVoiceOverlayProps) {
  // State
  const [state, setState] = useState<OverlayState>('idle');
  const [parsedResult, setParsedResult] = useState<VoiceParseResult | null>(null);
  const [overriddenType, setOverriddenType] = useState<'new_entry' | 'context_entry' | null>(null);
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);
  const stateRef = useRef<OverlayState>('idle');
  const recordingStartRef = useRef<number>(0);
  const lastSpeechRef = useRef<number>(0);
  
  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  
  // Hooks
  const { data: userMeds = [] } = useMeds();
  const isSttSupported = isBrowserSttSupported();
  
  // Build lexicon
  const lexicon = React.useMemo(() => {
    return buildUserMedicationLexicon(userMeds.map(m => ({ 
      id: m.id, 
      name: m.name, 
      wirkstoff: m.wirkstoff 
    })));
  }, [userMeds]);

  // Get effective entry type (with override support)
  const effectiveType = overriddenType ?? parsedResult?.entry_type ?? 'context_entry';
  
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
    if (!finalText) {
      onOpenChange(false);
      return;
    }
    
    setState('processing');
    
    // Parse the transcript
    setTimeout(() => {
      const result = parseVoiceEntry(finalText, userMeds.map(m => ({
        id: m.id,
        name: m.name,
        wirkstoff: m.wirkstoff
      })));
      
      setParsedResult(result);
      setState('review');
    }, 400);
  }, [clearAllTimers, userMeds, onOpenChange]);
  
  /**
   * Adaptive Auto-Stop Timer
   * Uses migraine-friendly thresholds that adapt to speech patterns
   */
  const startAutoStopTimer = useCallback(() => {
    clearAllTimers();
    
    const text = committedTextRef.current.trim();
    const recordingDuration = Date.now() - recordingStartRef.current;
    
    // Check if we CAN auto-stop (minimum requirements)
    if (!canAutoStop(text, recordingDuration)) {
      // Schedule a recheck in 500ms
      autoStopTimerRef.current = setTimeout(() => {
        if (hasSpokenRef.current && committedTextRef.current.trim()) {
          startAutoStopTimer();
        }
      }, 500);
      return;
    }
    
    // Get adaptive silence threshold based on speech patterns
    const silenceThreshold = getAdaptiveSilenceThreshold(text, recordingDuration);
    
    autoStopTimerRef.current = setTimeout(() => {
      // Double-check we still want to auto-stop
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
      // Gently finish after max duration - no error message
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
    setOverriddenType(null);
    setParsedResult(null);
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
      setState('recording');
      startHardTimeout();
    };
    
    recognition.onresult = (event: any) => {
      // Reset auto-stop timer on each speech result
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
          
          // Start adaptive auto-stop timer after each speech segment
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
      // For other errors (no-speech, network), just continue listening
    };
    
    recognition.onend = () => {
      // If still recording and has content, finish
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
  }, [isSttSupported, lexicon, clearAllTimers, startAutoStopTimer, startHardTimeout, finishRecording, onOpenChange]);
  
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
      setParsedResult(null);
      setOverriddenType(null);
      committedTextRef.current = '';
      hasSpokenRef.current = false;
    } else {
      stopRecording();
    }
  }, [open, stopRecording]);
  
  // Cleanup on unmount
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
      startRecording();
    } else if (state === 'recording') {
      finishRecording();
    }
  }, [state, startRecording, finishRecording]);
  
  const handleSave = useCallback(() => {
    if (!parsedResult) return;
    
    if (effectiveType === 'new_entry') {
      onSavePainEntry({
        painLevel: parsedResult.pain_intensity.value ?? undefined,
        date: parsedResult.time.date,
        time: parsedResult.time.time,
        medications: parsedResult.medications.map(m => ({
          name: m.name,
          medicationId: m.medicationId,
          doseQuarters: m.doseQuarters
        })),
        notes: parsedResult.note || undefined
      });
    } else {
      onSaveContextNote(parsedResult.raw_text, parsedResult.time.iso ?? undefined);
    }
    
    onOpenChange(false);
  }, [parsedResult, effectiveType, onSavePainEntry, onSaveContextNote, onOpenChange]);
  
  const handleRetry = useCallback(() => {
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    setParsedResult(null);
    setOverriddenType(null);
    setState('idle');
  }, []);

  const toggleEntryType = useCallback(() => {
    const newType = effectiveType === 'new_entry' ? 'context_entry' : 'new_entry';
    setOverriddenType(newType);
  }, [effectiveType]);

  const handleClose = useCallback(() => {
    stopRecording();
    onOpenChange(false);
  }, [stopRecording, onOpenChange]);
  
  // ============================================
  // Don't render if not open
  // ============================================
  
  if (!open) return null;
  
  // ============================================
  // Render Idle State - ONLY big mic
  // ============================================
  
  const renderIdleState = () => (
    <div 
      className="flex flex-col items-center justify-center h-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Big Microphone - tap to start */}
      <button
        onClick={handleMicTap}
        className="w-32 h-32 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center transition-all hover:bg-primary/20 hover:scale-105 active:scale-95 focus:outline-none"
        aria-label="Aufnahme starten"
      >
        <Mic className="w-14 h-14 text-primary" />
      </button>
      
      {/* Single minimal hint */}
      <p className="mt-10 text-sm text-muted-foreground/50">
        Sprechen
      </p>
    </div>
  );
  
  // ============================================
  // Render Recording State - ONLY pulsing mic
  // ============================================
  
  const renderRecordingState = () => (
    <div 
      className="flex flex-col items-center justify-center h-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Pulsing Microphone */}
      <button
        onClick={handleMicTap}
        className="relative w-32 h-32 focus:outline-none"
        aria-label="Aufnahme beenden"
      >
        {/* Calm pulse rings */}
        <div 
          className="absolute inset-0 rounded-full bg-primary/15 animate-ping" 
          style={{ animationDuration: '2.5s' }} 
        />
        <div 
          className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" 
          style={{ animationDuration: '2s' }} 
        />
        
        {/* Mic circle */}
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
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="mt-5 text-sm text-muted-foreground/60">Verarbeite…</p>
    </div>
  );
  
  // ============================================
  // Render Review State - Minimal Bottom Sheet
  // ============================================
  
  const renderReviewState = () => {
    if (!parsedResult) return null;
    
    const isNewEntry = effectiveType === 'new_entry';
    const showTypeToggle = parsedResult.typeCanBeToggled;
    const hasTime = parsedResult.time && !parsedResult.time.isNow;
    const hasPain = parsedResult.pain_intensity.value !== null;
    const hasMeds = parsedResult.medications.length > 0;
    const hasStructuredData = hasTime || hasPain || hasMeds;
    
    return (
      <div 
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl border-t border-border/30 shadow-2xl"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        
        <div className="p-5 max-h-[60vh] overflow-auto">
          {/* Type Chip - dezent, nur bei Unsicherheit antippbar */}
          <div className="flex justify-center mb-5">
            <Badge 
              variant={isNewEntry ? "default" : "secondary"}
              className={cn(
                "text-xs px-3 py-1.5 transition-all",
                showTypeToggle && "cursor-pointer hover:opacity-80"
              )}
              onClick={showTypeToggle ? toggleEntryType : undefined}
            >
              {isNewEntry ? 'Neuer Eintrag' : 'Kontexteintrag'}
            </Badge>
          </div>
          
          {/* Content - structured data only, NO raw transcript */}
          {isNewEntry && hasStructuredData ? (
            <div className="space-y-3 mb-6">
              {/* Time */}
              {hasTime && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">
                    {formatTimeDisplay(parsedResult.time)}
                  </span>
                </div>
              )}
              
              {/* Pain Level */}
              {hasPain && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <Activity className="w-5 h-5 text-destructive flex-shrink-0" />
                  <span className="text-sm font-medium">
                    Stärke {parsedResult.pain_intensity.value}
                  </span>
                </div>
              )}
              
              {/* Medications */}
              {hasMeds && parsedResult.medications.map((med, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                  <Pill className="w-5 h-5 text-success flex-shrink-0" />
                  <span className="text-sm font-medium">
                    {formatDoseQuarters(med.doseQuarters)} {med.name}
                  </span>
                </div>
              ))}
            </div>
          ) : isNewEntry && !hasStructuredData ? (
            // New entry but nothing recognized - suggest context
            <div className="text-center py-4 mb-4">
              <p className="text-sm text-muted-foreground/80">
                Als Notiz speichern?
              </p>
            </div>
          ) : (
            // Context entry - just show "Notiz" indicator, NO transcript
            <div className="text-center py-4 mb-4">
              <p className="text-sm text-muted-foreground/80">
                Notiz erkannt
              </p>
            </div>
          )}
          
          {/* Actions - exactly 2 */}
          <div className="space-y-3">
            {/* Primary: Save */}
            <Button
              size="lg"
              className="w-full h-12 text-base font-medium"
              onClick={handleSave}
            >
              <Check className="w-5 h-5 mr-2" />
              Speichern
            </Button>
            
            {/* Secondary: Retry - text link style */}
            <button
              onClick={handleRetry}
              className="w-full py-2 text-sm text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Erneut sprechen
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // ============================================
  // Main Render - Fullscreen dark overlay
  // ============================================
  
  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Backdrop tap to close (only in idle/recording, NOT in review) */}
      {(state === 'idle' || state === 'recording') && (
        <button
          onClick={handleClose}
          className="absolute inset-0 w-full h-full cursor-default focus:outline-none"
          aria-label="Schließen"
        />
      )}
      
      {/* Content */}
      <div className="relative h-full flex flex-col">
        {state === 'idle' && renderIdleState()}
        {state === 'recording' && renderRecordingState()}
        {state === 'processing' && renderProcessingState()}
        {state === 'review' && renderReviewState()}
      </div>
    </div>
  );
}
