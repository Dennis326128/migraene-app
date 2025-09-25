import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, Calendar, Pill } from "lucide-react";
import { useEvents } from "@/features/events/hooks/useEvents";

// Overuse thresholds per medication class (per month)
const OVERUSE_THRESHOLDS = {
  "triptane": { limit: 10, name: "Triptane" },
  "analgetika": { limit: 15, name: "Schmerzmittel" },
  "ergotamine": { limit: 10, name: "Ergotamine" },
  "opioids": { limit: 10, name: "Opioide" },
  "nsaid": { limit: 15, name: "NSAR" },
  "default": { limit: 15, name: "Sonstige" }
};

// Common medication classifications (simplified)
const classifyMedication = (medName: string): string => {
  const name = medName.toLowerCase();
  
  if (name.includes('sumatriptan') || name.includes('rizatriptan') || name.includes('triptan')) {
    return 'triptane';
  }
  if (name.includes('ibuprofen') || name.includes('aspirin') || name.includes('diclofenac')) {
    return 'nsaid';
  }
  if (name.includes('ergot')) {
    return 'ergotamine';
  }
  if (name.includes('codein') || name.includes('tramadol') || name.includes('opioid')) {
    return 'opioids';
  }
  if (name.includes('paracetamol') || name.includes('acetaminophen') || name.includes('schmerz')) {
    return 'analgetika';
  }
  
  return 'default';
};

interface OveruseMonitorProps {
  className?: string;
}

export const OveruseMonitor: React.FC<OveruseMonitorProps> = ({ className }) => {
  const { data: events = [] } = useEvents();

  // Calculate medication usage for last 30 days
  const overuseAnalysis = React.useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const medicationUsage: Record<string, {
      count: number;
      class: string;
      threshold: number;
      dates: string[];
      effectiveness: number[];
    }> = {};

    events.forEach(event => {
      const eventDate = new Date(event.started_at);
      if (eventDate < thirtyDaysAgo) return;

      if (!event.event_meds) return;

      event.event_meds.forEach((eventMed: any) => {
        const medName = eventMed.user_medications?.name;
        if (!medName) return;

        const medClass = classifyMedication(medName);
        const threshold = OVERUSE_THRESHOLDS[medClass]?.limit || OVERUSE_THRESHOLDS.default.limit;

        if (!medicationUsage[medName]) {
          medicationUsage[medName] = {
            count: 0,
            class: medClass,
            threshold,
            dates: [],
            effectiveness: []
          };
        }

        medicationUsage[medName].count++;
        medicationUsage[medName].dates.push(event.started_at);

        // Track effectiveness if available
        if (eventMed.med_effects && eventMed.med_effects[0]) {
          medicationUsage[medName].effectiveness.push(eventMed.med_effects[0].effect_rating_0_4);
        }
      });
    });

    return medicationUsage;
  }, [events]);

  const overuseMedications = Object.entries(overuseAnalysis).filter(
    ([_, data]) => data.count >= data.threshold * 0.8 // Show warning at 80% of limit
  );

  const criticalOveruse = Object.entries(overuseAnalysis).filter(
    ([_, data]) => data.count >= data.threshold
  );

  const getUsageColor = (count: number, threshold: number) => {
    const percentage = (count / threshold) * 100;
    if (percentage >= 100) return "text-destructive";
    if (percentage >= 80) return "text-warning";
    return "text-success";
  };

  const getUsageLevel = (count: number, threshold: number) => {
    const percentage = (count / threshold) * 100;
    if (percentage >= 100) return "Kritisch";
    if (percentage >= 80) return "Warnung";
    return "Normal";
  };

  const calculateTolerance = (effectiveness: number[]) => {
    if (effectiveness.length < 3) return null;
    
    // Simple trend analysis - compare first half vs second half
    const mid = Math.floor(effectiveness.length / 2);
    const firstHalf = effectiveness.slice(0, mid);
    const secondHalf = effectiveness.slice(mid);
    
    const avgFirst = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const decrease = avgFirst - avgSecond;
    return decrease > 0.5 ? "Mögliche Toleranzentwicklung" : null;
  };

  if (overuseMedications.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-success">
            <Pill className="w-5 h-5" />
            Medikamenten-Übergebrauch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-2">✅</div>
            <p>Kein Übergebrauch erkannt</p>
            <p className="text-sm mt-2">
              Ihre Medikamenteneinnahme liegt im empfohlenen Bereich.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {criticalOveruse.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Kritischer Übergebrauch erkannt!</strong> Sie haben {criticalOveruse.length} Medikament(e) 
            übermäßig häufig eingenommen. Bitte sprechen Sie mit Ihrem Arzt über alternative Behandlungsmöglichkeiten.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Medikamenten-Übergebrauch Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              Letzte 30 Tage
            </div>

            {overuseMedications.map(([medName, data]) => {
              const percentage = (data.count / data.threshold) * 100;
              const toleranceWarning = calculateTolerance(data.effectiveness);
              const usageLevel = getUsageLevel(data.count, data.threshold);
              const usageColor = getUsageColor(data.count, data.threshold);

              return (
                <Card key={medName} className="border-l-4 border-l-warning">
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{medName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {OVERUSE_THRESHOLDS[data.class]?.name || "Sonstige"}
                          </p>
                        </div>
                        <Badge
                          variant={percentage >= 100 ? "destructive" : percentage >= 80 ? "outline" : "secondary"}
                          className={usageColor}
                        >
                          {usageLevel}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Einnahmen diesen Monat</span>
                          <span className={`font-medium ${usageColor}`}>
                            {data.count} / {data.threshold}
                          </span>
                        </div>
                        <Progress value={Math.min(percentage, 100)} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {Math.round(percentage)}% des empfohlenen Monatsmaximums
                        </p>
                      </div>

                      {toleranceWarning && (
                        <Alert variant="destructive" className="py-2">
                          <AlertTriangle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            {toleranceWarning}: Die Wirksamkeit scheint abzunehmen.
                          </AlertDescription>
                        </Alert>
                      )}

                      {data.effectiveness.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Ø Wirksamkeit: {Math.round(
                            data.effectiveness.reduce((sum, val) => sum + val, 0) / data.effectiveness.length * 10
                          ) / 10}/4
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="bg-muted/30 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2">💡 Übergebrauch-Richtwerte (pro Monat):</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>• Triptane: max. 10 Tage</div>
                <div>• NSAR: max. 15 Tage</div>
                <div>• Schmerzmittel: max. 15 Tage</div>
                <div>• Ergotamine: max. 10 Tage</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};