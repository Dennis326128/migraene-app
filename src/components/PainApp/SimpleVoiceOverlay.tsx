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
import { Mic } from 'lucide-react';
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
  const [showIdleHint, setShowIdleHint] = useState(false); // Show "Tippe zum Sprechen" after auto-start failed
  
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
  const isAutoStartRef = useRef(false); // Track if current recording was auto-started
  
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
      
      // Start "no speech" timeout for auto-started recordings
      // If no speech detected within 3.5s, stop and go back to idle
      if (isAutoStartRef.current) {
        noSpeechTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'recording' && !hasSpokenRef.current) {
            // No speech detected - stop recording silently and show hint
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
      // Cancel no-speech timeout on first result
      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
        noSpeechTimeoutRef.current = null;
      }
      
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
  
  // Auto-start recording when overlay opens
  useEffect(() => {
    if (open) {
      setState('idle');
      setParsedResult(null);
      setOverriddenType(null);
      setShowIdleHint(false);
      committedTextRef.current = '';
      hasSpokenRef.current = false;
      isAutoStartRef.current = false;
      
      // Auto-start after short delay (300-500ms)
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
      setShowIdleHint(false);
      isAutoStartRef.current = false; // Manual tap - not auto-start
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
      
      {/* Hint - shows "Tippe zum Sprechen" after auto-start failed, otherwise "Sprechen" */}
      <p className="mt-10 text-sm text-muted-foreground/50">
        {showIdleHint ? 'Tippe zum Sprechen' : 'Sprechen'}
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
  // Render Processing State - with "Verstanden" transition
  // ============================================

  const renderProcessingState = () => (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="mt-5 text-sm text-muted-foreground/60">Verstanden</p>
    </div>
  );
  
  // ============================================
  // Generate natural language summary
  // ============================================
  
  const generateSummaryText = (result: VoiceParseResult, isNewEntry: boolean): string => {
    if (!isNewEntry) {
      return 'Notiz wurde erfasst.';
    }
    
    const parts: string[] = [];
    
    // Time component
    if (result.time && !result.time.isNow) {
      const timeDisplay = formatTimeDisplay(result.time);
      if (timeDisplay) {
        parts.push(timeDisplay);
      }
    }
    
    // Pain component
    if (result.pain_intensity.value !== null) {
      const painLevel = result.pain_intensity.value;
      const painDesc = painLevel >= 7 ? 'starke' : painLevel >= 4 ? 'mäßige' : 'leichte';
      parts.push(`${painDesc} Kopfschmerzen (Stärke ${painLevel})`);
    } else {
      parts.push('Kopfschmerzen');
    }
    
    // Medication component
    if (result.medications.length > 0) {
      const medTexts = result.medications.map(m => {
        const doseText = formatDoseQuarters(m.doseQuarters);
        return doseText ? `${doseText} ${m.name}` : m.name;
      });
      
      if (medTexts.length === 1) {
        parts.push(`${medTexts[0]} eingenommen`);
      } else {
        const lastMed = medTexts.pop();
        parts.push(`${medTexts.join(', ')} und ${lastMed} eingenommen`);
      }
    }
    
    // Build natural sentence
    if (parts.length === 0) {
      return 'Eintrag erkannt.';
    }
    
    // Combine into natural text
    let text = parts[0];
    for (let i = 1; i < parts.length; i++) {
      // Capitalize if it follows a period
      const part = parts[i];
      if (i === 1 && parts[0].includes('Stärke')) {
        text += '. ' + part.charAt(0).toUpperCase() + part.slice(1);
      } else if (part.includes('eingenommen')) {
        text += '. ' + part.charAt(0).toUpperCase() + part.slice(1);
      } else {
        text += ' ' + part;
      }
    }
    
    // Ensure ending period
    if (!text.endsWith('.')) {
      text += '.';
    }
    
    return text;
  };
  
  // ============================================
  // Render Review State - Natural Language Summary
  // ============================================
  
  const renderReviewState = () => {
    if (!parsedResult) return null;
    
    const isNewEntry = effectiveType === 'new_entry';
    const showTypeToggle = parsedResult.typeCanBeToggled;
    const hasPain = parsedResult.pain_intensity.value !== null;
    const hasMeds = parsedResult.medications.length > 0;
    const hasStructuredData = hasPain || hasMeds;
    
    // Generate natural summary
    const summaryText = generateSummaryText(parsedResult, isNewEntry);
    
    // Minimal fallback for truly empty results
    const showMinimalFallback = isNewEntry && !hasStructuredData;
    
    return (
      <>
        {/* Fade overlay for mic background */}
        <div 
          className="absolute inset-0 bg-background/80"
          style={{ 
            animation: 'fadeIn 0.25s ease-out',
          }}
        />
        
        {/* Bottom Sheet with slide-up */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl border-t border-border/20 shadow-2xl"
          style={{ 
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { 
                transform: translateY(100%); 
                opacity: 0.8;
              }
              to { 
                transform: translateY(0); 
                opacity: 1;
              }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          
          <div className="px-6 pb-8 pt-4">
            {/* Type Chip - small, neutral, only tappable if toggleable */}
            <div className="flex justify-center mb-6">
              <Badge 
                variant="outline"
                className={cn(
                  "text-xs px-3 py-1 font-normal bg-transparent border-border/40 text-muted-foreground",
                  showTypeToggle && "cursor-pointer hover:bg-muted/30 transition-colors"
                )}
                onClick={showTypeToggle ? toggleEntryType : undefined}
              >
                {isNewEntry ? 'Neuer Eintrag' : 'Kontexteintrag'}
              </Badge>
            </div>
            
            {/* Central Summary Card */}
            <div className="bg-muted/30 rounded-2xl p-5 mb-8">
              {showMinimalFallback ? (
                // Minimal fallback - no warnings, just neutral
                <p className="text-center text-base text-foreground/80 leading-relaxed">
                  Eintrag erkannt. Möchtest du ihn speichern?
                </p>
              ) : (
                // Natural language summary
                <p className="text-center text-base text-foreground leading-relaxed">
                  {summaryText}
                </p>
              )}
            </div>
            
            {/* Actions - exactly 2, calm design */}
            <div className="space-y-4">
              {/* Primary: Save - softer green, not aggressive */}
              <Button
                size="lg"
                className="w-full h-12 text-base font-medium bg-primary/90 hover:bg-primary"
                onClick={handleSave}
              >
                Speichern
              </Button>
              
              {/* Secondary: Retry - text link, centered, generous spacing */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleRetry}
                  className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2 px-4"
                >
                  Erneut sprechen
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
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
