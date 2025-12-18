import { Card } from "@/components/ui/card";
import { getEffectLabel, getEffectEmoji, getEffectColor } from "@/lib/utils/medicationEffects";

interface MedicationStat {
  name: string;
  count: number;
  avgEffect: number | null;  // 0-10 scale
  ratedCount: number;
}

interface MedicationStatisticsCardProps {
  from: string;
  to: string;
  medications: MedicationStat[];
}

export default function MedicationStatisticsCard({ from, to, medications }: MedicationStatisticsCardProps) {
  if (medications.length === 0) return null;

  // Sortierung: Nach Anzahl, dann alphabetisch
  const sortedMeds = [...medications].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="p-4 mb-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>📊</span>
          <span>Medikamenten-Übersicht</span>
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Zeitraum: {from} – {to}
        </p>
      </div>

      <div className="space-y-3">
        {sortedMeds.map((med) => (
          <div key={med.name} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="font-medium mb-1">{med.name}</div>
            <div className="text-sm space-y-0.5">
              <div className="text-muted-foreground">
                • {med.count} Einnahme{med.count !== 1 ? "n" : ""} 
                {med.ratedCount > 0 && (
                  <span className="ml-1">
                    ({med.ratedCount} bewertet)
                  </span>
                )}
              </div>
              {med.avgEffect !== null ? (
                <div className="flex items-center gap-2">
                  <span style={{ color: getEffectColor(Math.round(med.avgEffect)) }}>
                    • Ø Wirkung: {med.avgEffect.toFixed(1)}/10
                  </span>
                  <span className="text-base">{getEffectEmoji(Math.round(med.avgEffect))}</span>
                  <span className="text-xs text-muted-foreground">
                    ({getEffectLabel(Math.round(med.avgEffect))})
                  </span>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  • Ø Wirkung: - (keine Bewertungen)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
