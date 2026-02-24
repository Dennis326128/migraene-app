/**
 * MedicationHistoryView
 * Shows medication selection, status block (last intake, 30-day count, limit),
 * and paginated intake list filtered by global TimeRange.
 * Dose chip only shown when ≠ 1 tablet.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, ArrowDown, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationHistory } from "@/features/medication-intakes/hooks/useMedicationHistory";
import { useTimeRange } from "@/contexts/TimeRangeContext";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { formatDoseWithUnit } from "@/lib/utils/doseFormatter";
import { cn } from "@/lib/utils";

interface MedicationHistoryViewProps {
  selectedMedication: string | null;
  onSelectMedication: (name: string | null) => void;
}

/** Map period_type to German label */
function periodLabel(type: string): string {
  switch (type) {
    case "day": return "Tag";
    case "week": return "Woche";
    case "month": return "30 Tage";
    default: return type;
  }
}

export const MedicationHistoryView: React.FC<MedicationHistoryViewProps> = ({
  selectedMedication,
  onSelectMedication,
}) => {
  const { data: allMeds = [] } = useMeds();
  const { from: rangeFrom, to: rangeTo } = useTimeRange();
  const { data: allLimits = [] } = useMedicationLimits();

  const {
    items,
    totalCount,
    hasMore,
    loadMore,
    isLoading,
    isFetchingMore,
    last30DaysCount,
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

  // Find active limit for this medication
  const activeLimit = React.useMemo(() => {
    if (!selectedMedication) return null;
    return allLimits.find(
      (l) => l.medication_name === selectedMedication && l.is_active
    ) ?? null;
  }, [allLimits, selectedMedication]);

  // Last intake = first item (sorted DESC)
  const lastIntake = items.length > 0 ? items[0] : null;

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

      {/* Selected medication: Status Block + List */}
      {selectedMedication && (
        <>
          {/* Status Block */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              {/* Name + Strength */}
              <h3 className="text-sm font-semibold">
                {selectedMedication}
                {selectedMedData?.staerke ? ` ${selectedMedData.staerke}` : ""}
              </h3>

              {/* Last Intake */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Letzte Einnahme</span>
                <span className="text-sm font-medium">
                  {isLoading ? (
                    "…"
                  ) : lastIntake ? (
                    (() => {
                      const t = toZonedTime(new Date(lastIntake.taken_at), "Europe/Berlin");
                      return `${format(t, "EEEE, d. MMMM yyyy", { locale: de })} – ${format(t, "HH:mm")}`;
                    })()
                  ) : (
                    "Keine im Zeitraum"
                  )}
                </span>
              </div>

              {/* 30-Day Count */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Letzte 30 Tage</span>
                <Badge variant="secondary" className="text-sm font-semibold px-2.5 py-0.5">
                  {last30DaysCount}×
                </Badge>
              </div>

              {/* Limit (only if exists) */}
              {activeLimit && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Limit ({periodLabel(activeLimit.period_type)})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-sm font-semibold",
                      last30DaysCount >= activeLimit.limit_count && "text-destructive"
                    )}>
                      {last30DaysCount} / {activeLimit.limit_count}
                    </span>
                    {last30DaysCount >= activeLimit.limit_count && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>
                </div>
              )}
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
                const berlinTime = toZonedTime(new Date(intake.taken_at), "Europe/Berlin");
                const dateStr = format(berlinTime, "EEEE, d. MMMM yyyy", { locale: de });
                const timeStr = format(berlinTime, "HH:mm");
                const showDose = intake.dose_quarters !== 4;

                return (
                  <Card key={intake.id} className="hover:bg-accent/5 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium capitalize">{dateStr}</span>
                        <span className="text-sm text-muted-foreground ml-2">– {timeStr}</span>
                      </div>
                      {showDose && (
                        <Badge variant="outline" className="text-xs shrink-0 ml-2">
                          {formatDoseWithUnit(intake.dose_quarters)}
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
        </>
      )}
    </div>
  );
};