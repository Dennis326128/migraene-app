/**
 * ME/CFS-Belastung – Statistik-Kachel für AnalysisView.
 *
 * Low-cognitive-load redesign:
 *  - Primary KPI: burden days / 30
 *  - Secondary: avg burden
 *  - Typical range (no "Perzentil" wording)
 *  - Donut + legend (% only when documentedDays >= 14)
 *  - Collapsible details for methodology
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { buildMecfsDonutData } from "@/lib/mecfs/donutData";
import type { PainEntry } from "@/types/painApp";
import { DONUT_COLORS, SEGMENT_LABELS, SEGMENT_ORDER } from "./types";
import { MeCfsDonut } from "./MeCfsDonut";
import { MeCfsLegend } from "./MeCfsLegend";
import { MeCfsDetails } from "./MeCfsDetails";

interface MeCfsStatisticsCardProps {
  entries: PainEntry[];
  mecfsStart: string | null;
  mecfsEnd: string | null;
}

export function MeCfsStatisticsCard({ entries, mecfsStart, mecfsEnd }: MeCfsStatisticsCardProps) {
  const data = useMemo(() => {
    if (!mecfsStart || !mecfsEnd || mecfsStart > mecfsEnd) return null;
    return buildMecfsDonutData(entries, mecfsStart, mecfsEnd);
  }, [entries, mecfsStart, mecfsEnd]);

  // ── No tracking start → feature not used ──
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

  // ── No documentation in range ──
  if (!data.hasDocumentation) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            ME/CFS im Zeitraum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Datengrundlage: keine Dokumentation</p>
          <p className="text-sm text-muted-foreground mt-2">Keine Daten im Zeitraum.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Projection logic ──
  // Use projection when period < 30 days or documented < calendarDays
  const useProjection = data.calendarDays < 30 || data.documentedDays < data.calendarDays;
  const burdenDisplay = useProjection
    ? { value: data.burdenPer30, total: 30, sublabel: '30-Tage-Projektion' }
    : { value: data.daysWithBurden, total: data.calendarDays, sublabel: 'im Zeitraum' };

  // ── Typical range label ──
  const rangeLabel =
    data.p25 === data.p75
      ? `${data.p25}/10`
      : `${data.p25}–${data.p75}/10`;

  // ── Slices for donut ──
  const slices = SEGMENT_ORDER.map(seg => ({
    segment: seg,
    count: data.distribution[seg],
    color: DONUT_COLORS[seg],
    label: SEGMENT_LABELS[seg],
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ME/CFS im Zeitraum
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data basis – single line + info icon */}
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">
            Datengrundlage: {data.documentedDays} Tage
          </p>
          <InfoTooltip
            content={'Tageswert = höchste Belastung des Tages. Details findest du unter "Details anzeigen".'}
            side="top"
          />
        </div>

        {/* Primary KPI */}
        <div className="text-center space-y-1">
          <p className="text-2xl font-bold text-foreground">
            {burdenDisplay.value} <span className="text-base font-normal text-muted-foreground">von {burdenDisplay.total} Tagen belastet</span>
          </p>
          <p className="text-[11px] text-muted-foreground">{burdenDisplay.sublabel}</p>
        </div>

        {/* Secondary KPIs */}
        <div className="flex justify-center gap-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ø Belastung</p>
            <p className="text-base font-semibold text-foreground">{data.avgDailyMax}/10</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Üblicher Bereich</p>
            <p className="text-base font-semibold text-foreground">{rangeLabel}</p>
          </div>
        </div>

        {/* Donut + Legend */}
        <div className="flex flex-row items-center gap-4">
          <MeCfsDonut slices={slices} totalDays={data.calendarDays} />
          <MeCfsLegend
            slices={slices}
            totalDays={data.calendarDays}
            documentedDays={data.documentedDays}
          />
        </div>

        {/* Collapsible details */}
        <MeCfsDetails data={data} />
      </CardContent>
    </Card>
  );
}
