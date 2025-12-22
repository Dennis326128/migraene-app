/**
 * VoiceAssistantOverlay - Unified voice input entry point
 * 
 * Handles ALL voice/text intents:
 * - Pain entries (quick/detail)
 * - Questions (Q&A)
 * - Context notes
 * - Reminders
 * - Medication updates
 * 
 * Uses confidence-based auto-actions:
 * - >= 0.85: Auto-execute
 * - 0.60-0.85: Show confirmation
 * - < 0.60: Show action picker
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
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
  MessageCircle,
  RefreshCw,
  Undo2
} from 'lucide-react';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { cn } from '@/lib/utils';
import { routeVoiceCommand, type VoiceRouterResult } from '@/lib/voice/voiceIntentRouter';
import { useMeds, useAddMed, useDeleteMedById, type CreateMedInput } from '@/features/meds/hooks/useMeds';
import { supabase } from '@/integrations/supabase/client';
import { 
  executeAnalyticsQuery, 
  formatAnalyticsResult, 
  getTimeRange,
  type ParsedAnalyticsQuery
} from '@/lib/analytics/queryFunctions';
import type { VoiceAnalyticsQuery, VoiceAddMedication } from '@/types/voice.types';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { toast } from 'sonner';

// ============================================
// Constants - Confidence Thresholds
// ============================================

const AUTO_ACTION_THRESHOLD = 0.85;
const CONFIRM_THRESHOLD = 0.60;

// ============================================
// Types
// ============================================

type ActionType = 'pain_entry' | 'quick_entry' | 'medication' | 'add_medication' | 'reminder' | 'diary' | 'note' | 'question';
type OverlayState = 'input' | 'processing' | 'confirmation' | 'action_picker' | 'qa_answer';

interface VoiceAssistantOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: ActionType, draftText: string, prefillData?: any) => void;
}

interface RecognizedIntent {
  type: string;
  confidence: number;
  result: VoiceRouterResult;
}

interface QAAnswer {
  headline: string;
  answer: string;
  details?: string;
}

// ============================================
// Action Configuration
// ============================================

const ACTION_CONFIG: Array<{
  id: ActionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  {
    id: 'quick_entry',
    label: 'Schnell-Eintrag',
    description: 'Schmerz jetzt festhalten',
    icon: Zap,
    color: 'text-destructive',
  },
  {
    id: 'pain_entry',
    label: 'Migräne-Eintrag',
    description: 'Detaillierte Dokumentation',
    icon: PlusCircle,
    color: 'text-success',
  },
  {
    id: 'question',
    label: 'Frage beantworten',
    description: 'Statistiken & Auswertungen',
    icon: MessageCircle,
    color: 'text-primary',
  },
  {
    id: 'note',
    label: 'Als Notiz speichern',
    description: 'Für später',
    icon: Save,
    color: 'text-voice',
  },
  {
    id: 'reminder',
    label: 'Erinnerung',
    description: 'Termin/Medikament',
    icon: Bell,
    color: 'text-warning',
  },
  {
    id: 'medication',
    label: 'Medikament',
    description: 'Wirkung bewerten',
    icon: Pill,
    color: 'text-primary',
  },
  {
    id: 'add_medication',
    label: 'Neues Medikament',
    description: 'Medikament hinzufügen',
    icon: PlusCircle,
    color: 'text-success',
  },
];

// Map router result types to action types
function mapResultTypeToAction(resultType: string): ActionType | null {
  switch (resultType) {
    case 'create_pain_entry':
      return 'quick_entry'; // Default to quick for voice
    case 'create_quick_entry':
      return 'quick_entry';
    case 'create_medication_update':
    case 'create_medication_effect':
      return 'medication';
    case 'add_medication':
      return 'add_medication';
    case 'navigate_reminder_create':
    case 'navigate_appointment_create':
      return 'reminder';
    case 'navigate_diary':
      return 'diary';
    case 'create_note':
      return 'note';
    case 'analytics_query':
      return 'question';
    default:
      return null;
  }
}

function getActionLabel(actionType: ActionType): string {
  const config = ACTION_CONFIG.find(a => a.id === actionType);
  return config?.label || actionType;
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
  const [overlayState, setOverlayState] = useState<OverlayState>('input');
  const [recognizedIntent, setRecognizedIntent] = useState<RecognizedIntent | null>(null);
  const [qaAnswer, setQaAnswer] = useState<QAAnswer | null>(null);
  const [liveIntentPreview, setLiveIntentPreview] = useState<{ type: string; confidence: number } | null>(null);
  
  // Hooks
  const isSttSupported = isBrowserSttSupported();
  const { data: userMeds = [] } = useMeds();
  const addMedMutation = useAddMed();
  const deleteMedById = useDeleteMedById();
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
  // Live Intent Preview
  // ============================================

  const updateLivePreview = useCallback((text: string) => {
    if (!text.trim() || text.length < 3) {
      setLiveIntentPreview(null);
      return;
    }
    
    try {
      const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
      const result = routeVoiceCommand(text, userContext);
      setLiveIntentPreview({ type: result.type, confidence: result.confidence });
    } catch {
      setLiveIntentPreview(null);
    }
  }, [userMeds]);

  // Update preview when text changes
  useEffect(() => {
    const timer = setTimeout(() => {
      updateLivePreview(committedText + interimText);
    }, 300);
    return () => clearTimeout(timer);
  }, [committedText, interimText, updateLivePreview]);

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
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsRecording(false);
        setInterimText('');
      }
    };

    recognition.onend = () => {
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
  // Note Saving with Undo
  // ============================================

  const saveNoteDirectly = useCallback(async (text: string) => {
    try {
      const noteId = await saveVoiceNote({
        rawText: text,
        sttConfidence: 0.95,
        source: 'voice'
      });
      
      toast.success('✅ Notiz gespeichert', {
        description: text.length > 50 ? text.substring(0, 50) + '...' : text,
        action: {
          label: 'Rückgängig',
          onClick: async () => {
            try {
              // Soft delete the note
              await supabase
                .from('voice_notes')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', noteId);
              toast.success('Notiz rückgängig gemacht');
            } catch (e) {
              console.error('Undo failed:', e);
              toast.error('Rückgängig fehlgeschlagen');
            }
          }
        },
        duration: 8000
      });
      
      window.dispatchEvent(new Event('voice-note-saved'));
      return true;
    } catch (error) {
      console.error('Note save error:', error);
      toast.error('Notiz konnte nicht gespeichert werden');
      return false;
    }
  }, []);

  // ============================================
  // Turbo-Create Medication with Undo
  // ============================================

  const turboCreateMedication = useCallback(async (addMedData: VoiceAddMedication): Promise<boolean> => {
    try {
      const medInput: CreateMedInput = {
        name: addMedData.displayName,
        staerke: addMedData.strengthValue ? String(addMedData.strengthValue) : undefined,
        einheit: addMedData.strengthUnit || (addMedData.strengthValue ? 'mg' : undefined),
        darreichungsform: addMedData.formFactor,
        art: 'bedarf', // Default to PRN
        intake_type: 'as_needed',
      };
      
      const newMed = await addMedMutation.mutateAsync(medInput);
      
      if (!newMed) {
        toast.error('Medikament konnte nicht gespeichert werden');
        return false;
      }
      
      // Format display string
      const displayStr = addMedData.strengthValue 
        ? `${addMedData.displayName} ${addMedData.strengthValue} ${addMedData.strengthUnit || 'mg'}`
        : addMedData.displayName;
      
      toast.success(`✅ Medikament hinzugefügt: ${displayStr}`, {
        description: 'Bei Bedarf (PRN) als Standard',
        action: {
          label: 'Rückgängig',
          onClick: async () => {
            try {
              await deleteMedById.mutateAsync(newMed.id);
              toast.success('Medikament rückgängig gemacht');
            } catch (e) {
              console.error('Undo medication failed:', e);
              toast.error('Rückgängig fehlgeschlagen');
            }
          }
        },
        duration: 10000
      });
      
      return true;
    } catch (error) {
      console.error('Turbo-create medication error:', error);
      toast.error('Fehler beim Speichern', {
        description: 'Bitte versuche es manuell.'
      });
      return false;
    }
  }, [addMedMutation, deleteMedById]);

  // ============================================
  // Q&A Processing
  // ============================================

  const processQuestion = useCallback(async (text: string, voiceQuery: VoiceAnalyticsQuery) => {
    if (!userId || voiceQuery.queryType === 'unknown') return null;
    
    try {
      const timeRange = getTimeRange(voiceQuery.timeRangeDays);
      const parsedQuery: ParsedAnalyticsQuery = {
        queryType: voiceQuery.queryType,
        medName: voiceQuery.medName,
        medCategory: voiceQuery.medCategory as any,
        timeRange,
        confidence: voiceQuery.confidence
      };
      
      const queryResult = await executeAnalyticsQuery(userId, parsedQuery);
      return formatAnalyticsResult(parsedQuery, queryResult);
    } catch (error) {
      console.error('Q&A error:', error);
      return null;
    }
  }, [userId]);

  // ============================================
  // Intent Processing (Fertig button)
  // ============================================

  const processIntent = useCallback(async () => {
    if (!committedText.trim()) return;
    
    stopRecording();
    setOverlayState('processing');
    setQaAnswer(null);
    
    try {
      const userContext = {
        userMeds,
        timezone: 'Europe/Berlin',
        language: 'de-DE'
      };
      
      const result = routeVoiceCommand(committedText, userContext);
      console.log('🎯 Intent Result:', result);
      
      const intent: RecognizedIntent = {
        type: result.type,
        confidence: result.confidence,
        result
      };
      
      setRecognizedIntent(intent);
      
      // Handle based on confidence level
      const isHighConfidence = result.confidence >= AUTO_ACTION_THRESHOLD;
      const isMediumConfidence = result.confidence >= CONFIRM_THRESHOLD && result.confidence < AUTO_ACTION_THRESHOLD;
      
      // Check if pain entry has enough data to auto-proceed (pain level recognized = good enough)
      const isPainEntryWithData = (result.type === 'create_pain_entry' || result.type === 'create_quick_entry') && 
        result.payload && (result.payload as any).painLevel !== undefined;
      
      // === HIGH CONFIDENCE OR PAIN ENTRY WITH DATA: Auto-action ===
      if (isHighConfidence || isPainEntryWithData) {
        // Q&A: Show answer directly
        if (result.type === 'analytics_query' && userId) {
          const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
          if (voiceQuery) {
            const answer = await processQuestion(committedText, voiceQuery);
            if (answer) {
              setQaAnswer(answer);
              setOverlayState('qa_answer');
              return;
            }
          }
        }
        
        // Note: Save directly with undo
        if (result.type === 'create_note') {
          const success = await saveNoteDirectly(committedText);
          if (success) {
            onOpenChange(false);
            return;
          }
        }
        
        // Pain entry: Open QuickEntry with prefill - AUTO-PROCEED when we have data
        if (result.type === 'create_pain_entry' || result.type === 'create_quick_entry') {
          const painEntry = result.payload as any;
          console.log('🔧 Voice prefill painEntry (auto-proceed):', painEntry);
          
          // Build medication states with proper structure
          const medicationStates: Record<string, { doseQuarters: number; medicationId?: string }> = {};
          if (painEntry?.medications) {
            painEntry.medications.forEach((med: any) => {
              const name = med.name || med;
              medicationStates[name] = {
                doseQuarters: med.doseQuarters || 4,
                medicationId: med.medicationId
              };
            });
          }
          
          onSelectAction('quick_entry', committedText, {
            initialPainLevel: painEntry?.painLevel ? parseInt(String(painEntry.painLevel), 10) : undefined,
            initialSelectedTime: painEntry?.occurredAt ? 'custom' : undefined,
            initialCustomDate: painEntry?.occurredAt ? painEntry.occurredAt.split('T')[0] : undefined,
            initialCustomTime: painEntry?.occurredAt ? painEntry.occurredAt.split('T')[1]?.substring(0, 5) : undefined,
            initialNotes: painEntry?.notes || committedText,
            initialMedicationStates: Object.keys(medicationStates).length > 0 ? medicationStates : undefined,
          });
          onOpenChange(false);
          return;
        }
        
        // Reminder: Open reminder form
        if (result.type === 'navigate_reminder_create' || result.type === 'navigate_appointment_create') {
          onSelectAction('reminder', committedText, result.payload);
          onOpenChange(false);
          return;
        }
        
        // ADD MEDICATION: Turbo-create with high confidence, or open form
        if (result.type === 'add_medication') {
          const addMedData = result.payload as VoiceAddMedication | undefined;
          if (addMedData && addMedData.name.length >= 3) {
            // Turbo-create: Name >= 3 chars and valid
            const success = await turboCreateMedication(addMedData);
            if (success) {
              onOpenChange(false);
              return;
            }
          }
          // Fallback: Open medication form with prefill
          onSelectAction('add_medication', committedText, result.payload);
          onOpenChange(false);
          return;
        }
        
        // Medication: Navigate
        if (result.type === 'create_medication_update' || result.type === 'create_medication_effect') {
          onSelectAction('medication', committedText);
          onOpenChange(false);
          return;
        }
      }
      
      // === MEDIUM CONFIDENCE: Show confirmation ===
      if (isMediumConfidence && result.type !== 'unknown') {
        setOverlayState('confirmation');
        return;
      }
      
      // === LOW CONFIDENCE / UNKNOWN: Show action picker ===
      setOverlayState('action_picker');
      
    } catch (error) {
      console.error('Intent processing error:', error);
      setOverlayState('action_picker');
    }
  }, [committedText, userMeds, userId, stopRecording, processQuestion, saveNoteDirectly, turboCreateMedication, onSelectAction, onOpenChange]);

  // ============================================
  // Action Handlers
  // ============================================

  const handleFinish = useCallback(() => {
    processIntent();
  }, [processIntent]);

  const handleSelectAction = useCallback(async (action: ActionType) => {
    stopRecording();
    
    // Special handling for "question" action - process Q&A inline
    if (action === 'question' && userId && committedText.trim()) {
      setOverlayState('processing');
      try {
        // Parse and execute Q&A
        const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
        const result = routeVoiceCommand(committedText, userContext);
        
        console.log('🔍 Q&A route result:', {
          type: result.type,
          payload: result.payload,
          confidence: result.confidence
        });
        
        if (result.type === 'analytics_query') {
          const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
          console.log('🔍 VoiceQuery:', voiceQuery);
          
          if (voiceQuery && voiceQuery.queryType !== 'unknown') {
            const answer = await processQuestion(committedText, voiceQuery);
            if (answer) {
              setQaAnswer(answer);
              setOverlayState('qa_answer');
              return; // Stay open to show answer
            }
          }
        }
        
        // Fallback: couldn't parse as Q&A - show error and stay
        toast.error('Frage nicht verstanden', {
          description: 'Versuche z.B. "Wie viele schmerzfreie Tage in den letzten 30 Tagen?"'
        });
        setOverlayState('input');
        return;
      } catch (error) {
        console.error('Q&A error:', error);
        toast.error('Fehler bei der Auswertung');
        setOverlayState('input');
        return;
      }
    }
    
    onSelectAction(action, committedText);
    onOpenChange(false);
  }, [stopRecording, onSelectAction, committedText, onOpenChange, userId, userMeds, processQuestion]);

  const handleConfirmAction = useCallback(async () => {
    if (!recognizedIntent) return;
    
    const result = recognizedIntent.result;
    
    // Q&A
    if (result.type === 'analytics_query' && userId) {
      setOverlayState('processing');
      const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
      if (voiceQuery) {
        const answer = await processQuestion(committedText, voiceQuery);
        if (answer) {
          setQaAnswer(answer);
          setOverlayState('qa_answer');
          return;
        }
      }
    }
    
    // Note
    if (result.type === 'create_note') {
      const success = await saveNoteDirectly(committedText);
      if (success) {
        onOpenChange(false);
        return;
      }
    }
    
    // Add Medication - turbo-create on confirm
    if (result.type === 'add_medication') {
      const addMedData = result.payload as VoiceAddMedication | undefined;
      if (addMedData && addMedData.name.length >= 2) {
        const success = await turboCreateMedication(addMedData);
        if (success) {
          onOpenChange(false);
          return;
        }
      }
      // Fallback to form
      onSelectAction('add_medication', committedText, result.payload);
      onOpenChange(false);
      return;
    }
    
    // Map to action
    const action = mapResultTypeToAction(result.type);
    if (action) {
      handleSelectAction(action);
    }
  }, [recognizedIntent, userId, committedText, processQuestion, saveNoteDirectly, turboCreateMedication, handleSelectAction, onSelectAction, onOpenChange]);

  const handleAskAnother = useCallback(() => {
    // First stop any existing recording to reset state
    stopRecording();
    
    // Reset all state
    setCommittedText('');
    setQaAnswer(null);
    setRecognizedIntent(null);
    setOverlayState('input');
    setInterimText('');
    
    // Force restart recording after a short delay
    if (isSttSupported) {
      // Ensure recognition is fully stopped before restarting
      setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current = null;
        }
        startRecording();
      }, 400);
    }
  }, [isSttSupported, startRecording, stopRecording]);

  const handleCancel = useCallback(() => {
    stopRecording();
    onOpenChange(false);
  }, [stopRecording, onOpenChange]);

  const handleBackToInput = useCallback(() => {
    setOverlayState('input');
    setRecognizedIntent(null);
  }, []);

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
      setOverlayState('input');
      setRecognizedIntent(null);
      setQaAnswer(null);
      setLiveIntentPreview(null);
    }
  }, [open, isSttSupported, startRecording, stopRecording]);

  // ============================================
  // Derived State
  // ============================================

  const hasText = committedText.trim().length > 0;
  const suggestedAction = recognizedIntent ? mapResultTypeToAction(recognizedIntent.type) : null;
  const isProcessing = overlayState === 'processing';
  const showFertigButton = overlayState === 'input' || overlayState === 'confirmation';

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
            ) : overlayState === 'qa_answer' ? (
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
              : overlayState === 'qa_answer' 
                ? 'Hier ist deine Auswertung:'
                : overlayState === 'confirmation'
                  ? 'Stimmt das?'
                  : 'Per Sprache oder Text – Fragen, Einträge, Notizen.'}
          </DialogDescription>
        </DialogHeader>

        {/* Q&A Answer View */}
        {overlayState === 'qa_answer' && qaAnswer && (
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {qaAnswer.headline}
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {qaAnswer.answer}
              </p>
              {qaAnswer.details && (
                <p className="text-sm text-muted-foreground">
                  {qaAnswer.details}
                </p>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleAskAnother}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Weitere Frage
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={handleCancel}
              >
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation View */}
        {overlayState === 'confirmation' && recognizedIntent && suggestedAction && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground mb-1">Erkannt:</p>
              <p className="font-medium">{getActionLabel(suggestedAction)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sicherheit: {Math.round(recognizedIntent.confidence * 100)}%
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOverlayState('action_picker')}
              >
                Ändern
              </Button>
              <Button
                variant="default"
                className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                onClick={handleConfirmAction}
              >
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Action Picker View */}
        {overlayState === 'action_picker' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Was möchtest du machen?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_CONFIG.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className={cn(
                    "h-auto flex-col items-start p-3 gap-1 text-left hover:bg-muted/50",
                    suggestedAction === action.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => handleSelectAction(action.id)}
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
            
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleBackToInput}
            >
              ← Zurück zur Eingabe
            </Button>
          </div>
        )}

        {/* Input View */}
        {(overlayState === 'input' || overlayState === 'processing') && !qaAnswer && (
          <div className="space-y-3">
            {/* Text Input Area */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {hasText ? 'Dein Text (bearbeitbar)' : 'Tippe oder sprich…'}
              </label>
              <Textarea
                ref={textareaRef}
                value={committedText}
                onChange={(e) => setCommittedText(e.target.value)}
                placeholder="z.B. 'Migräne Stärke 7' oder 'Wie oft Triptan letzten Monat?'"
                className={cn(
                  "min-h-[80px] resize-none transition-colors",
                  isRecording && "border-voice/50 bg-voice/5"
                )}
                disabled={isProcessing}
              />
              
              {/* Live interim preview */}
              {interimText && (
                <p className="text-xs text-muted-foreground italic px-1 py-1 bg-muted/30 rounded">
                  Live: {interimText}
                </p>
              )}

              {/* Live intent preview - deutsche Labels */}
              {liveIntentPreview && hasText && overlayState === 'input' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <span>Erkannt:</span>
                  <span className="font-medium">
                    {liveIntentPreview.type === 'analytics_query' ? 'Frage' :
                     liveIntentPreview.type === 'create_note' ? 'Notiz' :
                     liveIntentPreview.type === 'create_pain_entry' ? 'Schmerz-Eintrag' :
                     liveIntentPreview.type === 'create_quick_entry' ? 'Schnell-Eintrag' :
                     liveIntentPreview.type === 'navigate_reminder_create' ? 'Erinnerung' :
                     liveIntentPreview.type === 'navigate_appointment_create' ? 'Termin' :
                     liveIntentPreview.type === 'add_medication' ? 'Neues Medikament' :
                     liveIntentPreview.type === 'create_medication_update' ? 'Medikament aktualisieren' :
                     liveIntentPreview.type === 'create_medication_effect' ? 'Medikamenten-Wirkung' :
                     liveIntentPreview.type === 'unknown' ? 'Nicht erkannt' :
                     liveIntentPreview.type}
                  </span>
                  <span className="text-muted-foreground/70">
                    ({Math.round(liveIntentPreview.confidence * 100)}%)
                  </span>
                </div>
              )}
            </div>

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
              <p className="text-xs text-muted-foreground text-center bg-muted/50 p-2 rounded">
                🎤 Mikrofon nicht verfügbar – bitte tippe deinen Text.
              </p>
            )}
          </div>
        )}

        {/* Bottom Actions - Always visible Fertig + Abbrechen */}
        {overlayState !== 'qa_answer' && overlayState !== 'action_picker' && overlayState !== 'confirmation' && (
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
