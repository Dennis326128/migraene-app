import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SaveButton } from "@/components/ui/save-button";
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
import { useMeds, useAddMed, useDeleteMed, useRecentMeds } from "@/features/meds/hooks/useMeds";
import { useSymptomCatalog, useEntrySymptoms, useSetEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";
import { useCheckMedicationLimits, type LimitCheck } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useUserDefaults, useUpsertUserDefaults } from "@/features/settings/hooks/useUserSettings";
import { useEntryIntakes, useSyncIntakes } from "@/features/medication-intakes/hooks/useMedicationIntakes";
import { PainSlider } from "@/components/ui/pain-slider";
import { normalizePainLevel } from "@/lib/utils/pain";
import { ContextInputField } from "./ContextInputField";
import { MeCfsSeveritySelector } from "./MeCfsSeveritySelector";
import { type MeCfsSeverityLevel, scoreToLevel } from "@/lib/mecfs/constants";
import { MedicationDoseList } from "./MedicationDose";
import { DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";
import { devLog, devWarn } from "@/lib/utils/devLogger";
import { groupSymptoms } from "@/lib/symptoms/symptomGroups";

interface NewEntryProps {
  onBack: () => void;
  onSave?: () => void;
  entry?: MigraineEntry | null;
  onLimitWarning?: (checks: any[]) => void;
  // Voice prefill props
  initialPainLevel?: number;
  initialSelectedDate?: string;
  initialSelectedTime?: string;
  initialMedicationStates?: Record<string, { doseQuarters: number; medicationId?: string }>;
  initialNotes?: string;
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

const painLocationsOptions = [
  { value: "einseitig_links", label: "Einseitig links" },
  { value: "einseitig_rechts", label: "Einseitig rechts" },
  { value: "beidseitig", label: "Beidseitig" },
  { value: "stirn", label: "Stirnbereich" },
  { value: "nacken", label: "Nackenbereich" },
  { value: "schlaefe", label: "Schläfenbereich" },
  { value: "top_of_head_burning", label: "Kopfoberseite (brennen)" },
];

export const NewEntry = ({ 
  onBack, 
  onSave, 
  entry, 
  onLimitWarning,
  initialPainLevel,
  initialSelectedDate,
  initialSelectedTime,
  initialMedicationStates,
  initialNotes,
}: NewEntryProps) => {
  const { toast } = useToast();
  const painLevelSectionRef = useRef<HTMLDivElement>(null);

  const [painLevel, setPainLevel] = useState<number>(7);
  const [painLocations, setPainLocations] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  // Medication state: Map<name, {doseQuarters, medicationId}>
  const [selectedMedications, setSelectedMedications] = useState<Map<string, { doseQuarters: number; medicationId?: string }>>(new Map());
  
  const [medicationsWithEffectiveness, setMedicationsWithEffectiveness] = useState<MedicationWithEffectiveness[]>([]);
  const [newMedication, setNewMedication] = useState("");
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [contextText, setContextText] = useState<string>("");
  const [meCfsScore, setMeCfsScore] = useState<number>(0);
  const [meCfsLevel, setMeCfsLevel] = useState<MeCfsSeverityLevel>('none');

  // Symptoms tracking state (for DB persistence)
  // Use a ref to always have the latest value available in handleSave (avoids stale closure)
  const [symptomsSource, setSymptomsSource] = useState<'copied_from_previous' | 'user_selected' | 'unknown'>('unknown');
  const [symptomsState, setSymptomsState] = useState<'untouched' | 'viewed' | 'edited'>('untouched');
  const symptomsStateRef = useRef(symptomsState);
  symptomsStateRef.current = symptomsState;

  // Collapsible states (stored in localStorage)
  const [painLocationOpen, setPainLocationOpen] = useState(() => {
    const stored = localStorage.getItem('newEntry_painLocationOpen');
    return stored !== null ? stored === 'true' : true;
  });
  const [symptomsOpen, setSymptomsOpen] = useState(() => {
    const stored = localStorage.getItem('newEntry_symptomsOpen');
    return stored !== null ? stored === 'true' : false;
  });

  // If symptoms accordion starts open (from localStorage), mark as 'viewed'
  useEffect(() => {
    if (symptomsOpen && symptomsState === 'untouched' && !entry) {
      setSymptomsState('viewed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save collapsible states to localStorage
  useEffect(() => {
    localStorage.setItem('newEntry_painLocationOpen', String(painLocationOpen));
  }, [painLocationOpen]);

  useEffect(() => {
    localStorage.setItem('newEntry_symptomsOpen', String(symptomsOpen));
  }, [symptomsOpen]);

  // Track symptoms_state when accordion opens
  const handleSymptomsOpenChange = (open: boolean) => {
    setSymptomsOpen(open);
    if (open && symptomsState === 'untouched') {
      setSymptomsState('viewed');
    }
  };

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
  const { data: recentMeds = [] } = useRecentMeds(5);
  const { data: existingIntakes = [] } = useEntryIntakes(entryIdNum);
  const syncIntakesMut = useSyncIntakes();

  // Load user defaults for new entries
  useEffect(() => {
    if (!entry && userDefaults) {
      // Only apply defaults for new entries, not when editing existing ones
      if (userDefaults.default_pain_location) {
        setPainLocations([userDefaults.default_pain_location]);
      }
      if (userDefaults.default_symptoms?.length > 0) {
        setSelectedSymptoms(userDefaults.default_symptoms);
        // Mark as copied from previous (prefilled from defaults)
        setSymptomsSource('copied_from_previous');
        setSymptomsState('untouched');
      }
    }
  }, [entry, userDefaults]);

  useEffect(() => {
    if (entry) {
      // Editing existing entry
      setPainLevel(normalizePainLevel(entry.pain_level || 7));
      setPainLocations((entry as any).pain_locations || []);
      setSelectedDate(entry.selected_date || new Date().toISOString().slice(0, 10));
      setSelectedTime(entry.selected_time?.substring(0, 5) || new Date().toTimeString().slice(0, 5));
      setNotes(entry.notes || "");
      // Load ME/CFS values
      setMeCfsScore((entry as any).me_cfs_severity_score ?? 0);
      setMeCfsLevel(((entry as any).me_cfs_severity_level as MeCfsSeverityLevel) || scoreToLevel((entry as any).me_cfs_severity_score ?? 0));
    } else {
      // New entry - apply voice prefill or defaults
      const now = new Date();
      
      // Pain level: use prefill or default
      if (initialPainLevel !== undefined && initialPainLevel >= 0 && initialPainLevel <= 10) {
        setPainLevel(initialPainLevel);
      }
      
      // Date/Time: use prefill or current time
      setSelectedDate(initialSelectedDate || now.toISOString().slice(0, 10));
      setSelectedTime(initialSelectedTime || now.toTimeString().slice(0, 5));
      
      // Medications: use prefill or empty
      if (initialMedicationStates && Object.keys(initialMedicationStates).length > 0) {
        const medMap = new Map<string, { doseQuarters: number; medicationId?: string }>();
        Object.entries(initialMedicationStates).forEach(([name, data]) => {
          medMap.set(name, data);
        });
        setSelectedMedications(medMap);
      } else {
        setSelectedMedications(new Map());
      }
      
      // Notes: use prefill or empty
      if (initialNotes) {
        setNotes(initialNotes);
      }
    }
  }, [entry, initialPainLevel, initialSelectedDate, initialSelectedTime, initialMedicationStates, initialNotes]);
  
  // Load existing intakes when editing (separate effect to wait for data)
  useEffect(() => {
    if (entry && existingIntakes.length > 0) {
      const intakeMap = new Map<string, { doseQuarters: number; medicationId?: string }>();
      existingIntakes.forEach(intake => {
        intakeMap.set(intake.medication_name, {
          doseQuarters: intake.dose_quarters,
          medicationId: intake.medication_id ?? undefined,
        });
      });
      setSelectedMedications(intakeMap);
    } else if (entry && entry.medications && entry.medications.length > 0 && entry.medications[0] !== "-") {
      // Fallback: use legacy medications array with default dose
      const legacyMap = new Map<string, { doseQuarters: number; medicationId?: string }>();
      entry.medications.forEach(medName => {
        if (medName && medName !== "-") {
          const med = medOptions.find(m => (typeof m === 'string' ? m : m.name) === medName);
          legacyMap.set(medName, {
            doseQuarters: DEFAULT_DOSE_QUARTERS,
            medicationId: med && typeof med !== 'string' ? med.id : undefined,
          });
        }
      });
      if (legacyMap.size > 0) {
        setSelectedMedications(legacyMap);
      }
    }
  }, [entry, existingIntakes, medOptions]);

  const handleAddNewMedication = async () => {
    const name = newMedication.trim();
    if (!name) return;
    try {
      await addMedMut.mutateAsync(name);
      setNewMedication("");
      setShowAddMedication(false);
      // Add new medication to selection with default dose
      setSelectedMedications((prev) => {
        const newMap = new Map(prev);
        newMap.set(name, { doseQuarters: DEFAULT_DOSE_QUARTERS });
        return newMap;
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
      // Remove from selection
      setSelectedMedications((prev) => {
        const newMap = new Map(prev);
        newMap.delete(name);
        return newMap;
      });
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
    if (painLevel === null || painLevel === undefined) {
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
        devLog('Retroactive entry detected, checking for stored coordinates...', { context: 'NewEntry' });
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('latitude, longitude')
          .single();
          
        if (profile?.latitude && profile?.longitude) {
          latitude = Number(profile.latitude);
          longitude = Number(profile.longitude);
          devLog('Using stored profile coordinates for retroactive entry', { context: 'NewEntry' });
        } else {
          // Fallback to current GPS if no stored coordinates
          const pos = await Geolocation.getCurrentPosition({ 
            enableHighAccuracy: true, 
            timeout: 10000 
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
          devLog('Using current GPS coordinates (no stored coordinates found)', { context: 'NewEntry' });
        }
      } else {
        // For current entries, always use fresh GPS
        const pos = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 10000 
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        devLog('Using current GPS coordinates for recent entry', { context: 'NewEntry' });
      }
    } catch (gpsError) {
      devWarn('GPS coordinates capture failed', { context: 'NewEntry', data: gpsError });
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
            title: "Hinweis",
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
          title: "Wetterdaten nicht verfügbar", 
          description: dateTimeChanged 
            ? "Neue Wetterdaten konnten nicht abgerufen werden. Alte Wetterdaten bleiben erhalten."
            : "Eintrag wird ohne Wetterdaten gespeichert.",
          variant: "default"
        });
      }
    }

    try {
      devLog('Building payload with selectedMedications', { context: 'NewEntry', data: selectedMedications });
      
      // Combine notes with context text for storage
      const combinedNotes = [notes.trim(), contextText.trim()]
        .filter(Boolean)
        .join('\n\n---\n\n');
      
      // Convert Map to medications array for legacy field
      const medicationsArray = Array.from(selectedMedications.keys());
      
      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTime.substring(0, 5),
        pain_level: painLevel,
        aura_type: "keine" as const,
        pain_locations: painLocations,
        medications: medicationsArray,
        notes: combinedNotes || null,
        weather_id: weatherId,
        latitude,
        longitude,
        entry_kind: 'pain' as const,
        symptoms_source: symptomsSource,
        symptoms_state: symptomsStateRef.current,
        me_cfs_severity_score: meCfsScore,
        me_cfs_severity_level: meCfsLevel,
      };

      devLog('Final payload', { context: 'NewEntry', data: payload });

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
        
        // Sync medication intakes with doses
        const medications = Array.from(selectedMedications.entries()).map(([name, data]) => ({
          name,
          medicationId: data.medicationId,
          doseQuarters: data.doseQuarters,
        }));
        await syncIntakesMut.mutateAsync({ entryId: numericId, medications });
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
          default_pain_location: painLocations.length > 0 ? painLocations[0] : null,
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
          ? "Wetterdaten für neuen Zeitpunkt abgerufen"
          : "Erfolgreich gespeichert." 
      });
      
      // Reduced delay for faster UX (was 1000ms)
      setTimeout(() => {
        onSave?.();
        onBack();
      }, 300);
    } catch (error) {
      console.error("Save error:", error);
      toast({ 
        title: "Fehler beim Speichern", 
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

      {/* Medikamente mit Dosis-Auswahl */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">Medikamenteneinnahme</Label>
        
        <MedicationDoseList
          medications={medOptions.map((med) => ({
            id: typeof med === 'string' ? med : med.id,
            name: typeof med === 'string' ? med : med.name,
          }))}
          selectedMedications={selectedMedications}
          onSelectionChange={setSelectedMedications}
          recentMedications={recentMeds}
          showRecent={true}
          disabled={saving}
        />

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

      {/* Schmerzlokalisation - Collapsible Multi-Select */}
      <Collapsible open={painLocationOpen} onOpenChange={setPainLocationOpen}>
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between">
            <TouchSafeCollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Label className="text-base font-medium cursor-pointer">
                Schmerzlokalisation {painLocations.length > 0 && `(${painLocations.length})`}
              </Label>
              <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${painLocationOpen ? 'rotate-180' : ''}`} />
            </TouchSafeCollapsibleTrigger>
            {painLocations.length >= 2 && (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setPainLocations([])}
              >
                Alle entfernen
              </button>
            )}
          </div>
          
          <CollapsibleContent className="mt-3">
            <div className="flex flex-wrap gap-2">
              {painLocationsOptions.map((location) => {
                const active = painLocations.includes(location.value);
                return (
                  <Button
                    key={location.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setPainLocations((prev) =>
                        prev.includes(location.value)
                          ? prev.filter((l) => l !== location.value)
                          : [...prev, location.value]
                      )
                    }
                    aria-pressed={active}
                  >
                    {location.label}
                  </Button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Symptome - Collapsible */}
      <Collapsible open={symptomsOpen} onOpenChange={handleSymptomsOpenChange}>
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between">
            <TouchSafeCollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Label className="text-base font-medium cursor-pointer">
                Begleitsymptome {selectedSymptoms.length > 0 && `(${selectedSymptoms.length})`}
              </Label>
              <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${symptomsOpen ? 'rotate-180' : ''}`} />
            </TouchSafeCollapsibleTrigger>
            {selectedSymptoms.length >= 2 && (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSelectedSymptoms([])}
              >
                Alle entfernen
              </button>
            )}
          </div>
          
          <CollapsibleContent>
            {loadingSymptoms && entry ? (
              <div className="text-sm text-muted-foreground mt-2">Lade vorhandene Symptome…</div>
            ) : (
              <div className="mt-3 space-y-4">
                {/* Microcopy hint when prefilled + untouched */}
                {symptomsSource === 'copied_from_previous' && symptomsState === 'untouched' && (
                  <p className="text-xs text-muted-foreground/60">
                    Optional: Öffnen hilft, die Auswertung genauer zu machen.
                  </p>
                )}
                {symptomsSource !== 'copied_from_previous' && (
                  <p className="text-xs text-muted-foreground">
                    Optional – verbessert die Auswertung für Arzt und Verlauf
                  </p>
                )}
                {groupSymptoms(catalog).map((group) => (
                  <div key={group.group}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((s) => {
                        const active = selectedSymptoms.includes(s.id);
                        return (
                          <Button
                            key={s.id}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSymptomsState('edited');
                              setSelectedSymptoms((prev) =>
                                prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                              );
                            }}
                            aria-pressed={active}
                          >
                            {s.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
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

      {/* ME/CFS-Symptomatik */}
      <MeCfsSeveritySelector
        value={meCfsScore}
        onValueChange={(score, level) => {
          setMeCfsScore(score);
          setMeCfsLevel(level);
        }}
        disabled={saving}
      />

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
        <SaveButton
          onClick={handleSave}
          className="flex-1"
          loading={saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending}
        />
      </div>
      </div>
    </div>
  );
};