import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ChevronDown, Info, Star, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MIGRAINE_TYPICAL_SYMPTOMS } from "@/lib/symptoms/symptomGroups";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BURDEN_LABELS, getBurdenWeight } from "@/features/symptoms/hooks/useSymptomBurden";

interface SymptomStat {
  name: string;
  count: number;
  percentage: number;
}

type SortMode = 'relevance' | 'frequency' | 'burden';

interface AccompanyingSymptomsCardProps {
  symptoms: SymptomStat[];
  totalEpisodes: number;
  episodesWithSymptoms: number;
  /** Filtered counts (only viewed/edited entries) */
  checkedEpisodes?: number;
  checkedSymptoms?: SymptomStat[];
  /** Burden data */
  burdenMap?: Map<string, number>;
  /** Navigate to burden settings */
  onNavigateToBurden?: () => void;
}

export function AccompanyingSymptomsCard({
  symptoms,
  totalEpisodes,
  episodesWithSymptoms,
  checkedEpisodes,
  checkedSymptoms,
  burdenMap = new Map(),
  onNavigateToBurden,
}: AccompanyingSymptomsCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [checkedOnly, setCheckedOnly] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');

  // Determine which data to use based on filter
  const hasCheckedData = checkedEpisodes !== undefined && checkedSymptoms !== undefined;
  const useChecked = checkedOnly && hasCheckedData;
  
  const activeSymptoms = useChecked ? (checkedSymptoms || []) : symptoms;
  const activeBasis = useChecked ? (checkedEpisodes || 0) : totalEpisodes;
  const activeEpisodesWithSymptoms = useChecked
    ? new Set((checkedSymptoms || []).flatMap(s => [])).size || Math.min(activeBasis, episodesWithSymptoms)
    : episodesWithSymptoms;

  const documentationRate = totalEpisodes > 0
    ? Math.round((episodesWithSymptoms / totalEpisodes) * 100)
    : 0;

  const isLowDocRate = documentationRate < 30;

  // Migränetypische Symptome
  const migraineTypicalPercent = useMemo(() => {
    if (activeBasis === 0) return null;
    const typicalSymptoms = activeSymptoms.filter(s => MIGRAINE_TYPICAL_SYMPTOMS.has(s.name));
    if (typicalSymptoms.length === 0) return null;
    return Math.max(...typicalSymptoms.map(s => s.percentage));
  }, [activeSymptoms, activeBasis]);

  // Sort symptoms
  const sorted = useMemo(() => {
    const list = [...activeSymptoms];
    switch (sortMode) {
      case 'frequency':
        return list.sort((a, b) => b.count - a.count);
      case 'burden': {
        return list.sort((a, b) => {
          const bA = burdenMap.get(a.name) ?? -1;
          const bB = burdenMap.get(b.name) ?? -1;
          return bB - bA;
        });
      }
      case 'relevance':
      default: {
        return list.sort((a, b) => {
          const impactA = a.percentage * getBurdenWeight(burdenMap.get(a.name) ?? null);
          const impactB = b.percentage * getBurdenWeight(burdenMap.get(b.name) ?? null);
          return impactB - impactA;
        });
      }
    }
  }, [activeSymptoms, sortMode, burdenMap]);

  const displayed = showAll ? sorted : sorted.slice(0, 8);
  const hasMore = sorted.length > 8;

  // Empty state: no checked entries
  if (useChecked && activeBasis === 0 && totalEpisodes > 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Begleitsymptome im Zeitraum</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Für Begleitsymptome fehlen geprüfte Einträge. Öffne den Bereich beim Eintragen kurz, um die Auswertung zu verbessern.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCheckedOnly(false)}
          >
            Alle Einträge einbeziehen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (activeSymptoms.length === 0) {
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
                <p className="text-xs">Geprüft = Begleitsymptome wurden mindestens geöffnet.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Basis line */}
        <p className="text-xs text-muted-foreground mt-1">
          {useChecked
            ? `Basis: ${activeBasis} von ${totalEpisodes} Attacken (geprüft)`
            : `Basis: ${totalEpisodes} Attacken (alle)`
          }
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filter toggle + sort */}
        <div className="flex items-center justify-between gap-2">
          {hasCheckedData && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={checkedOnly}
                onCheckedChange={setCheckedOnly}
                className="scale-75"
              />
              <span className="text-xs text-muted-foreground">Geprüfte Einträge</span>
            </label>
          )}
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevanz</SelectItem>
              <SelectItem value="frequency">Häufigkeit</SelectItem>
              <SelectItem value="burden">Belastung</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLowDocRate && (
          <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-md px-3 py-2">
            Hinweis: geringe Dokumentationsrate – eingeschränkte Aussagekraft
          </div>
        )}

        {/* Symptom ranking */}
        <div className="space-y-2">
          {displayed.map((symptom, idx) => {
            const burden = burdenMap.get(symptom.name);
            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-center justify-between">
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
                {burden !== undefined && burden >= 1 && (
                  <div className="flex items-center gap-1 pl-0.5">
                    {burden >= 3 && <Star className="h-3 w-3 text-amber-500 fill-current" />}
                    <span className="text-[10px] text-muted-foreground/70">
                      {BURDEN_LABELS[burden]}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
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

        {/* Info + link to burden settings */}
        <div className="pt-2 border-t border-border/50 space-y-2">
          <p className="text-xs text-muted-foreground/70">
            Häufigkeit zeigt, wie oft ein Symptom auftritt – Belastung, wie stark es dich einschränkt.
          </p>
          {onNavigateToBurden && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary h-7 px-2"
              onClick={onNavigateToBurden}
            >
              <Settings2 className="h-3 w-3 mr-1" />
              Belastung anpassen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
