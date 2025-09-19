import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PainEntry } from "@/types/painApp";

export const EntriesList = ({
  onBack,
  onEdit,
}: {
  onBack: () => void;
  onEdit: (entry: PainEntry) => void;
}) => {
  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<PainEntry | null>(null);

  const loadEntries = async () => {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("pain_entries")
      .select(
        `
          id,
          timestamp_created,
          selected_date,
          selected_time,
          pain_level,
          medications,
          notes,
          weather:weather_logs!pain_entries_weather_id_fkey (
            location,
            temperature_c,
            pressure_mb,
            humidity,
            condition_text,
            pressure_change_24h,
            moon_phase
          )
        `
      )
      .eq("user_id", userId)
      .order("timestamp_created", { ascending: false });

    if (error) {
      console.error("Fehler beim Laden der Einträge:", error);
      setLoading(false);
      return;
    }

    const transformedData = (data || []).map((entry) => ({
      ...entry,
      weather: Array.isArray(entry.weather) && entry.weather.length > 0
        ? entry.weather[0]
        : Array.isArray(entry.weather)
          ? undefined
          : entry.weather,
    })) as PainEntry[];

    setEntries(transformedData);
    setLoading(false);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;

    const { error } = await supabase.from("pain_entries").delete().eq("id", id);
    if (error) {
      console.error("Fehler beim Löschen:", error);
      alert("Fehler beim Löschen in der Datenbank.");
      return;
    }

    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setSelectedEntry(null);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const formatPainLevel = (level: string) =>
    level.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const formatMoonPhase = (phase: number) => {
    if (phase === 0 || phase === 1) return "🌑 Neumond";
    if (phase === 0.25) return "🌓 Erstes Viertel";
    if (phase === 0.5) return "🌕 Vollmond";
    if (phase === 0.75) return "🌗 Letztes Viertel";
    if (phase > 0 && phase < 0.25) return "🌒 Zunehmender Sichelmond";
    if (phase > 0.25 && phase < 0.5) return "🌔 Zunehmender Mond";
    if (phase > 0.5 && phase < 0.75) return "🌖 Abnehmender Mond";
    if (phase > 0.75 && phase < 1) return "🌘 Abnehmender Sichelmond";
    return `${phase}`;
  };

  return (
    <div className="p-4">
      <Button onClick={onBack} className="mb-4">
        ← Zurück
      </Button>
      <h1 className="text-2xl font-bold mb-4">Gespeicherte Einträge</h1>

      {loading ? (
        <p>Lade Einträge...</p>
      ) : entries.length === 0 ? (
        <p>Keine Einträge vorhanden.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="p-3 border rounded-lg bg-card hover:bg-accent cursor-pointer"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="flex">
                <span className="w-[80px]">{formatDate(entry.selected_date!)}</span>
                <span className="w-[80px]">{entry.selected_time}</span>
              </div>
              {entry.medications && entry.medications.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {entry.medications.join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Detail-Popup */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintragsdetails</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-1">
              <p><strong>📅 Datum:</strong> {formatDate(selectedEntry.selected_date!)}</p>
              <p><strong>⏰ Uhrzeit:</strong> {selectedEntry.selected_time}</p>
              <p><strong>🤕 Schmerzlevel:</strong> {formatPainLevel(selectedEntry.pain_level)}</p>
              <p><strong>💊 Medikamente:</strong> 
                {selectedEntry.medications.length > 0
                  ? " " + selectedEntry.medications.join(", ")
                  : " Keine"}
              </p>

              {selectedEntry.notes && (
                <p><strong>📝 Auslöser / Notiz:</strong> {selectedEntry.notes}</p>
              )}

              {selectedEntry.weather?.moon_phase !== undefined &&
               selectedEntry.weather?.moon_phase !== null && (
                <p>
                  <strong>🌙 Mondphase:</strong> {formatMoonPhase(selectedEntry.weather.moon_phase!)}
                </p>
              )}

              {selectedEntry.weather && (
                <>
                  <p><strong>🌍 Ort:</strong> {selectedEntry.weather.location || "Unbekannt"}</p>
                  <p><strong>🌡 Temperatur:</strong> {selectedEntry.weather.temperature_c ?? "-"}°C</p>
                  <p><strong>☁ Wetter:</strong> {selectedEntry.weather.condition_text || "-"}</p>
                  <p><strong>💧 Luftfeuchtigkeit:</strong> {selectedEntry.weather.humidity ?? "-"}%</p>
                  <p><strong>🔽 Luftdruck:</strong> {selectedEntry.weather.pressure_mb ?? "-"} hPa</p>
                  <p><strong>📉 Luftdruckänderung (24h):</strong> {selectedEntry.weather.pressure_change_24h ?? "-"} hPa</p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedEntry && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (selectedEntry) {
                      onEdit(selectedEntry); // 🔹 jetzt korrekt
                      setSelectedEntry(null);
                    }
                  }}
                >
                  Bearbeiten
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteEntry(selectedEntry.id)}
                >
                  Eintrag löschen
                </Button>
              </>
            )}
            <Button onClick={() => setSelectedEntry(null)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
