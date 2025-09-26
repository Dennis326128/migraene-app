import { useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { parseGermanVoiceEntry, type ParsedVoiceEntry } from '@/lib/voice/germanParser';

interface VoiceTriggerOptions {
  onParsed?: (data: VoiceTriggerData) => void;
  onError?: (error: string) => void;
}

export interface VoiceTriggerData {
  painLevel: number;
  selectedTime: string;
  customDate?: string;
  customTime?: string;
  medicationStates: Record<string, boolean>;
  notes?: string;
}

export function useVoiceTrigger(options: VoiceTriggerOptions = {}) {
  const [isListening, setIsListening] = useState(false);

  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    continuous: false,
    interimResults: true,
    onTranscriptReady: (transcript: string) => {
      console.log('🎤 Voice transcript received:', transcript);
      
      // Parse the German voice input
      const parsed = parseGermanVoiceEntry(transcript);
      console.log('🧠 Parsed voice data:', parsed);
      
      // Convert parsed data to QuickEntry format
      const voiceData = convertToQuickEntryData(parsed);
      console.log('📱 Converted for QuickEntry:', voiceData);
      
      setIsListening(false);
      options.onParsed?.(voiceData);
    },
    onError: (error: string) => {
      console.error('🚨 Voice recognition error:', error);
      setIsListening(false);
      options.onError?.(error);
    }
  });

  const startVoiceEntry = async () => {
    try {
      setIsListening(true);
      await speechRecognition.startRecording();
    } catch (error) {
      setIsListening(false);
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      options.onError?.(message);
    }
  };

  const stopVoiceEntry = () => {
    speechRecognition.stopRecording();
    setIsListening(false);
  };

  return {
    startVoiceEntry,
    stopVoiceEntry,
    isListening,
    speechState: speechRecognition.state
  };
}

function convertToQuickEntryData(parsed: ParsedVoiceEntry): VoiceTriggerData {
  // Convert pain level to numeric (0-10)
  let painLevel = 0;
  if (parsed.painLevel) {
    const numericPain = parseInt(parsed.painLevel);
    if (!isNaN(numericPain) && numericPain >= 0 && numericPain <= 10) {
      painLevel = numericPain;
    } else {
      // Convert category to numeric
      switch (parsed.painLevel.toLowerCase()) {
        case 'leicht': painLevel = 2; break;
        case 'mittel': painLevel = 5; break;
        case 'stark': painLevel = 7; break;
        case 'sehr_stark': painLevel = 9; break;
        default: painLevel = 0;
      }
    }
  }

  // Determine time selection
  let selectedTime = 'jetzt';
  let customDate: string | undefined;
  let customTime: string | undefined;

  if (parsed.isNow) {
    selectedTime = 'jetzt';
  } else if (parsed.selectedDate && parsed.selectedTime) {
    // Check if it's today
    const today = new Date().toISOString().split('T')[0];
    if (parsed.selectedDate === today) {
      // Check if time matches predefined options
      const now = new Date();
      const entryTime = new Date(`${parsed.selectedDate}T${parsed.selectedTime}`);
      const diffMinutes = (now.getTime() - entryTime.getTime()) / (1000 * 60);
      
      if (Math.abs(diffMinutes - 15) < 5) {
        selectedTime = '15min';
      } else if (Math.abs(diffMinutes - 30) < 5) {
        selectedTime = '30min';
      } else if (Math.abs(diffMinutes - 60) < 5) {
        selectedTime = '1h';
      } else if (Math.abs(diffMinutes - 120) < 10) {
        selectedTime = '2h';
      } else {
        // Use custom time
        selectedTime = 'custom';
        customTime = parsed.selectedTime;
      }
    } else {
      // Different date - use custom
      selectedTime = 'custom';
      customDate = parsed.selectedDate;
      customTime = parsed.selectedTime;
    }
  }

  // Convert medications to states object
  const medicationStates: Record<string, boolean> = {};
  if (parsed.medications && parsed.medications.length > 0) {
    parsed.medications.forEach(med => {
      // Extract medication name (remove dosage)
      const medName = med.replace(/\s+\d+\s*mg.*$/i, '').trim();
      medicationStates[medName] = true;
    });
  }

  return {
    painLevel,
    selectedTime,
    customDate,
    customTime,
    medicationStates,
    notes: parsed.notes || undefined
  };
}