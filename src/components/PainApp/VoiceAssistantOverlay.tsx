/**
 * VoiceAssistantOverlay - Unified voice input dialog (Phase 1 + 2)
 * 
 * Phase 1: Migränefreundliches UX
 * - Kacheln NICHT dauerhaft sichtbar (progressive disclosure)
 * - "Fertig" führt zur Intent-Erkennung
 * - Bei sicherem Intent: 1 CTA + "Andere wählen"
 * - Bei unsicherem Intent: Grid mit Kacheln
 * - Lange Pausen tolerieren (kein Auto-Restart)
 * 
 * Phase 2: Analytics Q&A
 * - Erkennt Statistik-Fragen
 * - Zeigt Antwort als Karte
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Mic, 
  MicOff,
  PlusCircle, 
  Zap, 
  Pill, 
  Bell, 
  BookOpen,
  Save,
  X,
  Check,
  Loader2,
  ChevronDown,
  BarChart3,
  ExternalLink
} from 'lucide-react';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { cn } from '@/lib/utils';
import { routeVoiceCommand, type VoiceRouterResult } from '@/lib/voice/voiceIntentRouter';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { supabase } from '@/integrations/supabase/client';
import { 
  executeAnalyticsQuery, 
  formatAnalyticsResult, 
  getTimeRange,
  type ParsedAnalyticsQuery
} from '@/lib/analytics/queryFunctions';
import type { VoiceAnalyticsQuery } from '@/types/voice.types';

// ============================================
// Types
// ============================================

type ActionType = 'pain_entry' | 'quick_entry' | 'medication' | 'reminder' | 'diary' | 'note';

interface VoiceAssistantOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: ActionType, draftText: string) => void;
}

interface RecognizedIntent {
  type: string;
  confidence: number;
  result: VoiceRouterResult;
}

interface AnalyticsAnswer {
  headline: string;
  answer: string;
  details?: string;
}

// ============================================
// Constants
// ============================================

const CONFIDENCE_THRESHOLD = 0.7;

const ACTION_CONFIG: Array<{
  id: ActionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  {
    id: 'pain_entry',
    label: 'Migräne-Eintrag',
    description: 'Detaillierte Dokumentation',
    icon: PlusCircle,
    color: 'text-success',
  },
  {
    id: 'quick_entry',
    label: 'Schnell-Eintrag',
    description: 'Kurz & schnell',
    icon: Zap,
    color: 'text-destructive',
  },
  {
    id: 'medication',
    label: 'Medikament',
    description: 'Wirkung bewerten',
    icon: Pill,
    color: 'text-primary',
  },
  {
    id: 'reminder',
    label: 'Erinnerung',
    description: 'Termin/Medikament',
    icon: Bell,
    color: 'text-warning',
  },
  {
    id: 'diary',
    label: 'Tagebuch',
    description: 'Einträge ansehen',
    icon: BookOpen,
    color: 'text-muted-foreground',
  },
  {
    id: 'note',
    label: 'Als Notiz speichern',
    description: 'Für später',
    icon: Save,
    color: 'text-voice',
  },
];

// Map router result types to action types
function mapResultTypeToAction(resultType: string): ActionType | null {
  switch (resultType) {
    case 'create_pain_entry':
      return 'pain_entry';
    case 'create_quick_entry':
      return 'quick_entry';
    case 'create_medication_update':
      return 'medication';
    case 'navigate_reminder_create':
    case 'navigate_appointment_create':
      return 'reminder';
    case 'navigate_diary':
      return 'diary';
    case 'create_note':
      return 'note';
    default:
      return null;
  }
}

// ============================================
// Component
// ============================================

export function VoiceAssistantOverlay({
  open,
  onOpenChange,
  onSelectAction,
}: VoiceAssistantOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const autoStartedRef = useRef(false);
  
  // State
  const [committedText, setCommittedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [recognizedIntent, setRecognizedIntent] = useState<RecognizedIntent | null>(null);
  const [analyticsAnswer, setAnalyticsAnswer] = useState<AnalyticsAnswer | null>(null);
  
  // Hooks
  const isSttSupported = isBrowserSttSupported();
  const { data: userMeds = [] } = useMeds();
  const [userId, setUserId] = useState<string | null>(null);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // ============================================
  // Text Insertion
  // ============================================

  const insertAtCursor = useCallback((insertText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const separator = committedText.length > 0 && !committedText.endsWith(' ') ? ' ' : '';
      setCommittedText(prev => prev + separator + insertText);
      return;
    }

    const start = textarea.selectionStart ?? committedText.length;
    const end = textarea.selectionEnd ?? committedText.length;
    
    const needsSpaceBefore = start > 0 && committedText[start - 1] !== ' ' && !insertText.startsWith(' ');
    const textToInsert = (needsSpaceBefore ? ' ' : '') + insertText;
    
    const newText = committedText.slice(0, start) + textToInsert + committedText.slice(end);
    setCommittedText(newText);
    
    const newCursorPos = start + textToInsert.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [committedText]);

  // ============================================
  // Speech Recognition
  // ============================================

  const startRecording = useCallback(() => {
    if (!isSttSupported || isRecording) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimText('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        insertAtCursor(final.trim());
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Voice recording error:', event.error);
      // Don't stop on 'no-speech' - migraine-friendly, let user take time
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsRecording(false);
        setInterimText('');
      }
    };

    recognition.onend = () => {
      // Migränefreundlich: KEIN Auto-Restart!
      // User hat "Fertig" Button wenn fertig
      setIsRecording(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [isSttSupported, isRecording, insertAtCursor]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.stop();
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  // ============================================
  // Intent Recognition (Phase 1 - "Fertig" Button)
  // ============================================

  const processIntent = useCallback(async () => {
    if (!committedText.trim()) return;
    
    setIsProcessing(true);
    setAnalyticsAnswer(null);
    
    try {
      const userContext = {
        userMeds,
        timezone: 'Europe/Berlin',
        language: 'de-DE'
      };
      
      const result = routeVoiceCommand(committedText, userContext);
      console.log('🎯 Intent Result:', result);
      
      // Analytics Query? (Phase 2)
      if (result.type === 'analytics_query' && userId) {
        const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
        if (voiceQuery && voiceQuery.queryType !== 'unknown') {
          const timeRange = getTimeRange(voiceQuery.timeRangeDays);
          const parsedQuery: ParsedAnalyticsQuery = {
            queryType: voiceQuery.queryType,
            medName: voiceQuery.medName,
            medCategory: voiceQuery.medCategory as any,
            timeRange,
            confidence: voiceQuery.confidence
          };
          
          const queryResult = await executeAnalyticsQuery(userId, parsedQuery);
          const formatted = formatAnalyticsResult(parsedQuery, queryResult);
          
          setAnalyticsAnswer(formatted);
          setRecognizedIntent({
            type: result.type,
            confidence: result.confidence,
            result
          });
          setIsProcessing(false);
          return;
        }
      }
      
      // Speichere erkannten Intent
      setRecognizedIntent({
        type: result.type,
        confidence: result.confidence,
        result
      });
      
      // Bei niedrigem Confidence: zeige Actions
      if (result.confidence < CONFIDENCE_THRESHOLD || result.type === 'unknown') {
        setShowActions(true);
      }
      
    } catch (error) {
      console.error('Intent processing error:', error);
      setShowActions(true);
    } finally {
      setIsProcessing(false);
    }
  }, [committedText, userMeds, userId]);

  const handleFinish = useCallback(() => {
    stopRecording();
    processIntent();
  }, [stopRecording, processIntent]);

  // ============================================
  // Action Selection
  // ============================================

  const handleSelectAction = useCallback((action: ActionType) => {
    stopRecording();
    onSelectAction(action, committedText);
    onOpenChange(false);
  }, [stopRecording, onSelectAction, committedText, onOpenChange]);

  const handleSelectSuggestedAction = useCallback(() => {
    if (!recognizedIntent) return;
    
    const action = mapResultTypeToAction(recognizedIntent.type);
    if (action) {
      handleSelectAction(action);
    }
  }, [recognizedIntent, handleSelectAction]);

  const handleCancel = useCallback(() => {
    stopRecording();
    onOpenChange(false);
  }, [stopRecording, onOpenChange]);

  // ============================================
  // Lifecycle
  // ============================================

  useEffect(() => {
    if (open && isSttSupported && !autoStartedRef.current) {
      autoStartedRef.current = true;
      const timer = setTimeout(() => {
        startRecording();
      }, 300);
      return () => clearTimeout(timer);
    }
    
    if (!open) {
      autoStartedRef.current = false;
      stopRecording();
      setCommittedText('');
      setInterimText('');
      setShowActions(false);
      setRecognizedIntent(null);
      setAnalyticsAnswer(null);
    }
  }, [open, isSttSupported, startRecording, stopRecording]);

  // ============================================
  // Derived State
  // ============================================

  const hasText = committedText.trim().length > 0;
  const suggestedAction = recognizedIntent ? mapResultTypeToAction(recognizedIntent.type) : null;
  const suggestedActionConfig = suggestedAction ? ACTION_CONFIG.find(a => a.id === suggestedAction) : null;
  const showSuggestion = recognizedIntent && recognizedIntent.confidence >= CONFIDENCE_THRESHOLD && suggestedActionConfig && !analyticsAnswer;
  const showUnknownState = recognizedIntent && (recognizedIntent.confidence < CONFIDENCE_THRESHOLD || recognizedIntent.type === 'unknown') && !analyticsAnswer;

  // ============================================
  // Render
  // ============================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRecording ? (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-voice animate-pulse" />
                  <div className="absolute w-5 h-5 rounded-full bg-voice/30 animate-ping" />
                </div>
                <span>Ich höre zu…</span>
              </>
            ) : isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Verarbeite…</span>
              </>
            ) : analyticsAnswer ? (
              <>
                <BarChart3 className="w-5 h-5 text-primary" />
                <span>Auswertung</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 text-voice" />
                <span>Spracheingabe</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-left">
            {isRecording 
              ? 'Sprich in deinem Tempo – oder tippe jederzeit.'
              : analyticsAnswer 
                ? 'Hier ist deine Auswertung:'
                : 'Tippe oder diktiere, dann wähle eine Aktion.'}
          </DialogDescription>
        </DialogHeader>

        {/* Analytics Answer Card (Phase 2) */}
        {analyticsAnswer && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {analyticsAnswer.headline}
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {analyticsAnswer.answer}
            </p>
            {analyticsAnswer.details && (
              <p className="text-sm text-muted-foreground">
                {analyticsAnswer.details}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-primary"
              onClick={() => {
                onSelectAction('diary', committedText);
                onOpenChange(false);
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Zum Tagebuch
            </Button>
          </div>
        )}

        {/* Text Input Area */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            {hasText ? 'Erkannter Text (bearbeitbar)' : 'Dein Text erscheint hier…'}
          </label>
          <Textarea
            ref={textareaRef}
            value={committedText}
            onChange={(e) => setCommittedText(e.target.value)}
            placeholder="Tippe oder sprich…"
            className={cn(
              "min-h-[80px] resize-none transition-colors",
              isRecording && "border-voice/50 bg-voice/5"
            )}
          />
          
          {/* Live interim preview */}
          {interimText && (
            <p className="text-xs text-muted-foreground italic px-1 py-1 bg-muted/30 rounded">
              Live: {interimText}
            </p>
          )}

          {/* Recording toggle button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-full",
              isRecording 
                ? "border-voice/50 text-voice hover:bg-voice/10" 
                : "border-muted text-muted-foreground hover:bg-muted/30"
            )}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isSttSupported || isProcessing}
          >
            {isRecording ? (
              <>
                <MicOff className="w-4 h-4 mr-2" />
                Aufnahme pausieren
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                {hasText ? 'Weiter aufnehmen' : 'Aufnahme starten'}
              </>
            )}
          </Button>
          
          {!isSttSupported && (
            <p className="text-xs text-muted-foreground text-center">
              Spracheingabe nicht verfügbar. Bitte tippe.
            </p>
          )}
        </div>

        {/* Suggestion CTA (when intent recognized with high confidence) */}
        {showSuggestion && suggestedActionConfig && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">Vorschlag:</p>
            <Button
              className="w-full h-auto py-3 justify-start gap-3"
              variant="default"
              onClick={handleSelectSuggestedAction}
            >
              <suggestedActionConfig.icon className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">{suggestedActionConfig.label}</p>
                <p className="text-xs opacity-80">{suggestedActionConfig.description}</p>
              </div>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowActions(true)}
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              Andere Aktion wählen…
            </Button>
          </div>
        )}

        {/* Unknown State Header */}
        {showUnknownState && (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground mb-2">
              Nicht sicher verstanden – bitte wähle eine Aktion:
            </p>
          </div>
        )}

        {/* Action Selection (progressive disclosure) */}
        {(showActions || showUnknownState) && !analyticsAnswer && (
          <div className="pt-2">
            {!showUnknownState && (
              <p className="text-xs text-muted-foreground mb-2">Was möchtest du machen?</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {ACTION_CONFIG.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className="h-auto flex-col items-start p-3 gap-1 text-left hover:bg-muted/50"
                  onClick={() => handleSelectAction(action.id)}
                  disabled={isProcessing}
                >
                  <div className="flex items-center gap-2 w-full">
                    <action.icon className={`w-4 h-4 ${action.color}`} />
                    <span className="font-medium text-sm">{action.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-6">
                    {action.description}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* "Aktion auswählen" link (when no intent recognized yet) */}
        {!showActions && !recognizedIntent && !isProcessing && hasText && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowActions(true)}
          >
            <ChevronDown className="w-4 h-4 mr-2" />
            Aktion auswählen
          </Button>
        )}

        {/* Bottom Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <X className="w-4 h-4 mr-2" />
            Abbrechen
          </Button>
          {(isRecording || (hasText && !recognizedIntent)) && (
            <Button
              variant="default"
              className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
              onClick={handleFinish}
              disabled={isProcessing || !hasText}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Fertig
            </Button>
          )}
          {analyticsAnswer && (
            <Button
              variant="default"
              className="flex-1"
              onClick={handleCancel}
            >
              <Check className="w-4 h-4 mr-2" />
              Schließen
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
