import React from "react";
import { Card } from "@/components/ui/card";
import { useSymptomCatalog } from "@/features/symptoms/hooks/useSymptoms";
import { useSymptomBurdens, useUpsertSymptomBurden, BURDEN_LABELS } from "@/features/symptoms/hooks/useSymptomBurden";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = [0, 1, 2, 3, 4] as const;

export function SettingsBurdenScreen() {
  const { data: catalog = [] } = useSymptomCatalog();
  const { data: burdens = [] } = useSymptomBurdens();
  const upsertMut = useUpsertSymptomBurden();

  const burdenMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of burdens) m.set(b.symptom_key, b.burden_level);
    return m;
  }, [burdens]);

  const handleChange = (symptomKey: string, level: number) => {
    upsertMut.mutate(
      { symptomKey, burdenLevel: level },
      { onSuccess: () => toast.success("Gespeichert", { duration: 1500 }) }
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Was macht deine Migräne für dich am schlimmsten?</h2>
        <p className="text-sm text-muted-foreground">
          Das hilft, deine Auswertung und Arztberichte besser einzuordnen.
        </p>
      </div>

      <div className="space-y-3">
        {catalog.map((symptom) => {
          const current = burdenMap.get(symptom.name) ?? null;
          return (
            <Card key={symptom.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{symptom.name}</span>
                {current !== null && current >= 3 && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <Star className="h-3 w-3 fill-current" />
                    {BURDEN_LABELS[current]}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {STEPS.map((level) => {
                  const isActive = current === level;
                  return (
                    <button
                      key={level}
                      onClick={() => handleChange(symptom.name, level)}
                      className={cn(
                        "flex-1 py-2 px-1 text-[10px] sm:text-xs rounded-lg transition-all",
                        "border border-border/30",
                        isActive
                          ? level >= 3
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-medium"
                            : "bg-primary/20 text-primary border-primary/40 font-medium"
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                      disabled={upsertMut.isPending}
                    >
                      {BURDEN_LABELS[level]}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
