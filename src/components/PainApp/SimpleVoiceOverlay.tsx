/**
 * SimpleVoiceOverlay - Radically simplified voice input
 * 
 * Migraine-friendly design principles:
 * - No live transcript during recording
 * - Big central microphone with calm animation
 * - Very long pause tolerance (90 seconds)
 * - No auto-stop, only manual "Fertig" button
 * - Summary shown AFTER recording stops
 * - 1 tap to save
 * 
 * Entry Types:
 * 1. NEW_ENTRY (Neuer Eintrag) - structured pain entry
 * 2. CONTEXT_ENTRY (Kontexteintrag) - free text note/trigger
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Mic, 
  X, 
  Check, 
  Edit,
  RefreshCw,
  AlertCircle,
  Clock,
  Activity,
  Pill,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
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

type OverlayState = 'recording' | 'processing' | 'summary' | 'dictation_fallback';

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
  const [state, setState] = useState<OverlayState>('recording');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedResult, setParsedResult] = useState<VoiceParseResult | null>(null);
  const [overriddenType, setOverriddenType] = useState<'new_entry' | 'context_entry' | null>(null);
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  
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
  // Speech Recognition
  // ============================================
  
  const startRecording = useCallback(() => {
    if (!isSttSupported) {
      setState('dictation_fallback');
      return;
    }
    
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setState('dictation_fallback');
      return;
    }
    
    committedTextRef.current = '';
    setTranscript('');
    setOverriddenType(null);
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false; // Only final results
    
    recognition.onstart = () => {
      setIsRecording(true);
    };
    
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript || '';
          const { corrected } = correctMedicationsInTranscript(text, lexicon);
          
          committedTextRef.current += (committedTextRef.current ? ' ' : '') + corrected;
          setTranscript(committedTextRef.current);
        }
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[SimpleVoice] Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setState('dictation_fallback');
        return;
      }
    };
    
    recognition.onend = () => {
      // Auto-restart if still in recording state
      if (isRecording && state === 'recording') {
        try {
          recognition.start();
        } catch (e) {
          console.error('[SimpleVoice] Restart failed:', e);
        }
      }
    };
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('[SimpleVoice] Start failed:', e);
      setState('dictation_fallback');
    }
  }, [isSttSupported, lexicon, isRecording, state]);
  
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);
  
  // ============================================
  // Lifecycle
  // ============================================
  
  useEffect(() => {
    if (open) {
      setState('recording');
      setTranscript('');
      setParsedResult(null);
      setOverriddenType(null);
      committedTextRef.current = '';
      
      // Auto-start recording after short delay
      const timer = setTimeout(() => {
        if (isSttSupported) {
          startRecording();
        } else {
          setState('dictation_fallback');
        }
      }, 300);
      
      return () => clearTimeout(timer);
    } else {
      stopRecording();
    }
  }, [open, isSttSupported, startRecording, stopRecording]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);
  
  // ============================================
  // Actions
  // ============================================
  
  const handleFinish = useCallback(() => {
    stopRecording();
    
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
      setState('summary');
    }, 300);
  }, [stopRecording, userMeds, onOpenChange]);
  
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
    setTranscript('');
    setParsedResult(null);
    setOverriddenType(null);
    setState('recording');
    startRecording();
  }, [startRecording]);
  
  const handleCancel = useCallback(() => {
    stopRecording();
    onOpenChange(false);
  }, [stopRecording, onOpenChange]);
  
  const handleDictationSubmit = useCallback(() => {
    if (!transcript.trim()) {
      onOpenChange(false);
      return;
    }
    
    committedTextRef.current = transcript;
    handleFinish();
  }, [transcript, handleFinish, onOpenChange]);

  const toggleEntryType = useCallback(() => {
    const newType = effectiveType === 'new_entry' ? 'context_entry' : 'new_entry';
    setOverriddenType(newType);
  }, [effectiveType]);
  
  // ============================================
  // Render Recording State
  // ============================================
  
  const renderRecordingState = () => (
    <div className="flex flex-col items-center justify-center h-full px-6">
      {/* Header - minimal */}
      <p className="text-sm text-muted-foreground mb-8 opacity-70">
        Ich höre zu …
      </p>
      
      {/* Big Microphone with pulse animation */}
      <div className="relative mb-8">
        {/* Pulse rings */}
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" style={{ animationDuration: '1.5s' }} />
          </>
        )}
        
        {/* Mic circle */}
        <div className={cn(
          "relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300",
          isRecording 
            ? "bg-primary/20 border-2 border-primary/40" 
            : "bg-muted border-2 border-muted-foreground/20"
        )}>
          <Mic className={cn(
            "w-14 h-14 transition-colors duration-300",
            isRecording ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
      </div>
      
      {/* Subtle hint */}
      <p className="text-xs text-muted-foreground/60 mb-12 text-center">
        Du kannst jederzeit pausieren
      </p>
      
      {/* Main Button */}
      <Button
        size="lg"
        className="w-full max-w-xs h-14 text-lg font-medium"
        onClick={isRecording ? handleFinish : startRecording}
      >
        {isRecording ? (
          <>
            <Check className="w-5 h-5 mr-2" />
            Fertig
          </>
        ) : (
          <>
            <Mic className="w-5 h-5 mr-2" />
            Sprechen
          </>
        )}
      </Button>
      
      {/* Cancel - very subtle */}
      <button
        onClick={handleCancel}
        className="mt-6 text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        Abbrechen
      </button>
    </div>
  );

  // ============================================
  // Render Processing State
  // ============================================

  const renderProcessingState = () => (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-6" />
      <p className="text-muted-foreground">Verarbeite…</p>
    </div>
  );
  
  // ============================================
  // Render Summary State
  // ============================================
  
  const renderSummaryState = () => {
    if (!parsedResult) return null;
    
    const isNewEntry = effectiveType === 'new_entry';
    const showTypeToggle = parsedResult.typeCanBeToggled;
    
    return (
      <div className="flex flex-col h-full px-4 py-4 overflow-hidden">
        {/* Header with Type Chip */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Badge 
            variant={isNewEntry ? "default" : "secondary"}
            className={cn(
              "text-sm px-3 py-1 cursor-pointer transition-all",
              showTypeToggle && "hover:opacity-80"
            )}
            onClick={showTypeToggle ? toggleEntryType : undefined}
          >
            {isNewEntry ? 'Neuer Eintrag' : 'Kontexteintrag'}
            {showTypeToggle && (
              <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
            )}
          </Badge>
        </div>
        
        {/* Content Card */}
        <Card className="flex-1 p-4 space-y-4 overflow-auto min-h-0">
          {isNewEntry ? (
            <>
              {/* Time */}
              {parsedResult.time && !parsedResult.time.isNow && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Beginn</p>
                    <p className="font-medium truncate">
                      {formatTimeDisplay(parsedResult.time)}
                    </p>
                  </div>
                  {parsedResult.time.confidence !== 'high' && (
                    <Badge variant="outline" className="text-warning border-warning/50 flex-shrink-0 text-xs">
                      Prüfen
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Pain Level */}
              {parsedResult.pain_intensity.value !== null && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Schmerzstärke</p>
                    <p className="font-medium text-lg">
                      {parsedResult.pain_intensity.value} / 10
                    </p>
                  </div>
                  {parsedResult.pain_intensity.needsReview && (
                    <Badge variant="outline" className="text-warning border-warning/50 flex-shrink-0 text-xs">
                      Prüfen
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Medications */}
              {parsedResult.medications.length > 0 && (
                <div className="space-y-2">
                  {parsedResult.medications.map((med, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                        <Pill className="w-4 h-4 text-success" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Medikament</p>
                        <p className="font-medium truncate">
                          {formatDoseQuarters(med.doseQuarters)} {med.name}
                        </p>
                      </div>
                      {med.needsReview && (
                        <Badge variant="outline" className="text-warning border-warning/50 flex-shrink-0 text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Prüfen
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* No structured data detected */}
              {parsedResult.pain_intensity.value === null && 
               parsedResult.medications.length === 0 && 
               parsedResult.time.isNow && (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Keine strukturierten Daten erkannt</p>
                  <p className="text-xs mt-1">
                    Tippe auf „Kontexteintrag" um als Notiz zu speichern
                  </p>
                </div>
              )}
              
              {/* Notes */}
              {parsedResult.note && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Notizen</p>
                  <p className="text-sm text-foreground/80">
                    {parsedResult.note}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Context Entry */
            <div>
              <p className="text-xs text-muted-foreground mb-2">Kontext-Notiz</p>
              <p className="text-foreground whitespace-pre-wrap">
                {parsedResult.raw_text}
              </p>
              {parsedResult.time && !parsedResult.time.isNow && (
                <p className="text-xs text-muted-foreground mt-3">
                  Zeit: {formatTimeDisplay(parsedResult.time)}
                </p>
              )}
            </div>
          )}
        </Card>
        
        {/* Action Buttons */}
        <div className="mt-4 space-y-3 flex-shrink-0">
          {/* Primary: Save */}
          <Button
            size="lg"
            className="w-full h-14 text-lg font-medium"
            onClick={handleSave}
          >
            <Check className="w-5 h-5 mr-2" />
            Speichern
          </Button>
          
          {/* Secondary actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => {
                // TODO: Navigate to full edit form with prefilled data
                handleSave();
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              Bearbeiten
            </Button>
            
            <Button
              variant="ghost"
              className="flex-1 h-11"
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Erneut sprechen
            </Button>
          </div>
        </div>
      </div>
    );
  };
  
  // ============================================
  // Render Dictation Fallback
  // ============================================
  
  const renderDictationFallback = () => (
    <div className="flex flex-col h-full px-6 py-4">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          Diktier-Modus
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Nutze die Diktierfunktion deiner Tastatur
        </p>
      </div>
      
      <div className="flex-1">
        <textarea
          className="w-full h-48 p-4 rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Tippe hier oder nutze das Mikrofon auf deiner Tastatur..."
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            committedTextRef.current = e.target.value;
          }}
          autoFocus
        />
      </div>
      
      <div className="mt-6 space-y-3">
        <Button
          size="lg"
          className="w-full h-14 text-lg font-medium"
          onClick={handleDictationSubmit}
          disabled={!transcript.trim()}
        >
          <Check className="w-5 h-5 mr-2" />
          Weiter
        </Button>
        
        <Button
          variant="ghost"
          className="w-full h-12"
          onClick={handleCancel}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
  
  // ============================================
  // Main Render
  // ============================================
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[70vh] rounded-t-3xl p-0"
      >
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted transition-colors z-10"
          aria-label="Schließen"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        
        {/* Content based on state */}
        {state === 'recording' && renderRecordingState()}
        {state === 'processing' && renderProcessingState()}
        {state === 'summary' && renderSummaryState()}
        {state === 'dictation_fallback' && renderDictationFallback()}
      </SheetContent>
    </Sheet>
  );
}
