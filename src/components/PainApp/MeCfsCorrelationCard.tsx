/**
 * ME/CFS Korrelations-Light – Zeigt Zusammenhang ME/CFS ↔ Migräne.
 * Nur wenn genug Daten (min 7 Tage pro Gruppe).
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { PainEntry } from "@/types/painApp";

interface MeCfsCorrelationCardProps {
  entries: PainEntry[];
}

function painToNumeric(level: string): number {
  const l = (level || '').toLowerCase().replace(/_/g, ' ');
  if (l.includes('sehr') && l.includes('stark')) return 9;
  if (l.includes('stark')) return 7;
  if (l.includes('mittel')) return 5;
  if (l.includes('leicht')) return 2;
  if (l === 'keine' || l === '-') return 0;
  const n = parseInt(level);
  return isNaN(n) ? 0 : n;
}

export function MeCfsCorrelationCard({ entries }: MeCfsCorrelationCardProps) {
  const correlation = useMemo(() => {
    // Group by day, take MAX ME/CFS and MAX pain per day
    const dayMap = new Map<string, { maxCfs: number; maxPain: number; hasMed: boolean }>();
    for (const e of entries) {
      const date = e.selected_date || e.timestamp_created?.split('T')[0];
      if (!date) continue;
      const cfs = (e as any).me_cfs_severity_score ?? 0;
      const pain = painToNumeric(e.pain_level);
      const hasMed = (e.medications?.length ?? 0) > 0 && e.medications?.[0] !== '-';
      const prev = dayMap.get(date);
      dayMap.set(date, {
        maxCfs: Math.max(prev?.maxCfs ?? 0, cfs),
        maxPain: Math.max(prev?.maxPain ?? 0, pain),
        hasMed: (prev?.hasMed ?? false) || hasMed,
      });
    }

    const days = Array.from(dayMap.values());

    // Group A: no ME/CFS (score 0), Group B: ME/CFS present (>0)
    const groupA = days.filter(d => d.maxCfs === 0);
    const groupB = days.filter(d => d.maxCfs > 0);

    // Need min 7 days per group
    if (groupA.length < 7 || groupB.length < 7) return null;

    const avgPainA = groupA.reduce((s, d) => s + d.maxPain, 0) / groupA.length;
    const avgPainB = groupB.reduce((s, d) => s + d.maxPain, 0) / groupB.length;
    const medPctA = Math.round((groupA.filter(d => d.hasMed).length / groupA.length) * 100);
    const medPctB = Math.round((groupB.filter(d => d.hasMed).length / groupB.length) * 100);

    return {
      nA: groupA.length,
      nB: groupB.length,
      avgPainA: Math.round(avgPainA * 10) / 10,
      avgPainB: Math.round(avgPainB * 10) / 10,
      medPctA,
      medPctB,
      painDiff: Math.round((avgPainB - avgPainA) * 10) / 10,
    };
  }, [entries]);

  if (!correlation) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          ME/CFS & Migräne – Zusammenhang
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gruppenvergleich: Tage ohne vs. mit ME/CFS-Belastung
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Ohne ME/CFS ({correlation.nA} Tage)</p>
            <p>Ø Schmerz: <span className="font-semibold">{correlation.avgPainA}/10</span></p>
            <p>Akutmed.: <span className="font-semibold">{correlation.medPctA}%</span></p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Mit ME/CFS ({correlation.nB} Tage)</p>
            <p>Ø Schmerz: <span className="font-semibold">{correlation.avgPainB}/10</span></p>
            <p>Akutmed.: <span className="font-semibold">{correlation.medPctB}%</span></p>
          </div>
        </div>
        {correlation.painDiff !== 0 && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            An Tagen mit ME/CFS-Belastung war die Schmerzintensität im Mittel {correlation.painDiff > 0 ? 'um' : 'um'} {Math.abs(correlation.painDiff)} Punkte {correlation.painDiff > 0 ? 'höher' : 'niedriger'}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
