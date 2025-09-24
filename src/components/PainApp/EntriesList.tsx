import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { backfillWeatherForRecentEntries } from "@/utils/backfillWeather";
import { useSymptomCatalog, useEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";

export const EntriesList = ({
  onBack,
  onEdit,
}: {
  onBack: () => void;
  onEdit: (entry: PainEntry) => void;
}) => {
  const { data: entries = [], isLoading, isError } = useEntries();
  const { mutate: deleteMutate } = useDeleteEntry();
  const [selectedEntry, setSelectedEntry] = useState<PainEntry | null>(null);

  const { data: symptomCatalog = [] } = useSymptomCatalog();
  const entryIdNum = selectedEntry?.id ? Number(selectedEntry.id) : null;
  const { data: symptomIds = [] } = useEntrySymptoms(entryIdNum);
  const symptomNameById = new Map(symptomCatalog.map(s => [s.id, s.name]));
  const symptomNames = symptomIds.map(id => symptomNameById.get(id) || id);

  const sorted = useMemo(
    () => [...entries].sort((a, b) =>
      new Date(b.timestamp_created).getTime() - new Date(a.timestamp_created).getTime()
    ),
    [entries]
  );

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

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

  const handleDelete = (id: string) => {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    deleteMutate(id);
    setSelectedEntry(null);
  };

  if (isLoading) return (<div className="p-4">Lade Einträge...</div>);
  if (isError)   return (<div className="p-4 text-destructive">Fehler beim Laden der Einträge.</div>);

  return (
    <div className="p-4">
      <Button onClick={onBack} className="mb-4">← Zurück</Button>
      <h1 className="text-2xl font-bold mb-4">Gespeicherte Einträge</h1>
      <div className="mb-3">
        <Button variant="outline" onClick={async () => {
          const btn = document.activeElement as HTMLButtonElement | null;
          if (btn) btn.disabled = true;
          const res = await backfillWeatherForRecentEntries(30);
          alert(`Wetter nachgetragen:\nGesamt: ${res.total}\nErfolgreich: ${res.ok}\nFehlgeschlagen: ${res.fail}`);
          if (btn) btn.disabled = false;
        }}>
          🌤️ Wetter nachtragen (30 Tage)
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p>Keine Einträge vorhanden.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((entry) => (
            <li
              key={entry.id}
              className="p-3 border rounded-lg bg-card hover:bg-accent cursor-pointer"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="flex">
                <span className="w-[80px]">{formatDate(entry.selected_date || entry.timestamp_created)}</span>
                <span className="w-[80px]">{entry.selected_time ?? new Date(entry.timestamp_created).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {entry.medications?.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {entry.medications.join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintragsdetails</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-1">
              <p><strong>📅 Datum:</strong> {formatDate(selectedEntry.selected_date || selectedEntry.timestamp_created)}</p>
              <p><strong>⏰ Uhrzeit:</strong> {selectedEntry.selected_time ?? new Date(selectedEntry.timestamp_created).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p>
              <p><strong>🤕 Schmerzlevel:</strong> {formatPainLevel(selectedEntry.pain_level)}</p>
              <p><strong>💊 Medikamente:</strong>
                {selectedEntry.medications?.length
                  ? " " + selectedEntry.medications.join(", ")
                  : " Keine"}
              </p>

              <p><strong>🧩 Symptome:</strong> {symptomNames.length ? symptomNames.join(", ") : "Keine"}</p>

              {selectedEntry.notes && (
                <p><strong>📝 Auslöser / Notiz:</strong> {selectedEntry.notes}</p>
              )}

              {selectedEntry.weather?.moon_phase != null && (
                <p><strong>🌙 Mondphase:</strong> {formatMoonPhase(selectedEntry.weather.moon_phase)}</p>
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
                <Button variant="secondary" onClick={() => { onEdit(selectedEntry); setSelectedEntry(null); }}>
                  Bearbeiten
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(selectedEntry.id)}>
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