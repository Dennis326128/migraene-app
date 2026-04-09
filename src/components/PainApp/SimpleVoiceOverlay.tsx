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
import { parseVoiceEntry, type VoiceParseResult, type MedEntry } from '@/lib/voice/parseVoiceEntry';
import { buildReviewState } from '@/lib/voice/buildReviewState';
import { getVocabularyWithUserMeds } from '@/lib/voice/voiceDomainVocabulary';
import { buildUserMedicationLexicon, correctMedicationsInTranscript } from '@/lib/voice/medicationFuzzyMatch';
import { isBrowserSttSupported } from '@/lib/voice/sttConfig';
import { 
  VOICE_MIGRAINE_PROFILE, 
  getAdaptiveSilenceThreshold, 
  canAutoStop 
} from '@/lib/voice/voiceTimingConfig';
import { useLanguage } from '@/hooks/useLanguage';
import { EntryReviewSheet, type EntryReviewState } from './EntryReviewSheet';
import { VoiceDebugOverlay } from './VoiceDebugOverlay';
import { DEFAULT_DOSE_QUARTERS } from '@/lib/utils/doseFormatter';
import { classifyVoiceEvent, segmentVoiceInput, getClassificationFeedback, getEventTypeIcon, getEventTypeLabel, type ClassificationResult, type VoiceEventType } from '@/lib/voice/eventClassifier';
import { generateVoiceSessionId, linkVoiceEventToEntry } from '@/lib/voice/voiceEventStore';
import { saveVoiceEventRobust } from '@/lib/voice/voiceEventQueue';
import { parseEverydayContent } from '@/lib/voice/everydayParser';
import { showSuccessToast, showInfoToast } from '@/lib/toastHelpers';

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
  // New parser fields
  painLocations?: string[];
  auraType?: string;
  symptoms?: string[];
  meCfsLevel?: string;
  isPrivate?: boolean;
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
  const [painFromDescriptor, setPainFromDescriptor] = useState(false);
  const [medsNeedReview, setMedsNeedReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('new');
  const [lastParseResult, setLastParseResult] = useState<VoiceParseResult | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string>('');
  const [lastClassification, setLastClassification] = useState<ClassificationResult | null>(null);
  
  // Voice event tracking
  const voiceSessionIdRef = useRef(generateVoiceSessionId());
  const voiceEventIdRef = useRef<string | null>(null);
  
  // User edit tracking
  const [userEdited, setUserEdited] = useState<{ pain: boolean; meds: boolean; notes: boolean }>({ pain: false, meds: false, notes: false });
  
  // Transcript storage for append mode
  const baseTranscriptRef = useRef('');
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<OverlayState>('recording');
  const recordingStartRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const continueSpeakingUsedRef = useRef(false);
  const reviewOpenedRef = useRef(false);
  
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
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);
  
  // ============================================
  // Build Review State from Parse Result
  // ============================================

  const buildEntryReviewState = useCallback((parsed: VoiceParseResult): { review: EntryReviewState; painDefaultUsed: boolean; painFromDescriptor: boolean; medsNeedReview: boolean } => {
    const newState = buildReviewState(parsed, {
      defaultPainLevel: 7,
      defaultMeCfs: 'none',
      defaultAura: 'keine',
    });
    
    const selectedMeds = new Map<string, { doseQuarters: number; medicationId?: string }>();
    for (const med of newState.selectedMedications) {
      selectedMeds.set(med.name, {
        doseQuarters: med.doseQuarters,
        medicationId: med.id,
      });
    }
    
    const review: EntryReviewState = {
      painLevel: newState.painLevel,
      selectedMedications: selectedMeds,
      notesText: newState.notesText,
      occurredAt: newState.occurredAt,
      painLocations: newState.painLocations,
      auraType: newState.auraType,
      symptoms: newState.symptoms,
      meCfsLevel: newState.meCfsLevel,
      isPrivate: newState.isPrivate,
      uncertainFields: newState.uncertainFields,
    };
    
    return {
      review,
      painDefaultUsed: newState.painLevelIsDefault,
      painFromDescriptor: false,
      medsNeedReview: newState.selectedMedications.some(m => m.needsReview),
    };
  }, []);
  
  // ============================================
  // Finish Recording & Parse
  // ============================================
  
  // Use refs for values needed in finishRecording to avoid dep cascades
  const voiceModeRef = useRef<VoiceMode>('new');
  const reviewStateRef = useRef<EntryReviewState | null>(null);
  const userEditedRef = useRef<{ pain: boolean; meds: boolean; notes: boolean }>({ pain: false, meds: false, notes: false });
  const userMedsRef = useRef(userMeds);
  
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { reviewStateRef.current = reviewState; }, [reviewState]);
  useEffect(() => { userEditedRef.current = userEdited; }, [userEdited]);
  useEffect(() => { userMedsRef.current = userMeds; }, [userMeds]);
  
  const openReviewWithDefaults = useCallback(() => {
    if (reviewOpenedRef.current) return;
    reviewOpenedRef.current = true;
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
    stateRef.current = 'review';
  }, []);

  const finishRecording = useCallback(() => {
    // Guard: only finish once
    if (reviewOpenedRef.current) return;
    
    clearAllTimers();
    intentionalStopRef.current = true;
    
    // Stop recognition best-effort (no await)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    
    const currentText = committedTextRef.current.trim();
    
    // Fallback timer: if parsing hangs, force review after 1800ms
    fallbackTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'processing' && !reviewOpenedRef.current) {
        console.warn('[SimpleVoice] Fallback triggered – forcing review');
        openReviewWithDefaults();
      }
    }, 1800);
    
    // Parse with small delay for final STT results
    try {
      const meds = userMedsRef.current;
      const mode = voiceModeRef.current;
      
      const medLexicon: MedEntry[] = meds.map(m => ({
        id: m.id,
        name: m.name,
        activeIngredient: m.wirkstoff ?? undefined,
        defaultDoseQuarters: 4,
      }));

      // === ALWAYS-SAVE-FIRST: Classify & persist raw context ===
      const classification = classifyVoiceEvent(currentText);
      setLastClassification(classification);
      const segments = segmentVoiceInput(currentText);
      const everydayData = parseEverydayContent(currentText);
      
      // Generate user-friendly feedback
      const feedback = getClassificationFeedback(classification);
      setVoiceFeedback(feedback);

      // Determine if this needs structured review (pain/medication/reminder)
      const REVIEW_REQUIRED_TYPES: VoiceEventType[] = ['pain', 'medication'];
      const needsStructuredReview = classification.classifications.some(
        c => REVIEW_REQUIRED_TYPES.includes(c.type)
      );

      // === EVERYDAY DIRECT SAVE: Skip review for non-medical entries ===
      if (!needsStructuredReview && currentText && classification.isMeaningful) {
        // Save voice event robustly (with offline fallback)
        saveVoiceEventRobust({
          rawTranscript: currentText,
          cleanedTranscript: currentText,
          source: 'voice',
          sessionId: voiceSessionIdRef.current,
          classification,
          segments,
          structuredData: { everyday: everydayData },
          reviewState: 'auto_saved',
        }).then(result => {
          voiceEventIdRef.current = result.id;
          if (result.queued) {
            showInfoToast('Offline gespeichert', 'Wird synchronisiert, sobald du online bist.');
          }
        });

        // Show friendly toast & close overlay immediately
        const primaryType = classification.classifications[0]?.type;
        const icon = primaryType ? getEventTypeIcon(primaryType) : '📝';
        const label = primaryType ? getEventTypeLabel(primaryType) : 'Notiz';
        
        // Build specific feedback from tags
        const tagHint = classification.tags.length > 0
          ? `: ${classification.tags.slice(0, 2).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}`
          : '';
        
        showSuccessToast(`${icon} ${label}${tagHint}`, 'Als Alltagseintrag gespeichert');

        // Clear fallback timer & close
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        onOpenChange(false);
        return;
      }
      
      if (mode === 'append' && baseTranscriptRef.current) {
        const combinedTranscript = (baseTranscriptRef.current + ' ' + currentText).trim();
        const parsed = parseVoiceEntry(combinedTranscript, medLexicon, new Date());
        
        const currentReview = reviewStateRef.current;
        if (currentReview) {
          const { review } = buildEntryReviewState(parsed);
          const edited = userEditedRef.current;
          reviewOpenedRef.current = true;
          setReviewState({
            ...review,
            painLevel: edited.pain ? currentReview.painLevel : review.painLevel,
            selectedMedications: edited.meds ? currentReview.selectedMedications : review.selectedMedications,
            notesText: edited.notes
              ? (currentReview.notesText.trim() + (review.notesText.trim() ? '\n\n' + review.notesText.trim() : ''))
              : review.notesText,
            occurredAt: currentReview.occurredAt,
          });
          setPainDefaultUsed(parsed.painLevel === null && !edited.pain);
          setEmptyTranscript(!combinedTranscript);
        }
        baseTranscriptRef.current = combinedTranscript;
      } else {
        const isEmpty = !currentText;
        setEmptyTranscript(isEmpty);
        
        const parsed = parseVoiceEntry(currentText, medLexicon, new Date());
        const { review, painDefaultUsed: pdu, painFromDescriptor: pfd, medsNeedReview: mnr } = buildEntryReviewState(parsed);
        
        // Save voice event FIRST (capture always) with offline fallback
        saveVoiceEventRobust({
          rawTranscript: currentText,
          cleanedTranscript: parsed.note || currentText,
          sttConfidence: undefined,
          source: 'voice',
          sessionId: voiceSessionIdRef.current,
          classification,
          segments,
          structuredData: {
            painLevel: parsed.painLevel,
            medications: parsed.medications.map(m => m.name),
            symptoms: parsed.symptoms,
            meCfsLevel: parsed.meCfsLevel,
            everyday: everydayData,
          },
          reviewState: 'auto_saved',
        }).then(result => {
          voiceEventIdRef.current = result.id;
        }).catch(err => {
          console.warn('[VoiceEvent] Background save failed:', err);
        });

        reviewOpenedRef.current = true;
        setReviewState(review);
        setLastParseResult(parsed);
        setPainDefaultUsed(pdu);
        setPainFromDescriptor(pfd);
        setMedsNeedReview(mnr);
        baseTranscriptRef.current = currentText;
      }
      
      setVoiceMode('new');
      setState('review');
      stateRef.current = 'review';
      
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    } catch (error) {
      console.error('[SimpleVoice] Parse error, using defaults:', error);
      
      // Even on parse error: try to save raw transcript
      if (currentText) {
        saveVoiceEventRobust({
          rawTranscript: currentText,
          source: 'voice',
          sessionId: voiceSessionIdRef.current,
          reviewState: 'auto_saved',
        }).catch(() => {});
      }
      
      openReviewWithDefaults();
    }
  }, [clearAllTimers, buildEntryReviewState, openReviewWithDefaults]);
  
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
    
    // Pass domain vocabulary as grammar hints (improves STT accuracy)
    try {
      const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;
      if (SpeechGrammarList) {
        const vocab = getVocabularyWithUserMeds(userMedsRef.current);
        const grammarStr = `#JSGF V1.0; grammar migraine; public <term> = ${vocab.join(' | ')} ;`;
        const grammarList = new SpeechGrammarList();
        grammarList.addFromString(grammarStr, 1);
        recognition.grammars = grammarList;
      }
    } catch (e) {
      // SpeechGrammarList not supported in all browsers — silently skip
    }
    
    recognition.onstart = () => {
      // Only set recording if we're not already in processing/review
      if (stateRef.current !== 'processing' && stateRef.current !== 'review') {
        setState('recording');
      }
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
      // NEVER restart if intentionally stopped or past recording state
      if (intentionalStopRef.current) return;
      if (stateRef.current !== 'recording') return;
      
      // Instead of auto-restart (which causes infinite loops),
      // show paused state and let user resume manually
      console.warn('[SimpleVoice] Recognition ended unexpectedly, showing paused state');
      setState('paused');
      stateRef.current = 'paused';
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
  // Lifecycle: Auto-start on open (stable deps via refs)
  // ============================================
  
  // Keep function refs stable to avoid effect re-fires
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);
  
  useEffect(() => {
    if (open) {
      setState('recording');
      stateRef.current = 'recording';
      reviewOpenedRef.current = false;
      setReviewState(null);
      setEmptyTranscript(false);
      setPainDefaultUsed(false);
      setPainFromDescriptor(false);
      setMedsNeedReview(false);
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
          startRecordingRef.current();
        }
      }, 200);
      
      return () => clearTimeout(timer);
    } else {
      clearAllTimers();
      stopRecordingRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSttSupported, clearAllTimers]);
  
  useEffect(() => {
    return () => {
      stopRecordingRef.current();
    };
  }, []);
  
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
    // Guard: prevent double-click
    if (stateRef.current === 'processing' || stateRef.current === 'review') return;
    
    // SOFORT: Prevent any auto-restart from onend
    intentionalStopRef.current = true;
    reviewOpenedRef.current = false;
    // SOFORT: Update ref synchronously so onstart/onend checks work immediately
    stateRef.current = 'processing';
    // SOFORT: React state for UI
    setState('processing');
    
    // Dann Recording stoppen & parsen
    finishRecording();
  }, [finishRecording]);
  
  const handleResumeRecording = useCallback(() => {
    intentionalStopRef.current = false;
    stateRef.current = 'recording';
    startRecordingRef.current();
  }, []);
  
  const handleContinueSpeaking = useCallback(() => {
    setVoiceMode('append');
    continueSpeakingUsedRef.current = true;
    committedTextRef.current = '';
    hasSpokenRef.current = false;
    intentionalStopRef.current = false;
    reviewOpenedRef.current = false;
    stateRef.current = 'recording';
    setState('recording');
    
    setTimeout(() => {
      startRecordingRef.current();
    }, 200);
  }, []);
  
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
        painLocations: reviewState.painLocations,
        auraType: reviewState.auraType,
        symptoms: reviewState.symptoms,
        meCfsLevel: reviewState.meCfsLevel,
        isPrivate: reviewState.isPrivate,
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
  
  // Live classification preview from current transcript
  const livePreviewLabel = React.useMemo(() => {
    const text = committedTextRef.current?.trim();
    if (!text || text.length < 3) return null;
    const cls = classifyVoiceEvent(text);
    if (!cls.isMeaningful || cls.classifications.length === 0) return null;
    const primary = cls.classifications[0];
    const icon = getEventTypeIcon(primary.type);
    const label = getEventTypeLabel(primary.type);
    return `${icon} ${label}`;
  }, [/* re-computed on render triggered by state changes */]);

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
      
      {/* Live classification hint (calm, non-technical) */}
      {livePreviewLabel && (
        <p className="text-sm text-primary/70 mb-2 transition-opacity duration-500">
          {livePreviewLabel}
        </p>
      )}
      
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
          
          {/* Top spacing (no grabber – avoids "drag" confusion for migraine users) */}
          <div className="pt-4 sticky top-0 bg-card rounded-t-3xl z-10" />
          
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
              painFromDescriptor={painFromDescriptor}
              medsNeedReview={medsNeedReview}
              hideTimeDisplay={true}
              rawTranscript={baseTranscriptRef.current}
            />
            <VoiceDebugOverlay
              parseResult={lastParseResult}
              painDefaultUsed={painDefaultUsed}
              painFromDescriptor={painFromDescriptor}
              medsNeedReview={medsNeedReview}
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
      {/* Header with back arrow – always on top, even above review overlay */}
      <div className="relative z-[60] flex items-center px-4 pt-4 pb-2">
        <button
          onClick={handleClose}
          onPointerDown={(e) => { e.stopPropagation(); handleClose(); }}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted/50 active:bg-muted transition-colors -ml-1"
          aria-label={t('common.back')}
        >
          <ChevronLeft className="w-6 h-6 text-foreground" />
        </button>
      </div>
      
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
