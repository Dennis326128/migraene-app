import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpeechRecognition } from './useSpeechRecognition';
import { routeVoiceCommand, getRouteForIntent, isNavigationIntent, type VoiceRouterResult } from '@/lib/voice/voiceIntentRouter';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { parseGermanVoiceEntry } from '@/lib/voice/germanParser';
import { toast } from '@/hooks/use-toast';
import { useMeds, useUpdateMed, useMarkMedAsIntolerant } from '@/features/meds/hooks/useMeds';
import type { VoiceUserContext, VoiceMedicationUpdate } from '@/types/voice.types';
import type { ParsedReminder, ParsedAppointment, DiaryFilter, AnalysisOptions, ReportOptions } from '@/lib/voice/navigationIntents';
import { VOICE_TIMING, isTranscriptSufficient } from '@/lib/voice/voiceTimingConfig';

// ============================================
// Types
// ============================================

export interface QuickEntryData {
  initialPainLevel: number;
  initialSelectedTime: string;
  initialCustomDate?: string;
  initialCustomTime?: string;
  initialMedicationStates: Record<string, { 
    doseQuarters: number; 
    medicationId?: string 
  }>;
  initialNotes: string;
  initialMedicationEffect?: {
    rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
    confidence: 'high' | 'medium' | 'low';
  };
}

export interface ReminderData {
  type: 'medication' | 'appointment';
  title: string;
  medications?: string[];
  date: string;
  time: string;
  timeOfDay?: 'morning' | 'noon' | 'evening' | 'night';
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  notes: string;
  notification_enabled: boolean;
}

export interface MedicationUpdateData {
  medicationName: string;
  action: 'discontinued' | 'intolerance' | 'started' | 'dosage_changed';
  reason?: string;
  notes?: string;
}

export interface SmartVoiceRouterOptions {
  onEntryDetected?: (data: QuickEntryData) => void;
  onNoteDetected?: (transcript: string) => void;
  onNoteCreated?: () => void;
  onReminderDetected?: (data: ReminderData) => void;
  onMedicationUpdateDetected?: (data: MedicationUpdateData) => void;
  // New navigation callbacks
  onNavigationIntent?: (route: string, payload?: unknown) => void;
  onHelpRequested?: () => void;
  onUnknownIntent?: (transcript: string) => void;
}

export interface VoiceRouterState {
  lastResult: VoiceRouterResult | null;
}

// ============================================
// Hook
// ============================================

export function useSmartVoiceRouter(options: SmartVoiceRouterOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastResult, setLastResult] = useState<VoiceRouterResult | null>(null);
  const isCancellingRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const navigate = useNavigate();
  const { data: userMeds = [] } = useMeds();
  const updateMed = useUpdateMed();
  const markAsIntolerant = useMarkMedAsIntolerant();
  
  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    interimResults: true,
    // Migraine-friendly: 5 seconds silence threshold (generous for word-finding issues)
    pauseThreshold: VOICE_TIMING.PAUSE_THRESHOLD_SECONDS,
    onTranscriptReady: async (transcript, confidence) => {
      // Skip processing if cancelled
      if (isCancellingRef.current) {
        console.log('🚫 Voice cancelled - skipping processing');
        isCancellingRef.current = false;
        return;
      }
      
      // Check if enough time has passed (MIN_LISTEN_MS)
      const elapsedMs = Date.now() - recordingStartTimeRef.current;
      const hasMinTime = elapsedMs >= VOICE_TIMING.MIN_LISTEN_MS;
      
      // Check if transcript is long enough
      const isSufficient = isTranscriptSufficient(transcript);
      
      console.log('🎤 Smart Router: Transcript received:', {
        transcript,
        elapsedMs,
        hasMinTime,
        isSufficient
      });
      
      // If transcript too short and not enough time, show hint and don't trigger unknown
      if (!isSufficient && !hasMinTime) {
        console.log('⏳ Transcript too short and recording too brief - hint to speak longer');
        toast({
          title: '🎤 Bitte etwas länger sprechen',
          description: 'Nimm dir Zeit beim Sprechen.',
          variant: 'default'
        });
        return;
      }
      
      setIsSaving(true);
      
      try {
        // Zentrale NLP-Analyse mit neuem Router
        const userContext: VoiceUserContext = {
          userMeds,
          timezone: 'Europe/Berlin',
          language: 'de-DE'
        };

        const result = routeVoiceCommand(transcript, userContext);
        setLastResult(result);
        
        console.log('🧠 Voice Router Result:', {
          type: result.type,
          confidence: result.confidence,
          source: result.source
        });

        // Intent-basiertes Routing
        await handleVoiceResult(result, transcript, confidence);
        
      } catch (error) {
        console.error('❌ Smart Router Error:', error);
        toast({
          title: 'Fehler',
          description: error instanceof Error ? error.message : 'Verarbeitung fehlgeschlagen',
          variant: 'destructive'
        });
      } finally {
        setIsSaving(false);
      }
    },
    onError: (error) => {
      console.error('🚨 Speech Recognition Error:', error);
      toast({
        title: 'Fehler',
        description: `Spracherkennung fehlgeschlagen: ${error}`,
        variant: 'destructive'
      });
      setIsSaving(false);
    }
  });

  /**
   * Handle voice result based on intent type
   */
  const handleVoiceResult = async (
    result: VoiceRouterResult,
    transcript: string,
    confidence: number
  ) => {
    switch (result.type) {
      // ============================================
      // Navigation Intents
      // ============================================
      
      case 'navigate_reminder_create': {
        const payload = result.payload as ParsedReminder | undefined;
        const reminderData: ReminderData = {
          type: payload?.isAppointment ? 'appointment' : 'medication',
          title: payload?.title || 'Erinnerung',
          medications: payload?.medications,
          date: payload?.date || new Date().toISOString().split('T')[0],
          time: payload?.time || '09:00',
          timeOfDay: payload?.timeOfDay,
          repeat: payload?.repeat || 'none',
          notes: payload?.notes || transcript,
          notification_enabled: true
        };
        
        toast({
          title: '⏰ Erinnerung erkannt',
          description: `${reminderData.title} - ${reminderData.date} ${reminderData.time}`
        });
        
        // Navigate and pass data
        if (options.onReminderDetected) {
          options.onReminderDetected(reminderData);
        } else {
          navigate('/reminders', { state: { prefillData: reminderData } });
        }
        break;
      }
      
      case 'navigate_appointment_create': {
        const payload = result.payload as ParsedAppointment | undefined;
        const reminderData: ReminderData = {
          type: 'appointment',
          title: payload?.title || 'Arzttermin',
          date: payload?.date || new Date().toISOString().split('T')[0],
          time: payload?.time || '09:00',
          repeat: 'none',
          notes: payload?.reason || transcript,
          notification_enabled: true
        };
        
        toast({
          title: '📅 Arzttermin erkannt',
          description: `${reminderData.title} - ${reminderData.date} ${reminderData.time}`
        });
        
        if (options.onReminderDetected) {
          options.onReminderDetected(reminderData);
        } else {
          navigate('/reminders', { state: { prefillData: reminderData } });
        }
        break;
      }
      
      case 'navigate_profile_edit':
        toast({ title: '👤 Persönliche Daten', description: 'Öffne Einstellungen...' });
        handleNavigation('/settings/account');
        break;
      
      case 'navigate_doctor_edit':
        toast({ title: '🏥 Arztdaten', description: 'Öffne Arzteinstellungen...' });
        handleNavigation('/settings/doctors');
        break;
      
      case 'navigate_diary': {
        const filter = result.payload as DiaryFilter | undefined;
        toast({ 
          title: '📔 Tagebuch', 
          description: filter?.period ? `Zeitraum: ${filter.period}` : 'Öffne Tagebuch...'
        });
        handleNavigation('/diary', filter);
        break;
      }
      
      case 'navigate_analysis': {
        const analysisOptions = result.payload as AnalysisOptions | undefined;
        toast({ 
          title: '📊 Auswertung', 
          description: analysisOptions?.period ? `Zeitraum: ${analysisOptions.period}` : 'Öffne Auswertung...'
        });
        handleNavigation('/analysis', analysisOptions);
        break;
      }
      
      case 'navigate_report': {
        const reportOptions = result.payload as ReportOptions | undefined;
        toast({ 
          title: '📄 Arztbericht', 
          description: 'Öffne Berichtserstellung...'
        });
        handleNavigation('/analysis', { generateReport: true, ...reportOptions });
        break;
      }
      
      case 'navigate_medications':
        toast({ title: '💊 Medikamente', description: 'Öffne Medikamentenübersicht...' });
        handleNavigation('/medications');
        break;
      
      case 'navigate_settings':
        toast({ title: '⚙️ Einstellungen', description: 'Öffne Einstellungen...' });
        handleNavigation('/settings');
        break;
      
      case 'help':
        console.log('🆘 Help requested');
        options.onHelpRequested?.();
        break;
      
      // ============================================
      // Content Intents
      // ============================================
      
      case 'create_medication_update': {
        const update = result.payload as VoiceMedicationUpdate;
        if (update) {
          await handleMedicationUpdate(update);
        }
        break;
      }

      case 'create_pain_entry': {
        // Parse transcript with full structured data using germanParser
        const parsed = parseGermanVoiceEntry(transcript, userMeds.map(m => ({ id: m.id, name: m.name })));
        
        // Build structured medication states with doseQuarters
        const medicationStates: Record<string, { doseQuarters: number; medicationId?: string }> = {};
        parsed.medicationsStructured
          ?.filter(m => m.confidence >= 0.6)
          .forEach(med => {
            const name = med.matchedMedicationName || med.raw;
            medicationStates[name] = {
              doseQuarters: med.doseQuarters || 4,
              medicationId: med.matchedMedicationId
            };
          });
        
        // Determine time selection
        let selectedTime = 'jetzt';
        let customDate: string | undefined;
        let customTime: string | undefined;
        
        if (!parsed.isNow && parsed.selectedDate && parsed.selectedTime) {
          const occurredDate = new Date(`${parsed.selectedDate}T${parsed.selectedTime}:00`);
          const now = new Date();
          const diffMinutes = Math.abs((now.getTime() - occurredDate.getTime()) / 1000 / 60);
          
          if (diffMinutes < 5) {
            selectedTime = 'jetzt';
          } else if (diffMinutes >= 50 && diffMinutes <= 70) {
            selectedTime = '1h';
          } else {
            selectedTime = 'custom';
            customDate = parsed.selectedDate;
            customTime = parsed.selectedTime;
          }
        }
        
        const quickEntryData: QuickEntryData = {
          initialPainLevel: parsed.painLevel ? parseInt(parsed.painLevel, 10) : 5,
          initialSelectedTime: selectedTime,
          initialCustomDate: customDate,
          initialCustomTime: customTime,
          initialMedicationStates: medicationStates,
          initialNotes: parsed.notes || transcript,
          initialMedicationEffect: parsed.medicationEffect
        };
        
        console.log('🎯 QuickEntryData from voice:', quickEntryData);
        
        toast({
          title: '📝 Schmerz-Eintrag erkannt',
          description: `Schmerzstärke ${parsed.painLevel || '?'}/10, ${Object.keys(medicationStates).length} Medikament(e)`
        });
        
        options.onEntryDetected?.(quickEntryData);
        break;
      }

      case 'create_note':
        console.log('📝 Kontext-Notiz');
        
        toast({
          title: '📝 Notiz',
          description: 'Als Kontext-Notiz gespeichert'
        });
        
        if (options.onNoteDetected) {
          options.onNoteDetected(transcript);
        } else {
          await saveVoiceNote({
            rawText: transcript,
            sttConfidence: confidence,
            source: 'voice'
          });
          options.onNoteCreated?.();
        }
        break;

      case 'unknown':
      default:
        console.log('❓ Unknown intent - showing fallback');
        
        if (result.confidence < 0.5) {
          toast({
            title: '⚠️ Nicht sicher verstanden',
            description: 'Bitte wähle eine Aktion aus',
            variant: 'default'
          });
        }
        
        options.onUnknownIntent?.(transcript);
        break;
    }
  };

  /**
   * Handle navigation with optional payload
   */
  const handleNavigation = (route: string, payload?: unknown) => {
    if (options.onNavigationIntent) {
      options.onNavigationIntent(route, payload);
    } else {
      navigate(route, { state: payload ? { voicePayload: payload } : undefined });
    }
  };
  
  /**
   * Handle medication updates (discontinued, intolerance, started, dosage_changed)
   */
  const handleMedicationUpdate = async (update: VoiceMedicationUpdate) => {
    console.log('💊 Medication Update:', update);
    
    // Find the medication in user's list
    const med = userMeds.find(m => 
      m.name.toLowerCase() === update.medicationName.toLowerCase() ||
      m.name.toLowerCase().includes(update.medicationName.toLowerCase()) ||
      update.medicationName.toLowerCase().includes(m.name.toLowerCase())
    );
    
    if (!med) {
      toast({
        title: '⚠️ Medikament nicht gefunden',
        description: `"${update.medicationName}" ist nicht in deiner Medikamentenliste. Bitte prüfen.`,
        variant: 'default'
      });
      
      options.onMedicationUpdateDetected?.({
        medicationName: update.medicationName,
        action: update.action,
        reason: update.reason,
        notes: update.notes
      });
      return;
    }

    try {
      switch (update.action) {
        case 'intolerance':
          await markAsIntolerant.mutateAsync({
            id: med.id,
            notes: update.reason || update.notes
          });
          toast({
            title: '💊 Medikament als unverträglich markiert',
            description: `${med.name} wurde als unverträglich gespeichert${update.reason ? `: ${update.reason}` : ''}`
          });
          break;

        case 'discontinued':
          await updateMed.mutateAsync({
            id: med.id,
            input: {
              is_active: false,
              discontinued_at: new Date().toISOString()
            }
          });
          toast({
            title: '💊 Medikament abgesetzt',
            description: `${med.name} wurde als abgesetzt markiert`
          });
          break;

        case 'started':
          await updateMed.mutateAsync({
            id: med.id,
            input: {
              is_active: true,
              discontinued_at: null
            }
          });
          toast({
            title: '💊 Medikament gestartet',
            description: `${med.name} wurde als aktiv markiert`
          });
          break;

        case 'dosage_changed':
          toast({
            title: '💊 Dosierungsänderung erkannt',
            description: `Bitte passe die Dosierung von ${med.name} manuell an`
          });
          break;
      }

      options.onMedicationUpdateDetected?.({
        medicationName: med.name,
        action: update.action,
        reason: update.reason,
        notes: update.notes
      });

    } catch (error) {
      console.error('Failed to update medication:', error);
      toast({
        title: 'Fehler',
        description: 'Medikamenten-Update fehlgeschlagen',
        variant: 'destructive'
      });
    }
  };
  
  // Track if we're cancelling to prevent processing
  const startVoice = async () => {
    isCancellingRef.current = false;
    recordingStartTimeRef.current = Date.now();
    try {
      await speechRecognition.startRecording();
    } catch (error) {
      console.error('Failed to start voice:', error);
      toast({
        title: 'Fehler',
        description: 'Mikrofon-Zugriff fehlgeschlagen',
        variant: 'destructive'
      });
    }
  };
  
  const stopVoice = () => {
    speechRecognition.stopRecording();
  };
  
  // Cancel without processing - just stop and reset
  const cancelVoice = () => {
    isCancellingRef.current = true;
    speechRecognition.resetTranscript();
    speechRecognition.stopRecording();
    setIsSaving(false);
    setLastResult(null);
  };
  
  return {
    startVoice,
    stopVoice,
    cancelVoice,
    isSaving,
    isListening: speechRecognition.state.isRecording,
    transcript: speechRecognition.state.transcript,
    isPaused: speechRecognition.state.isPaused,
    remainingSeconds: speechRecognition.state.remainingSeconds,
    lastResult,
  };
}
