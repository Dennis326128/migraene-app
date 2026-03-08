import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { useMedicationLimits, useCheckMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationSummary } from "@/features/medication-intakes/hooks/useMedicationSummary";
import { cn } from "@/lib/utils";

export function MedicationLimitsOverview() {
  const { data: limits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { data: medications = [] } = useMeds();
  const { mutate: checkLimits, data: limitChecks = [], isPending: checking } = useCheckMedicationLimits();
  const { data: summaries = [], isLoading: summariesLoading } = useMedicationSummary();

  // Check limits when we have medications
  React.useEffect(() => {
    if (medications.length > 0) {
      checkLimits(medications.map(m => m.name));
    }
  }, [medications, checkLimits]);

  // SSOT: Build medication usage from medication_intakes (same source as MedicationOverviewCard)
  const medicationUsage = useMemo(() => {
    const usage: Record<string, { count_7d: number; count_30d: number }> = {};
    for (const s of summaries) {
      usage[s.medication_name] = { count_7d: s.count_7d, count_30d: s.count_30d };
    }
    return usage;
  }, [summaries]);

  if (limitsLoading || checking || summariesLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span>Analysiere Medikamentenverbrauch...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No limits set up - simplified view using SSOT
  if (limits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Noch keine Limits eingerichtet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Sie haben noch keine Medikamenten-Limits eingerichtet. Limits helfen dabei, Überverbrauch zu vermeiden.
          </p>
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">30-Tage-Übersicht (ohne Limits)</h4>
            {Object.keys(medicationUsage).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(medicationUsage)
                  .filter(([, stats]) => stats.count_30d > 0)
                  .map(([med, stats]) => (
                    <div key={med} className="flex justify-between items-center">
                      <span className="text-sm">{med}</span>
                      <span className="text-sm font-medium">{stats.count_30d}× (letzte 30 Tage)</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Einträge mit Medikamenten erstellt.</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show limits and status  
  const hasIssues = limitChecks.some(check => check.status === 'warning' || check.status === 'reached' || check.status === 'exceeded');

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className={cn(
        hasIssues ? "border-destructive/50" : "border-green-500/50"
      )}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            Medikamenten-Limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {limitChecks.map((check) => {
            const percentage = Math.min(100, check.percentage);
            return (
              <div key={check.medication_name} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{check.medication_name}</span>
                  <span className={cn(
                    "text-sm font-medium",
                    check.status === 'exceeded' && "text-destructive",
                    check.status === 'reached' && "text-amber-500",
                    check.status === 'warning' && "text-amber-500",
                    check.status === 'safe' && "text-green-500"
                  )}>
                    {check.current_count}/{check.limit_count}
                    {check.status === 'exceeded' && (
                      <span className="ml-1">
                        ({check.status === 'exceeded' ? (
                          <>{check.current_count - check.limit_count} über</>
                        ) : null})
                      </span>
                    )}
                  </span>
                </div>
                <Progress 
                  value={percentage}
                  className={cn(
                    "h-2",
                    check.status === 'exceeded' && "[&>div]:bg-destructive",
                    check.status === 'reached' && "[&>div]:bg-amber-500",
                    check.status === 'warning' && "[&>div]:bg-amber-500",
                    check.status === 'safe' && "[&>div]:bg-green-500"
                  )}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {check.period_type === 'day' ? 'Heute' : 
                     check.period_type === 'week' ? 'Letzte 7 Tage' : 
                     'Letzte 30 Tage'}
                  </span>
                  {check.status === 'exceeded' ? (
                    <span className="text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Überschritten
                    </span>
                  ) : check.status === 'reached' ? (
                    <span className="text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Erreicht
                    </span>
                  ) : check.status === 'warning' ? (
                    <span className="text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Achtung
                    </span>
                  ) : (
                    <span className="text-green-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> OK
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
