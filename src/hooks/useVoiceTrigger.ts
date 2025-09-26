import { useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { parseGermanVoiceEntry, type ParsedVoiceEntry } from '@/lib/voice/germanParser';
import { useMeds } from '@/features/meds/hooks/useMeds';

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
  const [remainingSeconds, setRemainingSeconds] = useState<number | undefined>();
  const { data: userMeds } = useMeds();

  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    continuous: true,
    interimResults: true,
    pauseThreshold: 3,
    onTranscriptReady: (transcript: string) => {
      console.log('🎤 Voice transcript received:', transcript);
      
      // Parse the German voice input
      const parsed = parseGermanVoiceEntry(transcript);
      console.log('🧠 Parsed voice data:', parsed);
      
      // Convert parsed data to QuickEntry format with dynamic meds
      const voiceData = convertToQuickEntryData(parsed, userMeds || []);
      console.log('📱 Converted for QuickEntry:', voiceData);
      
      setIsListening(false);
      setRemainingSeconds(undefined);
      options.onParsed?.(voiceData);
    },
    onError: (error: string) => {
      console.error('🚨 Voice recognition error:', error);
      setIsListening(false);
      setRemainingSeconds(undefined);
      options.onError?.(error);
    },
    onPauseDetected: (seconds: number) => {
      setRemainingSeconds(seconds);
    }
  });

  const startVoiceEntry = async () => {
    try {
      setIsListening(true);
      setRemainingSeconds(undefined);
      await speechRecognition.startRecording();
    } catch (error) {
      setIsListening(false);
      setRemainingSeconds(undefined);
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      options.onError?.(message);
    }
  };

  const stopVoiceEntry = () => {
    speechRecognition.stopRecording();
    setIsListening(false);
    setRemainingSeconds(undefined);
  };

  return {
    startVoiceEntry,
    stopVoiceEntry,
    isListening,
    remainingSeconds,
    speechState: speechRecognition.state
  };
}

// Fuzzy medication matching helper
function findBestMedicationMatch(spokenMed: string, userMeds: any[]): any | null {
  const normalizedSpoken = spokenMed.toLowerCase().trim();
  console.log('🔍 Finding match for:', normalizedSpoken, 'in:', userMeds.map(m => m.name));
  
  // Exact match first
  for (const med of userMeds) {
    if (med.name.toLowerCase() === normalizedSpoken) {
      return med;
    }
  }
  
  // Partial match (spoken word contains medication name or vice versa)
  for (const med of userMeds) {
    const medName = med.name.toLowerCase();
    if (normalizedSpoken.includes(medName) || medName.includes(normalizedSpoken)) {
      return med;
    }
  }
  
  // Common abbreviations and alternative names
  const abbreviations: Record<string, string[]> = {
    'ibu': ['ibuprofen'],
    'suma': ['sumatriptan'],
    'para': ['paracetamol'],
    'asp': ['aspirin'],
    'riza': ['rizatriptan'],
    'almo': ['almotriptan'],
    'nara': ['naratriptan']
  };
  
  for (const [abbrev, fullNames] of Object.entries(abbreviations)) {
    if (normalizedSpoken.includes(abbrev)) {
      for (const fullName of fullNames) {
        const matchedMed = userMeds.find(med => 
          med.name.toLowerCase().includes(fullName)
        );
        if (matchedMed) return matchedMed;
      }
    }
  }
  
  return null;
}

function convertToQuickEntryData(parsed: ParsedVoiceEntry, userMeds: any[] = []): VoiceTriggerData {
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
      // Check if time matches predefined options (simplified to 2 options now)
      const now = new Date();
      const entryTime = new Date(`${parsed.selectedDate}T${parsed.selectedTime}`);
      const diffMinutes = (now.getTime() - entryTime.getTime()) / (1000 * 60);
      
      // Smart rounding for "vor X minuten" -> closest option or custom
      if (Math.abs(diffMinutes - 60) < 30) { // within 30 min of 1 hour
        selectedTime = '1h';
      } else {
        // Use custom time for any other time difference
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

  // Convert medications to states object with fuzzy matching
  const medicationStates: Record<string, boolean> = {};
  if (parsed.medications && parsed.medications.length > 0 && userMeds.length > 0) {
    parsed.medications.forEach(spokenMed => {
      console.log('🔍 Matching spoken medication:', spokenMed);
      
      // Extract medication name (remove dosage)
      const cleanSpokenMed = spokenMed.replace(/\s+\d+\s*mg.*$/i, '').trim().toLowerCase();
      
      // Find best match in user's medication list
      const matchedMed = findBestMedicationMatch(cleanSpokenMed, userMeds);
      if (matchedMed) {
        console.log('✅ Matched medication:', matchedMed.name);
        medicationStates[matchedMed.name] = true;
      } else {
        console.log('❌ No match found for:', cleanSpokenMed);
      }
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