/**
 * ME/CFS-Belastung – Statistik-Kachel für AnalysisView.
 *
 * Statistical stability rules:
 *  - calendarDays < 14: no projection, no %, no range
 *  - 14 ≤ calendarDays < 30: projection (preliminary), % shown
 *  - calendarDays ≥ 30: real values only, % shown, no projection
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

const MIN_DAYS_FOR_PROJECTION = 14;
const MIN_DAYS_FOR_STABLE = 30;

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

  // ── Statistical stability tiers ──
  const days = data.calendarDays;
  const tooFewDays = days < MIN_DAYS_FOR_PROJECTION;
  const showProjection = days >= MIN_DAYS_FOR_PROJECTION && days < MIN_DAYS_FOR_STABLE;
  const showRealValues = days >= MIN_DAYS_FOR_STABLE;
  const showPercent = days >= MIN_DAYS_FOR_PROJECTION;
  const showRange = days >= MIN_DAYS_FOR_PROJECTION;

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
        {/* Data basis */}
        <div className="flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground">
            <span>Datengrundlage: {data.calendarDays} Kalendertage</span>
            <br />
            <span>davon {data.documentedDays} dokumentiert</span>
          </div>
          <InfoTooltip
            content={'Tageswert = höchste Belastung des Tages. Details findest du unter "Details anzeigen".'}
            side="top"
          />
        </div>

        {/* Primary KPI */}
        <div className="text-center space-y-1">
          {tooFewDays ? (
            <>
              <p className="text-2xl font-bold text-foreground">
                {data.daysWithBurden}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  von {data.calendarDays} Tagen belastet
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Zu wenig Daten für eine belastbare Hochrechnung
              </p>
            </>
          ) : showProjection ? (
            <>
              <p className="text-2xl font-bold text-foreground">
                {data.burdenPer30}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  von 30 Tagen belastet
                </span>
              </p>
              <div className="flex items-center justify-center gap-1">
                <p className="text-[11px] text-muted-foreground">30-Tage-Projektion (vorläufig)</p>
                <InfoTooltip
                  content="Die Projektion basiert auf weniger als 30 Kalendertagen und kann sich mit zunehmender Datenbasis stabilisieren."
                  side="top"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground">
                {data.daysWithBurden}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  von {data.calendarDays} Tagen belastet
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">im Zeitraum</p>
            </>
          )}
        </div>

        {/* Secondary KPIs */}
        <div className="flex justify-center gap-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ø Belastung</p>
            <p className="text-base font-semibold text-foreground">{data.avgDailyMax}/10</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Üblicher Bereich</p>
            {showRange ? (
              <p className="text-base font-semibold text-foreground">{rangeLabel}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Noch keine stabile Spannbreite</p>
            )}
          </div>
        </div>

        {/* Donut + Legend */}
        <div className="flex flex-row items-center gap-4">
          <MeCfsDonut slices={slices} totalDays={data.calendarDays} />
          <MeCfsLegend
            slices={slices}
            totalDays={data.calendarDays}
            showPercent={showPercent}
          />
        </div>

        {/* Collapsible details */}
        <MeCfsDetails data={data} />
      </CardContent>
    </Card>
  );
}
