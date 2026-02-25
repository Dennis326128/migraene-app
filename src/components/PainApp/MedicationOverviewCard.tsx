/**
 * MedicationOverviewCard
 * Compact clinical medication overview for Auswertung & Statistiken.
 * Shows per medication: 7d/30d counts (without today), limit status.
 * CTA deep-links to diary medication mode with correct time range.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pill, ChevronRight, AlertTriangle } from "lucide-react";
import { useMedicationSummary } from "@/features/medication-intakes/hooks/useMedicationSummary";
import { getSummaryRanges } from "@/features/medication-intakes/api/medicationSummary.api";
import { useMedicationLimits, type MedicationLimit } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { getLimitStatus, isWarningStatus } from "@/lib/utils/medicationLimitStatus";

function getPeriodLabel(periodType: string): string {
  switch (periodType) {
    case 'day': return 'Tag';
    case 'week': return 'Woche';
    case 'month': return '30 Tage';
    default: return periodType;
  }
}

function getUsedForPeriod(periodType: string, count7d: number, count30d: number): number {
  switch (periodType) {
    case 'month': return count30d;
    case 'week': return count7d;
    default: return count30d;
  }
}


interface MedicationOverviewCardProps {
  onNavigateToMedicationHistory?: (medicationName: string, rangeOverride?: { preset: string; from?: string; to?: string }) => void;
}

export function MedicationOverviewCard({
  onNavigateToMedicationHistory,
}: MedicationOverviewCardProps) {
  const { data: summaries = [], isLoading } = useMedicationSummary();
  const { data: limits = [] } = useMedicationLimits();
  const { data: medications = [] } = useMeds();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-4 bg-muted rounded w-3/4 mb-2" />
          <div className="h-8 bg-muted rounded w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (summaries.length === 0) return null;

  // Build strength map from user_medications
  const strengthMap = new Map<string, string>();
  for (const med of medications) {
    if (med.staerke) strengthMap.set(med.name, med.staerke);
  }

  // Build active limit map
  const limitMap = new Map<string, MedicationLimit>();
  for (const limit of limits) {
    if (limit.is_active) {
      limitMap.set(limit.medication_name, limit);
    }
  }

  // Compute 30d range for deep-link
  const { effectiveToday, from30d } = getSummaryRanges();

  const handleDetailsClick = (medicationName: string, count30d: number) => {
    if (!onNavigateToMedicationHistory) return;

    if (count30d > 0) {
      // Deep-link with custom 30d range matching the overview data
      onNavigateToMedicationHistory(medicationName, {
        preset: 'custom',
        from: from30d,
        to: effectiveToday,
      });
    } else {
      // No 30d data → open with "all" range
      onNavigateToMedicationHistory(medicationName, {
        preset: 'all',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Medikamenten-Übersicht</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Häufigkeit ohne heute · Limit informativ
        </p>
      </CardHeader>
      <CardContent className="space-y-0">
        {summaries.map((med) => {
          const strength = strengthMap.get(med.medication_name);
          const activeLimit = limitMap.get(med.medication_name);
          const used = activeLimit
            ? getUsedForPeriod(activeLimit.period_type, med.count_7d, med.count_30d)
            : null;
          const limitStatus = activeLimit && used !== null
            ? getLimitStatus(used, activeLimit.limit_count)
            : null;
          const showWarning = limitStatus ? isWarningStatus(limitStatus) : false;

          const ctaLabel = med.count_30d > 0
            ? "Im Verlauf ansehen"
            : "Verlauf öffnen";

          return (
            <div
              key={med.medication_name}
              className="py-3 border-b border-border/30 last:border-0"
            >
              {/* Header: Name + Strength + CTA */}
              <div className="flex items-start justify-between mb-1.5">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-sm">
                    {med.medication_name}
                  </span>
                  {strength && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {strength}
                    </span>
                  )}
                </div>
                {onNavigateToMedicationHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => handleDetailsClick(med.medication_name, med.count_30d)}
                  >
                    {ctaLabel}
                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </Button>
                )}
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {/* 7d */}
                <span>
                  <span className="font-medium text-foreground/70">7 Tage: </span>
                  {med.count_7d}×
                </span>
                {/* 30d */}
                <span>
                  <span className="font-medium text-foreground/70">30 Tage: </span>
                  {med.count_30d}×
                </span>
                {/* Limit */}
                {activeLimit && used !== null && (
                  <span className="flex items-center gap-1">
                    <span className="font-medium text-foreground/70">
                      Limit ({getPeriodLabel(activeLimit.period_type)}):
                    </span>
                    <span className={showWarning ? "text-destructive font-semibold" : ""}>
                      {used}/{activeLimit.limit_count}
                    </span>
                    {showWarning && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    {limitStatus === 'reached' && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 border-destructive text-destructive">
                        Erreicht
                      </Badge>
                    )}
                    {limitStatus === 'exceeded' && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1">
                        Überschritten
                      </Badge>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}