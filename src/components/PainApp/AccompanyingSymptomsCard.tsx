import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MIGRAINE_TYPICAL_SYMPTOMS } from "@/lib/symptoms/symptomGroups";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SymptomStat {
  name: string;
  count: number;
  percentage: number;
}

interface AccompanyingSymptomsCardProps {
  symptoms: SymptomStat[];
  totalEpisodes: number;
  episodesWithSymptoms: number;
}

export function AccompanyingSymptomsCard({
  symptoms,
  totalEpisodes,
  episodesWithSymptoms,
}: AccompanyingSymptomsCardProps) {
  const [showAll, setShowAll] = useState(false);

  const documentationRate = totalEpisodes > 0
    ? Math.round((episodesWithSymptoms / totalEpisodes) * 100)
    : 0;

  const isLowDocRate = documentationRate < 30;

  // Migränetypische Symptome in mindestens einer Attacke
  const migraineTypicalPercent = useMemo(() => {
    if (totalEpisodes === 0) return null;
    // Höchster Prozentsatz eines migränetypischen Symptoms = Anteil der Attacken
    const typicalSymptoms = symptoms.filter(s => MIGRAINE_TYPICAL_SYMPTOMS.has(s.name));
    if (typicalSymptoms.length === 0) return null;
    // We use the max percentage as a proxy (at least X% had a typical symptom)
    return Math.max(...typicalSymptoms.map(s => s.percentage));
  }, [symptoms, totalEpisodes]);

  const sorted = useMemo(() => 
    [...symptoms].sort((a, b) => b.count - a.count),
    [symptoms]
  );

  const displayed = showAll ? sorted : sorted.slice(0, 8);
  const hasMore = sorted.length > 8;

  if (symptoms.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Begleitsymptome im Zeitraum</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Keine Symptome dokumentiert. Du kannst Begleitsymptome bei jedem Eintrag erfassen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Begleitsymptome im Zeitraum</CardTitle>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground/60 cursor-help hover:text-muted-foreground transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <p className="text-xs">Häufigkeit der dokumentierten Begleitsymptome, sortiert nach Auftreten.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Dokumentiert in {episodesWithSymptoms} von {totalEpisodes} Attacken
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLowDocRate && (
          <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-md px-3 py-2">
            Hinweis: geringe Dokumentationsrate – eingeschränkte Aussagekraft
          </div>
        )}

        {/* Symptom ranking */}
        <div className="space-y-2">
          {displayed.map((symptom, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{symptom.name}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, symptom.percentage)}%` }}
                  />
                </div>
                <span className="text-sm font-medium tabular-nums w-10 text-right">
                  {symptom.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {hasMore && !showAll && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Weitere Symptome anzeigen
          </Button>
        )}

        {/* Migränetypische Symptome Kennwert */}
        {migraineTypicalPercent !== null && migraineTypicalPercent > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Attacken mit migränetypischen Symptomen:</span>
              <span className="font-semibold text-foreground">{migraineTypicalPercent}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
