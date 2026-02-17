/**
 * ME/CFS-Belastung – Statistik-Kachel für AnalysisView.
 * Calendar-day basis with "Keine Dokumentation" segment.
 * Uses mecfsStart/mecfsEnd (clamped to tracking start).
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { scoreToLevel, levelToLabelDe, type MeCfsSeverityLevel } from "@/lib/mecfs/constants";
import { buildMecfsDonutData, type MeCfsDonutSegment } from "@/lib/mecfs/donutData";
import type { PainEntry } from "@/types/painApp";

interface MeCfsStatisticsCardProps {
  entries: PainEntry[];
  mecfsStart: string | null;
  mecfsEnd: string | null;
}

/** Farben für ME/CFS Donut */
const DONUT_COLORS: Record<MeCfsDonutSegment, string> = {
  undocumented: 'hsl(var(--muted))',
  none: 'hsl(var(--muted-foreground) / 0.3)',
  mild: '#facc15',
  moderate: '#fb923c',
  severe: '#ef4444',
};

const SEGMENT_LABELS: Record<MeCfsDonutSegment, string> = {
  undocumented: 'Keine Dokumentation',
  none: 'keine Belastung',
  mild: 'leicht',
  moderate: 'mittel',
  severe: 'schwer',
};

const SEGMENT_ORDER: MeCfsDonutSegment[] = ['none', 'mild', 'moderate', 'severe', 'undocumented'];

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

export function MeCfsStatisticsCard({ entries, mecfsStart, mecfsEnd }: MeCfsStatisticsCardProps) {
  const data = useMemo(() => {
    if (!mecfsStart || !mecfsEnd || mecfsStart > mecfsEnd) return null;
    return buildMecfsDonutData(entries, mecfsStart, mecfsEnd);
  }, [entries, mecfsStart, mecfsEnd]);

  // No tracking start → feature not used yet
  if (!mecfsStart || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            ME/CFS-Belastung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ME/CFS wurde in diesem Zeitraum noch nicht dokumentiert.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No documentation in range
  if (!data.hasDocumentation) {
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
            Keine ME/CFS-Dokumentation im ausgewählten Zeitraum.
          </p>
          <p className="text-xs text-muted-foreground">
            Basis: {data.calendarDays} Kalendertage (ab Beginn der ME/CFS-Dokumentation)
          </p>
        </CardContent>
      </Card>
    );
  }

  // All documented days are score 0
  if (data.allDocumentedZero) {
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
            Im ausgewählten Zeitraum wurde keine ME/CFS-Belastung eingetragen.
          </p>
          <p className="text-xs text-muted-foreground">
            Basis: {data.calendarDays} Kalendertage · {data.documentedDays} Tage dokumentiert
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Donut with segments ──
  const total = data.calendarDays;
  const slices = SEGMENT_ORDER.map(seg => ({
    segment: seg,
    count: data.distribution[seg],
    color: DONUT_COLORS[seg],
    label: SEGMENT_LABELS[seg],
  }));
  const activeSlices = slices.filter(s => s.count > 0);

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
  const avgLabel = levelToLabelDe(scoreToLevel(data.avgDailyMax));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ME/CFS im Zeitraum
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basis info */}
        <p className="text-xs text-muted-foreground">
          Basis: {data.calendarDays} Kalendertage (ab Beginn der ME/CFS-Dokumentation)
          <br />
          {data.documentedDays} Tage dokumentiert · Tagesaggregation: MAX pro Tag
        </p>

        {/* Donut + Legend */}
        <div className="flex flex-row items-center gap-4">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg viewBox="0 0 120 120" width={size} height={size}>
              {paths.map(p => (
                <path key={p.segment} d={p.d} fill={p.color} />
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
                <div key={slice.segment} className={`flex items-center gap-2 ${isZero ? 'opacity-40' : ''}`}>
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

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Belastete Tage</p>
            <p className="text-lg font-semibold">{data.burdenPer30}<span className="text-sm font-normal text-muted-foreground"> / 30</span></p>
            <p className="text-[10px] text-muted-foreground">(hochgerechnet)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ø Tagesbelastung</p>
            <p className="text-lg font-semibold">{data.avgDailyMax}/10</p>
            <p className="text-[10px] text-muted-foreground capitalize">Ø Tages-MAX ({avgLabel})</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Typischer Bereich</p>
            <p className="text-lg font-semibold">
              {data.p25 === data.p75
                ? `${data.p25}/10`
                : `${data.p25}–${data.p75}/10`}
            </p>
            <p className="text-[10px] text-muted-foreground">25.–75. Perzentil</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
