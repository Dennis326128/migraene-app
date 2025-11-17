import { useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { parseGermanVoiceEntry } from '@/lib/voice/germanParser';
import { parseGermanReminderEntry, isReminderTrigger } from '@/lib/voice/reminderParser';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { toast } from '@/hooks/use-toast';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { normalizePainLevel } from '@/lib/utils/pain';

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

interface SmartVoiceRouterOptions {
  onEntryDetected?: (data: QuickEntryData) => void;
  onNoteDetected?: (transcript: string) => void;
  onNoteCreated?: () => void;
  onReminderDetected?: (data: ReminderData) => void;
}

export function useSmartVoiceRouter(options: SmartVoiceRouterOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const { data: userMeds = [] } = useMeds();
  
  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    interimResults: true,
    pauseThreshold: 3,
    onTranscriptReady: async (transcript, confidence) => {
      console.log('🎤 Smart Router: Transcript received:', transcript);
      setIsSaving(true);
      
      try {
        // 1. Check: Ist es eine Erinnerung?
        if (isReminderTrigger(transcript)) {
          console.log('⏰ Erinnerung erkannt');
          
          const parsedReminder = parseGermanReminderEntry(transcript, userMeds);
          
          if (parsedReminder.type) {
            const reminderData: ReminderData = {
              type: parsedReminder.type,
              title: parsedReminder.title,
              medications: parsedReminder.medications,
              date: parsedReminder.date,
              time: parsedReminder.time,
              timeOfDay: parsedReminder.timeOfDay || undefined,
              repeat: parsedReminder.repeat,
              notes: parsedReminder.notes,
              notification_enabled: true
            };
            
            toast({
              title: '⏰ Erinnerung erkannt',
              description: `${parsedReminder.type === 'medication' ? 'Medikament' : 'Termin'}: ${parsedReminder.title}`
            });
            
            options.onReminderDetected?.(reminderData);
            return;
          }
        }
        
        // 2. Check: Ist es ein Schmerz-Eintrag?
        const parsed = parseGermanVoiceEntry(transcript, userMeds);
        
        console.log('📊 Parsed result:', parsed);
        
        // Decision: Schmerzlevel erkannt = Schmerz-Eintrag
        if (parsed.painLevel) {
          console.log('📝 Schmerz-Eintrag erkannt (painLevel:', parsed.painLevel, ')');
          
          // Convert parsed data to QuickEntry format
          const painScore = normalizePainLevel(parsed.painLevel);
          
          // Build medication states
          const medicationStates: Record<string, boolean> = {};
          parsed.medications?.forEach(medName => {
            medicationStates[medName] = true;
          });
          
          // Determine time selection
          let selectedTime = 'jetzt';
          let customDate: string | undefined;
          let customTime: string | undefined;
          
          if (parsed.isNow) {
            selectedTime = 'jetzt';
          } else if (parsed.selectedDate && parsed.selectedTime) {
            // Check if it's approximately 1 hour ago
            const parsedDateTime = new Date(`${parsed.selectedDate}T${parsed.selectedTime}`);
            const now = new Date();
            const diffMinutes = Math.abs((now.getTime() - parsedDateTime.getTime()) / 1000 / 60);
            
            if (diffMinutes >= 50 && diffMinutes <= 70) {
              selectedTime = '1h';
            } else {
              selectedTime = 'custom';
              customDate = parsed.selectedDate;
              customTime = parsed.selectedTime;
            }
          }
          
          const quickEntryData: QuickEntryData = {
            initialPainLevel: painScore,
            initialSelectedTime: selectedTime,
            initialCustomDate: customDate,
            initialCustomTime: customTime,
            initialMedicationStates: medicationStates,
            initialNotes: transcript // Full transcript as notes
          };
          
          toast({
            title: '📝 Schmerz-Eintrag erkannt',
            description: `Schmerzstärke ${painScore}/10, ${parsed.medications?.length || 0} Medikament(e)`
          });
          
          options.onEntryDetected?.(quickEntryData);
          
        } else {
          // 3. Fallback: Kein Schmerzlevel → Voice-Notiz
          console.log('🎙️ Voice-Notiz erkannt (kein Schmerzlevel)');
          
          toast({
            title: '🎙️ Voice-Notiz',
            description: 'Bitte überprüfen und speichern'
          });
          
          // NEU: Callback statt direktes Speichern
          if (options.onNoteDetected) {
            options.onNoteDetected(transcript);
          } else {
            // Fallback: direktes Speichern (backward compatibility)
            await saveVoiceNote({
              rawText: transcript,
              sttConfidence: confidence,
              source: 'voice'
            });
            
            toast({
              title: '🎙️ Voice-Notiz gespeichert',
              description: 'Erfolgreich in Datenbank gespeichert'
            });
            
            options.onNoteCreated?.();
          }
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
