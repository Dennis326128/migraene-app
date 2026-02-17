/**
 * ME/CFS-Belastung – Kompakte Statistik-Kachel für AnalysisView.
 * Zeigt Ø Tagesbelastung (numerisch + Label), Belastete Tage (%), Typischer Bereich (IQR).
 * Robust für 4-Stufen (0/3/6/9) UND zukünftigen Slider 0–10.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { scoreToLevel, levelToLabelDe, ME_CFS_OPTIONS } from "@/lib/mecfs/constants";
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
    const score = e.me_cfs_severity_score ?? 0;
    map.set(date, Math.max(map.get(date) ?? 0, score));
  }
  return map;
}

/** Compute percentile from sorted array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function MeCfsStatisticsCard({ entries, daysInRange }: MeCfsStatisticsCardProps) {
  const stats = useMemo(() => {
    const dayMap = dailyMax(entries);
    const scores = Array.from(dayMap.values());
    const documentedDays = scores.length;

    if (documentedDays === 0) return null;

    const daysWithBurden = scores.filter(s => s > 0).length;
    const burdenPct = Math.round((daysWithBurden / documentedDays) * 100);
    const avgDailyMax = scores.reduce((a, b) => a + b, 0) / documentedDays;
    const avgLevel = scoreToLevel(avgDailyMax);

    // IQR (p25–p75) for "Typischer Bereich"
    const sorted = [...scores].sort((a, b) => a - b);
    const p25 = Math.round(percentile(sorted, 25) * 10) / 10;
    const p75 = Math.round(percentile(sorted, 75) * 10) / 10;

    // Distribution via bucket mapping (works for slider 0–10 too)
    const dist = { none: 0, mild: 0, moderate: 0, severe: 0 };
    for (const s of scores) {
      dist[scoreToLevel(s)]++;
    }

    return {
      documentedDays,
      calendarDays: daysInRange,
      daysWithBurden,
      burdenPct,
      avgDailyMax: Math.round(avgDailyMax * 10) / 10,
      avgLevel,
      p25,
      p75,
      dist,
      allZero: daysWithBurden === 0,
    };
  }, [entries, daysInRange]);

  // No documented days at all → hide card
  if (!stats) return null;

  // "All zero" variant: clear statement instead of unnecessary KPIs
  if (stats.allZero) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            ME/CFS-Belastung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Im ausgewählten Zeitraum wurde keine ME/CFS-Belastung dokumentiert.
          </p>
          <p className="text-xs text-muted-foreground">
            Basis: {stats.documentedDays} dokumentierte Tage
            {stats.calendarDays != null && stats.calendarDays !== stats.documentedDays && (
              <> (von {stats.calendarDays} Kalendertagen)</>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const barColors: Record<string, string> = {
    none: 'bg-muted',
    mild: 'bg-yellow-400',
    moderate: 'bg-orange-400',
    severe: 'bg-red-500',
  };

  const totalDist = Object.values(stats.dist).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ME/CFS-Belastung
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tagesweise Auswertung (MAX pro Tag) · Basis: {stats.documentedDays} dokumentierte Tage
          {stats.calendarDays != null && stats.calendarDays !== stats.documentedDays && (
            <> (von {stats.calendarDays} Kalendertagen)</>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {/* KPI A: Ø Tagesbelastung (numeric + label) */}
          <div>
            <p className="text-xs text-muted-foreground">Ø Tagesbelastung</p>
            <p className="text-lg font-semibold">{stats.avgDailyMax}/10</p>
            <p className="text-[10px] text-muted-foreground capitalize">({levelToLabelDe(stats.avgLevel)})</p>
          </div>

          {/* KPI B: Belastete Tage */}
          <div>
            <p className="text-xs text-muted-foreground">Belastete Tage</p>
            <p className="text-lg font-semibold">{stats.burdenPct}%</p>
            <p className="text-[10px] text-muted-foreground">{stats.daysWithBurden}/{stats.documentedDays} dok. Tage</p>
          </div>

          {/* KPI C: Typischer Bereich (IQR) */}
          <div>
            <p className="text-xs text-muted-foreground">Typischer Bereich</p>
            <p className="text-lg font-semibold">
              {stats.p25 === stats.p75
                ? `${stats.p25}/10`
                : `${stats.p25}–${stats.p75}/10`}
            </p>
            <p className="text-[10px] text-muted-foreground">25.–75. Perzentil</p>
          </div>
        </div>

        {/* Distribution: stacked bar */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Verteilung (Tage)
          </p>
          {/* Stacked horizontal bar */}
          <div className="flex h-5 rounded-sm overflow-hidden">
            {ME_CFS_OPTIONS.map(opt => {
              const count = stats.dist[opt.level];
              const pct = totalDist > 0 ? (count / totalDist) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={opt.level}
                  className={`${barColors[opt.level]} flex items-center justify-center`}
                  style={{ width: `${pct}%`, minWidth: count > 0 ? '16px' : '0' }}
                  title={`${opt.label}: ${count} Tage (${Math.round(pct)}%)`}
                >
                  {pct > 12 && (
                    <span className="text-[9px] font-medium text-foreground/80">{count}</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex gap-3 text-[9px] text-muted-foreground">
            {ME_CFS_OPTIONS.map(opt => {
              const count = stats.dist[opt.level];
              return (
                <span key={opt.level} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-sm ${barColors[opt.level]}`} />
                  {opt.label}: {count}
                </span>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
