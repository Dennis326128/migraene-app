import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Plus, X, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PainEntry } from "@/types/painApp";
import { logAndSaveWeatherAt } from "@/utils/weatherLogger";
import { useCreateEntry, useUpdateEntry } from "@/features/entries/hooks/useEntryMutations";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";

interface NewEntryProps {
  onBack: () => void;
  onSave?: () => void;
  entry?: PainEntry | null;
}

const painLevels = [
  { value: "-", label: "-" },
  { value: "leicht", label: "Leicht" },
  { value: "mittel", label: "Mittel" },
  { value: "stark", label: "Stark" },
  { value: "sehr_stark", label: "Sehr stark" }
];

export const NewEntry = ({ onBack, onSave, entry }: NewEntryProps) => {
  const { toast } = useToast();

  const [painLevel, setPainLevel] = useState(entry?.pain_level || "stark");
  const [selectedDate, setSelectedDate] = useState(entry?.selected_date || new Date().toISOString().split("T")[0]);
  const [selectedTime, setSelectedTime] = useState(entry?.selected_time || new Date().toTimeString().slice(0, 5));
  const [selectedMedications, setSelectedMedications] = useState<string[]>(entry?.medications || ["-"]);
  const [newMedication, setNewMedication] = useState("");
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(entry?.notes || "");

  const { data: medOptions = [] } = useMeds();
  const addMedMut = useAddMed();
  const delMedMut = useDeleteMed();
  const createMut = useCreateEntry();
  const updateMut = useUpdateEntry();


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

  const handleSave = async () => {
    if (!painLevel || painLevel === "-") {
      toast({ title: "Fehler", description: "Bitte Schmerzstufe auswählen", variant: "destructive" });
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
        medications: selectedMedications.filter((m) => m !== "-" && m.trim() !== ""),
        notes: notes.trim() || null,
        weather_id: weatherId,
      };

      if (entry?.id) {
        await updateMut.mutateAsync({ id: entry.id, patch: payload });
      } else {
        await createMut.mutateAsync(payload);
      }

      toast({ title: "✓ Eintrag gespeichert", description: "Erfolgreich gespeichert." });
      onSave?.();
      onBack();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <Home className="w-5 h-5 mr-2" /> Home
          </Button>
          <h2 className="text-xl font-medium">
            {entry ? "Eintrag bearbeiten" : "Neuer Eintrag"}
          </h2>
          <div className="w-16" />
        </div>

        <Card className="p-6 mb-4">
          <Label>Schmerzstufe</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {painLevels.map((level) => (
              <Button
                key={level.value}
                variant={painLevel === level.value ? "default" : "outline"}
                onClick={() => setPainLevel(level.value)}
              >
                {level.label}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-6 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div>
              <Label>Uhrzeit</Label>
              <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-4">
          <Label>Auslöser / Notiz</Label>
          <Input
            type="text"
            placeholder="z. B. Stress, Überanstrengung, Lärm..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Card>

        <Card className="p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <Label>Tabletten-Einnahme</Label>
            <Button variant="ghost" size="sm" onClick={() => setShowAddMedication(!showAddMedication)}>
              <Plus className="w-4 h-4 mr-1" /> Neu
            </Button>
          </div>

          {showAddMedication && (
            <div className="mb-4 flex gap-2">
              <Input
                placeholder="Neues Medikament"
                value={newMedication}
                onChange={(e) => setNewMedication(e.target.value)}
              />
              <Button onClick={handleAddNewMedication}>
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
              >
                <X className="w-4 h-4" />
              </Button>

              <Button variant="ghost" size="sm" onClick={() => handleDeleteMedication(med)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}

          <Button
            className="w-full mt-2"
            variant="outline"
            disabled={selectedMedications[0] === "-"}
            onClick={() => setSelectedMedications((prev) => [...prev, "-"])}
          >
            + Weiteres Medikament
          </Button>
        </Card>

        <Button className="w-full h-14 mt-4" onClick={handleSave} disabled={saving || createMut.isPending || updateMut.isPending}>
          <Save className="w-5 h-5 mr-2" /> {saving || createMut.isPending || updateMut.isPending ? "Speichern..." : "Speichern"}
        </Button>
      </div>
    </div>
  );
};