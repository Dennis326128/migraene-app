import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Play, Square, Edit3, Save, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseGermanVoiceEntry, type ParsedVoiceEntry } from "@/lib/voice/germanParser";
import { useCreateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";

interface VoiceEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type RecordingState = 'idle' | 'recording' | 'processing' | 'reviewing';

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
  
  // Manual editing states
  const [editedDate, setEditedDate] = useState('');
  const [editedTime, setEditedTime] = useState('');
  const [editedPainLevel, setEditedPainLevel] = useState('');
  const [editedMedications, setEditedMedications] = useState<string[]>([]);
  const [editedNotes, setEditedNotes] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const createEntryMutation = useCreateEntry();
  const { data: availableMeds = [] } = useMeds();

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
      stopRecording();
    }
  }, [open]);

  // Update editing states when parsed entry changes
  useEffect(() => {
    if (parsedEntry) {
      setEditedDate(parsedEntry.selectedDate);
      setEditedTime(parsedEntry.selectedTime);
      setEditedPainLevel(parsedEntry.painLevel);
      setEditedMedications([...parsedEntry.medications]);
      setEditedNotes(parsedEntry.notes);
    }
  }, [parsedEntry]);

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Spracherkennung nicht unterstützt",
        description: "Ihr Browser unterstützt keine Spracherkennung. Bitte verwenden Sie Chrome oder Edge.",
        variant: "destructive"
      });
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'de-DE';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setRecordingState('recording');
        setTranscript('');
        console.log('🎙️ Voice recording started');
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(finalTranscript + interimTranscript);
      };

      recognition.onerror = (event) => {
        console.error('🎙️ Speech recognition error:', event.error);
        setRecordingState('idle');
        
        let errorMessage = "Spracherkennung fehlgeschlagen";
        switch (event.error) {
          case 'no-speech':
            errorMessage = "Keine Sprache erkannt. Bitte sprechen Sie deutlicher.";
            break;
          case 'audio-capture':
            errorMessage = "Mikrofonzugriff fehlgeschragen. Bitte Berechtigung erteilen.";
            break;
          case 'not-allowed':
            errorMessage = "Mikrofonzugriff verweigert. Bitte Berechtigung in den Browsereinstellungen aktivieren.";
            break;
        }
        
        toast({
          title: "Sprachfehler",
          description: errorMessage,
          variant: "destructive"
        });
      };

      recognition.onend = () => {
        setRecordingState('processing');
        console.log('🎙️ Voice recording ended, processing...');
        
        if (transcript.trim()) {
          // Parse the transcript
          const parsed = parseGermanVoiceEntry(transcript.trim());
          setParsedEntry(parsed);
          setRecordingState('reviewing');
        } else {
          setRecordingState('idle');
          toast({
            title: "Keine Sprache erkannt",
            description: "Bitte versuchen Sie es erneut und sprechen Sie deutlicher.",
            variant: "destructive"
          });
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (error) {
      console.error('🎙️ Failed to start recognition:', error);
      toast({
        title: "Spracherkennung fehlgeschlagen",
        description: "Bitte versuchen Sie es erneut oder verwenden Sie die manuelle Eingabe.",
        variant: "destructive"
      });
    }
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
      notes: editedNotes
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
    
    try {
      // Capture GPS coordinates
      let latitude = null;
      let longitude = null;
      
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 8000 
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        console.log('📍 Voice Entry: GPS coordinates captured');
      } catch (gpsError) {
        console.warn('📍 Voice Entry: GPS failed, will use fallback', gpsError);
      }
      
      // Capture weather data (non-blocking)
      let weatherId = null;
      try {
        const atISO = new Date(`${finalEntry.selectedDate}T${finalEntry.selectedTime}:00`).toISOString();
        if (latitude && longitude) {
          weatherId = await logAndSaveWeatherAtCoords(atISO, latitude, longitude);
        } else {
          weatherId = await logAndSaveWeatherAt(atISO);
        }
      } catch (weatherError) {
        console.warn('Weather data fetch failed:', weatherError);
      }

      // Create the entry using the same system as form entries
      const payload = {
        selected_date: finalEntry.selectedDate,
        selected_time: finalEntry.selectedTime,
        pain_level: finalEntry.painLevel as "leicht" | "mittel" | "stark" | "sehr_stark",
        aura_type: "keine" as const,
        pain_location: null,
        medications: finalEntry.medications,
        notes: finalEntry.notes.trim() || null,
        weather_id: weatherId,
        latitude,
        longitude,
      };

      await createEntryMutation.mutateAsync(payload as any);

      toast({
        title: "✅ Spracheintrag gespeichert",
        description: "Ihr Migräne-Eintrag wurde erfolgreich über Sprache erfasst."
      });

      // Log to audit (optional - metadata in old_data)
      // Could be added via audit_logs table if needed

      onSuccess?.();
      onClose();
      
    } catch (error) {
      console.error('Voice entry save error:', error);
      toast({
        title: "❌ Fehler beim Speichern",
        description: "Bitte versuchen Sie es erneut.",
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
              <p className="text-sm text-muted-foreground">
                Sprechen Sie Ihren Migräne-Eintrag auf Deutsch:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>💡 <strong>Beispiele:</strong></p>
                <p>"Ich habe Schmerzstufe 8 und Sumatriptan 50 genommen"</p>
                <p>"Vor 30 Minuten Schmerz 6, Ibuprofen 400"</p>
                <p>"Gestern um 17 Uhr 7/10, kein Medikament"</p>
              </div>
              <Button 
                onClick={startRecording}
                size="lg"
                className="w-full"
              >
                <Mic className="w-5 h-5 mr-2" />
                Aufnahme starten
              </Button>
              <div className="text-xs text-muted-foreground">
                Alternativ können Sie auch manuell eingeben
              </div>
            </div>
          )}

          {recordingState === 'recording' && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Aufnahme läuft...</span>
              </div>
              <div className="p-4 bg-secondary/50 rounded-lg min-h-[60px]">
                <p className="text-sm">{transcript || "Sprechen Sie jetzt..."}</p>
              </div>
              <Button 
                onClick={stopRecording}
                variant="outline"
                size="sm"
              >
                <Square className="w-4 h-4 mr-2" />
                Aufnahme beenden
              </Button>
            </div>
          )}

          {recordingState === 'processing' && (
            <div className="text-center space-y-4">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm">Verarbeite Spracheingabe...</p>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}