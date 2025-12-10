import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SaveButton } from "@/components/ui/navigation-buttons";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TouchSafeCollapsibleTrigger } from "@/components/ui/touch-collapsible";
import { Plus, X, Trash2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MigraineEntry } from "@/types/painApp";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";
import { updateUserProfileCoordinates } from "@/utils/coordinateUpdater";
import { useCreateEntry, useUpdateEntry, useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { useSymptomCatalog, useEntrySymptoms, useSetEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";
import { useCheckMedicationLimits, type LimitCheck } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useUserDefaults, useUpsertUserDefaults } from "@/features/settings/hooks/useUserSettings";
import { PainSlider } from "@/components/ui/pain-slider";
import { normalizePainLevel } from "@/lib/utils/pain";
import { ContextInputField } from "./ContextInputField";

interface NewEntryProps {
  onBack: () => void;
  onSave?: () => void;
  entry?: MigraineEntry | null;
  onLimitWarning?: (checks: any[]) => void;
}

const painLevels = [
  { value: "leicht", label: "Leichte Migräne (2/10)", desc: "Beeinträchtigt Alltag wenig" },
  { value: "mittel", label: "Mittlere Migräne (5/10)", desc: "Erschwert Aktivitäten" },
  { value: "stark", label: "Starke Migräne (7/10)", desc: "Normale Aktivitäten unmöglich" },
  { value: "sehr_stark", label: "Sehr starke Migräne (9/10)", desc: "Bettlägerig, unerträglich" },
];

// Haptic Feedback für Mobile
const triggerHapticFeedback = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(50); // 50ms vibration
  }
};

interface MedicationWithEffectiveness {
  name: string;
  dosage: string;
  effectiveness: number;
  notes: string;
}

const painLocations = [
  { value: "einseitig_links", label: "Einseitig links" },
  { value: "einseitig_rechts", label: "Einseitig rechts" },
  { value: "beidseitig", label: "Beidseitig" },
  { value: "stirn", label: "Stirnbereich" },
  { value: "nacken", label: "Nackenbereich" },
  { value: "schlaefe", label: "Schläfenbereich" },
];

export const NewEntry = ({ onBack, onSave, entry, onLimitWarning }: NewEntryProps) => {
  const { toast } = useToast();
  const painLevelSectionRef = useRef<HTMLDivElement>(null);

  const [painLevel, setPainLevel] = useState<number>(7);
  const [painLocation, setPainLocation] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedMedications, setSelectedMedications] = useState<string[]>(["-"]);
  const [medicationsWithEffectiveness, setMedicationsWithEffectiveness] = useState<MedicationWithEffectiveness[]>([]);
  const [newMedication, setNewMedication] = useState("");
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [contextText, setContextText] = useState<string>("");

  // Collapsible states (stored in localStorage)
  const [painLocationOpen, setPainLocationOpen] = useState(() => {
    const stored = localStorage.getItem('newEntry_painLocationOpen');
    return stored !== null ? stored === 'true' : true;
  });
  const [symptomsOpen, setSymptomsOpen] = useState(() => {
    const stored = localStorage.getItem('newEntry_symptomsOpen');
    return stored !== null ? stored === 'true' : true;
  });

  // Save collapsible states to localStorage
  useEffect(() => {
    localStorage.setItem('newEntry_painLocationOpen', String(painLocationOpen));
  }, [painLocationOpen]);

  useEffect(() => {
    localStorage.setItem('newEntry_symptomsOpen', String(symptomsOpen));
  }, [symptomsOpen]);

  const entryIdNum = entry?.id ? Number(entry.id) : null;
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: entrySymptomIds = [], isLoading: loadingSymptoms } = useEntrySymptoms(entryIdNum);
  const setEntrySymptomsMut = useSetEntrySymptoms();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // User defaults for persistent selections
  const { data: userDefaults } = useUserDefaults();
  const upsertDefaults = useUpsertUserDefaults();

  // Medication limit checking
  const checkLimits = useCheckMedicationLimits();
  
  // Set entry symptoms when data loads
  useEffect(() => {
    if (entry && entrySymptomIds) {
      setSelectedSymptoms(entrySymptomIds);
    }
  }, [entry, entrySymptomIds]);

  const { data: medOptions = [] } = useMeds();
  const addMedMut = useAddMed();
  const delMedMut = useDeleteMed();
  const createMut = useCreateEntry();
  const updateMut = useUpdateEntry();
  const deleteMut = useDeleteEntry();

  // Load user defaults for new entries
  useEffect(() => {
    if (!entry && userDefaults) {
      // Only apply defaults for new entries, not when editing existing ones
      if (userDefaults.default_pain_location) {
        setPainLocation(userDefaults.default_pain_location);
      }
      if (userDefaults.default_symptoms?.length > 0) {
        setSelectedSymptoms(userDefaults.default_symptoms);
      }
    }
  }, [entry, userDefaults]);

  useEffect(() => {
    if (entry) {
      setPainLevel(normalizePainLevel(entry.pain_level || 7));
      setPainLocation((entry as any).pain_location || "");
      setSelectedDate(entry.selected_date || new Date().toISOString().slice(0, 10));
      setSelectedTime(entry.selected_time?.substring(0, 5) || new Date().toTimeString().slice(0, 5));
      setSelectedMedications([...entry.medications]);
      setNotes(entry.notes || "");
    } else {
      const now = new Date();
      setSelectedDate(now.toISOString().slice(0, 10));
      setSelectedTime(now.toTimeString().slice(0, 5));
    }
  }, [entry]);

  const handleAddNewMedication = async () => {
    const name = newMedication.trim();
    if (!name) return;
    try {
      await addMedMut.mutateAsync(name);
      setNewMedication("");
      setShowAddMedication(false);
      // Optional: gleich in Auswahl setzen
      setSelectedMedications((prev) => {
        const next = [...prev];
        if (next.length === 1 && next[0] === "-") next[0] = name; else next.push(name);
        return next;
      });
      toast({ title: "Medikament hinzugefügt", description: `${name} wurde hinzugefügt.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message ?? String(e), variant: "destructive" });
    }
  };

  const handleDeleteMedication = async (name: string) => {
    if (!name || name === "-") return;
    if (!confirm(`Möchten Sie ${name} wirklich löschen?`)) return;
    try {
      await delMedMut.mutateAsync(name);
      // Auswahl bereinigen
      setSelectedMedications((prev) => prev.map((m) => (m === name ? "-" : m)));
      toast({ title: "Gelöscht", description: `${name} wurde gelöscht.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message ?? String(e), variant: "destructive" });
    }
  };

// ... keep existing code

  // Enhanced pain level setter with haptic feedback removed (now handled by PainSlider)

  // Keyboard navigation for pain levels removed (now handled by PainSlider)

// ... keep existing code

  const handleSave = async () => {
    if (painLevel < 1) {
      toast({ title: "Fehler", description: "Bitte Migräne-Intensität auswählen", variant: "destructive" });
      return;
    }

    // Validate pain level range
    if (painLevel < 0 || painLevel > 10) {
      toast({
        title: "Ungültiger Schmerzwert",
        description: "Schmerzwert muss zwischen 0 und 10 liegen",
        variant: "destructive",
      });
      return;
    }

    // Validate notes length
    if (notes && notes.length > 2000) {
      toast({
        title: "Notizen zu lang",
        description: "Notizen dürfen maximal 2000 Zeichen enthalten",
        variant: "destructive",
      });
      return;
    }

    // No pre-save check - save directly
    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    
    // Detect if date/time has changed (for existing entries)
    const dateTimeChanged = entry && (
      entry.selected_date !== selectedDate || 
      entry.selected_time?.substring(0, 5) !== selectedTime.substring(0, 5)
    );
    
    /**
     * 🌤️ BEDINGTES WETTER-LOGGING
     * 
     * Erfasst Wetterdaten nur wenn:
     * - Neuer Eintrag (!entry)
     * - ODER Datum/Zeit hat sich geändert (dateTimeChanged)
     * 
     * Wetter-Abruf-Logik:
     * - Retroaktive Einträge (>1h Vergangenheit): Nutzt gespeicherte Profilkoordinaten
     * - Aktuelle Einträge: Nutzt Live-GPS-Daten
     * - Fetch via fetch-weather-hybrid Edge Function
     * - Historische Daten: Open-Meteo Archive API
     */
    
    // Smart coordinate capture for retroactive entries
    let latitude = null;
    let longitude = null;
    const entryDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const now = new Date();
    const isRetroactive = entryDateTime < now && (now.getTime() - entryDateTime.getTime()) > 3600000; // 1 hour buffer
    
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      
      if (isRetroactive) {
        // For retroactive entries, try to use fallback coordinates from user profile
        console.log('📍 Retroactive entry detected, checking for stored coordinates...');
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('latitude, longitude')
          .single();
          
        if (profile?.latitude && profile?.longitude) {
          latitude = Number(profile.latitude);
          longitude = Number(profile.longitude);
          console.log('📍 Using stored profile coordinates for retroactive entry');
        } else {
          // Fallback to current GPS if no stored coordinates
          const pos = await Geolocation.getCurrentPosition({ 
            enableHighAccuracy: true, 
            timeout: 10000 
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
          console.log('📍 Using current GPS coordinates (no stored coordinates found)');
        }
      } else {
        // For current entries, always use fresh GPS
        const pos = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 10000 
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        console.log('📍 Using current GPS coordinates for recent entry');
      }
    } catch (gpsError) {
      console.warn('GPS coordinates capture failed:', gpsError);
    }
    
    // Retain existing weather_id or fetch new weather data conditionally
    let weatherId = entry?.weather_id ?? null;
    let weatherFetched = false;
    
    if (!entry || dateTimeChanged) {
      try {
        const entryDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
        const now = new Date();
        const isFutureEntry = entryDateTime > now;
        
        if (isFutureEntry) {
          console.log('⏰ Future entry - weather data will be added later');
          weatherId = null;
          toast({
            title: "ℹ️ Hinweis",
            description: "Wetterdaten werden automatisch zum Ereigniszeitpunkt nachgetragen.",
            variant: "default"
          });
        } else {
          // Use captured coordinates for weather data
          const atISO = entryDateTime.toISOString();
          const forceRefresh = dateTimeChanged === true; // Skip cache when date/time changed
          if (latitude && longitude) {
            weatherId = await logAndSaveWeatherAtCoords(atISO, latitude, longitude, forceRefresh);
          } else {
            weatherId = await logAndSaveWeatherAt(atISO, forceRefresh);
          }
          weatherFetched = true;
        }
      } catch (weatherError) {
        console.warn('Weather data fetch failed, continuing without weather data:', weatherError);
        toast({ 
          title: "⚠️ Wetterdaten nicht verfügbar", 
          description: dateTimeChanged 
            ? "Neue Wetterdaten konnten nicht abgerufen werden. Alte Wetterdaten bleiben erhalten."
            : "Eintrag wird ohne Wetterdaten gespeichert.",
          variant: "default"
        });
      }
    }

    try {
      console.log('📦 Building payload with selectedMedications:', selectedMedications);
      
      // Combine notes with context text for storage
      const combinedNotes = [notes.trim(), contextText.trim()]
        .filter(Boolean)
        .join('\n\n---\n\n');
      
      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTime.substring(0, 5),
        pain_level: painLevel,
        aura_type: "keine" as const, // Always set to default since aura is removed
        pain_location: (painLocation || null) as "einseitig_links" | "einseitig_rechts" | "beidseitig" | "stirn" | "nacken" | "schlaefe" | null,
        medications: selectedMedications.filter((m) => m !== "-" && m.trim() !== ""),
        notes: combinedNotes || null,
        weather_id: weatherId,
        latitude,
        longitude,
      };

      console.log('📤 Final payload:', payload);

      // Always use createEntry (UPSERT) - overwrites existing entry with same date/time
      let savedId: string | number;
      
      // Offline-Support: Check if online
      if (!navigator.onLine) {
        const { addToOfflineQueue } = await import('@/lib/offlineQueue');
        await addToOfflineQueue('pain_entry', payload);
        onBack();
        return;
      }
      
      try {
        savedId = await createMut.mutateAsync(payload as any);
      } catch (error: any) {
        // Bei Netzwerkfehler: In Queue
        if (error.message?.includes('network') || error.message?.includes('fetch') || !navigator.onLine) {
          const { addToOfflineQueue } = await import('@/lib/offlineQueue');
          await addToOfflineQueue('pain_entry', payload);
          onBack();
          return;
        }
        throw error;
      }

      // If editing and time changed, delete old entry to prevent duplicates
      if (entry?.id) {
        const oldDate = entry.selected_date;
        const oldTime = entry.selected_time?.substring(0, 5);
        const newDate = payload.selected_date;
        const newTime = payload.selected_time;
        
        if (oldDate !== newDate || oldTime !== newTime) {
          try {
            await deleteMut.mutateAsync(entry.id);
            console.log('🗑️ Deleted old entry after time change:', entry.id);
          } catch (err) {
            console.warn('Failed to delete old entry (might already be replaced by UPSERT):', err);
          }
        }
      }

      // Symptome setzen (idempotent)
      const numericId = Number(savedId);
      if (Number.isFinite(numericId)) {
        await setEntrySymptomsMut.mutateAsync({ entryId: numericId, symptomIds: selectedSymptoms });
      }

      // Process context text with AI (fire-and-forget, non-blocking)
      if (contextText.trim()) {
        console.log('🧠 Processing context text with AI...');
        import('@/integrations/supabase/client').then(async ({ supabase }) => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // First save as voice_note for context analysis
            const { data: voiceNote, error: vnError } = await supabase
              .from('voice_notes')
              .insert([{
                user_id: user.id,
                text: contextText.trim(),
                occurred_at: new Date(`${selectedDate}T${selectedTime}:00`).toISOString(),
                source: 'typed',
                context_type: 'entry_context',
                tz: 'Europe/Berlin',
              }])
              .select('id')
              .single();

            if (vnError) {
              console.warn('⚠️ Failed to save context as voice_note:', vnError);
            } else if (voiceNote?.id) {
              console.log('✅ Saved context as voice_note:', voiceNote.id);
              
              // Link to pain_entry
              await supabase
                .from('pain_entries')
                .update({ voice_note_id: voiceNote.id })
                .eq('id', Number(savedId));

              // Trigger NLP processing (fire-and-forget)
              const medNames = medOptions.map(m => typeof m === 'string' ? m : m.name);
              supabase.functions.invoke('extract-context-segments', {
                body: {
                  voiceNoteId: voiceNote.id,
                  text: contextText.trim(),
                  userMeds: medNames,
                }
              }).then(result => {
                if (result.error) {
                  console.warn('⚠️ Context NLP processing failed:', result.error);
                } else {
                  console.log('✅ Context NLP processed:', result.data?.segment_count, 'segments');
                }
              }).catch(err => {
                console.warn('⚠️ Context NLP invocation failed:', err);
              });
            }
          } catch (err) {
            console.warn('⚠️ Context processing error:', err);
          }
        });
      }

      // Update user profile with latest coordinates (for future fallback)
      if (latitude && longitude) {
        try {
          await updateUserProfileCoordinates(latitude, longitude);
        } catch (error) {
          console.warn('Failed to update user profile coordinates:', error);
          // Don't fail the save operation if coordinate update fails
        }
      }

      // Save current selections as new user defaults
      try {
        const newDefaults = {
          default_pain_location: painLocation || null,
          default_symptoms: selectedSymptoms,
        };
        await upsertDefaults.mutateAsync(newDefaults);
      } catch (error) {
        console.warn('Failed to save user defaults:', error);
        // Don't fail the save operation if defaults saving fails
      }

      // Medication effectiveness is now tracked in the medications array of pain_entries
      // No separate entry_medications table needed

      // Post-save medication limit check (truly non-blocking, fire-and-forget)
      const savedMedications = payload.medications || [];
      console.log('🔍 Checking limits for medications:', savedMedications);
      
      if (savedMedications.length > 0) {
        // Don't await - fire and forget for non-blocking behavior
        checkLimits.mutateAsync(savedMedications)
          .then((limitResults) => {
            console.log('✅ NewEntry limit check results:', limitResults);
            const warningNeeded = limitResults.some(r => 
              r.status === 'warning' || r.status === 'reached' || r.status === 'exceeded'
            );
            
            if (warningNeeded && onLimitWarning) {
              console.log('⚠️ NewEntry triggering limit warning:', limitResults.filter(r => 
                r.status === 'warning' || r.status === 'reached' || r.status === 'exceeded'
              ));
              // Call parent callback before returning
              setTimeout(() => onLimitWarning(limitResults), 1500);
            } else {
              console.log('✅ No warnings needed - all limits safe');
            }
          })
          .catch((error) => {
            console.error('❌ Post-save limit check failed:', error);
            console.error('Error details:', {
              message: error?.message,
              status: error?.status,
              data: error?.data,
              stack: error?.stack,
              full: error
            });
            // Silent fail: User has already saved
          });
      } else {
        console.log('ℹ️ No medications to check');
      }

      toast({ 
        title: entry ? "Eintrag aktualisiert" : "Migräne-Eintrag gespeichert", 
        description: dateTimeChanged && weatherFetched 
          ? "✅ Wetterdaten für neuen Zeitpunkt abgerufen"
          : "Erfolgreich gespeichert. Ihre Daten sind sicher gespeichert." 
      });
      
      // Success animation delay
      setTimeout(() => {
        onSave?.();
        onBack();
      }, 1000);
    } catch (error) {
      console.error("Save error:", error);
      toast({ 
        title: "❌ Fehler beim Speichern", 
        description: "Bitte versuchen Sie es erneut.", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <PageHeader 
        title={entry ? "Eintrag bearbeiten" : "Neuer Eintrag"} 
        onBack={onBack}
      />
      
      <div className="container mx-auto p-6 max-w-2xl">
      {/* Migräne-Intensität - Slider */}
      <Card className="p-4 sm:p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">
          Migräne-Intensität
        </Label>
        <PainSlider 
          value={painLevel} 
          onValueChange={setPainLevel}
          disabled={saving}
        />
      </Card>

        {/* Aura block completely removed */}

      {/* Datum und Zeit */}
      <Card className="p-6 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date-input" className="text-base font-medium mb-2 block">Datum</Label>
            <Input 
              id="date-input"
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Migräne-Datum"
            />
          </div>
          <div>
            <Label htmlFor="time-input" className="text-base font-medium mb-2 block">Uhrzeit</Label>
            <Input 
              id="time-input"
              type="time" 
              value={selectedTime} 
              onChange={(e) => setSelectedTime(e.target.value)}
              aria-label="Migräne-Uhrzeit"
            />
          </div>
        </div>
        
      </Card>

      {/* Medikamente */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">Medikamenteneinnahme</Label>
        
        <div className="grid gap-2">
          <Button
            type="button"
            variant={selectedMedications.length === 0 || (selectedMedications.length === 1 && selectedMedications[0] === "-") ? "default" : "outline"}
            className="justify-start"
            onClick={() => setSelectedMedications(["-"])}
            aria-pressed={selectedMedications.length === 0 || (selectedMedications.length === 1 && selectedMedications[0] === "-")}
          >
            Keine Medikamente
          </Button>
          {medOptions.map((med) => {
            const medName = typeof med === 'string' ? med : med.name;
            const isSelected = selectedMedications.includes(medName);
            
            return (
              <Button
                key={typeof med === 'string' ? med : med.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="justify-start"
                onClick={() => {
                  if (isSelected) {
                    setSelectedMedications(prev => prev.filter(m => m !== medName));
                  } else {
                    setSelectedMedications(prev => [...prev.filter(m => m !== "-"), medName]);
                  }
                }}
                aria-pressed={isSelected}
              >
                {medName}
              </Button>
            );
          })}
        </div>

        {/* Neues Medikament hinzufügen */}
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Neues Medikament eingeben..."
            value={newMedication}
            onChange={(e) => setNewMedication(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNewMedication()}
          />
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleAddNewMedication}
            disabled={!newMedication.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Schmerzlokalisation - Collapsible */}
      <Collapsible open={painLocationOpen} onOpenChange={setPainLocationOpen}>
        <Card className="p-6 mb-4">
          <TouchSafeCollapsibleTrigger className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
            <Label className="text-base font-medium cursor-pointer">
              Schmerzlokalisation
            </Label>
            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${painLocationOpen ? 'rotate-180' : ''}`} />
          </TouchSafeCollapsibleTrigger>
          
          <CollapsibleContent className="mt-3">
            <div className="grid gap-2">
              <Button
                type="button"
                variant={painLocation === "" ? "default" : "outline"}
                className="justify-start"
                onClick={() => setPainLocation("")}
                aria-pressed={painLocation === ""}
              >
                Nicht spezifiziert
              </Button>
              {painLocations.map((location) => (
                <Button
                  key={location.value}
                  type="button"
                  variant={painLocation === location.value ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setPainLocation(location.value)}
                  aria-pressed={painLocation === location.value}
                >
                  {location.label}
                </Button>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Symptome - Collapsible */}
      <Collapsible open={symptomsOpen} onOpenChange={setSymptomsOpen}>
        <Card className="p-6 mb-4">
          <TouchSafeCollapsibleTrigger className="w-full flex items-center justify-between hover:opacity-80 transition-opacity">
            <Label className="text-base font-medium cursor-pointer">Begleitsymptome</Label>
            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${symptomsOpen ? 'rotate-180' : ''}`} />
          </TouchSafeCollapsibleTrigger>
          
          <CollapsibleContent>
            {loadingSymptoms && entry ? (
              <div className="text-sm text-muted-foreground mt-2">Lade vorhandene Symptome…</div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                {catalog.map((s) => {
                  const active = selectedSymptoms.includes(s.id);
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        setSelectedSymptoms((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                        )
                      }
                      aria-pressed={active}
                    >
                      {s.name}
                    </Button>
                  );
                })}
                {catalog.length === 0 && (
                  <div className="text-sm text-muted-foreground">Keine Symptome im Katalog.</div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kurze Notizen */}
      <Card className="p-6 mb-4">
        <Label htmlFor="notes-input" className="text-base font-medium mb-3 block">
          Kurze Notizen
        </Label>
        <Input
          id="notes-input"
          type="text"
          placeholder="z.B. Stress, Stimmung, Schlafqualität..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Kurze Notizen zum Eintrag"
        />
      </Card>

      {/* Zusätzlicher Kontext (Spracheingabe) */}
      <Card className="p-6 mb-4">
        <ContextInputField
          value={contextText}
          onChange={setContextText}
          disabled={saving}
        />
      </Card>

      {/* Aktions-Buttons */}
      <div className="flex gap-3 mt-4">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex-1"
          disabled={saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending}
        >
          Abbrechen
        </Button>
        <Button
          onClick={handleSave}
          className="flex-1"
          disabled={saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending}
        >
          {(saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending) ? "Wird gespeichert..." : "Speichern"}
        </Button>
      </div>
      </div>
    </div>
  );
};