import { useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { analyzeVoiceTranscript } from '@/lib/voice/voiceNlp';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { toast } from '@/hooks/use-toast';
import { useMeds, useUpdateMed, useMarkMedAsIntolerant } from '@/features/meds/hooks/useMeds';
import type { VoiceUserContext, VoiceMedicationUpdate } from '@/types/voice.types';

interface QuickEntryData {
  initialPainLevel: number;
  initialSelectedTime: string;
  initialCustomDate?: string;
  initialCustomTime?: string;
  initialMedicationStates: Record<string, boolean>;
  initialNotes: string;
}

interface ReminderData {
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

interface MedicationUpdateData {
  medicationName: string;
  action: 'discontinued' | 'intolerance' | 'started' | 'dosage_changed';
  reason?: string;
  notes?: string;
}

interface SmartVoiceRouterOptions {
  onEntryDetected?: (data: QuickEntryData) => void;
  onNoteDetected?: (transcript: string) => void;
  onNoteCreated?: () => void;
  onReminderDetected?: (data: ReminderData) => void;
  onMedicationUpdateDetected?: (data: MedicationUpdateData) => void;
}

export function useSmartVoiceRouter(options: SmartVoiceRouterOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const { data: userMeds = [] } = useMeds();
  const updateMed = useUpdateMed();
  const markAsIntolerant = useMarkMedAsIntolerant();
  
  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    interimResults: true,
    pauseThreshold: 8,
    onTranscriptReady: async (transcript, confidence) => {
      console.log('🎤 Smart Router: Transcript received:', transcript);
      setIsSaving(true);
      
      try {
        // Zentrale NLP-Analyse
        const userContext: VoiceUserContext = {
          userMeds,
          timezone: 'Europe/Berlin',
          language: 'de-DE'
        };

        const analysis = analyzeVoiceTranscript(transcript, userContext, confidence);
        
        console.log('🧠 Analysis Result:', {
          intent: analysis.intent,
          intentConfidence: analysis.intentConfidence,
          sttConfidence: analysis.sttConfidence
        });

        // Intent-basiertes Routing
        switch (analysis.intent) {
          case 'medication_update':
            if (analysis.medicationUpdate) {
              await handleMedicationUpdate(analysis.medicationUpdate);
            }
            break;

          case 'reminder':
            if (analysis.reminder) {
              const reminderData: ReminderData = {
                type: analysis.reminder.type || 'medication',
                title: analysis.reminder.title || 'Erinnerung',
                medications: analysis.reminder.medications?.map(m => m.name),
                date: analysis.reminder.date || new Date().toISOString().split('T')[0],
                time: analysis.reminder.time || '12:00',
                timeOfDay: analysis.reminder.timeOfDay,
                repeat: analysis.reminder.repeat || 'none',
                notes: analysis.reminder.notes || '',
                notification_enabled: true
              };
              
              toast({
                title: '⏰ Erinnerung erkannt',
                description: `${reminderData.type === 'medication' ? 'Medikament' : 'Termin'}: ${reminderData.title}`
              });
              
              options.onReminderDetected?.(reminderData);
            }
            break;

          case 'pain_entry':
            if (analysis.painEntry) {
              const { painEntry } = analysis;
              
              // Build medication states (nur high/medium confidence)
              const medicationStates: Record<string, boolean> = {};
              painEntry.medications
                ?.filter(m => m.confidence >= 0.6)
                .forEach(med => {
                  medicationStates[med.name] = true;
                });
              
              // Determine time selection
              let selectedTime = 'jetzt';
              let customDate: string | undefined;
              let customTime: string | undefined;
              
              if (painEntry.occurredAt) {
                const occurredDate = new Date(painEntry.occurredAt);
                const now = new Date();
                const diffMinutes = Math.abs((now.getTime() - occurredDate.getTime()) / 1000 / 60);
                
                if (diffMinutes < 5) {
                  selectedTime = 'jetzt';
                } else if (diffMinutes >= 50 && diffMinutes <= 70) {
                  selectedTime = '1h';
                } else {
                  selectedTime = 'custom';
                  customDate = occurredDate.toISOString().split('T')[0];
                  customTime = occurredDate.toISOString().split('T')[1].substring(0, 5);
                }
              }
              
              const quickEntryData: QuickEntryData = {
                initialPainLevel: painEntry.painLevel || 5,
                initialSelectedTime: selectedTime,
                initialCustomDate: customDate,
                initialCustomTime: customTime,
                initialMedicationStates: medicationStates,
                initialNotes: transcript // Full transcript as notes
              };
              
              toast({
                title: '📝 Schmerz-Eintrag erkannt',
                description: `Schmerzstärke ${painEntry.painLevel || '?'}/10, ${Object.keys(medicationStates).length} Medikament(e)`
              });
              
              options.onEntryDetected?.(quickEntryData);
            }
            break;

          case 'note':
          case 'unknown':
            console.log('📝 Kontext-Notiz oder unbekannter Intent');
            
            if (analysis.intentConfidence < 0.5) {
              toast({
                title: '⚠️ Unsicher',
                description: 'Text als Notiz gespeichert - bitte prüfen',
                variant: 'default'
              });
            } else {
              toast({
                title: '📝 Kontext-Notiz',
                description: 'Gespeichert für spätere Analyse'
              });
            }
            
            // Callback statt direktes Speichern
            if (options.onNoteDetected) {
              options.onNoteDetected(transcript);
            } else {
              // Fallback: direktes Speichern
              await saveVoiceNote({
                rawText: transcript,
                sttConfidence: confidence,
                source: 'voice'
              });
              
              options.onNoteCreated?.();
            }
            break;
        }
        
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
      
      // Still call callback with data so UI can handle it
      options.onMedicationUpdateDetected?.({
        medicationName: update.medicationName,
        action: update.action,
        reason: update.reason,
        notes: update.notes
      });
      return;
    }

    try {
      const actionLabels = {
        discontinued: 'abgesetzt',
        intolerance: 'als unverträglich markiert',
        started: 'gestartet',
        dosage_changed: 'Dosierung geändert'
      };

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
          // For dosage changes, just notify - user should edit manually
          toast({
            title: '💊 Dosierungsänderung erkannt',
            description: `Bitte passe die Dosierung von ${med.name} manuell an`
          });
          break;
      }

      // Call callback
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
  
  const startVoice = async () => {
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
  
  return {
    startVoice,
    stopVoice,
    isSaving,
    isListening: speechRecognition.state.isRecording,
    transcript: speechRecognition.state.transcript,
    isPaused: speechRecognition.state.isPaused,
    remainingSeconds: speechRecognition.state.remainingSeconds
  };
}
