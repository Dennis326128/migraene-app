/**
 * MedicationHistoryView
 * Shows medication selection, status block (7d/30d counts incl. today, limit),
 * and paginated intake list of LATEST entries (not filtered by global TimeRange).
 *
 * SAFETY MODE: All counts include today (rolling window).
 * LIST: Shows latest 10 entries regardless of global range selection.
 * Dose chip only shown when ≠ 1 tablet.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, ArrowDown, Loader2, AlertTriangle, Settings } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { todayStr } from "@/lib/dateRange/rangeResolver";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationHistory } from "@/features/medication-intakes/hooks/useMedicationHistory";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { formatDoseWithUnit } from "@/lib/utils/doseFormatter";
import { getLimitStatus, isWarningStatus } from "@/lib/utils/medicationLimitStatus";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────

/** Normalize medication name for robust matching */
function normalizeMedName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*(mg|ml|g|µg|mcg)\b/gi, "$1 $2");
}

/** Find active limit for a medication — robust matching with fallbacks. */
function findActiveLimitForMedication<T extends { is_active: boolean; medication_name: string }>(
  selectedMedication: string | null,
  limits: T[]
): T | null {
  if (!selectedMedication) return null;
  const sel = normalizeMedName(selectedMedication);

  // 1) exact normalized match
  const exact = limits.find(
    (l) => l.is_active && normalizeMedName(l.medication_name) === sel
  );
  if (exact) return exact;

  // 2) base-name fallback (strip strength) — only if single match
  const baseOf = (s: string) => s.replace(/\b\d+\s*(mg|ml|g|µg|mcg)\b/gi, "").trim();
  const selBase = baseOf(sel);
  if (selBase.length > 2) {
    const candidates = limits.filter(
      (l) => l.is_active && baseOf(normalizeMedName(l.medication_name)) === selBase
    );
    if (candidates.length === 1) return candidates[0];
  }

  return null;
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

/**
 * Build relative date label: "Heute", "Gestern", "vor X Tagen"
 * Uses Berlin-aware todayStr() as SSOT for calendar day comparison.
 */
function relativeDateLabel(intakeDate: string, todayDate: string): string | null {
  const diff = differenceInCalendarDays(
    new Date(todayDate + "T12:00:00"),
    new Date(intakeDate + "T12:00:00")
  );
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  if (diff >= 2) return `vor ${diff} Tagen`;
  return null;
}

/**
 * SSOT: Get the occurred-at timestamp for an intake in Berlin timezone.
 * Priority: taken_date + taken_time > taken_at > created_at
 * Returns { localDate: YYYY-MM-DD, localTime: HH:mm, berlinDate: Date }
 */
function getIntakeOccurredAt(intake: { taken_at: string; taken_date: string; taken_time: string }) {
  // taken_date is already a calendar date (YYYY-MM-DD), taken_time is HH:mm(:ss)
  const berlinTime = toZonedTime(new Date(intake.taken_at), "Europe/Berlin");
  const localDate = intake.taken_date || format(berlinTime, "yyyy-MM-dd");
  const localTime = intake.taken_time
    ? intake.taken_time.substring(0, 5)
    : format(berlinTime, "HH:mm");
  return { localDate, localTime, berlinTime };
}

/**
 * Format intake date for display:
 * - "Heute – HH:MM"
 * - "Gestern – HH:MM"
 * - "Wochentag, DD. Monat YYYY – HH:MM"
 */
function formatIntakeDisplay(localDate: string, localTime: string, todayDate: string): string {
  const diff = differenceInCalendarDays(
    new Date(todayDate + "T12:00:00"),
    new Date(localDate + "T12:00:00")
  );
  if (diff === 0) return `Heute – ${localTime}`;
  if (diff === 1) return `Gestern – ${localTime}`;

  // Full date: "Dienstag, 24. Februar 2026 – HH:MM"
  const d = new Date(localDate + "T12:00:00");
  const formatted = format(d, "EEEE, d. MMMM yyyy", { locale: de });
  return `${formatted} – ${localTime}`;
}

// ─── Props ──────────────────────────────────────────────────────────

interface MedicationHistoryViewProps {
  selectedMedication: string | null;
  onSelectMedication: (name: string | null) => void;
  onNavigateToLimitEdit?: (medicationName: string, mode: 'create' | 'edit') => void;
}

// ─── Component ──────────────────────────────────────────────────────

export const MedicationHistoryView: React.FC<MedicationHistoryViewProps> = ({
  selectedMedication,
  onSelectMedication,
  onNavigateToLimitEdit,
}) => {
  const { data: allMeds = [] } = useMeds();
  const { data: allLimits = [], isLoading: limitsLoading } = useMedicationLimits();

  const {
    items,
    totalCount,
    hasMore,
    loadMore,
    isLoading,
    isFetchingMore,
    rolling7dCount,
    rolling30dCount,
    rollingTodayCount,
  } = useMedicationHistory(selectedMedication);

  // Build sorted medication list (active first, then alphabetical)
  const medicationOptions = React.useMemo(() => {
    return [...allMeds].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return a.name.localeCompare(b.name, "de");
    });
  }, [allMeds]);

  const selectedMedData = allMeds.find((m) => m.name === selectedMedication);

  // SSOT: LimitExistence = activeLimit != null
  const activeLimit = React.useMemo(
    () => findActiveLimitForMedication(selectedMedication, allLimits),
    [allLimits, selectedMedication]
  );

  // Limit used count — period-dependent
  const limitUsed = React.useMemo(() => {
    if (!activeLimit) return null;
    switch (activeLimit.period_type) {
      case 'day': return rollingTodayCount;
      case 'week': return rolling7dCount;
      case 'month': return rolling30dCount;
      default: return rolling30dCount;
    }
  }, [activeLimit, rollingTodayCount, rolling7dCount, rolling30dCount]);

  const limitStatus = activeLimit && limitUsed !== null
    ? getLimitStatus(limitUsed, activeLimit.limit_count)
    : null;
  const showLimitWarning = limitStatus ? isWarningStatus(limitStatus) : false;

  const today = todayStr();

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
              {/* Name + Strength + "inkl. heute" hint */}
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">
                  {selectedMedication}
                  {selectedMedData?.staerke ? ` ${selectedMedData.staerke}` : ""}
                </h3>
                <span className="text-xs text-muted-foreground">inkl. heute</span>
              </div>

              {/* Counts + Limit */}
              <div className="space-y-3">
                {/* 7-Day Count */}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">7 Tage</span>
                  <span className="text-base font-semibold tabular-nums">
                    {rolling7dCount}×
                  </span>
                </div>

                {/* 30-Day Count */}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">30 Tage</span>
                  <span className="text-base font-semibold tabular-nums">
                    {rolling30dCount}×
                  </span>
                </div>

                {/* Limit row — ONLY if activeLimit exists (SSOT: DB record) */}
                {activeLimit && limitUsed !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Limit ({periodLabel(activeLimit.period_type)})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base tabular-nums">
                        <span className={cn(
                          "font-semibold",
                          limitStatus === 'exceeded' && "text-destructive",
                          limitStatus === 'reached' && "text-destructive",
                          limitStatus === 'warning' && "text-warning"
                        )}>
                          {limitUsed}
                        </span>
                        <span className="text-muted-foreground font-normal">
                          {" / "}{activeLimit.limit_count}
                        </span>
                      </span>
                      {showLimitWarning && limitStatus === 'warning' && (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      )}
                      {(limitStatus === 'reached' || limitStatus === 'exceeded') && (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      {limitStatus === 'exceeded' && (
                        <span className="text-[11px] font-medium text-destructive">
                          Überschritten
                        </span>
                      )}
                      {/* Edit limit icon */}
                      {onNavigateToLimitEdit && (
                        <button
                          onClick={() => onNavigateToLimitEdit(selectedMedication, 'edit')}
                          className="ml-1 min-w-[32px] min-h-[32px] flex items-center justify-center text-muted-foreground/50 hover:text-foreground focus-visible:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title="Limit bearbeiten"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* No limit → offer to set one (ONLY when no active limit exists) */}
                {!activeLimit && !limitsLoading && onNavigateToLimitEdit && (
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => onNavigateToLimitEdit(selectedMedication, 'create')}
                      className="text-xs text-muted-foreground hover:text-foreground underline transition-colors min-h-[32px] flex items-center"
                    >
                      Limit festlegen
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Intake List */}
          {isLoading ? (
            <div className="space-y-1.5">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="py-3 px-4">
                    <Skeleton className="h-5 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <EmptyState
              icon="📋"
              title="Noch keine Einnahmen erfasst"
              description="Sobald du eine Einnahme dokumentierst, erscheint sie hier."
            />
          ) : (
            <div className="space-y-1.5">
              {items.map((intake) => {
                const { localDate, localTime } = getIntakeOccurredAt(intake);
                const isToday = localDate === today;
                const showDose = intake.dose_quarters !== 4;
                const displayText = formatIntakeDisplay(localDate, localTime, today);

                return (
                  <Card key={intake.id} className="hover:bg-accent/5 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <span className={cn("text-sm font-medium", isToday ? "" : "capitalize")}>
                        {displayText}
                      </span>
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
