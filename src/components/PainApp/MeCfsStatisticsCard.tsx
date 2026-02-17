/**
 * ME/CFS-Belastung – Kompakte Statistik-Kachel für AnalysisView.
 * Zeigt Ø-Level, Anteil Tage mit Belastung und Mini-Balkendiagramm.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { scoreToLevel, levelToLabelDe, ME_CFS_OPTIONS } from "@/lib/mecfs/constants";
import { averageScore, countBySeverityLevel } from "@/lib/mecfs/aggregations";
import type { PainEntry } from "@/types/painApp";

interface MeCfsStatisticsCardProps {
  entries: PainEntry[];
  daysInRange?: number;
}

/** Aggregate ME/CFS to one value per day (MAX) */
function dailyMax(entries: PainEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const date = e.selected_date || e.timestamp_created?.split('T')[0];
    if (!date) continue;
    const score = (e as any).me_cfs_severity_score ?? 0;
    map.set(date, Math.max(map.get(date) ?? 0, score));
  }
  return map;
}

export function MeCfsStatisticsCard({ entries, daysInRange }: MeCfsStatisticsCardProps) {
  const stats = useMemo(() => {
    const dayMap = dailyMax(entries);
    const scores = Array.from(dayMap.values());
    // Render card if we have any day data at all (even if all 0)
    if (scores.length === 0) return null;

    const totalDays = daysInRange ?? scores.length;
    const daysWithBurden = scores.filter(s => s > 0).length;
    const burdenPct = totalDays > 0 ? Math.round((daysWithBurden / totalDays) * 100) : 0;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgLevel = scoreToLevel(avg);
    const peakScore = Math.max(...scores);
    const peakLevel = scoreToLevel(peakScore);

    // Distribution via bucket mapping (works for slider 0–10 too)
    const dist = { none: 0, mild: 0, moderate: 0, severe: 0 };
    for (const s of scores) {
      dist[scoreToLevel(s)]++;
    }

    return { avgLevel, burdenPct, daysWithBurden, totalDays, peakLevel, dist, avgScore: Math.round(avg * 10) / 10 };
  }, [entries, daysInRange]);

  // Only hide if truly no data points at all
  if (!stats) {
    return null;
  }

  const barColors: Record<string, string> = {
    none: 'bg-muted',
    mild: 'bg-yellow-400',
    moderate: 'bg-orange-400',
    severe: 'bg-red-500',
  };

  const maxDist = Math.max(...Object.values(stats.dist), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ME/CFS-Belastung
        </CardTitle>
        <p className="text-xs text-muted-foreground">Tagesweise Auswertung (MAX pro Tag)</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ø Belastung</p>
            <p className="text-lg font-semibold capitalize">{levelToLabelDe(stats.avgLevel)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tage mit Belastung</p>
            <p className="text-lg font-semibold">{stats.burdenPct}%</p>
            <p className="text-[10px] text-muted-foreground">{stats.daysWithBurden} / {stats.totalDays} Tage</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spitze</p>
            <p className="text-lg font-semibold capitalize">{levelToLabelDe(stats.peakLevel)}</p>
          </div>
        </div>

        {/* Mini distribution bar chart */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Verteilung</p>
          <div className="flex items-end gap-1.5 h-10">
            {ME_CFS_OPTIONS.map(opt => {
              const count = stats.dist[opt.level];
              const heightPct = maxDist > 0 ? (count / maxDist) * 100 : 0;
              return (
                <div key={opt.level} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-muted-foreground">{count}</span>
                  <div
                    className={`w-full rounded-sm ${barColors[opt.level]}`}
                    style={{ height: `${Math.max(heightPct, 4)}%`, minHeight: '2px' }}
                  />
                  <span className="text-[9px] text-muted-foreground">{opt.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
