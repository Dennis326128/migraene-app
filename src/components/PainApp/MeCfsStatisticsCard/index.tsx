/**
 * ME/CFS-Belastung – Statistik-Kachel für AnalysisView.
 *
 * Hybrid-Darstellung:
 *  - Primary KPI: "Belastete Tage (dokumentiert): x von y"
 *  - Burden donut based on documented days only
 *  - Separate documentation ring (documented vs undocumented)
 *  - Projection only as secondary (14–29 days)
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { buildMecfsDonutData } from "@/lib/mecfs/donutData";
import { scoreToLevel, levelToLabelDe } from "@/lib/mecfs/constants";
import type { PainEntry } from "@/types/painApp";
import { DONUT_COLORS, SEGMENT_LABELS, SEGMENT_ORDER } from "./types";
import { MeCfsDonut } from "./MeCfsDonut";
import { MeCfsLegend } from "./MeCfsLegend";
import { MeCfsDocRing } from "./MeCfsDocRing";
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
          <p className="text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Statistical stability tiers ──
  const days = data.calendarDays;
  const tooFewDays = days < MIN_DAYS_FOR_PROJECTION;
  const showProjection = days >= MIN_DAYS_FOR_PROJECTION && days < MIN_DAYS_FOR_STABLE;

  // ── Peak severity label ──
  const peakScore = Math.max(
    ...(data.distribution.severe > 0 ? [9] : []),
    ...(data.distribution.moderate > 0 ? [6] : []),
    ...(data.distribution.mild > 0 ? [3] : []),
    0,
  );
  const peakLabel = levelToLabelDe(scoreToLevel(peakScore));

  // ── Burden-only slices (exclude undocumented) ──
  const burdenSegments = SEGMENT_ORDER.filter(s => s !== 'undocumented');
  const slices = burdenSegments.map(seg => ({
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

        {/* ── (1) Primary KPI: always same format ── */}
        <div className="text-center space-y-1">
          <p className="text-2xl font-bold text-foreground">
            {data.daysWithBurden}{' '}
            <span className="text-base font-normal text-muted-foreground">
              von {data.documentedDays} dokumentierten Tagen belastet
            </span>
          </p>
        </div>

        {/* ── (2) Secondary KPIs ── */}
        <div className="flex justify-center gap-6 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Ø Belastung</p>
            <p className="text-base font-semibold text-foreground">{data.avgDailyMax}/10</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Höchste Belastung</p>
            <p className="text-base font-semibold text-foreground capitalize">{peakLabel}</p>
          </div>
        </div>

        {/* ── (2b) Projection – secondary, only 14–29 days ── */}
        {showProjection && (
          <p className="text-xs text-muted-foreground text-center">
            Schätzung pro 30 Tage: {data.burdenPer30} belastete Tage
          </p>
        )}

        {/* ── (3) Tertiary: Documentation basis ── */}
        <div className="flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-muted-foreground">Datengrundlage</p>
            <p>Dokumentiert: {data.documentedDays} von {data.calendarDays} Tagen</p>
          </div>
          <InfoTooltip
            content="Tageswert = höchste Belastung des Tages. Nicht dokumentierte Tage werden nicht als symptomfrei gewertet."
            side="top"
          />
        </div>
        {tooFewDays && (
          <p className="text-[11px] text-muted-foreground">
            Für eine stabile Trendbewertung werden mindestens 14 Tage empfohlen.
          </p>
        )}

        {/* ── Burden Donut (documented days only) + Legend ── */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Verteilung basiert auf dokumentierten Tagen.</p>
          <div className="flex flex-row items-center gap-4">
            <MeCfsDonut slices={slices} totalDays={data.documentedDays} />
            <MeCfsLegend
              slices={slices}
              totalDays={data.documentedDays}
              showPercent={!tooFewDays}
            />
          </div>
        </div>

        {/* ── Documentation Ring (small, secondary) ── */}
        <MeCfsDocRing
          documentedDays={data.documentedDays}
          calendarDays={data.calendarDays}
        />

        {/* ── Collapsible details ── */}
        <MeCfsDetails data={data} />
      </CardContent>
    </Card>
  );
}
