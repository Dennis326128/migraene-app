/**
 * MedicationHistoryView
 * Shows medication selection, 30-day count, and paginated intake list.
 * List is filtered by global TimeRange. Dose is always shown.
 * Uses taken_at/taken_date for correct event time display.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, ArrowDown, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationHistory } from "@/features/medication-intakes/hooks/useMedicationHistory";
import { useTimeRange } from "@/contexts/TimeRangeContext";
import { formatDoseWithUnit } from "@/lib/utils/doseFormatter";
import { cn } from "@/lib/utils";

interface MedicationHistoryViewProps {
  selectedMedication: string | null;
  onSelectMedication: (name: string | null) => void;
}

export const MedicationHistoryView: React.FC<MedicationHistoryViewProps> = ({
  selectedMedication,
  onSelectMedication,
}) => {
  const { data: allMeds = [] } = useMeds();
  const { from: rangeFrom, to: rangeTo } = useTimeRange();

  const {
    items,
    totalCount,
    hasMore,
    loadMore,
    isLoading,
    isFetchingMore,
    last30DaysCount,
    last30From,
    last30To,
    effectiveToday,
    offset,
    rangeFrom: usedFrom,
    rangeTo: usedTo,
  } = useMedicationHistory(selectedMedication, rangeFrom, rangeTo);

  // Build sorted medication list (active first, then alphabetical)
  const medicationOptions = React.useMemo(() => {
    return [...allMeds].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return a.name.localeCompare(b.name, "de");
    });
  }, [allMeds]);

  const selectedMedData = allMeds.find((m) => m.name === selectedMedication);

  return (
    <div className="space-y-3">
      {/* Medication Selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Pill className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Medikament</span>
          </div>
          <Select
            value={selectedMedication ?? ""}
            onValueChange={(v) => onSelectMedication(v || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Medikament auswählen…" />
            </SelectTrigger>
            <SelectContent>
              {medicationOptions.map((med) => (
                <SelectItem key={med.id} value={med.name}>
                  <span className={cn(!med.is_active && "text-muted-foreground")}>
                    {med.name}
                    {med.staerke ? ` ${med.staerke}` : ""}
                    {!med.is_active ? " (inaktiv)" : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* No medication selected */}
      {!selectedMedication && (
        <EmptyState
          icon="💊"
          title="Medikament auswählen"
          description="Wähle ein Medikament, um Einnahmen anzuzeigen."
        />
      )}

      {/* Selected medication: Summary + List */}
      {selectedMedication && (
        <>
          {/* 30-Day Summary */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    {selectedMedication}
                    {selectedMedData?.staerke ? ` ${selectedMedData.staerke}` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Letzte 30 Tage
                  </p>
                </div>
                <Badge variant="secondary" className="text-base font-semibold px-3 py-1">
                  {last30DaysCount}×
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Intake List */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Lädt...</div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="📋"
              title="Keine Einnahmen"
              description="Keine Einnahmen im gewählten Zeitraum."
            />
          ) : (
            <div className="space-y-1.5">
              {items.map((intake) => {
                // Use taken_at for display (already backfilled correctly)
                const berlinTime = toZonedTime(new Date(intake.taken_at), "Europe/Berlin");
                const dateStr = format(berlinTime, "EEEE, d. MMMM yyyy", { locale: de });
                const timeStr = format(berlinTime, "HH:mm");
                const doseLabel = formatDoseWithUnit(intake.dose_quarters);

                return (
                  <Card key={intake.id} className="hover:bg-accent/5 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium capitalize">{dateStr}</span>
                        <span className="text-sm text-muted-foreground ml-2">– {timeStr}</span>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">
                        {doseLabel}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Load more */}
          {hasMore && !isLoading && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isFetchingMore}
                className="gap-2"
              >
                {isFetchingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
                Mehr anzeigen ({totalCount - items.length} weitere)
              </Button>
            </div>
          )}

          {/* DEV Debug */}
          {import.meta.env.DEV && (
            <div className="text-[10px] text-muted-foreground/50 p-2 font-mono space-y-0.5">
              <div>effectiveToday: {effectiveToday}</div>
              <div>timeRange: {usedFrom} → {usedTo}</div>
              <div>last30: {last30From} → {last30To}</div>
              <div>totalCount: {totalCount}</div>
              <div>loadedCount: {items.length}</div>
              <div>offset: {offset}</div>
              <div>count30d: {last30DaysCount}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
