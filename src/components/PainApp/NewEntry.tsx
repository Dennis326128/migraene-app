import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Plus, X, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "../../lib/supabaseClient";
import { PainEntry } from "@/types/painApp";
import { logAndSaveWeather } from "@/utils/weatherLogger";

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
  const [allMedications, setAllMedications] = useState<string[]>([]);
  const [newMedication, setNewMedication] = useState("");
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(entry?.notes || "");

  useEffect(() => {
    const loadMedications = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data, error } = await supabase
        .from("user_medications")
        .select("name")
        .eq("user_id", authData.user.id);

      if (!error && data) setAllMedications(data.map((m) => m.name));
    };
    loadMedications();
  }, []);

  const handleAddNewMedication = async () => {
    if (!newMedication.trim()) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { error } = await supabase
      .from("user_medications")
      .insert({ user_id: authData.user.id, name: newMedication.trim() });

    if (!error) {
      setAllMedications((prev) => [...prev, newMedication.trim()]);
      setNewMedication("");
      setShowAddMedication(false);
      toast({ title: "Medikament hinzugefügt", description: `${newMedication} wurde hinzugefügt.` });
    } else {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteMedication = async (name: string) => {
    if (!confirm(`Möchten Sie ${name} wirklich löschen?`)) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { error } = await supabase
      .from("user_medications")
      .delete()
      .eq("user_id", authData.user.id)
      .eq("name", name);

    if (!error) {
      setAllMedications((prev) => prev.filter((m) => m !== name));
      setSelectedMedications((prev) => prev.map((m) => (m === name ? "-" : m)));
      toast({ title: "Gelöscht", description: `${name} wurde gelöscht.` });
    } else {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!painLevel || painLevel === "-") {
      toast({ title: "Fehler", description: "Bitte Schmerzstufe auswählen", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Kein Nutzer gefunden");

      // Wetter zuerst loggen → weather_id
      const weatherId = await logAndSaveWeather();

      const payload: Partial<PainEntry> & {
        selected_date: string;
        selected_time: string;
        pain_level: string;
        medications: string[];
        notes: string | null;
        weather_id?: number | null;
      } = {
        selected_date: selectedDate,
        selected_time: selectedTime,
        pain_level: painLevel,
        medications: selectedMedications.filter((m) => m !== "-" && m.trim() !== ""),
        notes: notes.trim() || null,
        weather_id: weatherId ?? null,
      };

      let error;
      if (entry?.id) {
        ({ error } = await supabase.from("pain_entries").update(payload).eq("id", entry.id));
      } else {
        ({ error } = await supabase.from("pain_entries").insert({
          user_id: authData.user.id,
          timestamp_created: new Date().toISOString(),
          ...payload,
        }));
      }

      if (error) throw new Error(error.message);

      toast({ title: "✓ Eintrag gespeichert", description: "Erfolgreich gespeichert." });
      onSave?.();
      onBack();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
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
                  {allMedications.map((m) => (
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

        <Button className="w-full h-14 mt-4" onClick={handleSave} disabled={saving}>
          <Save className="w-5 h-5 mr-2" /> {saving ? "Speichern..." : "Speichern"}
        </Button>
      </div>
    </div>
  );
};
