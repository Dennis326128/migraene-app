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
import { 
  Thermometer, 
  Droplets, 
  Gauge, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  MapPin,
  CloudSun,
  AlertCircle
} from "lucide-react";

export const EntriesList = ({
  onBack,
  onEdit,
}: {
  onBack: () => void;
  onEdit: (entry: MigraineEntry) => void;
}) => {
  const [limit, setLimit] = useState(50);
  const { data: entries = [], isLoading, isError } = useEntries({ limit });
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
              className="p-4 border-border/30 border rounded-lg bg-card hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="space-y-2">
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
                
                {/* Kompakte Wetter-Vorschau */}
                {entry.weather && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border/30">
                    {entry.weather.temperature_c != null && (
                      <span className="flex items-center gap-1">
                        <Thermometer className="h-3 w-3" />
                        {entry.weather.temperature_c}°C
                      </span>
                    )}
                    {entry.weather.humidity != null && (
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        {entry.weather.humidity}%
                      </span>
                    )}
                    {entry.weather.pressure_mb != null && (
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {entry.weather.pressure_mb} hPa
                      </span>
                    )}
                    {entry.weather.pressure_change_24h != null && Math.abs(entry.weather.pressure_change_24h) > 3 && (
                      <span className="text-orange-600">⚠️</span>
                    )}
                  </div>
                )}
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
                  <p className="font-medium mb-3 flex items-center gap-2">
                    <CloudSun className="h-5 w-5 text-primary" />
                    Wetterdaten
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">Temperatur:</span>
                      <span className="font-medium">{selectedEntry.weather.temperature_c ?? "-"}°C</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">Luftfeuchtigkeit:</span>
                      <span className="font-medium">{selectedEntry.weather.humidity ?? "-"}%</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-purple-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">Luftdruck:</span>
                      <span className="font-medium">{selectedEntry.weather.pressure_mb ?? "-"} hPa</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {selectedEntry.weather.pressure_change_24h != null && selectedEntry.weather.pressure_change_24h > 0 ? (
                        <TrendingUp className="h-4 w-4 text-red-500 shrink-0" />
                      ) : selectedEntry.weather.pressure_change_24h != null && selectedEntry.weather.pressure_change_24h < 0 ? (
                        <TrendingDown className="h-4 w-4 text-blue-500 shrink-0" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-gray-500 shrink-0" />
                      )}
                      <span className="text-muted-foreground min-w-[140px]">Luftdrucktrend:</span>
                      <span className="font-medium">
                        {selectedEntry.weather.pressure_change_24h != null ? (
                          <>
                            {selectedEntry.weather.pressure_change_24h > 0 ? "+" : ""}
                            {selectedEntry.weather.pressure_change_24h.toFixed(1)} hPa
                            {Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                              <span className="ml-2 text-orange-600">⚠️ Stark</span>
                            )}
                          </>
                        ) : "-"}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">Ort:</span>
                      <span className="font-medium truncate">{selectedEntry.weather.location || "Unbekannt"}</span>
                    </div>
                  </div>
                  
                  {/* Migräne-Trigger-Warnung */}
                  {selectedEntry.weather.pressure_change_24h != null && Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                    <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/30 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-600">
                        Starke Luftdruckänderung kann Migräne auslösen
                      </p>
                    </div>
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
      
      {sorted.length >= limit && (
        <div 
          className="mt-6 py-5 text-center cursor-pointer text-muted-foreground/60 text-sm
                     hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors
                     select-none touch-manipulation"
          onClick={() => setLimit(prev => prev + 50)}
        >
          {isLoading ? (
            <span className="animate-pulse">Lädt...</span>
          ) : (
            <span className="tracking-widest">···</span>
          )}
        </div>
      )}
    </div>
  );
};