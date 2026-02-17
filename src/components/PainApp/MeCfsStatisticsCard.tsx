/**
 * ME/CFS-Belastung – Statistik-Kachel für AnalysisView.
 * Donut-Verteilung (wie Kopfschmerz- & Behandlungstage) + KPIs:
 *   A) Belastete Tage / 30 (hochgerechnet)
 *   B) Ø Tages-MAX (0–10) + Label
 *   C) Typischer Bereich (IQR p25–p75)
 * Robust für 4-Stufen (0/3/6/9) UND zukünftigen Slider 0–10.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { scoreToLevel, levelToLabelDe, type MeCfsSeverityLevel } from "@/lib/mecfs/constants";
import type { PainEntry } from "@/types/painApp";

interface MeCfsStatisticsCardProps {
  entries: PainEntry[];
  daysInRange?: number;
}

/** Farben für ME/CFS Donut – dezent, nicht Ampel */
const DONUT_COLORS: Record<MeCfsSeverityLevel, string> = {
  none: 'hsl(var(--muted))',
  mild: '#facc15',      // Yellow-400
  moderate: '#fb923c',  // Orange-400
  severe: '#ef4444',    // Red-500
};

const LEVEL_LABELS: Record<MeCfsSeverityLevel, string> = {
  none: 'keine',
  mild: 'leicht',
  moderate: 'mittel',
  severe: 'schwer',
};

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

/** SVG arc path for donut slice */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const delta = endAngle - startAngle;
  if (delta >= Math.PI * 2 - 0.001) {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const xMid = cx + r * Math.cos(startAngle + Math.PI);
    const yMid = cy + r * Math.sin(startAngle + Math.PI);
    return [
      `M ${cx} ${cy}`, `L ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${xMid} ${yMid}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y1}`, 'Z',
    ].join(' ');
  }
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = delta > Math.PI ? 1 : 0;
  return [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, 'Z'].join(' ');
}

const LEVELS: MeCfsSeverityLevel[] = ['none', 'mild', 'moderate', 'severe'];

export function MeCfsStatisticsCard({ entries, daysInRange }: MeCfsStatisticsCardProps) {
  const stats = useMemo(() => {
    const dayMap = dailyMax(entries);
    const scores = Array.from(dayMap.values());
    const documentedDays = scores.length;
    if (documentedDays === 0) return null;

    const daysWithBurden = scores.filter(s => s > 0).length;
    const burdenPct = Math.round((daysWithBurden / documentedDays) * 100);
    const burdenPer30 = Math.round(((daysWithBurden / documentedDays) * 30) * 10) / 10;
    const avgDailyMax = scores.reduce((a, b) => a + b, 0) / documentedDays;

    const sorted = [...scores].sort((a, b) => a - b);
    const p25 = Math.round(percentile(sorted, 25) * 10) / 10;
    const p75 = Math.round(percentile(sorted, 75) * 10) / 10;

    // Distribution via bucket mapping
    const dist: Record<MeCfsSeverityLevel, number> = { none: 0, mild: 0, moderate: 0, severe: 0 };
    for (const s of scores) {
      dist[scoreToLevel(s)]++;
    }

    return {
      documentedDays,
      calendarDays: daysInRange,
      daysWithBurden,
      burdenPct,
      burdenPer30,
      avgDailyMax: Math.round(avgDailyMax * 10) / 10,
      avgLabel: levelToLabelDe(scoreToLevel(avgDailyMax)),
      p25,
      p75,
      dist,
      allZero: daysWithBurden === 0,
    };
  }, [entries, daysInRange]);

  if (!stats) return null;

  // ── All-zero variant ──
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

  // ── Donut data ──
  const slices = LEVELS.map(level => ({
    level,
    count: stats.dist[level],
    color: DONUT_COLORS[level],
    label: LEVEL_LABELS[level],
  }));
  const activeSlices = slices.filter(s => s.count > 0);
  const total = stats.documentedDays;

  // SVG paths
  const size = 120;
  const cx = 60, cy = 60, r = 55;
  let currentAngle = -Math.PI / 2;
  const paths = activeSlices.map(slice => {
    const sweepAngle = (slice.count / total) * Math.PI * 2;
    const d = describeArc(cx, cy, r, currentAngle, currentAngle + sweepAngle);
    currentAngle += sweepAngle;
    return { ...slice, d };
  });

  const pct = (v: number) => total > 0 ? Math.round((v / total) * 1000) / 10 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ME/CFS-Belastung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donut + Legend (like HeadacheDaysPie) */}
        <div className="flex flex-row items-center gap-4">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg viewBox="0 0 120 120" width={size} height={size}>
              {paths.map(p => (
                <path key={p.level} d={p.d} fill={p.color} />
              ))}
              <circle cx="60" cy="60" r="32" fill="hsl(var(--card))" />
              <text x="60" y="56" textAnchor="middle" className="fill-foreground" fontSize={18} fontWeight="bold">
                {total}
              </text>
              <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                Tage
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 text-sm">
            {slices.map(slice => {
              const isZero = slice.count === 0;
              return (
                <div key={slice.level} className={`flex items-center gap-2 ${isZero ? 'opacity-40' : ''}`}>
                  <span
                    className="inline-block shrink-0 rounded-sm"
                    style={{ width: 12, height: 12, backgroundColor: slice.color }}
                  />
                  <span className="text-foreground">{slice.label}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {slice.count}
                    {total > 0 && <span className="ml-1">({pct(slice.count)}%)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Basis info */}
        <p className="text-xs text-muted-foreground">
          Basis: {stats.documentedDays} dokumentierte Tage
          {stats.calendarDays != null && stats.calendarDays !== stats.documentedDays && (
            <> (von {stats.calendarDays} Kalendertagen)</>
          )}
          {' '}· Tagesaggregation: MAX pro Tag
        </p>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {/* KPI A: Belastete Tage / 30 */}
          <div>
            <p className="text-xs text-muted-foreground">Belastete Tage</p>
            <p className="text-lg font-semibold">{stats.burdenPer30}<span className="text-sm font-normal text-muted-foreground"> / 30</span></p>
            <p className="text-[10px] text-muted-foreground">(hochgerechnet)</p>
          </div>

          {/* KPI B: Ø Tagesbelastung */}
          <div>
            <p className="text-xs text-muted-foreground">Ø Tagesbelastung</p>
            <p className="text-lg font-semibold">{stats.avgDailyMax}/10</p>
            <p className="text-[10px] text-muted-foreground capitalize">Ø Tages-MAX ({stats.avgLabel})</p>
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
      </CardContent>
    </Card>
  );
}
