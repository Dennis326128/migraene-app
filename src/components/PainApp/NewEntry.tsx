import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MigraineEntry } from "@/types/painApp";
import { logAndSaveWeatherAt, logAndSaveWeatherAtCoords } from "@/utils/weatherLogger";
import { useCreateEntry, useUpdateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { useSymptomCatalog, useEntrySymptoms, useSetEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";
import { useCheckMedicationLimits, type LimitCheck } from "@/features/medication-limits/hooks/useMedicationLimits";
import { MedicationLimitWarning } from "./MedicationLimitWarning";
import { PainSlider } from "@/components/ui/pain-slider";
import { normalizePainLevel } from "@/lib/utils/pain";

interface NewEntryProps {
  onBack: () => void;
  onSave?: () => void;
  entry?: MigraineEntry | null;
}

const painLevels = [
  { value: "leicht", label: "💚 Leichte Migräne (2/10)", desc: "Beeinträchtigt Alltag wenig" },
  { value: "mittel", label: "💛 Mittlere Migräne (5/10)", desc: "Erschwert Aktivitäten" },
  { value: "stark", label: "🟠 Starke Migräne (7/10)", desc: "Normale Aktivitäten unmöglich" },
  { value: "sehr_stark", label: "🔴 Sehr starke Migräne (9/10)", desc: "Bettlägerig, unerträglich" },
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
  { value: "einseitig_links", label: "🔵 Einseitig links" },
  { value: "einseitig_rechts", label: "🔴 Einseitig rechts" },
  { value: "beidseitig", label: "🟡 Beidseitig" },
  { value: "stirn", label: "🟢 Stirnbereich" },
  { value: "nacken", label: "🟣 Nackenbereich" },
  { value: "schlaefe", label: "🟠 Schläfenbereich" },
];

export const NewEntry = ({ onBack, onSave, entry }: NewEntryProps) => {
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

  const entryIdNum = entry?.id ? Number(entry.id) : null;
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: entrySymptomIds = [], isLoading: loadingSymptoms } = useEntrySymptoms(entryIdNum);
  const setEntrySymptomsMut = useSetEntrySymptoms();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // Medication limit checking
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [limitChecks, setLimitChecks] = useState<LimitCheck[]>([]);
  const [pendingSave, setPendingSave] = useState(false);
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

  useEffect(() => {
    if (entry) {
      setPainLevel(normalizePainLevel(entry.pain_level || 7));
      setPainLocation((entry as any).pain_location || "");
      setSelectedDate(entry.selected_date || new Date().toISOString().slice(0, 10));
      setSelectedTime(entry.selected_time || new Date().toTimeString().slice(0, 5));
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

    // Check medication limits before saving
    const activeMedications = selectedMedications.filter((m) => m !== "-" && m.trim() !== "");
    if (activeMedications.length > 0 && !pendingSave) {
      try {
        const limitResults = await checkLimits.mutateAsync(activeMedications);
        const warningNeeded = limitResults.some(result => 
          result.status === 'warning' || result.status === 'reached' || result.status === 'exceeded'
        );
        
        if (warningNeeded) {
          setLimitChecks(limitResults);
          setShowLimitWarning(true);
          return;
        }
      } catch (error) {
        console.error('Error checking medication limits:', error);
        // Continue with save if limit check fails
      }
    }

    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    setPendingSave(false);
    
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
    
    let weatherId = null;
    try {
      // Use captured coordinates for weather data
      const atISO = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
      if (latitude && longitude) {
        weatherId = await logAndSaveWeatherAtCoords(atISO, latitude, longitude);
      } else {
        weatherId = await logAndSaveWeatherAt(atISO);
      }
    } catch (weatherError) {
      console.warn('Weather data fetch failed, continuing without weather data:', weatherError);
      toast({ 
        title: "⚠️ Wetterdaten nicht verfügbar", 
        description: "Eintrag wird ohne Wetterdaten gespeichert.",
        variant: "default"
      });
    }

    try {
      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTime,
        pain_level: painLevel,
        aura_type: "keine" as const, // Always set to default since aura is removed
        pain_location: (painLocation || null) as "einseitig_links" | "einseitig_rechts" | "beidseitig" | "stirn" | "nacken" | "schlaefe" | null,
        medications: selectedMedications.filter((m) => m !== "-" && m.trim() !== ""),
        notes: notes.trim() || null,
        weather_id: weatherId,
        latitude,
        longitude,
      };

      let savedId: string | number;
      if (entry?.id) {
        await updateMut.mutateAsync({ id: entry.id, patch: payload });
        savedId = entry.id;
      } else {
        savedId = await createMut.mutateAsync(payload as any);
      }

      // Symptome setzen (idempotent)
      const numericId = Number(savedId);
      if (Number.isFinite(numericId)) {
        await setEntrySymptomsMut.mutateAsync({ entryId: numericId, symptomIds: selectedSymptoms });
      }

      // Medication effectiveness is now tracked in the medications array of pain_entries
      // No separate entry_medications table needed

      toast({ 
        title: "✅ Migräne-Eintrag gespeichert", 
        description: "Erfolgreich gespeichert. Ihre Daten sind sicher gespeichert." 
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
    <div className="p-6 bg-gradient-to-br from-background to-secondary/20 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
          aria-label="Zurück zum Hauptmenü"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-center flex-1">
          {entry ? "📝 Migräne-Eintrag bearbeiten" : "✏️ Neue Migräne erfassen"}
        </h1>
        <div className="w-9"></div>
      </div>

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
        <Label className="text-base font-medium mb-3 block">📅 Datum und Uhrzeit</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date-input">Datum</Label>
            <Input 
              id="date-input"
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Migräne-Datum"
            />
          </div>
          <div>
            <Label htmlFor="time-input">Uhrzeit</Label>
            <Input 
              id="time-input"
              type="time" 
              value={selectedTime} 
              onChange={(e) => setSelectedTime(e.target.value)}
              aria-label="Migräne-Uhrzeit"
            />
          </div>
        </div>
        
        {/* Retroactive Entry Warning */}
        {(() => {
          const entryDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
          const now = new Date();
          const isRetroactive = entryDateTime < now && (now.getTime() - entryDateTime.getTime()) > 60000; // 1 minute buffer
          
          if (isRetroactive) {
            return (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-600">⚠️</span>
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800 mb-1">Nachträglicher Eintrag erkannt</p>
                    <p className="text-yellow-700">
                      Die Wetterdaten werden für den gewählten Zeitpunkt ({new Date(entryDateTime).toLocaleString('de-DE')}) abgerufen. 
                      Für genauere Daten könnten Sie den Standort von damals verwenden, falls verfügbar.
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}
      </Card>

      {/* Medikamente */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">💊 Medikamenteneinnahme</Label>
        
        {/* Medikamente-Auswahl */}
        <div className="space-y-2 mb-4">
          <Select value="" onValueChange={(medName) => {
            if (!selectedMedications.includes(medName)) {
              setSelectedMedications(prev => [...prev.filter(m => m !== "-"), medName]);
            }
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Medikament auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {medOptions.filter(m => !selectedMedications.includes(typeof m === 'string' ? m : m.name)).map((m) => (
                <SelectItem key={typeof m === 'string' ? m : m.id} value={typeof m === 'string' ? m : m.name}>
                  {typeof m === 'string' ? m : m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Neues Medikament */}
          <div className="flex gap-2">
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
        </div>

        {/* Ausgewählte Medikamente mit Wirksamkeit */}
        {selectedMedications.filter(m => m !== "-" && m.trim() !== "").length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Ausgewählte Medikamente:</div>
            <div className="space-y-3">
              {selectedMedications.filter(m => m !== "-" && m.trim() !== "").map((med) => {
                const medEffectiveness = medicationsWithEffectiveness.find(m => m.name === med) || {
                  name: med,
                  dosage: "",
                  effectiveness: 0,
                  notes: ""
                };
                
                return (
                  <div key={med} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{med}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMedications(prev => prev.filter(m => m !== med))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Dosierung</label>
                        <Input
                          placeholder="z.B. 10mg"
                          value={medEffectiveness.dosage}
                          onChange={(e) => {
                            const updated = medicationsWithEffectiveness.filter(m => m.name !== med);
                            updated.push({ ...medEffectiveness, dosage: e.target.value });
                            setMedicationsWithEffectiveness(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Wirksamkeit (0-4)</label>
                        <select
                          value={medEffectiveness.effectiveness}
                          onChange={(e) => {
                            const updated = medicationsWithEffectiveness.filter(m => m.name !== med);
                            updated.push({ ...medEffectiveness, effectiveness: parseInt(e.target.value) });
                            setMedicationsWithEffectiveness(updated);
                          }}
                          className="w-full h-9 px-3 rounded-md border border-input bg-background"
                        >
                          <option value={0}>0 - Keine Wirkung</option>
                          <option value={1}>1 - Schwach</option>
                          <option value={2}>2 - Mäßig</option>
                          <option value={3}>3 - Gut</option>
                          <option value={4}>4 - Sehr gut</option>
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs text-muted-foreground">Notizen zur Wirkung</label>
                      <Input
                        placeholder="Nebenwirkungen, Wirkdauer etc."
                        value={medEffectiveness.notes}
                        onChange={(e) => {
                          const updated = medicationsWithEffectiveness.filter(m => m.name !== med);
                          updated.push({ ...medEffectiveness, notes: e.target.value });
                          setMedicationsWithEffectiveness(updated);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Schmerzlokalisation */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">
          📍 Schmerzlokalisation
        </Label>
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
      </Card>

      {/* Symptome */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">🧩 Begleitsymptome</Label>
        {loadingSymptoms && entry ? (
          <div className="text-sm text-muted-foreground mt-2">Lade vorhandene Symptome…</div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
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
      </Card>

      {/* Auslöser/Notizen */}
      <Card className="p-6 mb-4">
        <Label htmlFor="notes-input" className="text-base font-medium mb-3 block">
          📝 Auslöser / Notizen
        </Label>
        <Input
          id="notes-input"
          type="text"
          placeholder="z. B. Stress, helles Licht, Wetterumschwung, Schlafmangel..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Migräne-Auslöser oder Notizen"
        />
      </Card>

      {/* Speichern Button */}
      <Button 
        className="w-full h-14 mt-4 text-lg font-medium" 
        onClick={handleSave} 
        disabled={saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending}
        aria-label="Migräne-Eintrag speichern"
      >
        <Save className="w-5 h-5 mr-2" /> 
        {saving || createMut.isPending || updateMut.isPending || setEntrySymptomsMut.isPending ? "Speichere..." : "Migräne-Eintrag speichern"}
      </Button>

      {/* Medication Limit Warning Dialog */}
      <MedicationLimitWarning
        isOpen={showLimitWarning}
        onOpenChange={setShowLimitWarning}
        limitChecks={limitChecks}
        onContinue={() => {
          setPendingSave(true);
          setShowLimitWarning(false);
          handleSave();
        }}
        onCancel={() => {
          setShowLimitWarning(false);
          setPendingSave(false);
        }}
      />
    </div>
  );
};