import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatPainLevel as formatPainLevelUtil, formatAuraType, formatPainLocation } from "@/lib/utils/pain";
import { PainEntry, MigraineEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { useSymptomCatalog, useEntrySymptoms } from "@/features/symptoms/hooks/useSymptoms";
import { useEntryIntakes } from "@/features/medication-intakes/hooks/useMedicationIntakes";
import { formatDoseFromQuarters, DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteConfirmation } from "@/components/ui/delete-confirmation";
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
import { useLanguage } from "@/hooks/useLanguage";

export const EntriesList = ({
  onBack,
  onEdit,
}: {
  onBack: () => void;
  onEdit: (entry: MigraineEntry) => void;
}) => {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const [limit, setLimit] = useState(50);
  const { data: entries = [], isLoading, isError } = useEntries({ limit });
  const { mutate: deleteMutate, isPending: isDeleting } = useDeleteEntry();
  const [selectedEntry, setSelectedEntry] = useState<MigraineEntry | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const { data: symptomCatalog = [] } = useSymptomCatalog();
  const entryIdNum = selectedEntry?.id ? Number(selectedEntry.id) : null;
  const { data: symptomIds = [] } = useEntrySymptoms(entryIdNum);
  const { data: entryIntakes = [] } = useEntryIntakes(entryIdNum);
  const symptomNameById = new Map(symptomCatalog.map(s => [s.id, s.name]));
  const symptomNames = symptomIds.map(id => symptomNameById.get(id) || id);
  
  // Build medication display with doses
  const formatMedicationsWithDose = (entry: MigraineEntry, intakes: typeof entryIntakes) => {
    if (!entry.medications?.length) return t('common.none');
    
    const intakeMap = new Map(intakes.map(i => [i.medication_name, i.dose_quarters]));
    
    return entry.medications.map(med => {
      const quarters = intakeMap.get(med) ?? DEFAULT_DOSE_QUARTERS;
      const doseStr = formatDoseFromQuarters(quarters);
      return quarters !== DEFAULT_DOSE_QUARTERS ? `${med} · ${doseStr}` : med;
    }).join(", ");
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) =>
      new Date(b.timestamp_created).getTime() - new Date(a.timestamp_created).getTime()
    ),
    [entries]
  );

  const dateLocale = currentLanguage === 'de' ? 'de-DE' : 'en-US';

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit", year: "2-digit" });

  const formatPainLevel = (level: string) =>
    level.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const formatMoonPhase = (phase: number) => {
    if (phase === 0 || phase === 1) return `🌑 ${t('moon.newMoon')}`;
    if (phase === 0.25) return `🌓 ${t('moon.firstQuarter')}`;
    if (phase === 0.5) return `🌕 ${t('moon.fullMoon')}`;
    if (phase === 0.75) return `🌗 ${t('moon.lastQuarter')}`;
    if (phase > 0 && phase < 0.25) return `🌒 ${t('moon.waxingCrescent')}`;
    if (phase > 0.25 && phase < 0.5) return `🌔 ${t('moon.waxingGibbous')}`;
    if (phase > 0.5 && phase < 0.75) return `🌖 ${t('moon.waningGibbous')}`;
    if (phase > 0.75 && phase < 1) return `🌘 ${t('moon.waningCrescent')}`;
    return `${phase}`;
  };

  const handleDeleteClick = (id: string) => {
    setEntryToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (entryToDelete) {
      deleteMutate(entryToDelete);
      setSelectedEntry(null);
      setDeleteConfirmOpen(false);
      setEntryToDelete(null);
    }
  };

  if (isLoading) return (<div className="p-4">{t('entry.loading')}</div>);
  if (isError) return (<div className="p-4 text-destructive">{t('entry.loadError')}</div>);

  return (
    <div className="p-4 bg-gradient-to-br from-background to-secondary/20 min-h-screen">
      <div className="flex items-center justify-between mb-2">
        <Button onClick={onBack} variant="ghost" className="p-2 hover:bg-secondary/80">
          ← {t('common.back')}
        </Button>
        <h1 className="text-xl font-semibold">📊 {t('entry.entriesAndHistory')}</h1>
        <div className="w-16"></div>
      </div>
      <p className="text-center text-sm text-muted-foreground mb-6">
        {t('entry.viewAll')}
      </p>

      {sorted.length === 0 ? (
        <div className="flex justify-center py-8">
          <EmptyState
            icon="📋"
            title={t('entry.noEntries')}
            description={t('entry.noEntriesDesc')}
            action={{
              label: t('entry.createFirst'),
              onClick: onBack,
              variant: "default"
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((entry) => {
            const painLevel = entry.pain_level;
            const isNumeric = !isNaN(Number(painLevel));
            const numericPain = isNumeric ? Number(painLevel) : 
              painLevel === "sehr_stark" ? 9 :
              painLevel === "stark" ? 7 :
              painLevel === "mittel" ? 5 : 2;
            
            return (
              <div
                key={entry.id}
                className="p-3 border-border/30 border rounded-lg bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ 
                      backgroundColor: numericPain >= 8 ? '#ef4444' : 
                                       numericPain >= 6 ? '#fb923c' :
                                       numericPain >= 4 ? '#fbbf24' : 
                                       'hsl(var(--muted-foreground) / 0.4)'
                    }}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm">
                        {formatDate(entry.selected_date || entry.timestamp_created)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.selected_time ?? new Date(entry.timestamp_created).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatPainLevel(painLevel)} ({numericPain}/10)
                      {entry.medications?.length > 0 && (
                        <span className="ml-2">· 💊 {entry.medications.join(", ")}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">🩺 {t('entry.details')}</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-3 text-sm">
              <p><strong>📅 {t('time.date')}:</strong> {formatDate(selectedEntry.selected_date || selectedEntry.timestamp_created)}</p>
              <p><strong>⏰ {t('time.time')}:</strong> {selectedEntry.selected_time ?? new Date(selectedEntry.timestamp_created).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}</p>
              
              <p><strong>🩺 {t('pain.intensity')}:</strong> {formatPainLevel(selectedEntry.pain_level)}</p>
              
              {(selectedEntry as any).aura_type && (selectedEntry as any).aura_type !== "keine" && (
                <p><strong>✨ {t('aura.title')}:</strong> {formatAuraType((selectedEntry as any).aura_type)}</p>
              )}
              
              {(selectedEntry as any).pain_locations && (selectedEntry as any).pain_locations.length > 0 && (
                <p><strong>📍 {t('pain.localisation')}:</strong> {(selectedEntry as any).pain_locations.map(formatPainLocation).join(', ')}</p>
              )}

              <p>
                <strong>💊 {t('medication.medications')}:</strong>{" "}
                {formatMedicationsWithDose(selectedEntry, entryIntakes)}
              </p>

              <p><strong>🧩 {t('symptoms.title')}:</strong> {symptomNames.length ? symptomNames.join(", ") : t('common.none')}</p>

              {selectedEntry.notes && (
                <p><strong>📝 {t('analysis.triggers')} / {t('voice.note')}:</strong> {selectedEntry.notes}</p>
              )}

              {selectedEntry.weather?.moon_phase != null && (
                <p><strong>🌙 {t('moon.phase')}:</strong> {formatMoonPhase(selectedEntry.weather.moon_phase)}</p>
              )}

              {selectedEntry.weather && (
                <div className="mt-4 pt-3 border-t">
                  <p className="font-medium mb-3 flex items-center gap-2">
                    <CloudSun className="h-5 w-5 text-primary" />
                    {t('weather.data')}
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">{t('weather.temperature')}:</span>
                      <span className="font-medium">{selectedEntry.weather.temperature_c ?? "-"}°C</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">{t('weather.humidity')}:</span>
                      <span className="font-medium">{selectedEntry.weather.humidity ?? "-"}%</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-purple-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">{t('weather.pressure')}:</span>
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
                      <span className="text-muted-foreground min-w-[140px]">{t('weather.pressureTrend')}:</span>
                      <span className="font-medium">
                        {selectedEntry.weather.pressure_change_24h != null ? (
                          <>
                            {selectedEntry.weather.pressure_change_24h > 0 ? "+" : ""}
                            {selectedEntry.weather.pressure_change_24h.toFixed(1)} hPa
                            {Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                              <span className="ml-2 text-orange-600">⚠️ {t('common.strong')}</span>
                            )}
                          </>
                        ) : (
                          <span title="Nicht verfügbar – fehlende Vergleichsdaten 24h zuvor.">–</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[140px]">{t('weather.location')}:</span>
                      <span className="font-medium truncate">{selectedEntry.weather.location || t('common.unknown')}</span>
                    </div>
                  </div>
                  
                  {selectedEntry.weather.pressure_change_24h != null && Math.abs(selectedEntry.weather.pressure_change_24h) > 3 && (
                    <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/30 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-600">
                        {t('weather.pressureWarning')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!selectedEntry.weather && (
                <div className="mt-4 pt-3 border-t">
                  <p className="font-medium mb-2 flex items-center gap-2">
                    <CloudSun className="h-5 w-5 text-muted-foreground" />
                    {t('weather.data')}
                  </p>
                  <p className="text-sm text-muted-foreground">{t('weather.noData', 'Keine Wetterdaten verfügbar')}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {selectedEntry && (
              <>
                <Button variant="secondary" onClick={() => { onEdit(selectedEntry); setSelectedEntry(null); }}>
                  ✏️ {t('common.edit')}
                </Button>
                <Button variant="destructive" onClick={() => handleDeleteClick(selectedEntry.id)}>
                  🗑️ {t('common.delete')}
                </Button>
              </>
            )}
            <Button onClick={() => setSelectedEntry(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <DeleteConfirmation
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
        title={t('entry.delete')}
        description={t('entry.deleteConfirm')}
        isDeleting={isDeleting}
      />
      
      {sorted.length >= limit && (
        <div 
          className="mt-6 py-5 text-center cursor-pointer text-muted-foreground/60 text-sm
                     hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors
                     select-none touch-manipulation"
          onClick={() => setLimit(prev => prev + 50)}
        >
          {isLoading ? (
            <span className="animate-pulse">{t('common.loading')}</span>
          ) : (
            <span className="tracking-widest">···</span>
          )}
        </div>
      )}
    </div>
  );
};