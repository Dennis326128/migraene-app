import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock, Settings } from "lucide-react";
import { useMedicationLimits, useCheckMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useEntries } from "@/features/entries/hooks/useEntries";

interface MedicationLimitsOverviewProps {
  onSetupLimits?: () => void;
}

export function MedicationLimitsOverview({ onSetupLimits }: MedicationLimitsOverviewProps) {
  const { data: limits = [], isLoading: limitsLoading } = useMedicationLimits();
  const { data: medications = [] } = useMeds();
  const { mutate: checkLimits, data: limitChecks = [], isPending: checking } = useCheckMedicationLimits();

  // Get last 30 days entries for analysis
  const last30Days = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0]
    };
  }, []);

  const { data: recentEntries = [] } = useEntries(last30Days);

  // Debug logging
  React.useEffect(() => {
    console.log('[MedicationLimitsOverview] Debug Info:', {
      recentEntries: recentEntries,
      entriesCount: recentEntries.length,
      last30Days: last30Days,
      medications: medications,
      medicationsCount: medications.length,
      sampleEntry: recentEntries[0],
      dateRange: `${last30Days.from} bis ${last30Days.to}`
    });
  }, [recentEntries, last30Days, medications]);

  // Check limits when we have medications
  React.useEffect(() => {
    if (medications.length > 0) {
      checkLimits(medications.map(m => m.name));
    }
  }, [medications, checkLimits]);

  // Calculate medication usage from entries for 30-day overview
  const medicationUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    
    recentEntries.forEach(entry => {
      if (entry.medications) {
        entry.medications.forEach((med: string) => {
          usage[med] = (usage[med] || 0) + 1;
        });
      }
    });
    
    return usage;
  }, [recentEntries]);

  if (limitsLoading || checking) {
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

  // No limits set up
  if (limits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Medikamenten-Limits einrichten
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
                {Object.entries(medicationUsage).map(([med, count]) => (
                  <div key={med} className="flex justify-between items-center">
                    <span className="text-sm">{med}</span>
                    <span className="text-sm font-medium">{count}x genommen</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Einträge mit Medikamenten erstellt. <br/>Erstellen Sie Ihren ersten Eintrag im Tagebuch.</p>
            )}
          </div>
          {onSetupLimits && (
            <Button onClick={onSetupLimits} className="w-full">
              Limits jetzt einrichten
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show limits and status  
  const hasIssues = limitChecks.some(check => check.status === 'warning' || check.status === 'reached' || check.status === 'exceeded');

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            Medikamenten-Überverbrauch Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasIssues ? (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Achtung: Limits erreicht oder überschritten</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">😊 Alles im grünen Bereich!</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Medication Cards */}
      <div className="grid gap-4">
        {limitChecks.map((check) => {
          const percentage = Math.min((check.current_count / check.limit_count) * 100, 100);
          
          let statusColor = "bg-green-500";
          let statusText = "🟢 Sicher";
          let statusDescription = "Alles in Ordnung";
          
          if (check.status === 'warning') {
            statusColor = "bg-yellow-500";
            statusText = "🟡 Achtung";
            statusDescription = "Sie nähern sich dem Limit";
          } else if (check.status === 'reached') {
            statusColor = "bg-orange-500";
            statusText = "🟠 Limit erreicht";
            statusDescription = "Limit erreicht - Vorsicht geboten";
          } else if (check.status === 'exceeded') {
            statusColor = "bg-red-500";
            statusText = "🔴 Überschritten";
            statusDescription = "Limit überschritten - Arzt konsultieren!";
          }

          return (
            <Card key={`${check.medication_name}-${check.period_type}`} className="border-l-4" style={{ borderLeftColor: statusColor.replace('bg-', '#') }}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{check.medication_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {check.current_count}/{check.limit_count} pro {
                          check.period_type === 'day' ? 'Tag' :
                          check.period_type === 'week' ? 'Woche' : 'Monat'
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{statusText}</div>
                      <div className="text-xs text-muted-foreground">{statusDescription}</div>
                    </div>
                  </div>
                  
                  <Progress value={percentage} className="h-2" />
                  
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Math.round(percentage)}% verbraucht</span>
                    <span>
                      <Clock className="h-3 w-3 inline mr-1" />
                      seit {new Date(check.period_start).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  
                  {check.status === 'exceeded' && (
                    <div className="bg-red-50 border border-red-200 p-3 rounded-md">
                      <p className="text-sm text-red-800">
                        <strong>Wichtig:</strong> Sie haben das empfohlene Limit überschritten. 
                        Konsultieren Sie bitte Ihren Arzt.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 30-Day Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            30-Tage-Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(medicationUsage).map(([med, count]) => (
              <div key={med} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <span className="font-medium">{med}</span>
                <span className="text-lg font-bold">{count}x</span>
              </div>
            ))}
          </div>
          {Object.keys(medicationUsage).length === 0 && (
            <p className="text-muted-foreground text-center py-4">
              Noch keine Einträge mit Medikamenten erstellt.
            </p>
          )}
        </CardContent>
      </Card>

      {onSetupLimits && (
        <Card>
          <CardContent className="p-4">
            <Button onClick={onSetupLimits} variant="outline" className="w-full">
              <Settings className="h-4 w-4 mr-2" />
              Limits verwalten
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}