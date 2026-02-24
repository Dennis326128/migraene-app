/**
 * MedicationHistoryView
 * Shows medication selection, 30-day count, and paginated intake list.
 */

import React, { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, ArrowDown, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationHistory } from "@/features/medication-intakes/hooks/useMedicationHistory";
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
  const {
    items,
    totalCount,
    hasMore,
    loadMore,
    resetPagination,
    isLoading,
    last30DaysCount,
    last30From,
    last30To,
    effectiveToday,
    visibleCount,
  } = useMedicationHistory(selectedMedication);

  // Reset pagination when medication changes
  useEffect(() => {
    resetPagination();
  }, [selectedMedication, resetPagination]);

  // Build sorted medication list (alphabetical, active first)
  const medicationOptions = React.useMemo(() => {
    const sorted = [...allMeds].sort((a, b) => {
      // Active first
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return a.name.localeCompare(b.name, "de");
    });
    return sorted;
  }, [allMeds]);

  const selectedMedData = allMeds.find(
    (m) => m.name === selectedMedication
  );

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
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-base font-semibold px-3 py-1">
                    {last30DaysCount}×
                  </Badge>
                </div>
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
                const ts = intake.timestamp_created || intake.created_at;
                const berlinTime = toZonedTime(new Date(ts), "Europe/Berlin");
                const dateStr = format(berlinTime, "EEEE, d. MMMM yyyy", { locale: de });
                const timeStr = format(berlinTime, "HH:mm");

                return (
                  <Card key={intake.id} className="hover:bg-accent/5 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium capitalize">{dateStr}</span>
                        <span className="text-sm text-muted-foreground ml-2">– {timeStr}</span>
                      </div>
                      {intake.dose_quarters !== 4 && (
                        <Badge variant="outline" className="text-xs">
                          {intake.dose_quarters / 4} Tbl.
                        </Badge>
                      )}
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
                className="gap-2"
              >
                <ArrowDown className="h-4 w-4" />
                Mehr anzeigen ({totalCount - items.length} weitere)
              </Button>
            </div>
          )}

          {/* DEV Debug */}
          {import.meta.env.DEV && (
            <div className="text-[10px] text-muted-foreground/50 p-2 font-mono space-y-0.5">
              <div>effectiveToday: {effectiveToday}</div>
              <div>last30From: {last30From}</div>
              <div>totalCount: {totalCount}</div>
              <div>pageSize: 10 | loadedCount: {items.length}</div>
              <div>last30DaysCount: {last30DaysCount}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
