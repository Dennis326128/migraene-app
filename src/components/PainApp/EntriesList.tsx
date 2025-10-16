import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatPainLevel, formatAuraType, formatPainLocation } from "@/lib/utils/pain";
import { PainEntry, MigraineEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { useSymptomCatalog, useEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";
import { EmptyState } from "@/components/ui/empty-state";

export const EntriesList = ({
  onBack,
  onEdit,
}: {
  onBack: () => void;
  onEdit: (entry: MigraineEntry) => void;
}) => {
  const { data: entries = [], isLoading, isError } = useEntries();
  const { mutate: deleteMutate } = useDeleteEntry();
  const [selectedEntry, setSelectedEntry] = useState<MigraineEntry | null>(null);

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
    <div className="p-4 bg-gradient-to-br from-background to-secondary/20 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <Button onClick={onBack} variant="ghost" className="p-2 hover:bg-secondary/80">
          ← Zurück
        </Button>
        <h1 className="text-xl font-semibold">📊 Migräne-Verlauf</h1>
        <div className="w-16"></div>
      </div>
      
      <div className="mb-4">
        <Button variant="outline" onClick={async () => {
          const btn = document.activeElement as HTMLButtonElement | null;
          if (btn) btn.disabled = true;
          const { backfillMigrainWeatherEntries } = await import("@/utils/migraineBackfill");
          const res = await backfillMigrainWeatherEntries(30);
          alert(`🌤️ Wetter nachgetragen:\n✅ Erfolgreich: ${res.success}\n❌ Fehlgeschlagen: ${res.failed}\n📊 Gesamt: ${res.total}`);
          if (btn) btn.disabled = false;
        }}>
          🌤️ Wetter nachtragen (30 Tage)
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex justify-center py-8">
          <EmptyState
            icon="📋"
            title="Noch keine Einträge"
            description="Ihre Migräne-Einträge werden hier angezeigt. Erstellen Sie Ihren ersten Eintrag, um zu beginnen."
            action={{
              label: "Ersten Eintrag erstellen",
              onClick: onBack,
              variant: "default"
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((entry) => (
            <div
              key={entry.id}
              className="p-4 border rounded-lg bg-card hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium">
                      {formatDate(entry.selected_date || entry.timestamp_created)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {entry.selected_time ?? new Date(entry.timestamp_created).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm">
                    <strong>Intensität:</strong> {formatPainLevel(entry.pain_level)}
                  </p>
                  {entry.medications?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      💊 {entry.medications.join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-lg">
                  {entry.pain_level === "sehr_stark" ? "🔴" : 
                   entry.pain_level === "stark" ? "🟠" :
                   entry.pain_level === "mittel" ? "💛" : "💚"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">🩺 Migräne-Eintrag Details</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-3 text-sm">
              <p><strong>📅 Datum:</strong> {formatDate(selectedEntry.selected_date || selectedEntry.timestamp_created)}</p>
              <p><strong>⏰ Uhrzeit:</strong> {selectedEntry.selected_time ?? new Date(selectedEntry.timestamp_created).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p>
              
              <p><strong>🩺 Migräne-Intensität:</strong> {formatPainLevel(selectedEntry.pain_level)}</p>
              
              {(selectedEntry as any).aura_type && (selectedEntry as any).aura_type !== "keine" && (
                <p><strong>✨ Aura:</strong> {formatAuraType((selectedEntry as any).aura_type)}</p>
              )}
              
              {(selectedEntry as any).pain_location && (
                <p><strong>📍 Lokalisation:</strong> {formatPainLocation((selectedEntry as any).pain_location)}</p>
              )}

              <p>
                <strong>💊 Medikamente:</strong>{" "}
                {selectedEntry.medications?.length 
                  ? selectedEntry.medications.join(", ") 
                  : "Keine"}
              </p>

              <p><strong>🧩 Symptome:</strong> {symptomNames.length ? symptomNames.join(", ") : "Keine"}</p>

              {selectedEntry.notes && (
                <p><strong>📝 Auslöser / Notiz:</strong> {selectedEntry.notes}</p>
              )}

              {selectedEntry.weather?.moon_phase != null && (
                <p><strong>🌙 Mondphase:</strong> {formatMoonPhase(selectedEntry.weather.moon_phase)}</p>
              )}

              {selectedEntry.weather && (
                <div className="mt-4 pt-3 border-t">
                  <p className="font-medium mb-2">🌤️ Wetterdaten:</p>
                  <p><strong>🌍 Ort:</strong> {selectedEntry.weather.location || "Unbekannt"}</p>
                  <p><strong>🌡 Temperatur:</strong> {selectedEntry.weather.temperature_c ?? "-"}°C</p>
                  <p><strong>☁ Wetter:</strong> {selectedEntry.weather.condition_text || "-"}</p>
                  <p><strong>💧 Luftfeuchtigkeit:</strong> {selectedEntry.weather.humidity ?? "-"}%</p>
                  <p><strong>🔽 Luftdruck:</strong> {selectedEntry.weather.pressure_mb ?? "-"} hPa</p>
                  <p><strong>📈 Luftdrucktrend (24h):</strong>{" "}
                    {selectedEntry.weather.pressure_change_24h != null ? (
                      <>
                        {selectedEntry.weather.pressure_change_24h > 0 ? "↗️ +" : 
                         selectedEntry.weather.pressure_change_24h < 0 ? "↘️ " : "➡️ "}
                        {selectedEntry.weather.pressure_change_24h.toFixed(1)} hPa
                        {Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                          <span className="text-orange-600 ml-1">⚠️</span>
                        )}
                      </>
                    ) : "-"}
                  </p>
                  {selectedEntry.weather.pressure_change_24h != null && Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                    <p className="text-xs text-orange-600 mt-1">
                      💡 Starke Luftdruckänderung kann Migräne auslösen
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {selectedEntry && (
              <>
                <Button variant="secondary" onClick={() => { onEdit(selectedEntry); setSelectedEntry(null); }}>
                  ✏️ Bearbeiten
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(selectedEntry.id)}>
                  🗑️ Löschen
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