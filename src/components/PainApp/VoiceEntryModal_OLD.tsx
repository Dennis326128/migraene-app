import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Play, Square, Edit3, Save, X, Trash2, Settings, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseGermanVoiceEntry, getMissingSlots, type ParsedVoiceEntry, convertNumberWords } from "@/lib/voice/germanParser";
import { useCreateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";
import { TTSEngine } from "@/lib/voice/ttsEngine";
import { SlotFillingDialog } from "./SlotFillingDialog";
import { berlinDateToday } from "@/lib/tz";
import { createTraceLogger, type VoiceTraceLogger } from "@/lib/voice/traceLogger";

interface VoiceEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type RecordingState = 'idle' | 'warmup' | 'recording' | 'processing' | 'reviewing' | 'fallback' | 'slot_filling' | 'confirming';

type ErrorType = 'stt_no_audio' | 'parse_missing_fields' | 'save_error' | 'audio_permission' | 'network_error';

interface SlotFillingState {
  missingSlots: ('time' | 'pain' | 'meds')[];
  currentSlotIndex: number;
  collectedData: Partial<ParsedVoiceEntry>;
  slotTimeout?: NodeJS.Timeout;
}

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export function VoiceEntryModal({ open, onClose, onSuccess }: VoiceEntryModalProps) {
  const { toast } = useToast();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [parsedEntry, setParsedEntry] = useState<ParsedVoiceEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [directSaveMode, setDirectSaveMode] = useState(false);
  
  // Manual editing states
  const [editedDate, setEditedDate] = useState('');
  const [editedTime, setEditedTime] = useState('');
  const [editedPainLevel, setEditedPainLevel] = useState('');
  const [editedMedications, setEditedMedications] = useState<string[]>([]);
  const [editedNotes, setEditedNotes] = useState('');
  
  // STT robustness states
  const [restartCount, setRestartCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('default');
  const [showDebug, setShowDebug] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  // Slot-filling and TTS states
  const [slotFillingState, setSlotFillingState] = useState<SlotFillingState>({
    missingSlots: [],
    currentSlotIndex: 0,
    collectedData: {}
  });
  const [currentError, setCurrentError] = useState<ErrorType | null>(null);
  const [spokenText, setSpokenText] = useState('');
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);
  
  // Trace logging
  const [traceLogger, setTraceLogger] = useState<VoiceTraceLogger | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const warmupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ttsEngineRef = useRef<TTSEngine | null>(null);
  const createEntryMutation = useCreateEntry();
  const { data: availableMeds = [] } = useMeds();

  // Initialize TTS engine
  useEffect(() => {
    ttsEngineRef.current = new TTSEngine();
    return () => {
      ttsEngineRef.current?.stopSpeaking();
    };
  }, []);

  const painLevels = [
    { value: "leicht", label: "💚 Leichte Migräne (2/10)" },
    { value: "mittel", label: "💛 Mittlere Migräne (5/10)" },
    { value: "stark", label: "🟠 Starke Migräne (7/10)" },
    { value: "sehr_stark", label: "🔴 Sehr starke Migräne (9/10)" },
  ];

  const getPainLevelDisplay = (level: string) => {
    // If it's a direct number (0-10), show it dynamically
    if (/^\d+$/.test(level)) {
      const num = parseInt(level);
      if (num >= 0 && num <= 10) {
        const emoji = num >= 8 ? '🔴' : num >= 6 ? '🟠' : num >= 4 ? '💛' : '💚';
        return `${emoji} Migräne (${num}/10)`;
      }
    }
    // Fallback to predefined categories
    return painLevels.find(p => p.value === level)?.label || level;
  };

  useEffect(() => {
    if (!open) {
      // Reset all states when modal closes
      setRecordingState('idle');
      setTranscript('');
      setParsedEntry(null);
      setIsEditing(false);
      setRestartCount(0);
      setDebugLog([]);
      setDirectSaveMode(false);
      stopRecording();
      cleanup();
    } else {
      // Load available devices and preferences when modal opens
      loadAudioDevices();
      loadPreferences();
    }
  }, [open]);

  // Update editing states when parsed entry changes
  // Handle voice-finished with proper error taxonomy and slot-filling
  const handleRecognitionEnd = (finalTranscript?: string) => {
    // Prioritize transcript state when available, as finalTranscript can be empty due to race conditions
    const workingTranscript = (transcript && transcript.trim()) ? transcript : (finalTranscript || '');
    addDebugLog(`Recognition ended. Final transcript: "${workingTranscript}" (from ${finalTranscript ? 'event' : 'state'}). Direct save mode: ${directSaveMode}`);
    
    // Complete STT step in trace
    if (traceLogger) {
      if (!workingTranscript || workingTranscript.trim() === '') {
        traceLogger.addStep('STT', 'failed', { 
          transcript: workingTranscript || '',
          reason: 'no_speech_detected',
          source: finalTranscript ? 'event' : 'state',
          directSaveMode
        }, 'Keine Sprache erkannt');
      } else {
        traceLogger.addStep('STT', 'completed', { 
          transcript: workingTranscript,
          length: workingTranscript.length,
          source: finalTranscript ? 'event' : 'state',
          directSaveMode,
          alternatives: 'not_available' // could be enhanced with alternatives from recognition event
        });
      }
    }
    
    // In direct save mode, skip auto-restart and error handling
    if (directSaveMode) {
      addDebugLog('🚀 Direct save mode: Processing whatever text we have...');
      setDirectSaveMode(false); // Reset for next time
      
      // Even with empty transcript, try to process - user can edit manually
      if (!workingTranscript || workingTranscript.trim() === '') {
        addDebugLog('🚀 No transcript in direct save mode - creating empty entry for manual editing');
        // Create minimal entry for manual editing
        const minimalEntry: ParsedVoiceEntry = {
          selectedDate: berlinDateToday(),
          selectedTime: '',
          painLevel: '',
          medications: [],
          notes: '',
          isNow: true,
          confidence: { time: 'high', pain: 'low', meds: 'high' }
        };
        setParsedEntry(minimalEntry);
        setRecordingState('reviewing');
        return;
      }
      // Continue with normal processing below for non-empty transcript
    } else {
      // Normal mode: Auto-restart logic from original function
      if (restartCount < 2 && recordingState === 'recording' && !workingTranscript.trim()) {
        // Auto-restart for no-speech
        addDebugLog('Auto-restarting due to no speech detected');
        return;
      }
      
      if (!workingTranscript || workingTranscript.trim() === '') {
        setCurrentError('stt_no_audio');
        handleError('stt_no_audio', `DEBUG: finalTranscript: "${finalTranscript || ''}" (${(finalTranscript || '').length}), transcript state: "${transcript}" (${transcript.length}) → verwendet: "${workingTranscript}" - Keine verwertbare Sprache erkannt.`);
        return;
      }
    }

    try {
      setRecordingState('processing');
      
      // Start parser step in trace
      traceLogger?.addStep('PARSER', 'started', { 
        inputText: workingTranscript,
        textLength: workingTranscript.length
      });
      
      const parsed = parseGermanVoiceEntry(workingTranscript);
      setParsedEntry(parsed);
      addDebugLog(`Parsed: Pain=${parsed.painLevel}, Meds=${parsed.medications?.join(',') || 'none'}`);
      
      // Complete parser step
      traceLogger?.addStep('PARSER', 'completed', {
        parsedTime: { date: parsed.selectedDate, time: parsed.selectedTime, isNow: parsed.isNow },
        parsedPain: parsed.painLevel,
        parsedMeds: parsed.medications,
        parsedNotes: parsed.notes,
        confidence: parsed.confidence,
        missingSlots: getMissingSlots(parsed)
      });
      
      // Handle confirmation responses if we're in confirming state
      if (recordingState === 'confirming') {
        handleConfirmationResponse(workingTranscript);
        return;
      }
      
      // Handle slot-filling responses if we're in slot-filling state
      if (recordingState === 'slot_filling') {
        handleSlotResponse(workingTranscript);
        return;
      }
      
      // Check for missing required fields for new entries
      const missingSlots = getMissingSlots(parsed);
      
      // Enhanced debugging
      addDebugLog(`=== SLOT ANALYSIS ===`);
      addDebugLog(`Parsed Pain Level: "${parsed.painLevel}"`);
      addDebugLog(`Parsed isNow: ${parsed.isNow}`);
      addDebugLog(`Parsed Date: "${parsed.selectedDate}"`);
      addDebugLog(`Parsed Time: "${parsed.selectedTime}"`);
      addDebugLog(`Missing slots: ${missingSlots.join(', ') || 'NONE'}`);
      addDebugLog(`Confidence: Time=${parsed.confidence.time}, Pain=${parsed.confidence.pain}, Meds=${parsed.confidence.meds}`);
      addDebugLog(`Direct save mode was: ${directSaveMode}`);
      addDebugLog(`=================`);
      
      // In direct save mode, skip slot-filling and go directly to review for manual editing
      if (directSaveMode) {
        addDebugLog('🚀 Direct save mode: Skipping slot-filling, going to review for manual editing');
        setRecordingState('reviewing');
      } else if (missingSlots.length > 0) {
        addDebugLog(`🚨 Starting slot-filling for missing: ${missingSlots.join(', ')}`);
        // Start slot-filling dialog instead of showing error
        setCurrentError('parse_missing_fields');
        setSlotFillingState({
          missingSlots,
          currentSlotIndex: 0,
          collectedData: parsed
        });
        setRecordingState('slot_filling');
        startSlotFilling(missingSlots[0], parsed);
      } else {
        addDebugLog('✅ All required data available, going to review mode');
        // All required data present, go to review
        setRecordingState('reviewing');
      }
      
    } catch (error) {
      traceLogger?.addStep('PARSER', 'failed', { error: error.message }, error.message);
      setCurrentError('save_error');
      handleError('save_error', 'Fehler beim Verarbeiten der Spracheingabe');
    }
  };

  // Start slot-filling process with TTS
  const startSlotFilling = async (slot: 'time' | 'pain' | 'meds', currentData: ParsedVoiceEntry) => {
    const tts = ttsEngineRef.current;
    if (!tts) return;

    try {
      // Stop any current speech recognition
      stopRecording();
      
      setIsTTSSpeaking(true);
      
      const summary = generateSummary(currentData);
      let questionText = '';
      
      switch (slot) {
        case 'time':
          questionText = `Ich habe verstanden: ${summary}. Für wann soll ich den Eintrag speichern? Soll ich jetzt nehmen?`;
          break;
        case 'pain':
          questionText = `Ich habe verstanden: ${summary}. Welche Schmerzstufe von 0 bis 10?`;
          break;
        case 'meds':
          questionText = `Ich habe verstanden: ${summary}. Hast du ein Medikament genommen? Wenn ja, welches und welche Dosis?`;
          break;
      }
      
      setSpokenText(questionText);
      
      await tts.speak(questionText, {
        onEnd: () => {
          setIsTTSSpeaking(false);
          // Resume recording for answer after 500ms delay
          setTimeout(() => {
            startRecording();
            // Set timeout for slot response (10 seconds)
            const timeout = setTimeout(() => {
              showSlotFallbackUI();
            }, 10000);
            setSlotFillingState(prev => ({
              ...prev,
              slotTimeout: timeout
            }));
          }, 500);
        },
        onError: () => {
          setIsTTSSpeaking(false);
          // Fallback to UI immediately if TTS fails
          showSlotFallbackUI();
        }
      });
      
    } catch (error) {
      console.error('TTS Error:', error);
      setIsTTSSpeaking(false);
      showSlotFallbackUI();
    }
  };

  // Show fallback UI when voice doesn't work
  const showSlotFallbackUI = () => {
    // Clear any slot timeout
    if (slotFillingState.slotTimeout) {
      clearTimeout(slotFillingState.slotTimeout);
    }
    // UI will show the SlotFillingDialog component
  };

  // Handle slot-filling responses
  const handleSlotResponse = (response: string) => {
    const currentSlot = slotFillingState.missingSlots[slotFillingState.currentSlotIndex];
    const updatedData = { ...slotFillingState.collectedData };
    
    // Parse the response based on slot type
    switch (currentSlot) {
      case 'time':
        if (response.toLowerCase().includes('jetzt') || response === 'now') {
          updatedData.isNow = true;
          updatedData.selectedDate = berlinDateToday();
          updatedData.selectedTime = '';
        } else {
          // Parse time response (implement based on quick select values)
          parseTimeSlotResponse(response, updatedData);
        }
        break;
      case 'pain':
        updatedData.painLevel = response.match(/\d+/)?.[0] || response;
        break;
      case 'meds':
        if (response.toLowerCase().includes('keine') || response === 'none') {
          updatedData.medications = [];
        } else {
          updatedData.medications = [response];
        }
        break;
    }
    
    // Update confidence for filled slot
    if (updatedData.confidence) {
      updatedData.confidence[currentSlot] = 'high';
    }
    
    // Move to next slot or finish
    const nextIndex = slotFillingState.currentSlotIndex + 1;
    if (nextIndex < slotFillingState.missingSlots.length) {
      setSlotFillingState({
        ...slotFillingState,
        currentSlotIndex: nextIndex,
        collectedData: updatedData
      });
      startSlotFilling(slotFillingState.missingSlots[nextIndex], updatedData as ParsedVoiceEntry);
    } else {
      // All slots filled, go to confirmation
      setParsedEntry(updatedData as ParsedVoiceEntry);
      startConfirmation(updatedData as ParsedVoiceEntry);
    }
  };

  // Parse time slot responses
  const parseTimeSlotResponse = (response: string, data: any) => {
    const now = new Date();
    
    if (response === '30min_ago') {
      const targetTime = new Date(now.getTime() - 30 * 60 * 1000);
      data.selectedDate = targetTime.toISOString().split('T')[0];
      data.selectedTime = targetTime.toTimeString().slice(0, 5);
    } else if (response === '1hour_ago') {
      const targetTime = new Date(now.getTime() - 60 * 60 * 1000);
      data.selectedDate = targetTime.toISOString().split('T')[0];
      data.selectedTime = targetTime.toTimeString().slice(0, 5);
    } else if (response === '2hours_ago') {
      const targetTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      data.selectedDate = targetTime.toISOString().split('T')[0];
      data.selectedTime = targetTime.toTimeString().slice(0, 5);
    } else if (response === 'yesterday_17') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      data.selectedDate = yesterday.toISOString().split('T')[0];
      data.selectedTime = '17:00';
    }
  };

  // Start confirmation process
  const startConfirmation = async (finalData: ParsedVoiceEntry) => {
    const tts = ttsEngineRef.current;
    if (!tts) {
      setRecordingState('reviewing');
      return;
    }

    setRecordingState('confirming');
    const summary = generateSummary(finalData);
    const confirmText = `Okay. ${summary}. Speichern?`;
    
    setIsTTSSpeaking(true);
    setSpokenText(confirmText);
    
    try {
      await tts.speak(confirmText, {
        onEnd: () => {
          setIsTTSSpeaking(false);
          // Start listening for "ja"/"nein" response
          setTimeout(() => startRecording(), 500);
        },
        onError: () => {
          setIsTTSSpeaking(false);
          setRecordingState('reviewing');
        }
      });
    } catch (error) {
      setIsTTSSpeaking(false);
      setRecordingState('reviewing');
    }
  };

  // Generate summary for TTS
  const generateSummary = (data: ParsedVoiceEntry): string => {
    const parts: string[] = [];
    
    if (data.isNow) {
      parts.push('jetzt');
    } else if (data.selectedDate && data.selectedTime) {
      parts.push(`${data.selectedDate} um ${data.selectedTime}`);
    }
    
    if (data.painLevel) {
      parts.push(`Schmerz ${data.painLevel}`);
    }
    
    if (data.medications && data.medications.length > 0) {
      parts.push(data.medications.join(', '));
    } else {
      parts.push('keine Medikamente');
    }
    
    return parts.join(', ');
  };

  // Handle confirmation responses
  const handleConfirmationResponse = (transcript: string) => {
    const response = transcript.toLowerCase();
    
    if (response.includes('ja') || response.includes('speichern') || response.includes('genau')) {
      handleSave();
    } else if (response.includes('nein') || response.includes('zurück') || response.includes('ändern')) {
      setRecordingState('reviewing');
    }
  };

  // Enhanced error handling with proper taxonomy
  const handleError = (errorType: ErrorType, message: string) => {
    setCurrentError(errorType);
    
    switch (errorType) {
      case 'stt_no_audio':
        toast({
          title: "Mikrofon-Problem",
          description: message,
          variant: "destructive"
        });
        // Go to fallback mode, don't close modal
        setRecordingState('fallback');
        break;
        
      case 'parse_missing_fields':
        // Don't show error toast, this triggers slot-filling
        break;
        
      case 'audio_permission':
        toast({
          title: "Mikrofon blockiert",
          description: "Bitte erlauben Sie den Mikrofon-Zugriff in den Browser-Einstellungen.",
          variant: "destructive"
        });
        setRecordingState('fallback');
        break;
        
      case 'save_error':
      case 'network_error':
        toast({
          title: "Fehler",
          description: message,
          variant: "destructive"
        });
        break;
    }
  };

  // Update the existing handleRecognitionEnd in the warmup/recording section
  useEffect(() => {
    if (parsedEntry) {
      setEditedDate(parsedEntry.selectedDate);
      setEditedTime(parsedEntry.selectedTime);
      setEditedPainLevel(parsedEntry.painLevel);
      setEditedMedications([...parsedEntry.medications]);
      setEditedNotes(parsedEntry.notes);
    }
  }, [parsedEntry]);

  const addDebugLog = (message: string) => {
    setDebugLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const loadAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAvailableDevices(audioInputs);
      addDebugLog(`Found ${audioInputs.length} audio input devices`);
    } catch (error) {
      addDebugLog(`Device enumeration failed: ${error}`);
    }
  };

  const loadPreferences = () => {
    const savedDevice = localStorage.getItem('voice-preferred-device');
    if (savedDevice) setSelectedDevice(savedDevice);
  };

  const savePreferences = () => {
    localStorage.setItem('voice-preferred-device', selectedDevice);
  };

  const setupAudioMonitoring = async (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      source.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (analyserRef.current && recordingState === 'recording') {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
      addDebugLog('Audio monitoring setup complete');
    } catch (error) {
      addDebugLog(`Audio monitoring failed: ${error}`);
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (warmupTimeoutRef.current) {
      clearTimeout(warmupTimeoutRef.current);
      warmupTimeoutRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Spracherkennung nicht unterstützt",
        description: "Ihr Browser unterstützt keine Spracherkennung. Bitte verwenden Sie Chrome oder Edge.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Initialize trace logging for new session
      if (!traceLogger) {
        const logger = createTraceLogger();
        setTraceLogger(logger);
        logger.addStep('STT', 'started', { 
          deviceId: selectedDevice,
          userAgent: navigator.userAgent.substring(0, 100)
        });
      }

      setRecordingState('warmup');
      addDebugLog('Starting audio warmup...');
      
      // Audio warmup - get user media first
      const constraints = {
        audio: {
          deviceId: selectedDevice !== 'default' ? { exact: selectedDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Setup audio monitoring
      await setupAudioMonitoring(stream);
      
      // Warmup delay
      warmupTimeoutRef.current = setTimeout(() => {
        initializeSpeechRecognition();
      }, 500);
      
    } catch (error) {
      traceLogger?.addStep('STT', 'failed', { error: error.message }, error.message);
      addDebugLog(`getUserMedia failed: ${error}`);
      handleAudioError(error);
    }
  };

  const initializeSpeechRecognition = async () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'de-DE';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;

      // Grammar biasing (Chrome only, partial support)
      try {
        const grammar = createGrammar();
        if (grammar) {
          recognition.grammars = grammar;
          addDebugLog('Grammar biasing applied');
        }
      } catch (e) {
        addDebugLog('Grammar biasing not supported');
      }

      recognition.onstart = () => {
        setRecordingState('recording');
        setTranscript('');
        addDebugLog('🎙️ Speech recognition started');
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        let confidence = 0;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          confidence = Math.max(confidence, event.results[i][0].confidence || 0);
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const fullTranscript = finalTranscript + interimTranscript;
        setTranscript(fullTranscript);
        addDebugLog(`Transcript (conf: ${confidence.toFixed(2)}): ${fullTranscript.slice(0, 50)}...`);
        
        // Store both final and full transcript in ref for use in onend
        if (finalTranscript) {
          recognitionRef.current.finalTranscript = finalTranscript;
        }
        // Always store the full transcript (includes interim text)
        recognitionRef.current.fullTranscript = fullTranscript;
        addDebugLog(`📝 Stored in ref - final: "${finalTranscript}" (${finalTranscript.length}), full: "${fullTranscript}" (${fullTranscript.length})`);
      };

      recognition.onerror = (event) => {
        addDebugLog(`🎙️ Speech error: ${event.error}`);
        handleRecognitionError(event.error);
      };

      recognition.onend = () => {
        addDebugLog('🎙️ Recognition ended');
        // Prioritize full transcript (includes interim), then final transcript as fallback
        const fullFromRef = recognitionRef.current?.fullTranscript || '';
        const finalFromRef = recognitionRef.current?.finalTranscript || '';
        const eventTranscript = fullFromRef || finalFromRef;
        addDebugLog(`📖 Reading from ref - full: "${fullFromRef}" (${fullFromRef.length}), final: "${finalFromRef}" (${finalFromRef.length}) → using: "${eventTranscript}"`);
        handleRecognitionEnd(eventTranscript);
      };

      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (error) {
      addDebugLog(`Recognition init failed: ${error}`);
      handleAudioError(error);
    }
  };

  const createGrammar = () => {
    try {
      if (!(window as any).SpeechGrammarList) return null;
      
      const grammarList = new (window as any).SpeechGrammarList();
      const medications = availableMeds.map(med => med.name).join(' | ');
      const numbers = Array.from({length: 11}, (_, i) => i).join(' | ');
      const timeWords = 'heute | gestern | vorgestern | vor | minuten | stunden | uhr';
      
      const grammar = `#JSGF V1.0; grammar migraine; public <entry> = <pain> | <medication> | <time>; <pain> = schmerz | migräne | kopfschmerz (${numbers}); <medication> = ${medications}; <time> = ${timeWords};`;
      
      grammarList.addFromString(grammar, 1);
      return grammarList;
    } catch (e) {
      return null;
    }
  };

  const handleRecognitionError = (error: string) => {
    switch (error) {
      case 'no-speech':
        if (restartCount < 2) {
          addDebugLog(`No speech detected, restarting (${restartCount + 1}/2)...`);
          setRestartCount(prev => prev + 1);
          setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 250 * (restartCount + 1));
          return;
        } else {
          setRecordingState('fallback');
          toast({
            title: "Spracherkennung schwierig",
            description: "Versuchen Sie Push-to-Talk oder nutzen Sie die Schnell-Bausteine.",
            variant: "default"
          });
        }
        break;
        
      case 'audio-capture':
        toast({
          title: "Kein Mikrofon gefunden",
          description: "Anderes Programm nutzt es? Bitte Gerät wählen.",
          variant: "destructive"
        });
        setRecordingState('fallback');
        break;
        
      case 'not-allowed':
        toast({
          title: "Mikrofon blockiert",
          description: "Berechtigung in Browser/OS-Einstellungen aktivieren.",
          variant: "destructive"
        });
        setRecordingState('fallback');
        break;
        
      default:
        setRecordingState('idle');
        toast({
          title: "Sprachfehler",
          description: "Unbekannter Fehler. Bitte erneut versuchen.",
          variant: "destructive"
        });
    }
  };


  const handleAudioError = (error: any) => {
    setRecordingState('fallback');
    addDebugLog(`Audio error: ${error.message || error}`);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!parsedEntry && !isEditing) return;
    
    const finalEntry = isEditing ? {
      selectedDate: editedDate,
      selectedTime: editedTime,
      painLevel: editedPainLevel,
      medications: editedMedications.filter(m => m.trim()),
      notes: editedNotes,
      isNow: false
    } : parsedEntry!;
    
    if (!finalEntry.painLevel) {
      toast({
        title: "Fehlender Schmerzwert",
        description: "Bitte wählen Sie eine Schmerzstärke aus.",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    
    // Start DTO preparation in trace
    traceLogger?.addStep('DTO', 'started', { 
      rawEntry: finalEntry,
      isEditing
    });

    try {
      // Fix time handling - ensure we have proper date/time
      let selectedDate = finalEntry.selectedDate;
      let selectedTime = finalEntry.selectedTime;
      
      // Handle isNow case - set current date/time
      if (finalEntry.isNow || !selectedDate || !selectedTime) {
        const now = new Date();
        selectedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
        selectedTime = now.toTimeString().slice(0, 5);  // HH:MM
        console.log(`🕒 Voice Entry: Using current time ${selectedDate} ${selectedTime}`);
      }
      
      // Pain level is already numeric from parser (0-10 as string)
      // No conversion needed - store directly as numeric string
      console.log(`🎯 Voice Entry: Using numeric pain level directly: ${finalEntry.painLevel}`);
      
      // Prepare DTO payload
      const dtoPayload = {
        user_id: "auth.uid()", // Will be set by API
        timestamp_created: new Date().toISOString(),
        selected_date: selectedDate,
        selected_time: selectedTime,
        pain_level: finalEntry.painLevel, // Now storing numeric values directly
        medications: Array.isArray(finalEntry.medications) ? finalEntry.medications : [finalEntry.medications].filter(Boolean),
        notes: finalEntry.notes?.trim() || "",
        latitude: null as number | null,
        longitude: null as number | null,
        weather_id: null as number | null
      };
      
      traceLogger?.addStep('DTO', 'completed', dtoPayload);
      
      // Capture GPS coordinates (non-blocking)
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 8000 
        });
        dtoPayload.latitude = pos.coords.latitude;
        dtoPayload.longitude = pos.coords.longitude;
        console.log('📍 Voice Entry: GPS coordinates captured');
      } catch (gpsError) {
        console.warn('📍 Voice Entry: GPS failed, will use fallback', gpsError);
      }
      
      // Start weather step (non-blocking)
      traceLogger?.addStep('WEATHER', 'started', { 
        coords: dtoPayload.latitude ? `${dtoPayload.latitude},${dtoPayload.longitude}` : 'fallback'
      });
      
      // Capture weather data (non-blocking - don't let it fail the save)
      const weatherPromise = (async () => {
        try {
          const atISO = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
          if (dtoPayload.latitude && dtoPayload.longitude) {
            return await logAndSaveWeatherAtCoords(atISO, dtoPayload.latitude, dtoPayload.longitude);
          } else {
            return await logAndSaveWeatherAt(atISO);
          }
        } catch (weatherError) {
          traceLogger?.addStep('WEATHER', 'failed', { error: weatherError.message }, weatherError.message);
          console.warn('Weather data fetch failed:', weatherError);
          return null;
        }
      })();

      // Start DB insert
      traceLogger?.addStep('DB_INSERT', 'started', {
        payload: {
          ...dtoPayload,
          medications_count: dtoPayload.medications.length
        }
      });

      // Create the entry using the same system as form entries
      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTime,
        pain_level: finalEntry.painLevel, // Store numeric value directly
        aura_type: "keine" as const,
        pain_location: null,
        medications: dtoPayload.medications,
        notes: dtoPayload.notes || null,
        weather_id: null, // Will be updated after weather call
        latitude: dtoPayload.latitude,
        longitude: dtoPayload.longitude,
      };

      const entryId = await createEntryMutation.mutateAsync(payload as any);
      
      traceLogger?.addStep('DB_INSERT', 'completed', { 
        entryId,
        insertedPayload: payload
      });

      // Wait for weather and update if successful (optional)
      try {
        const weatherId = await weatherPromise;
        if (weatherId) {
          traceLogger?.addStep('WEATHER', 'completed', { weatherId });
          console.log(`🌤️ Voice Entry: Weather logged with ID ${weatherId}`);
        }
      } catch (weatherError) {
        // Weather errors shouldn't fail the save
        console.warn('Weather update failed after save:', weatherError);
      }

      toast({
        title: "✅ Spracheintrag gespeichert",
        description: "Ihr Migräne-Eintrag wurde erfolgreich über Sprache erfasst."
      });

      onSuccess?.();
      onClose();
      
    } catch (error) {
      traceLogger?.addStep('DB_INSERT', 'failed', { 
        error: error.message,
        errorDetails: error 
      }, error.message);
      
      console.error('Voice entry save error:', error);
      
      // More specific error messages based on error type
      let errorTitle = "❌ Fehler beim Speichern";
      let errorDescription = "Bitte versuchen Sie es erneut.";
      
      if (error.message?.includes('violates row-level security')) {
        errorTitle = "🔒 Berechtigungsfehler";
        errorDescription = "Authentifizierung fehlgeschlagen. Bitte melden Sie sich erneut an.";
      } else if (error.message?.includes('not null violation')) {
        errorTitle = "📝 Daten unvollständig";
        errorDescription = "Erforderliche Felder fehlen. Bitte überprüfen Sie Ihre Eingaben.";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const removeMedication = (index: number) => {
    setEditedMedications(prev => prev.filter((_, i) => i !== index));
  };

  const addMedication = (med: string) => {
    if (med.trim() && !editedMedications.includes(med.trim())) {
      setEditedMedications(prev => [...prev, med.trim()]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🎙️ Sprach-Eintrag
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {recordingState === 'idle' && (
            <div className="text-center space-y-4">
              {/* Device Selection */}
              {availableDevices.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-xs">Mikrofon wählen</Label>
                  <Select value={selectedDevice} onValueChange={(value) => {
                    setSelectedDevice(value);
                    savePreferences();
                  }}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Standard-Mikrofon</SelectItem>
                      {availableDevices.map((device) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Mikrofon ${device.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Sprechen Sie Ihren Migräne-Eintrag auf Deutsch:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>💡 <strong>Beispiele:</strong></p>
                <p>"Ich habe Schmerzstufe 8 und Sumatriptan 50 genommen"</p>
                <p>"Vor 30 Minuten Schmerz 6, Ibuprofen 400"</p>
                <p>"Gestern um 17 Uhr 7/10, kein Medikament"</p>
                <p>"Die letzte Tablette hat mittel geholfen"</p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={startRecording}
                  size="lg"
                  className="w-full"
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Aufnahme starten
                </Button>
                
                {isPushToTalk && (
                  <Button 
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onMouseDown={startRecording}
                    onMouseUp={() => {
                      setDirectSaveMode(true);
                      stopRecording();
                    }}
                    onTouchStart={startRecording}
                    onTouchEnd={() => {
                      setDirectSaveMode(true);
                      stopRecording();
                    }}
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Halten zum Sprechen
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowDebug(!showDebug)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <div className="text-xs text-muted-foreground">
                  Alternativ: Schnell-Eingabe verwenden
                </div>
              </div>
            </div>
          )}

          {(recordingState === 'warmup' || recordingState === 'recording') && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">
                  {recordingState === 'warmup' ? 'Mikrofon wird vorbereitet...' : 'Aufnahme läuft...'}
                </span>
              </div>
              
              {/* Audio Level Indicator */}
              {recordingState === 'recording' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 justify-center">
                    <Volume2 className="w-4 h-4" />
                    <Progress value={audioLevel} className="w-32" />
                  </div>
                  {audioLevel < 10 && (
                    <div className="text-xs text-yellow-600">
                      ⚠️ Sehr leise - sprechen Sie näher ans Mikrofon
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-4 bg-secondary/50 rounded-lg min-h-[60px]">
                <p className="text-sm">{transcript || "Sprechen Sie jetzt..."}</p>
              </div>
              
               <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    setDirectSaveMode(true);
                    stopRecording();
                  }}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Aufnahme beenden
                </Button>
                {restartCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Restart {restartCount}/2
                  </Badge>
                )}
              </div>
            </div>
          )}

          {recordingState === 'processing' && (
            <div className="text-center space-y-4">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm">Verarbeite Spracheingabe...</p>
            </div>
          )}

          {recordingState === 'fallback' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-medium text-yellow-600 mb-2">
                  🎙️ Spracherkennung schwierig
                </div>
                <p className="text-xs text-muted-foreground">
                  Nutzen Sie eine der alternativen Eingabemethoden:
                </p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsPushToTalk(true)}
                >
                  Push-to-Talk versuchen
                </Button>
                
                <Button 
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    // Show quick builder
                    const quickEntry = {
                      selectedDate: new Date().toISOString().split('T')[0],
                      selectedTime: new Date().toTimeString().slice(0, 5),
                      painLevel: '',
                      medications: [],
                      notes: 'Fallback-Eingabe',
                      isNow: true
                    };
                    setParsedEntry(quickEntry as any);
                    setRecordingState('reviewing');
                  }}
                >
                  Schnell-Eingabe nutzen
                </Button>
              </div>
            </div>
          )}

          {recordingState === 'reviewing' && parsedEntry && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Erkannter Eintrag</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  {isEditing ? 'Fertig' : 'Bearbeiten'}
                </Button>
              </div>

              <div className="p-3 bg-secondary/50 rounded-lg text-xs">
                <strong>Gesprochener Text:</strong> "{transcript}"
              </div>

              {!isEditing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Datum & Zeit</Label>
                    <p className="text-sm">{parsedEntry.selectedDate} um {parsedEntry.selectedTime}</p>
                    {parsedEntry.isNow && <Badge variant="secondary" className="text-xs">Jetzt</Badge>}
                  </div>
                  
                  <div>
                    <Label className="text-xs text-muted-foreground">Schmerzstärke</Label>
                    <p className="text-sm">
                      {parsedEntry.painLevel ? 
                        getPainLevelDisplay(parsedEntry.painLevel)
                        : "⚠️ Nicht erkannt"}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Medikamente</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parsedEntry.medications.length > 0 ? 
                        parsedEntry.medications.map((med, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{med}</Badge>
                        ))
                        : <span className="text-xs text-muted-foreground">Keine</span>
                      }
                    </div>
                  </div>

                  {parsedEntry.notes && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Zusätzliche Notizen</Label>
                      <p className="text-sm">{parsedEntry.notes}</p>
                    </div>
                  )}

                  {parsedEntry.medicationEffect && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Medikamenten-Wirkung</Label>
                      <div className="space-y-1">
                        <p className="text-sm">
                          {parsedEntry.medicationEffect.medName && (
                            <strong>{parsedEntry.medicationEffect.medName}: </strong>
                          )}
                          {parsedEntry.medicationEffect.rating === 'none' && '❌ Gar nicht geholfen'}
                          {parsedEntry.medicationEffect.rating === 'poor' && '🔴 Schlecht geholfen'}
                          {parsedEntry.medicationEffect.rating === 'moderate' && '🟡 Mittel geholfen'}
                          {parsedEntry.medicationEffect.rating === 'good' && '🟢 Gut geholfen'}
                          {parsedEntry.medicationEffect.rating === 'very_good' && '✅ Sehr gut geholfen'}
                        </p>
                        {parsedEntry.medicationEffect.sideEffects && parsedEntry.medicationEffect.sideEffects.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {parsedEntry.medicationEffect.sideEffects.map((effect, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{effect}</Badge>
                            ))}
                          </div>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          Konfidenz: {parsedEntry.medicationEffect.confidence}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Datum</Label>
                      <Input 
                        type="date" 
                        value={editedDate}
                        onChange={(e) => setEditedDate(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Zeit</Label>
                      <Input 
                        type="time" 
                        value={editedTime}
                        onChange={(e) => setEditedTime(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Schmerzstärke</Label>
                    <div className="grid gap-1 mt-1">
                      {painLevels.map((level) => (
                        <Button
                          key={level.value}
                          variant={editedPainLevel === level.value ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs justify-start"
                          onClick={() => setEditedPainLevel(level.value)}
                        >
                          {level.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Medikamente</Label>
                    <div className="flex flex-wrap gap-1 mt-1 mb-2">
                      {editedMedications.map((med, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {med}
                          <button 
                            onClick={() => removeMedication(i)}
                            className="ml-1 text-red-500 hover:text-red-700"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {availableMeds.slice(0, 3).map((med) => (
                        <Button
                          key={med.id}
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => addMedication(med.name)}
                        >
                          + {med.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Notizen</Label>
                    <Textarea 
                      value={editedNotes}
                      onChange={(e) => setEditedNotes(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setRecordingState('idle')}
                  className="flex-1"
                >
                  <MicOff className="w-4 h-4 mr-1" />
                  Neu aufnehmen
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={saving || (!parsedEntry?.painLevel && !editedPainLevel)}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? "Speichert..." : "Speichern"}
                </Button>
              </div>
            </div>
          )}

          {/* Slot Filling Dialog */}
          {recordingState === 'slot_filling' && slotFillingState.missingSlots.length > 0 && (
            <SlotFillingDialog
              currentSlot={slotFillingState.missingSlots[slotFillingState.currentSlotIndex]}
              progress={slotFillingState.currentSlotIndex + 1}
              totalSlots={slotFillingState.missingSlots.length}
              isSpeaking={isTTSSpeaking}
              spokenText={spokenText}
              onQuickSelect={(value: string) => {
                handleSlotResponse(value);
              }}
              onManualInput={(value: string) => {
                handleSlotResponse(value);
              }}
              onSkip={() => {
                // Skip current slot and move to next
                const nextIndex = slotFillingState.currentSlotIndex + 1;
                if (nextIndex < slotFillingState.missingSlots.length) {
                  setSlotFillingState({
                    ...slotFillingState,
                    currentSlotIndex: nextIndex
                  });
                  startSlotFilling(slotFillingState.missingSlots[nextIndex], slotFillingState.collectedData as ParsedVoiceEntry);
                } else {
                  // All slots processed, go to review
                  setParsedEntry(slotFillingState.collectedData as ParsedVoiceEntry);
                  setRecordingState('reviewing');
                }
              }}
              onCancel={() => {
                setRecordingState('fallback');
              }}
              availableMeds={availableMeds.map(med => med.name)}
            />
          )}

          {/* Debug Panel */}
          {showDebug && (
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-medium">🔧 Debug-Informationen</div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTrace(!showTrace)}
                  className="h-6 px-2 text-xs"
                >
                  {showTrace ? 'Pipeline' : 'Basic'}
                </Button>
              </div>
              
              {!showTrace ? (
                <div className="text-xs space-y-1 bg-secondary/30 p-2 rounded max-h-32 overflow-y-auto">
                  <div>Gerät: {selectedDevice === 'default' ? 'Standard' : selectedDevice.slice(0, 20)}</div>
                  <div>Audio-Level: {audioLevel.toFixed(0)}</div>
                  <div>Restarts: {restartCount}/2</div>
                  <div>Status: {recordingState}</div>
                  <div className="border-t pt-1 mt-1">
                    {debugLog.map((log, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground">{log}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs space-y-2 bg-secondary/30 p-2 rounded max-h-48 overflow-y-auto">
                  {traceLogger ? (
                    <>
                      <div className="font-medium">
                        🔍 Pipeline Trace (ID: {traceLogger.getCorrelationId().slice(-8)})
                      </div>
                      <div className="space-y-1">
                        {traceLogger.getTraces().map((trace, i) => (
                          <div key={i} className="text-[10px] p-1 bg-background/50 rounded">
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${
                                trace.status === 'completed' ? 'bg-green-500' : 
                                trace.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                              }`}></span>
                              <span className="font-mono">{trace.step}</span>
                              <span className="text-muted-foreground">
                                {new Date(trace.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            {trace.error && (
                              <div className="text-red-600 mt-1">❌ {trace.error}</div>
                            )}
                            <div className="text-muted-foreground mt-1">
                              {JSON.stringify(trace.data).substring(0, 100)}...
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t pt-1 mt-2 text-[10px] text-muted-foreground">
                        {(() => {
                          const summary = traceLogger.getSummary();
                          return `${summary.completed}/${summary.totalSteps} steps completed, ${summary.failed} failed, ${Math.round(summary.totalDuration / 1000)}s`;
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No trace data available</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}