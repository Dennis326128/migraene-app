/**
 * SimpleVoiceOverlay - Radically simplified voice input
 * 
 * Migraine-friendly design principles:
 * - No live transcript during recording
 * - Big central microphone with calm animation
 * - Very long pause tolerance (60-90 seconds)
 * - No auto-stop, only manual "Fertig" button
 * - Summary shown AFTER recording stops
 * - 1 tap to save
 * 
 * Only 2 outcomes:
 * 1. PAIN_ENTRY (structured)
 * 2. CONTEXT_NOTE (free text)
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
  Pill
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { 
  parseSimpleVoiceEntry, 
  formatDoseQuarters, 
  formatTimeDisplay,
  type SimpleVoiceResult 
} from '@/lib/voice/simpleVoiceParser';
import { buildUserMedicationLexicon, correctMedicationsInTranscript } from '@/lib/voice/medicationFuzzyMatch';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';

// ============================================
// Types
// ============================================

type OverlayState = 'recording' | 'summary' | 'dictation_fallback';

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
  onSaveContextNote: (text: string) => void;
}

// ============================================
// Recording Timer Constants
// ============================================

const MAX_RECORDING_MS = 3 * 60 * 1000; // 3 minutes max
const PAUSE_TOLERANCE_MS = 90 * 1000;   // 90 seconds silence allowed

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
  const [parsedResult, setParsedResult] = useState<SimpleVoiceResult | null>(null);
  
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
    
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false; // Only final results for simplicity
    
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
      // For other errors (no-speech, aborted), keep listening
    };
    
    recognition.onend = () => {
      // Auto-restart if still supposed to be recording
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
      // Nothing recorded, close
      onOpenChange(false);
      return;
    }
    
    // Parse the transcript
    const result = parseSimpleVoiceEntry(finalText, userMeds.map(m => ({
      id: m.id,
      name: m.name,
      wirkstoff: m.wirkstoff
    })));
    
    setParsedResult(result);
    setState('summary');
  }, [stopRecording, userMeds, onOpenChange]);
  
  const handleSave = useCallback(() => {
    if (!parsedResult) return;
    
    if (parsedResult.type === 'pain_entry') {
      onSavePainEntry({
        painLevel: parsedResult.painLevel?.value,
        date: parsedResult.time?.date,
        time: parsedResult.time?.time,
        medications: parsedResult.medications?.map(m => ({
          name: m.name,
          medicationId: m.medicationId,
          doseQuarters: m.doseQuarters
        })),
        notes: parsedResult.cleanedNotes || undefined
      });
    } else {
      onSaveContextNote(parsedResult.rawTranscript);
    }
    
    onOpenChange(false);
  }, [parsedResult, onSavePainEntry, onSaveContextNote, onOpenChange]);
  
  const handleRetry = useCallback(() => {
    committedTextRef.current = '';
    setTranscript('');
    setParsedResult(null);
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
  // Render Summary State
  // ============================================
  
  const renderSummaryState = () => {
    if (!parsedResult) return null;
    
    const isPainEntry = parsedResult.type === 'pain_entry';
    
    return (
      <div className="flex flex-col h-full px-6 py-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            Zusammenfassung
          </h2>
        </div>
        
        {/* Content Card */}
        <Card className="flex-1 p-4 space-y-4 overflow-auto">
          {isPainEntry ? (
            <>
              {/* Time */}
              {parsedResult.time && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Beginn</p>
                    <p className="font-medium">
                      {formatTimeDisplay(parsedResult.time)}
                    </p>
                  </div>
                  {parsedResult.time.confidence !== 'high' && (
                    <Badge variant="outline" className="ml-auto text-warning border-warning/50">
                      Bitte prüfen
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Pain Level */}
              {parsedResult.painLevel && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Schmerzstärke</p>
                    <p className="font-medium text-lg">
                      {parsedResult.painLevel.value} / 10
                    </p>
                  </div>
                  {parsedResult.painLevel.needsReview && (
                    <Badge variant="outline" className="ml-auto text-warning border-warning/50">
                      Bitte prüfen
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Medications */}
              {parsedResult.medications && parsedResult.medications.length > 0 && (
                <div className="space-y-2">
                  {parsedResult.medications.map((med, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                        <Pill className="w-4 h-4 text-success" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Medikament</p>
                        <p className="font-medium">
                          {formatDoseQuarters(med.doseQuarters)} {med.name}
                        </p>
                      </div>
                      {med.needsReview && (
                        <Badge variant="outline" className="text-warning border-warning/50">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Prüfen
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Notes */}
              {parsedResult.cleanedNotes && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Notizen</p>
                  <p className="text-sm text-foreground/80">
                    {parsedResult.cleanedNotes}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Context Note */
            <div>
              <p className="text-xs text-muted-foreground mb-2">Kontext-Notiz</p>
              <p className="text-foreground">
                {parsedResult.rawTranscript}
              </p>
              {parsedResult.time && !parsedResult.time.isNow && (
                <p className="text-xs text-muted-foreground mt-2">
                  Zeit: {formatTimeDisplay(parsedResult.time)}
                </p>
              )}
            </div>
          )}
        </Card>
        
        {/* Action Buttons */}
        <div className="mt-6 space-y-3">
          {/* Primary: Save */}
          <Button
            size="lg"
            className="w-full h-14 text-lg font-medium"
            onClick={handleSave}
          >
            <Check className="w-5 h-5 mr-2" />
            Speichern
          </Button>
          
          {/* Secondary: Edit - would navigate to full form */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => {
                // For now, just save - edit would open NewEntry form
                handleSave();
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              Bearbeiten
            </Button>
            
            <Button
              variant="ghost"
              className="flex-1 h-12"
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
        className="h-[85vh] rounded-t-3xl p-0"
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
        {state === 'summary' && renderSummaryState()}
        {state === 'dictation_fallback' && renderDictationFallback()}
      </SheetContent>
    </Sheet>
  );
}
