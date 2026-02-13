import React from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSymptomCatalog } from "@/features/symptoms/hooks/useSymptoms";
import {
  useSymptomBurdens,
  useUpsertSymptomBurden,
  BURDEN_LABELS,
  BURDEN_STEPS,
  BURDEN_SYMPTOM_FALLBACK_ORDER,
} from "@/features/symptoms/hooks/useSymptomBurden";
import { useSymptomFrequency } from "@/features/symptoms/hooks/useSymptomFrequency";
import { cn } from "@/lib/utils";

export function SettingsBurdenScreen() {
  const navigate = useNavigate();
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: burdens = [] } = useSymptomBurdens();
  const { data: freqMap = new Map() } = useSymptomFrequency();
  const upsertMut = useUpsertSymptomBurden();
  const [hasChanged, setHasChanged] = React.useState(false);

  const burdenMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of burdens) m.set(b.symptom_key, b.burden_level);
    return m;
  }, [burdens]);

  // Smart sort: documented symptoms first by frequency, then fallback/rest alphabetically
  const sortedCatalog = React.useMemo(() => {
    const hasFreqData = freqMap.size > 0;

    if (hasFreqData) {
      // A) Symptoms with frequency data, sorted by frequency desc
      const withFreq = catalog.filter(s => (freqMap.get(s.name) ?? 0) > 0);
      withFreq.sort((a, b) => (freqMap.get(b.name) ?? 0) - (freqMap.get(a.name) ?? 0));

      // B) Rest alphabetically
      const rest = catalog.filter(s => (freqMap.get(s.name) ?? 0) === 0);
      rest.sort((a, b) => a.name.localeCompare(b.name, "de"));

      return [...withFreq, ...rest];
    }

    // Fallback: clinical order, then alphabetical
    const fallbackSet = new Set(BURDEN_SYMPTOM_FALLBACK_ORDER);
    const fallbackOrder = new Map(BURDEN_SYMPTOM_FALLBACK_ORDER.map((n, i) => [n, i]));

    const inFallback = catalog.filter(s => fallbackSet.has(s.name));
    inFallback.sort((a, b) => (fallbackOrder.get(a.name) ?? 999) - (fallbackOrder.get(b.name) ?? 999));

    const rest = catalog.filter(s => !fallbackSet.has(s.name));
    rest.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return [...inFallback, ...rest];
  }, [catalog, freqMap]);

  const handleToggle = (symptomKey: string, level: number) => {
    const current = burdenMap.get(symptomKey) ?? 0;
    // Toggle: clicking active state resets to neutral
    const newLevel = current === level ? 0 : level;
    upsertMut.mutate({ symptomKey, burdenLevel: newLevel });
    setHasChanged(true);
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Wie stark schränken dich diese Symptome ein?</h2>
        <p className="text-sm text-muted-foreground">
          Wähle pro Symptom die passende Stufe – oder lass es leer.
        </p>
      </div>

      <div className="space-y-2">
        {sortedCatalog.map((symptom) => {
          const current = burdenMap.get(symptom.name) ?? 0;
          const freq = freqMap.get(symptom.name);
          return (
            <Card key={symptom.id} className="p-3">
              <div className="space-y-2">
                {/* Symptom name + frequency hint */}
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-sm",
                    current > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                  )}>
                    {symptom.name}
                  </span>
                  {freq !== undefined && freq > 0 && (
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {freq}×
                    </span>
                  )}
                </div>
                {/* Burden level buttons */}
                <div className="flex gap-1">
                  {BURDEN_STEPS.map((level) => {
                    const isActive = current === level;
                    return (
                      <button
                        key={level}
                        onClick={() => handleToggle(symptom.name, level)}
                        className={cn(
                          "flex-1 py-1.5 text-[11px] rounded-lg transition-colors leading-tight",
                          isActive
                            ? level >= 3
                              ? "bg-primary/25 text-primary border border-primary/40 font-medium"
                              : "bg-primary/10 text-primary border border-primary/25 font-medium"
                            : "border border-border/40 text-muted-foreground hover:bg-muted/50"
                        )}
                        disabled={upsertMut.isPending}
                      >
                        {BURDEN_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Sticky footer with "Fertig" button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/40 bg-background/95 backdrop-blur-sm pb-safe">
        <div className="mx-auto max-w-lg px-4 py-3 flex flex-col items-end gap-1">
          {hasChanged && (
            <span className="text-[11px] text-muted-foreground/70">
              Änderungen werden automatisch gespeichert.
            </span>
          )}
          <Button
            variant="default"
            size="mobile"
            className="w-full"
            onClick={() => navigate(-1)}
          >
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
}
