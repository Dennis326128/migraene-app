import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Play, Square, Edit3, Save, X, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseGermanVoiceEntry, getMissingSlots, type ParsedVoiceEntry } from "@/lib/voice/germanParser";
import { useCreateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";
import { TTSEngine } from "@/lib/voice/ttsEngine";
import { SlotFillingDialog } from "./SlotFillingDialog";
import { berlinDateToday } from "@/lib/tz";
import { convertNumericPainToCategory } from "@/lib/utils/pain";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface VoiceEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type AppState = 'idle' | 'recording' | 'processing' | 'reviewing' | 'slot_filling' | 'saving';

interface SlotFillingState {
  missingSlots: ('time' | 'pain' | 'meds')[];
  currentSlotIndex: number;
  collectedData: Partial<ParsedVoiceEntry>;
}

export function VoiceEntryModal({ open, onClose, onSuccess }: VoiceEntryModalProps) {
  const { toast } = useToast();
  const [appState, setAppState] = useState<AppState>('idle');
  const [parsedEntry, setParsedEntry] = useState<ParsedVoiceEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Manual editing states
  const [editedDate, setEditedDate] = useState('');
  const [editedTime, setEditedTime] = useState('');
  const [editedPainLevel, setEditedPainLevel] = useState<number>(7);
  const [editedMedications, setEditedMedications] = useState<string[]>([]);
  const [editedNotes, setEditedNotes] = useState('');

  // Slot filling states
  const [slotFillingState, setSlotFillingState] = useState<SlotFillingState>({
    missingSlots: [],
    currentSlotIndex: 0,
    collectedData: {}
  });

  const ttsEngineRef = useRef<TTSEngine | null>(null);
  const createEntryMutation = useCreateEntry();
  const { data: availableMeds = [] } = useMeds();

  // Initialize speech recognition with callbacks
  const speechRecognition = useSpeechRecognition({
    language: 'de-DE',
    onTranscriptReady: handleTranscriptReady,
    onError: handleSpeechError,
    onDebugLog: addDebugLog
  });

  // Initialize TTS engine
  useEffect(() => {
    ttsEngineRef.current = new TTSEngine();
    return () => {
      ttsEngineRef.current?.stopSpeaking();
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      resetAllState();
    }
  }, [open]);

  function addDebugLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-9), `${timestamp}: ${message}`]);
  }

  function resetAllState() {
    setAppState('idle');
    setParsedEntry(null);
    setIsEditing(false);
    setDebugLogs([]);
    speechRecognition.resetTranscript();
    resetEditingState();
    resetSlotFilling();
  }

  function resetEditingState() {
    setEditedDate('');
    setEditedTime('');
    setEditedPainLevel(7);
    setEditedMedications([]);
    setEditedNotes('');
  }

  function resetSlotFilling() {
    setSlotFillingState({
      missingSlots: [],
      currentSlotIndex: 0,
      collectedData: {}
    });
  }

  async function handleTranscriptReady(transcript: string, confidence: number) {
    try {
      addDebugLog(`🔍 Verarbeite Transcript: "${transcript}"`);
      setAppState('processing');

      // Parse German voice input
      const parsed = parseGermanVoiceEntry(transcript);
      addDebugLog(`✅ Parsing erfolgreich: Zeit=${parsed.selectedTime}, Schmerz=${parsed.painLevel}, Meds=${parsed.medications.length}`);
      
      setParsedEntry(parsed);
      
      // Check for missing required fields
      const missingSlots = getMissingSlots(parsed);
      
      if (missingSlots.length > 0) {
        addDebugLog(`⚠️ Fehlende Felder: ${missingSlots.join(', ')}`);
        startSlotFilling(missingSlots, parsed);
      } else {
        addDebugLog(`✅ Alle Felder vorhanden, gehe zu Review`);
        setAppState('reviewing');
        populateEditingFields(parsed);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Parsing-Fehler';
      addDebugLog(`❌ Parsing fehlgeschlagen: ${message}`);
      toast({
        title: "Parsing-Fehler",
        description: "Spracheingabe konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
        variant: "destructive"
      });
      setAppState('idle');
    }
  }

  function handleSpeechError(error: string) {
    addDebugLog(`❌ Sprach-Fehler: ${error}`);
    toast({
      title: "Spracherkennung Fehler",
      description: error,
      variant: "destructive"
    });
    setAppState('idle');
  }

  function startSlotFilling(missingSlots: ('time' | 'pain' | 'meds')[], initialData: ParsedVoiceEntry) {
    setSlotFillingState({
      missingSlots,
      currentSlotIndex: 0,
      collectedData: initialData
    });
    setAppState('slot_filling');
    
    // Start TTS for first missing slot
    askForSlot(missingSlots[0]);
  }

  async function askForSlot(slot: 'time' | 'pain' | 'meds') {
    const questions = {
      time: 'Wann hatten Sie die Schmerzen? Bitte nennen Sie die Uhrzeit.',
      pain: 'Wie stark waren die Schmerzen auf einer Skala von 0 bis 10?',
      meds: 'Haben Sie Medikamente eingenommen? Wenn ja, welche?'
    };

    const question = questions[slot];
    addDebugLog(`🔊 Frage für ${slot}: ${question}`);
    
    try {
      await ttsEngineRef.current?.speak(question);
      // After TTS finishes, start listening for the answer
      speechRecognition.startRecording();
    } catch (error) {
      addDebugLog(`❌ TTS Fehler: ${error}`);
      toast({
        title: "TTS Fehler",
        description: "Konnte Frage nicht vorlesen",
        variant: "destructive"
      });
    }
  }

  function populateEditingFields(entry: ParsedVoiceEntry) {
    setEditedDate(entry.selectedDate);
    setEditedTime(entry.selectedTime);
    setEditedPainLevel(normalizePainLevel(entry.painLevel));
    setEditedMedications([...entry.medications]);
    setEditedNotes(entry.notes);
  }

  async function handleSave() {
    if (!parsedEntry && !isEditing) {
      toast({
        title: "Fehler",
        description: "Keine Daten zum Speichern vorhanden",
        variant: "destructive"
      });
      return;
    }

    setAppState('saving');
    addDebugLog('💾 Speichere Eintrag...');

    try {
      // Use edited data if in edit mode, otherwise use parsed data
      const dataToSave = isEditing ? {
        selectedDate: editedDate,
        selectedTime: editedTime,
        painLevel: editedPainLevel,
        medications: editedMedications,
        notes: editedNotes
      } : parsedEntry!;

      // Create entry data
      const entryData = {
        date: dataToSave.selectedDate,
        time: dataToSave.selectedTime,
        pain_level: dataToSave.painLevel || 0,
        medications: dataToSave.medications,
        notes: dataToSave.notes || '',
        entry_method: 'voice' as const,
        weather_data: null,
        coordinates: null
      };

      // Try to get weather data
      try {
        if (navigator.geolocation) {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          
          const { latitude, longitude } = position.coords;
          const weather = await logAndSaveWeatherAtCoords(
            new Date(`${dataToSave.selectedDate}T${dataToSave.selectedTime}`).toISOString(),
            latitude, 
            longitude
          );
          entryData.weather_data = weather;
          entryData.coordinates = { latitude, longitude };
          addDebugLog('🌤️ Wetterdaten hinzugefügt');
        }
      } catch (error) {
        addDebugLog('⚠️ Wetterdaten konnten nicht abgerufen werden');
      }

      // Save to database
      await createEntryMutation.mutateAsync(entryData);
      
      addDebugLog('✅ Eintrag erfolgreich gespeichert');
      toast({
        title: "Erfolgreich gespeichert",
        description: "Ihr Eintrag wurde gespeichert",
      });

      // Success callback and close
      onSuccess?.();
      onClose();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen';
      addDebugLog(`❌ Speichern fehlgeschlagen: ${message}`);
      toast({
        title: "Speichern fehlgeschlagen",
        description: message,
        variant: "destructive"
      });
      setAppState('reviewing');
    }
  }

  async function startRecording() {
    addDebugLog('🎙️ Starte Aufnahme...');
    setAppState('recording');
    await speechRecognition.startRecording();
  }

  function stopRecording() {
    addDebugLog('⏹️ Stoppe Aufnahme...');
    speechRecognition.stopRecording();
  }

  const painLevels = Array.from({ length: 11 }, (_, i) => i.toString());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Spracheingabe</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Recording Status */}
          <div className="text-center space-y-4">
            <div className="text-lg font-medium">
              {appState === 'idle' && 'Bereit für Spracheingabe'}
              {appState === 'recording' && 'Höre zu...'}
              {appState === 'processing' && 'Verarbeite Sprache...'}
              {appState === 'reviewing' && 'Überprüfen Sie Ihre Eingabe'}
              {appState === 'slot_filling' && 'Fehlende Informationen...'}
              {appState === 'saving' && 'Speichere...'}
            </div>

            {/* Live transcript */}
            {speechRecognition.state.transcript && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Erkannter Text:</p>
                <p className="font-medium">{speechRecognition.state.transcript}</p>
                {speechRecognition.state.confidence > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vertrauen: {(speechRecognition.state.confidence * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            )}

            {/* Error display */}
            {speechRecognition.state.error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg">
                {speechRecognition.state.error}
              </div>
            )}

            {/* Recording Controls */}
            <div className="flex justify-center gap-3">
              {!speechRecognition.state.isRecording && appState === 'idle' && (
                <Button onClick={startRecording} size="lg" className="gap-2">
                  <Mic className="h-5 w-5" />
                  Aufnahme starten
                </Button>
              )}
              
              {speechRecognition.state.isRecording && (
                <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2">
                  <Square className="h-4 w-4" />
                  Stoppen
                </Button>
              )}

              {appState === 'reviewing' && (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(!isEditing)} variant="outline" className="gap-2">
                    <Edit3 className="h-4 w-4" />
                    {isEditing ? 'Bearbeitung beenden' : 'Bearbeiten'}
                  </Button>
                  <Button onClick={handleSave} className="gap-2" disabled={createEntryMutation.isPending}>
                    <Save className="h-4 w-4" />
                    Speichern
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Manual editing form */}
          {isEditing && appState === 'reviewing' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium">Manuelle Bearbeitung</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="time">Uhrzeit</Label>
                  <Input
                    id="time"
                    type="time"
                    value={editedTime}
                    onChange={(e) => setEditedTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pain-level">Schmerzstärke (0-10)</Label>
                <PainSlider 
                  value={editedPainLevel} 
                  onValueChange={setEditedPainLevel}
                />
              </div>
                  <SelectTrigger>
                    <SelectValue placeholder="Schmerzstärke wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {painLevels.map(level => (
                      <SelectItem key={level} value={level}>
                        {level} {level === '0' ? '(schmerzfrei)' : level === '10' ? '(unerträglich)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Notizen</Label>
                <Textarea
                  id="notes"
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Zusätzliche Notizen..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Medikamente</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {editedMedications.map((med, index) => (
                    <Badge key={index} variant="secondary" className="gap-1">
                      {med}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => {
                          setEditedMedications(prev => prev.filter((_, i) => i !== index));
                        }}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Slot filling - simplified for now */}
          {appState === 'slot_filling' && (
            <div className="border-t pt-4">
              <div className="text-center space-y-4">
                <h3 className="font-medium">Fehlende Informationen</h3>
                <p className="text-sm text-muted-foreground">
                  Bitte ergänzen Sie: {slotFillingState.missingSlots.join(', ')}
                </p>
                <Button onClick={() => setAppState('reviewing')} variant="outline">
                  Manuell bearbeiten
                </Button>
              </div>
            </div>
          )}

          {/* Debug panel */}
          {showDebug && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Debug Log</h3>
              <div className="text-xs font-mono bg-muted p-3 rounded max-h-32 overflow-y-auto space-y-1">
                {debugLogs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}