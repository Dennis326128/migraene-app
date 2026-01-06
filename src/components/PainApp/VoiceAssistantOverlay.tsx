/**
 * VoiceAssistantOverlay - Unified voice input entry point
 * 
 * Features:
 * - Live intent preview during recording
 * - Disambiguation view for close scores
 * - Safety policy for auto-execute decisions
 * - Noise guard for fragments
 * - Hold-to-talk support
 * - Context-aware defaults
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
  BarChart3,
  MessageCircle,
  RefreshCw,
  Undo2,
  Edit
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
import { voiceLogStart, voiceLogTranscript, voiceLogRouterResult, voiceLogComplete, voiceLogGetDebugJson } from '@/lib/voice/voiceLogger';
import { SlotFillingView, type SimpleSlotFillingPlan } from './VoicePlannerUI/SlotFillingView';
import { DisambiguationView, type DisambiguationOption } from './VoicePlannerUI/DisambiguationView';
import { initSlotFilling, getNextSlotToFill, fillSlot, slotsToPayload, type SlotFillingState, type SlotName } from '@/lib/voice/slotFilling';
import { scoreIntents, getTopIntents } from '@/lib/voice/intentScoring';
import { normalizeTranscript } from '@/lib/voice/normalizeTranscript';
import { evaluatePolicy, type InputSource } from '@/lib/voice/voicePolicy';
import { checkNoiseGuard, getNoiseMessage } from '@/lib/voice/noiseGuard';
import { getIntentLabel, extractEntitiesForPreview, formatEntitiesPreview } from '@/lib/voice/intentLabels';
import { buildUserMedLexicon, applyLexiconCorrections } from '@/lib/voice/userMedLexicon';
import { loadLastContext, needsContextConfirmation, type LastRelevantContext } from '@/lib/voice/lastContext';
import { useNavigate } from 'react-router-dom';

// ============================================
// Types
// ============================================

type ActionType = 'pain_entry' | 'quick_entry' | 'medication' | 'add_medication' | 'reminder' | 'diary' | 'note' | 'question';
type OverlayState = 'input' | 'processing' | 'confirmation' | 'action_picker' | 'qa_answer' | 'dictation_fallback' | 'slot_filling' | 'disambiguation' | 'noise_retry';

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

interface LivePreview {
  intent: string;
  confidence: number;
  entities: string;
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
  { id: 'quick_entry', label: 'Schnell-Eintrag', description: 'Schmerz jetzt festhalten', icon: Zap, color: 'text-destructive' },
  { id: 'pain_entry', label: 'Migräne-Eintrag', description: 'Detaillierte Dokumentation', icon: PlusCircle, color: 'text-success' },
  { id: 'question', label: 'Frage beantworten', description: 'Statistiken & Auswertungen', icon: MessageCircle, color: 'text-primary' },
  { id: 'note', label: 'Als Notiz speichern', description: 'Für später', icon: Save, color: 'text-voice' },
  { id: 'reminder', label: 'Erinnerung', description: 'Termin/Medikament', icon: Bell, color: 'text-warning' },
  { id: 'medication', label: 'Medikament', description: 'Wirkung bewerten', icon: Pill, color: 'text-primary' },
  { id: 'add_medication', label: 'Neues Medikament', description: 'Medikament hinzufügen', icon: PlusCircle, color: 'text-success' },
];

function mapResultTypeToAction(resultType: string): ActionType | null {
  switch (resultType) {
    case 'create_pain_entry': return 'quick_entry';
    case 'create_quick_entry': return 'quick_entry';
    case 'create_medication_update':
    case 'create_medication_effect': return 'medication';
    case 'add_medication': return 'add_medication';
    case 'navigate_reminder_create':
    case 'navigate_appointment_create': return 'reminder';
    case 'navigate_diary': return 'diary';
    case 'create_note': return 'note';
    case 'analytics_query': return 'question';
    default: return null;
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
  const navigate = useNavigate();
  
  // Pause-resilient refs
  const userStoppedRef = useRef(false);
  const lastFinalSegmentRef = useRef('');
  const lastHeardAtRef = useRef(Date.now());
  const autoRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State
  const [committedText, setCommittedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState>('input');
  const [recognizedIntent, setRecognizedIntent] = useState<RecognizedIntent | null>(null);
  const [qaAnswer, setQaAnswer] = useState<QAAnswer | null>(null);
  const [livePreview, setLivePreview] = useState<LivePreview | null>(null);
  const [slotFillingState, setSlotFillingState] = useState<SlotFillingState | null>(null);
  const [disambiguationOptions, setDisambiguationOptions] = useState<[DisambiguationOption, DisambiguationOption] | null>(null);
  const [noiseMessage, setNoiseMessage] = useState<string>('');
  const [lastContext, setLastContext] = useState<LastRelevantContext | null>(null);
  const [isHoldToTalk, setIsHoldToTalk] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<{ type: string; id: string | number } | null>(null);
  
  // Hooks
  const isSttSupported = isBrowserSttSupported();
  const { data: userMeds = [] } = useMeds();
  const addMedMutation = useAddMed();
  const deleteMedById = useDeleteMedById();
  const [userId, setUserId] = useState<string | null>(null);
  
  // Build user medication lexicon for ASR correction
  const userMedLexicon = React.useMemo(() => buildUserMedLexicon(userMeds), [userMeds]);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);
  
  // Load last context when overlay opens
  useEffect(() => {
    if (open && userId) {
      loadLastContext(userId).then(setLastContext).catch(console.error);
    }
  }, [open, userId]);

  const shouldShowDictationFallback = !isSttSupported;
  const inputSource: InputSource = shouldShowDictationFallback ? 'dictation_fallback' : 'stt';

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
  // Live Intent Preview (throttled)
  // ============================================

  const updateLivePreview = useCallback((text: string) => {
    if (!text.trim() || text.length < 3) {
      setLivePreview(null);
      return;
    }
    
    try {
      // Apply user med lexicon corrections
      const { corrected } = applyLexiconCorrections(text, userMedLexicon);
      
      // Score intents
      const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
      const result = routeVoiceCommand(corrected, userContext);
      
      // Extract entities for preview
      const { normalized } = normalizeTranscript(corrected);
      const entities = extractEntitiesForPreview(normalized);
      const entitiesStr = formatEntitiesPreview(entities);
      
      setLivePreview({
        intent: result.type,
        confidence: result.confidence,
        entities: entitiesStr
      });
    } catch {
      setLivePreview(null);
    }
  }, [userMeds, userMedLexicon]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateLivePreview(committedText + interimText);
    }, 250); // Throttle to 250ms
    return () => clearTimeout(timer);
  }, [committedText, interimText, updateLivePreview]);

  // ============================================
  // Speech Recognition (Pause-Resilient)
  // ============================================

  // Clear auto-restart timeout on unmount or close
  useEffect(() => {
    return () => {
      if (autoRestartTimeoutRef.current) {
        clearTimeout(autoRestartTimeoutRef.current);
        autoRestartTimeoutRef.current = null;
      }
    };
  }, []);

  // Also clear when overlay closes
  useEffect(() => {
    if (!open && autoRestartTimeoutRef.current) {
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }
  }, [open]);

  const startRecording = useCallback(() => {
    if (!isSttSupported) return;
    
    // If already recording, don't restart
    if (isRecording && recognitionRef.current) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // Clear any pending auto-restart
    if (autoRestartTimeoutRef.current) {
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      userStoppedRef.current = false;
      lastHeardAtRef.current = Date.now();
      setIsRecording(true);
      setInterimText('');
    };

    recognition.onresult = (event: any) => {
      lastHeardAtRef.current = Date.now();
      let interim = '';

      // Process only new results from resultIndex
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        
        if (result.isFinal) {
          // Get only the new segment
          const segment = transcript.trim();
          
          // Dedup: skip if same as last final segment
          if (segment && segment !== lastFinalSegmentRef.current) {
            lastFinalSegmentRef.current = segment;
            
            // Apply lexicon corrections and insert ONLY this segment
            const { corrected } = applyLexiconCorrections(segment, userMedLexicon);
            insertAtCursor(corrected);
          }
          
          // Clear interim after final
          setInterimText('');
        } else {
          // Collect interim text for preview
          interim += transcript;
        }
      }

      // Only update interim if we have new interim content
      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Voice recording error:', event.error);
      
      // no-speech: Just clear interim, don't stop completely
      if (event.error === 'no-speech') {
        setInterimText('');
        // Don't set isRecording to false - let onend handle restart
        return;
      }
      
      // aborted: Usually user-initiated or browser, don't error out
      if (event.error === 'aborted') {
        setInterimText('');
        return;
      }
      
      // Other errors: Stop recording
      setIsRecording(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText('');
      
      // Auto-restart if:
      // - Overlay is still open
      // - User didn't explicitly stop
      // - STT is supported
      if (open && !userStoppedRef.current && isSttSupported) {
        autoRestartTimeoutRef.current = setTimeout(() => {
          if (open && !userStoppedRef.current) {
            console.log('[Voice] Auto-restarting after pause...');
            startRecording();
          }
        }, 400);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recording:', e);
      setIsRecording(false);
    }
  }, [isSttSupported, isRecording, insertAtCursor, userMedLexicon, open]);

  const stopRecording = useCallback(() => {
    // Mark that user explicitly stopped
    userStoppedRef.current = true;
    
    // Clear any pending auto-restart
    if (autoRestartTimeoutRef.current) {
      clearTimeout(autoRestartTimeoutRef.current);
      autoRestartTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      try {
        recognition.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  // Reset refs when overlay opens
  useEffect(() => {
    if (open) {
      userStoppedRef.current = false;
      lastFinalSegmentRef.current = '';
      lastHeardAtRef.current = Date.now();
    }
  }, [open]);

  // ============================================
  // Success Toast with Undo + Edit
  // ============================================

  const showSuccessToastWithUndoEdit = useCallback((
    message: string,
    description: string,
    onUndo: () => Promise<void>,
    onEdit?: () => void,
    duration: number = 10000
  ) => {
    toast.success(message, {
      description,
      action: onEdit ? {
        label: 'Ändern',
        onClick: onEdit
      } : {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            await onUndo();
            toast.success('Rückgängig gemacht');
          } catch (e) {
            console.error('Undo failed:', e);
            toast.error('Rückgängig fehlgeschlagen');
          }
        }
      },
      duration
    });
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
      
      setLastCreatedId({ type: 'note', id: noteId });
      
      showSuccessToastWithUndoEdit(
        '✅ Notiz gespeichert',
        text.length > 50 ? text.substring(0, 50) + '...' : text,
        async () => {
          await supabase
            .from('voice_notes')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', noteId);
        }
      );
      
      window.dispatchEvent(new Event('voice-note-saved'));
      return true;
    } catch (error) {
      console.error('Note save error:', error);
      toast.error('Notiz konnte nicht gespeichert werden');
      return false;
    }
  }, [showSuccessToastWithUndoEdit]);

  // ============================================
  // Turbo-Create Medication with Undo + Edit
  // ============================================

  const turboCreateMedication = useCallback(async (addMedData: VoiceAddMedication): Promise<boolean> => {
    try {
      const medInput: CreateMedInput = {
        name: addMedData.displayName,
        staerke: addMedData.strengthValue ? String(addMedData.strengthValue) : undefined,
        einheit: addMedData.strengthUnit || (addMedData.strengthValue ? 'mg' : undefined),
        darreichungsform: addMedData.formFactor,
        art: 'bedarf',
        intake_type: 'as_needed',
      };
      
      const newMed = await addMedMutation.mutateAsync(medInput);
      if (!newMed) {
        toast.error('Medikament konnte nicht gespeichert werden');
        return false;
      }
      
      setLastCreatedId({ type: 'medication', id: newMed.id });
      
      const displayStr = addMedData.strengthValue 
        ? `${addMedData.displayName} ${addMedData.strengthValue} ${addMedData.strengthUnit || 'mg'}`
        : addMedData.displayName;
      
      showSuccessToastWithUndoEdit(
        `✅ ${displayStr} hinzugefügt`,
        'Bei Bedarf (PRN) als Standard',
        async () => {
          await deleteMedById.mutateAsync(newMed.id);
        },
        () => {
          navigate(`/medications?edit=${newMed.id}`);
        }
      );
      
      return true;
    } catch (error) {
      console.error('Turbo-create medication error:', error);
      toast.error('Fehler beim Speichern', { description: 'Bitte versuche es manuell.' });
      return false;
    }
  }, [addMedMutation, deleteMedById, showSuccessToastWithUndoEdit, navigate]);

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
  // Intent Processing (Main Logic)
  // ============================================

  const processIntent = useCallback(async () => {
    if (!committedText.trim()) return;
    
    stopRecording();
    setOverlayState('processing');
    setQaAnswer(null);
    setNoiseMessage('');
    
    voiceLogStart(inputSource);
    voiceLogTranscript(committedText);
    
    try {
      // Step 1: Noise Guard
      const noiseCheck = checkNoiseGuard(committedText);
      if (noiseCheck.isNoise) {
        setNoiseMessage(getNoiseMessage(noiseCheck));
        setOverlayState('noise_retry');
        voiceLogComplete('noise_filtered');
        return;
      }
      
      if (noiseCheck.isAmbiguousNumber) {
        // Show disambiguation for ambiguous numbers
        setNoiseMessage(noiseCheck.disambiguationQuestion || 'Meinst du einen Schmerzwert?');
        setDisambiguationOptions([
          { intent: 'pain_entry', score: 0.6 },
          { intent: 'note', score: 0.4 }
        ]);
        setOverlayState('disambiguation');
        voiceLogComplete('disambiguation_number');
        return;
      }
      
      // Step 2: Apply lexicon corrections
      const { corrected } = applyLexiconCorrections(committedText, userMedLexicon);
      
      // Step 3: Route command
      const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
      const result = routeVoiceCommand(corrected, userContext);
      
      voiceLogRouterResult(result);
      
      const intent: RecognizedIntent = {
        type: result.type,
        confidence: result.confidence,
        result
      };
      setRecognizedIntent(intent);
      
      // Step 4: Get top intents for disambiguation check
      const scoringResult = scoreIntents(corrected, userMeds);
      const topIntents = getTopIntents(scoringResult.scores, 2);
      const top2ScoreDiff = topIntents.length >= 2 
        ? topIntents[0].score - topIntents[1].score 
        : 1;
      
      // Step 5: Check for slot-filling (add_medication without name)
      if (result.type === 'add_medication') {
        const addMedData = result.payload as VoiceAddMedication | undefined;
        if (!addMedData || !addMedData.name || addMedData.name.length < 2) {
          const slotState = initSlotFilling('add_medication', {
            medication_strength: addMedData?.strengthValue,
            medication_unit: addMedData?.strengthUnit,
          });
          
          if (!slotState.isComplete) {
            setSlotFillingState(slotState);
            setOverlayState('slot_filling');
            voiceLogComplete('slot_filling');
            return;
          }
        }
      }
      
      // Step 6: Evaluate safety policy
      const policyDecision = evaluatePolicy({
        source: inputSource,
        confidence: result.confidence,
        intentType: result.type,
        top2ScoreDiff,
        hasMissingSlots: false,
        isAmbiguous: noiseCheck.isAmbiguousNumber
      });
      
      console.log('🛡️ Policy Decision:', policyDecision);
      
      // Step 7: Handle based on policy
      switch (policyDecision.action) {
        case 'disambiguation':
          if (topIntents.length >= 2) {
            setDisambiguationOptions([
              { intent: topIntents[0].intent, score: topIntents[0].score },
              { intent: topIntents[1].intent, score: topIntents[1].score }
            ]);
            setOverlayState('disambiguation');
            voiceLogComplete('disambiguation');
            return;
          }
          break;
          
        case 'slot_filling':
          // Already handled above
          break;
          
        case 'action_picker':
          setOverlayState('action_picker');
          voiceLogComplete('action_picker');
          return;
          
        case 'confirm':
          setOverlayState('confirmation');
          voiceLogComplete('confirmation');
          return;
          
        case 'auto_execute':
          // Execute the action directly
          break;
      }
      
      // Step 8: Auto-execute high-confidence actions
      
      // Q&A
      if (result.type === 'analytics_query' && userId) {
        const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
        if (voiceQuery) {
          const answer = await processQuestion(committedText, voiceQuery);
          if (answer) {
            setQaAnswer(answer);
            setOverlayState('qa_answer');
            voiceLogComplete('success');
            return;
          }
        }
      }
      
      // Note
      if (result.type === 'create_note') {
        const success = await saveNoteDirectly(committedText);
        if (success) {
          voiceLogComplete('success');
          onOpenChange(false);
          return;
        }
      }
      
      // Pain entry
      if (result.type === 'create_pain_entry' || result.type === 'create_quick_entry') {
        const painEntry = result.payload as any;
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
        
        const hasExplicitTime = painEntry?.occurredAt && !painEntry?.isNow;
        
        onSelectAction('quick_entry', committedText, {
          initialPainLevel: painEntry?.painLevel ? parseInt(String(painEntry.painLevel), 10) : undefined,
          initialSelectedTime: hasExplicitTime ? 'custom' : 'jetzt',
          initialCustomDate: hasExplicitTime ? painEntry.occurredAt.split('T')[0] : undefined,
          initialCustomTime: hasExplicitTime ? painEntry.occurredAt.split('T')[1]?.substring(0, 5) : undefined,
          initialNotes: painEntry?.notes || committedText,
          initialMedicationStates: Object.keys(medicationStates).length > 0 ? medicationStates : undefined,
        });
        voiceLogComplete('success');
        onOpenChange(false);
        return;
      }
      
      // Reminder
      if (result.type === 'navigate_reminder_create' || result.type === 'navigate_appointment_create') {
        onSelectAction('reminder', committedText, result.payload);
        voiceLogComplete('success');
        onOpenChange(false);
        return;
      }
      
      // Add Medication (turbo-create)
      if (result.type === 'add_medication') {
        const addMedData = result.payload as VoiceAddMedication | undefined;
        if (addMedData && addMedData.name.length >= 3) {
          const success = await turboCreateMedication(addMedData);
          if (success) {
            voiceLogComplete('success');
            onOpenChange(false);
            return;
          }
        }
        onSelectAction('add_medication', committedText, result.payload);
        voiceLogComplete('fallback_form');
        onOpenChange(false);
        return;
      }
      
      // Medication effect
      if (result.type === 'create_medication_update' || result.type === 'create_medication_effect') {
        onSelectAction('medication', committedText);
        voiceLogComplete('success');
        onOpenChange(false);
        return;
      }
      
      // Fallback to confirmation for medium confidence
      if (result.confidence >= 0.6) {
        setOverlayState('confirmation');
        voiceLogComplete('confirmation');
        return;
      }
      
      // Low confidence: action picker
      setOverlayState('action_picker');
      voiceLogComplete('action_picker');
      
    } catch (error) {
      console.error('Intent processing error:', error);
      voiceLogComplete('error', String(error));
      setOverlayState('action_picker');
    }
  }, [committedText, userMeds, userId, stopRecording, processQuestion, saveNoteDirectly, turboCreateMedication, onSelectAction, onOpenChange, inputSource, userMedLexicon]);

  // ============================================
  // Disambiguation Handler
  // ============================================

  const handleDisambiguationSelect = useCallback(async (intent: string) => {
    // Map intent to action and execute
    const actionMap: Record<string, ActionType> = {
      'add_medication': 'add_medication',
      'pain_entry': 'quick_entry',
      'medication_update': 'medication',
      'medication_effect': 'medication',
      'reminder': 'reminder',
      'analytics_query': 'question',
      'note': 'note',
      'navigation': 'diary',
    };
    
    const action = actionMap[intent];
    if (action) {
      if (action === 'question' && userId) {
        // Process as Q&A
        setOverlayState('processing');
        const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
        const result = routeVoiceCommand(committedText, userContext);
        if (result.type === 'analytics_query') {
          const answer = await processQuestion(committedText, result.payload as VoiceAnalyticsQuery);
          if (answer) {
            setQaAnswer(answer);
            setOverlayState('qa_answer');
            return;
          }
        }
      }
      
      onSelectAction(action, committedText);
      onOpenChange(false);
    }
  }, [committedText, userId, userMeds, processQuestion, onSelectAction, onOpenChange]);

  // ============================================
  // Slot Filling Handlers
  // ============================================

  const handleSlotSelect = useCallback((value: string) => {
    if (!slotFillingState) return;
    
    const currentSlot = getNextSlotToFill(slotFillingState);
    if (!currentSlot) return;
    
    const newState = fillSlot(slotFillingState, currentSlot.name, value);
    setSlotFillingState(newState);
    
    if (newState.isComplete) {
      const payload = slotsToPayload(newState);
      const medPayload: VoiceAddMedication = {
        name: String(payload.name || ''),
        displayName: String(payload.displayName || ''),
        strengthValue: payload.strengthValue as number | undefined,
        strengthUnit: payload.strengthUnit as 'mg' | 'ml' | 'µg' | 'mcg' | 'g' | undefined,
        formFactor: payload.formFactor as 'tablette' | 'kapsel' | 'spray' | 'tropfen' | 'injektion' | 'pflaster' | 'spritze' | undefined,
        confidence: 0.9,
      };
      turboCreateMedication(medPayload).then(success => {
        if (success) {
          voiceLogComplete('success');
          onOpenChange(false);
        } else {
          onSelectAction('add_medication', committedText, medPayload);
          onOpenChange(false);
        }
      });
    }
  }, [slotFillingState, turboCreateMedication, onOpenChange, onSelectAction, committedText]);

  const handleSlotCustomInput = useCallback((value: string) => {
    handleSlotSelect(value);
  }, [handleSlotSelect]);

  const handleSlotBack = useCallback(() => {
    setSlotFillingState(null);
    setOverlayState('input');
  }, []);

  // ============================================
  // Action Handlers
  // ============================================

  const handleFinish = useCallback(() => {
    processIntent();
  }, [processIntent]);

  const handleSelectAction = useCallback(async (action: ActionType) => {
    stopRecording();
    
    if (action === 'question' && userId && committedText.trim()) {
      setOverlayState('processing');
      try {
        const userContext = { userMeds, timezone: 'Europe/Berlin', language: 'de-DE' };
        const result = routeVoiceCommand(committedText, userContext);
        
        if (result.type === 'analytics_query') {
          const voiceQuery = result.payload as VoiceAnalyticsQuery | undefined;
          if (voiceQuery && voiceQuery.queryType !== 'unknown') {
            const answer = await processQuestion(committedText, voiceQuery);
            if (answer) {
              setQaAnswer(answer);
              setOverlayState('qa_answer');
              return;
            }
          }
        }
        
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
    
    if (result.type === 'create_note') {
      const success = await saveNoteDirectly(committedText);
      if (success) {
        onOpenChange(false);
        return;
      }
    }
    
    if (result.type === 'add_medication') {
      const addMedData = result.payload as VoiceAddMedication | undefined;
      if (addMedData && addMedData.name.length >= 2) {
        const success = await turboCreateMedication(addMedData);
        if (success) {
          onOpenChange(false);
          return;
        }
      }
      onSelectAction('add_medication', committedText, result.payload);
      onOpenChange(false);
      return;
    }
    
    const action = mapResultTypeToAction(result.type);
    if (action) {
      handleSelectAction(action);
    }
  }, [recognizedIntent, userId, committedText, processQuestion, saveNoteDirectly, turboCreateMedication, handleSelectAction, onSelectAction, onOpenChange]);

  const handleAskAnother = useCallback(() => {
    stopRecording();
    setCommittedText('');
    setQaAnswer(null);
    setRecognizedIntent(null);
    setOverlayState('input');
    setInterimText('');
    setLivePreview(null);
    setDisambiguationOptions(null);
    setNoiseMessage('');
    
    if (isSttSupported) {
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
    setDisambiguationOptions(null);
    setNoiseMessage('');
  }, []);

  // ============================================
  // Hold-to-Talk Handlers
  // ============================================

  const handleMicPointerDown = useCallback(() => {
    if (isHoldToTalk && isSttSupported && !isRecording) {
      startRecording();
    }
  }, [isHoldToTalk, isSttSupported, isRecording, startRecording]);

  const handleMicPointerUp = useCallback(() => {
    if (isHoldToTalk && isRecording) {
      stopRecording();
    }
  }, [isHoldToTalk, isRecording, stopRecording]);

  // ============================================
  // Lifecycle
  // ============================================

  useEffect(() => {
    if (open && isSttSupported && !autoStartedRef.current && !shouldShowDictationFallback) {
      autoStartedRef.current = true;
      const timer = setTimeout(() => startRecording(), 300);
      return () => clearTimeout(timer);
    }
    
    if (open && shouldShowDictationFallback) {
      setOverlayState('dictation_fallback');
    }
    
    if (!open) {
      autoStartedRef.current = false;
      stopRecording();
      setCommittedText('');
      setInterimText('');
      setOverlayState('input');
      setRecognizedIntent(null);
      setQaAnswer(null);
      setLivePreview(null);
      setDisambiguationOptions(null);
      setNoiseMessage('');
      setSlotFillingState(null);
    }
  }, [open, isSttSupported, startRecording, stopRecording, shouldShowDictationFallback]);

  // ============================================
  // Derived State
  // ============================================

  const hasText = committedText.trim().length > 0;
  const suggestedAction = recognizedIntent ? mapResultTypeToAction(recognizedIntent.type) : null;
  const isProcessing = overlayState === 'processing';

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
                  : overlayState === 'disambiguation'
                    ? 'Was meintest du?'
                    : overlayState === 'noise_retry'
                      ? 'Nicht verstanden'
                      : 'Per Sprache oder Text – Fragen, Einträge, Notizen.'}
          </DialogDescription>
        </DialogHeader>

        {/* Q&A Answer View */}
        {overlayState === 'qa_answer' && qaAnswer && (
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{qaAnswer.headline}</p>
              <p className="text-2xl font-semibold text-foreground">{qaAnswer.answer}</p>
              {qaAnswer.details && <p className="text-sm text-muted-foreground">{qaAnswer.details}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleAskAnother}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Weitere Frage
              </Button>
              <Button variant="default" className="flex-1" onClick={handleCancel}>
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Noise Retry View */}
        {overlayState === 'noise_retry' && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-muted-foreground">{noiseMessage}</p>
            </div>
            <Button variant="default" className="w-full" onClick={handleAskAnother}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Nochmal versuchen
            </Button>
          </div>
        )}

        {/* Disambiguation View */}
        {overlayState === 'disambiguation' && disambiguationOptions && (
          <DisambiguationView
            options={disambiguationOptions}
            transcript={committedText}
            onSelect={handleDisambiguationSelect}
            onBack={handleBackToInput}
            onShowAll={() => setOverlayState('action_picker')}
          />
        )}

        {/* Confirmation View */}
        {overlayState === 'confirmation' && recognizedIntent && suggestedAction && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground mb-1">Erkannt:</p>
              <p className="font-medium">{getIntentLabel(suggestedAction)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sicherheit: {Math.round(recognizedIntent.confidence * 100)}%
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOverlayState('action_picker')}>
                Ändern
              </Button>
              <Button variant="default" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={handleConfirmAction}>
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Action Picker View */}
        {overlayState === 'action_picker' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Was möchtest du machen?</p>
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
                  <span className="text-xs text-muted-foreground pl-6">{action.description}</span>
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={handleBackToInput}>
              ← Zurück zur Eingabe
            </Button>
          </div>
        )}

        {/* Slot Filling View */}
        {overlayState === 'slot_filling' && slotFillingState && (
          (() => {
            const nextSlot = getNextSlotToFill(slotFillingState);
            if (!nextSlot) return null;
            
            const plan: SimpleSlotFillingPlan = {
              missingSlot: nextSlot.name,
              prompt: nextSlot.prompt,
              suggestions: nextSlot.suggestions,
            };
            
            return (
              <SlotFillingView
                plan={plan}
                onSelect={handleSlotSelect}
                onBack={handleSlotBack}
                onCustomInput={handleSlotCustomInput}
              />
            );
          })()
        )}

        {/* Dictation Fallback View */}
        {overlayState === 'dictation_fallback' && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mic className="w-5 h-5" />
                <span className="font-medium">Diktier-Modus</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Tippe ins Textfeld und nutze die iOS-Diktierfunktion (🎤 Mikrofon-Symbol auf der Tastatur).
              </p>
            </div>
            
            <Textarea
              ref={textareaRef}
              value={committedText}
              onChange={(e) => setCommittedText(e.target.value)}
              placeholder="Hier diktieren oder tippen..."
              className="min-h-[100px] resize-none"
              autoFocus
            />
            
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setCommittedText('Tagebuch öffnen')}>
                📖 Tagebuch
              </Button>
              <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setCommittedText('Neuer Eintrag Stärke 5')}>
                ⚡ Schnell-Eintrag
              </Button>
              <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => setCommittedText('Wie viele schmerzfreie Tage in den letzten 30 Tagen?')}>
                📊 Auswertung
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={handleCancel}>Abbrechen</Button>
              <Button variant="default" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={handleFinish} disabled={!hasText}>
                <Check className="w-4 h-4 mr-2" />
                Fertig
              </Button>
            </div>
          </div>
        )}

        {/* Input View */}
        {(overlayState === 'input' || overlayState === 'processing') && !qaAnswer && (
          <div className="space-y-3">
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
              
              {interimText && (
                <p className="text-xs text-muted-foreground italic px-1 py-1 bg-muted/30 rounded">
                  Live: {interimText}
                </p>
              )}

              {/* Live Intent Preview - Enhanced */}
              {livePreview && hasText && overlayState === 'input' && (
                <div className="flex items-center gap-2 text-xs bg-muted/30 px-2 py-1.5 rounded">
                  <span className="text-muted-foreground">Erkannt:</span>
                  <span className="font-medium text-foreground">{getIntentLabel(livePreview.intent)}</span>
                  <span className="text-muted-foreground/70">({Math.round(livePreview.confidence * 100)}%)</span>
                  {livePreview.entities && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">{livePreview.entities}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Recording toggle button with hold-to-talk support */}
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
              onClick={isHoldToTalk ? undefined : (isRecording ? stopRecording : startRecording)}
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerLeave={isHoldToTalk && isRecording ? handleMicPointerUp : undefined}
              disabled={!isSttSupported || isProcessing}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-4 h-4 mr-2" />
                  {isHoldToTalk ? 'Loslassen zum Beenden' : 'Aufnahme pausieren'}
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 mr-2" />
                  {hasText ? 'Weiter aufnehmen' : (isHoldToTalk ? 'Gedrückt halten' : 'Aufnahme starten')}
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

        {/* Bottom Actions */}
        {overlayState !== 'qa_answer' && overlayState !== 'action_picker' && overlayState !== 'confirmation' && overlayState !== 'disambiguation' && overlayState !== 'noise_retry' && overlayState !== 'dictation_fallback' && overlayState !== 'slot_filling' && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="ghost" className="flex-1" onClick={handleCancel} disabled={isProcessing}>
              <X className="w-4 h-4 mr-2" />
              Abbrechen
            </Button>
            <Button variant="default" className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={handleFinish} disabled={isProcessing || !hasText}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Fertig
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
