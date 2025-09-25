import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MigraineEntry } from "@/types/painApp";
import { logAndSaveWeatherAt } from "@/utils/weatherLogger";
import { useCreateEntry, useUpdateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { useSymptomCatalog, useEntrySymptoms, useSetEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";

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

const auraTypes = [
  { value: "keine", label: "Keine Aura" },
  { value: "visuell", label: "Visuelle Aura (Blitze, Zacken)" },
  { value: "sensorisch", label: "Sensorische Aura (Taubheit, Kribbeln)" },
  { value: "sprachlich", label: "Sprachliche Aura (Wortfindung)" },
  { value: "gemischt", label: "Gemischte Aura" },
];

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

  const [painLevel, setPainLevel] = useState<string>("-");
  const [auraType, setAuraType] = useState<string>("keine");
  const [painLocation, setPainLocation] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedMedications, setSelectedMedications] = useState<string[]>(["-"]);
  const [newMedication, setNewMedication] = useState("");
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<string>("");

  const entryIdNum = entry?.id ? Number(entry.id) : null;
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: entrySymptomIds = [], isLoading: loadingSymptoms } = useEntrySymptoms(entryIdNum);
  const setEntrySymptomsMut = useSetEntrySymptoms();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  useEffect(() => {
    if (entry && entrySymptomIds) setSelectedSymptoms(entrySymptomIds);
  }, [entry, entrySymptomIds]);

  const { data: medOptions = [] } = useMeds();
  const addMedMut = useAddMed();
  const delMedMut = useDeleteMed();
  const createMut = useCreateEntry();
  const updateMut = useUpdateEntry();

  useEffect(() => {
    if (entry) {
      setPainLevel(entry.pain_level || "-");
      setAuraType((entry as any).aura_type || "keine");
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

  // Enhanced pain level setter with haptic feedback
  const handlePainLevelChange = useCallback((newLevel: string) => {
    setPainLevel(newLevel);
    triggerHapticFeedback();
  }, []);

  // Keyboard navigation for pain levels
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!painLevelSectionRef.current?.contains(document.activeElement)) return;
    
    const currentIndex = painLevels.findIndex(level => level.value === painLevel);
    let newIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        newIndex = Math.min(currentIndex + 1, painLevels.length - 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = painLevels.length - 1;
        break;
    }
    
    if (newIndex !== currentIndex && newIndex >= 0) {
      handlePainLevelChange(painLevels[newIndex].value);
      // Focus the corresponding button
      const buttons = painLevelSectionRef.current?.querySelectorAll('button');
      if (buttons && buttons[newIndex]) {
        (buttons[newIndex] as HTMLButtonElement).focus();
      }
    }
  }, [painLevel, handlePainLevelChange]);

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSave = async () => {
    if (!painLevel || painLevel === "-") {
      toast({ title: "Fehler", description: "Bitte Migräne-Intensität auswählen", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Wetter nur bei rückdatierten Einträgen sofort abfragen
      const atISO = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
      const now = new Date();
      const isBackdated =
        selectedDate < now.toISOString().slice(0,10) ||
        (selectedDate === now.toISOString().slice(0,10) &&
         new Date(atISO).getTime() < now.getTime() - 2 * 60 * 60 * 1000); // >2h in der Vergangenheit

      const weatherId = isBackdated ? await logAndSaveWeatherAt(atISO) : null;

      const payload = {
        selected_date: selectedDate,
        selected_time: selectedTime,
        pain_level: painLevel as "leicht" | "mittel" | "stark" | "sehr_stark",
        aura_type: auraType as "keine" | "visuell" | "sensorisch" | "sprachlich" | "gemischt",
        pain_location: (painLocation || null) as "einseitig_links" | "einseitig_rechts" | "beidseitig" | "stirn" | "nacken" | "schlaefe" | null,
        medications: selectedMedications.filter((m) => m !== "-" && m.trim() !== ""),
        notes: notes.trim() || null,
        weather_id: weatherId,
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

      toast({ title: "✅ Migräne-Eintrag gespeichert", description: "Erfolgreich gespeichert." });
      onSave?.();
      onBack();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message ?? String(err), variant: "destructive" });
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

      {/* Migräne-Intensität */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">
          🩺 Migräne-Intensität *
        </Label>
        <div className="text-sm text-muted-foreground mb-2">
          💡 Tipp: Nutzen Sie die Pfeiltasten ↑↓ zur Navigation
        </div>
        <div ref={painLevelSectionRef} className="grid gap-3" role="radiogroup" aria-label="Migräne-Intensität auswählen">
          {painLevels.map((level, index) => (
            <Button
              key={level.value}
              type="button"
              variant={painLevel === level.value ? "default" : "outline"}
              className="h-auto p-4 text-left justify-start transition-all duration-200 hover:scale-[1.02]"
              onClick={() => handlePainLevelChange(level.value)}
              aria-pressed={painLevel === level.value}
              role="radio"
              aria-checked={painLevel === level.value}
              tabIndex={index === 0 ? 0 : -1}
            >
              <div className="flex flex-col items-start w-full">
                <span className="font-medium">{level.label}</span>
                <span className="text-sm text-muted-foreground mt-1">{level.desc}</span>
              </div>
            </Button>
          ))}
        </div>
      </Card>

      {/* Aura */}
      <Card className="p-6 mb-4">
        <Label className="text-base font-medium mb-3 block">
          ✨ Aura-Symptome
        </Label>
        <div className="grid gap-2">
          {auraTypes.map((aura) => (
            <Button
              key={aura.value}
              type="button"
              variant={auraType === aura.value ? "default" : "outline"}
              className="justify-start"
              onClick={() => setAuraType(aura.value)}
              aria-pressed={auraType === aura.value}
            >
              {aura.label}
            </Button>
          ))}
        </div>
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

      {/* Medikamente */}
      <Card className="p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <Label className="text-base font-medium">💊 Medikamenteneinnahme</Label>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowAddMedication(!showAddMedication)}
            aria-label="Neues Medikament hinzufügen"
          >
            <Plus className="w-4 h-4 mr-1" /> Neu
          </Button>
        </div>

        {showAddMedication && (
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Neues Medikament"
              value={newMedication}
              onChange={(e) => setNewMedication(e.target.value)}
              aria-label="Name des neuen Medikaments"
            />
            <Button onClick={handleAddNewMedication} aria-label="Medikament hinzufügen">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {selectedMedications.map((med, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <Select
              value={med}
              onValueChange={(v) => {
                const updated = [...selectedMedications];
                updated[index] = v;
                setSelectedMedications(updated);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Medikament auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-">-</SelectItem>
                {medOptions.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (index === 0 && selectedMedications.length === 1) return;
                setSelectedMedications((prev) => prev.filter((_, i) => i !== index));
              }}
              aria-label="Medikament entfernen"
            >
              <X className="w-4 h-4" />
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleDeleteMedication(med)}
              aria-label={`${med} aus Liste löschen`}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}

        <Button
          className="w-full mt-2"
          variant="outline"
          disabled={selectedMedications[0] === "-"}
          onClick={() => setSelectedMedications((prev) => [...prev, "-"])}
          aria-label="Weiteres Medikament hinzufügen"
        >
          + Weiteres Medikament
        </Button>
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
    </div>
  );
};