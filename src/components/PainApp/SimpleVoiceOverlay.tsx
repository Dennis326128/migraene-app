/**
 * SimpleVoiceOverlay - Radikal vereinfachte Spracheingabe
 * 
 * Migräne-optimierte Design-Prinzipien:
 * - Kein Transkript während der Aufnahme
 * - Nur 1 sichtbarer Hauptbutton
 * - Keine erklärenden Texte
 * - Keine Modus-Auswahl sichtbar
 * - Ruhige, dunkle Darstellung
 * - Auto-Stopp nach 2 Sekunden Pause
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

// Auto-stop delay after speech pause (2 seconds)
const AUTO_STOP_DELAY_MS = 2000;

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
  const hasSpokenRef = useRef(false);
  
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
  // Auto-Stop Timer
  // ============================================
  
  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);
  
  const startAutoStopTimer = useCallback(() => {
    clearAutoStopTimer();
    autoStopTimerRef.current = setTimeout(() => {
      // Only auto-stop if user has spoken something
      if (hasSpokenRef.current && committedTextRef.current.trim()) {
        finishRecording();
      }
    }, AUTO_STOP_DELAY_MS);
  }, [clearAutoStopTimer]);
  
  // ============================================
  // Finish Recording & Parse
  // ============================================
  
  const finishRecording = useCallback(() => {
    clearAutoStopTimer();
    
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
    }, 300);
  }, [clearAutoStopTimer, userMeds, onOpenChange]);
  
  // ============================================
  // Speech Recognition
  // ============================================
  
  const startRecording = useCallback(() => {
    if (!isSttSupported) {
      // Fallback: just close, user can use keyboard
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
    setOverriddenType(null);
    setParsedResult(null);
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false; // Only final results
    
    recognition.onstart = () => {
      setState('recording');
    };
    
    recognition.onresult = (event: any) => {
      clearAutoStopTimer();
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript || '';
          const { corrected } = correctMedicationsInTranscript(text, lexicon);
          
          committedTextRef.current += (committedTextRef.current ? ' ' : '') + corrected;
          hasSpokenRef.current = true;
          
          // Start auto-stop timer after each speech segment
          startAutoStopTimer();
        }
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[SimpleVoice] Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        onOpenChange(false);
        return;
      }
      // For other errors, try to continue
    };
    
    recognition.onend = () => {
      // If still recording and has content, finish
      if (state === 'recording' && hasSpokenRef.current && committedTextRef.current.trim()) {
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
  }, [isSttSupported, lexicon, clearAutoStopTimer, startAutoStopTimer, finishRecording, onOpenChange, state]);
  
  const stopRecording = useCallback(() => {
    clearAutoStopTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }
  }, [clearAutoStopTimer]);
  
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
  
  // ============================================
  // Don't render if not open
  // ============================================
  
  if (!open) return null;
  
  // ============================================
  // Render Idle State
  // ============================================
  
  const renderIdleState = () => (
    <div className="flex flex-col items-center justify-center h-full">
      {/* Big Microphone - tap to start */}
      <button
        onClick={handleMicTap}
        className="w-28 h-28 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center transition-all hover:bg-primary/20 hover:scale-105 active:scale-95"
        aria-label="Aufnahme starten"
      >
        <Mic className="w-12 h-12 text-primary" />
      </button>
      
      {/* Minimal hint */}
      <p className="mt-8 text-sm text-muted-foreground/60">
        Einfach sprechen
      </p>
    </div>
  );
  
  // ============================================
  // Render Recording State
  // ============================================
  
  const renderRecordingState = () => (
    <div className="flex flex-col items-center justify-center h-full">
      {/* Pulsing Microphone */}
      <button
        onClick={handleMicTap}
        className="relative w-28 h-28"
        aria-label="Aufnahme beenden"
      >
        {/* Pulse rings */}
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" style={{ animationDuration: '1.5s' }} />
        
        {/* Mic circle */}
        <div className="relative w-full h-full rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <Mic className="w-12 h-12 text-primary" />
        </div>
      </button>
    </div>
  );

  // ============================================
  // Render Processing State
  // ============================================

  const renderProcessingState = () => (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-12 h-12 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="mt-4 text-sm text-muted-foreground/80">Verarbeite…</p>
    </div>
  );
  
  // ============================================
  // Render Review State (Bottom Sheet Style)
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
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl border-t border-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="p-5 max-h-[65vh] overflow-auto">
          {/* Type Chip - dezent, nur bei Unsicherheit antippbar */}
          <div className="flex justify-center mb-4">
            <Badge 
              variant={isNewEntry ? "default" : "secondary"}
              className={cn(
                "text-xs px-3 py-1 transition-all",
                showTypeToggle && "cursor-pointer hover:opacity-80"
              )}
              onClick={showTypeToggle ? toggleEntryType : undefined}
            >
              {isNewEntry ? 'Neuer Eintrag' : 'Kontexteintrag'}
            </Badge>
          </div>
          
          {/* Content */}
          {isNewEntry && hasStructuredData ? (
            <div className="space-y-3 mb-5">
              {/* Time */}
              {hasTime && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">
                    {formatTimeDisplay(parsedResult.time)}
                  </span>
                </div>
              )}
              
              {/* Pain Level */}
              {hasPain && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                  <Activity className="w-5 h-5 text-destructive flex-shrink-0" />
                  <span className="text-sm font-medium">
                    Stärke {parsedResult.pain_intensity.value}
                  </span>
                </div>
              )}
              
              {/* Medications */}
              {hasMeds && parsedResult.medications.map((med, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                  <Pill className="w-5 h-5 text-success flex-shrink-0" />
                  <span className="text-sm font-medium">
                    {formatDoseQuarters(med.doseQuarters)} {med.name}
                  </span>
                </div>
              ))}
            </div>
          ) : isNewEntry && !hasStructuredData ? (
            // New entry but nothing recognized
            <div className="text-center py-3 mb-4">
              <p className="text-sm text-muted-foreground">
                Als Notiz speichern?
              </p>
            </div>
          ) : (
            // Context entry - show condensed note
            <div className="p-3 rounded-xl bg-muted/30 mb-5">
              <p className="text-sm text-foreground/80 line-clamp-3">
                {parsedResult.raw_text}
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="space-y-2">
            {/* Primary: Save */}
            <Button
              size="lg"
              className="w-full h-12 text-base font-medium"
              onClick={handleSave}
            >
              <Check className="w-5 h-5 mr-2" />
              Speichern
            </Button>
            
            {/* Secondary: Retry */}
            <button
              onClick={handleRetry}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Erneut sprechen
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // ============================================
  // Main Render
  // ============================================
  
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      {/* Close on background tap (only in idle/recording) */}
      {(state === 'idle' || state === 'recording') && (
        <button
          onClick={() => onOpenChange(false)}
          className="absolute inset-0 w-full h-full"
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
