import React from "react";
import { Card } from "@/components/ui/card";
import { useSymptomCatalog } from "@/features/symptoms/hooks/useSymptoms";
import {
  useSymptomBurdens,
  useUpsertSymptomBurden,
  BURDEN_LABELS,
  MAX_BESONDERS_BELASTEND,
  BURDEN_SYMPTOM_ORDER,
} from "@/features/symptoms/hooks/useSymptomBurden";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = [1, 2] as const;

export function SettingsBurdenScreen() {
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: burdens = [] } = useSymptomBurdens();
  const upsertMut = useUpsertSymptomBurden();

  const burdenMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of burdens) m.set(b.symptom_key, b.burden_level);
    return m;
  }, [burdens]);

  const besondersCount = React.useMemo(() => {
    let count = 0;
    for (const b of burdens) {
      if (b.burden_level === 2) count++;
    }
    return count;
  }, [burdens]);

  // Sort catalog by clinical priority
  const sortedCatalog = React.useMemo(() => {
    const orderMap = new Map(BURDEN_SYMPTOM_ORDER.map((name, idx) => [name, idx]));
    return [...catalog].sort((a, b) => {
      const idxA = orderMap.get(a.name) ?? 999;
      const idxB = orderMap.get(b.name) ?? 999;
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name, "de");
    });
  }, [catalog]);

  const handleChange = (symptomKey: string, level: number) => {
    const current = burdenMap.get(symptomKey) ?? 0;

    // Toggle: clicking active state resets to neutral
    if (current === level) {
      upsertMut.mutate({ symptomKey, burdenLevel: 0 });
      return;
    }

    // Max 3 "Besonders belastend" check
    if (level === 2 && current !== 2 && besondersCount >= MAX_BESONDERS_BELASTEND) {
      toast.info("Maximal 3 besonders belastende Symptome möglich.", { duration: 3000 });
      return;
    }

    upsertMut.mutate({ symptomKey, burdenLevel: level });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Was belastet dich besonders?</h2>
        <p className="text-sm text-muted-foreground">
          Markiere bis zu 3 Symptome als besonders belastend.
        </p>
      </div>

      <div className="space-y-2">
        {sortedCatalog.map((symptom) => {
          const current = burdenMap.get(symptom.name) ?? 0;
          return (
            <Card key={symptom.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {current === 2 && <Star className="h-4 w-4 text-primary fill-current flex-shrink-0" />}
                  <span className={cn(
                    "text-sm truncate",
                    current === 2 ? "font-medium text-foreground" : 
                    current === 1 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {symptom.name}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {STEPS.map((level) => {
                    const isActive = current === level;
                    return (
                      <button
                        key={level}
                        onClick={() => handleChange(symptom.name, level)}
                        className={cn(
                          "py-1.5 px-3 text-xs rounded-lg transition-colors",
                          isActive
                            ? level === 2
                              ? "bg-primary text-primary-foreground font-medium"
                              : "bg-primary/15 text-primary border border-primary/30 font-medium"
                            : "border border-border/40 text-muted-foreground hover:bg-muted/50"
                        )}
                        disabled={upsertMut.isPending}
                      >
                        {level === 2 ? "⭐" : BURDEN_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
