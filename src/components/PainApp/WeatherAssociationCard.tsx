import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudRain, AlertTriangle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Minimal types matching WeatherAnalysisV2 shape */
interface WeatherBucket {
  label: string;
  nDays: number;
  headacheRate: number;
  meanPainMax: number | null;
  acuteMedRate: number;
}

interface RelativeRisk {
  referenceLabel: string;
  compareLabel: string;
  rr: number | null;
  absDiff: number | null;
}

interface WeatherCoverage {
  daysDocumented: number;
  daysWithWeather: number;
  daysWithDelta24h: number;
  ratioWeather: number;
  ratioDelta24h: number;
  daysWithEntryWeather?: number;
  daysWithSnapshotWeather?: number;
  daysWithNoWeather?: number;
}

interface PressureDelta {
  enabled: boolean;
  confidence: string;
  buckets: WeatherBucket[];
  relativeRisk: RelativeRisk | null;
  notes: string[];
}

export interface WeatherAssociationCardProps {
  coverage: WeatherCoverage;
  pressureDelta24h: PressureDelta;
  disclaimer: string;
}

export function WeatherAssociationCard({
  coverage,
  pressureDelta24h,
  disclaimer,
}: WeatherAssociationCardProps) {
  const isInsufficient = pressureDelta24h.confidence === "insufficient";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CloudRain className="h-5 w-5 text-primary" />
          Wetter & Kopfschmerz
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Zusammenhang zwischen Luftdruckänderung und Kopfschmerzen
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Coverage */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          <span>Dokumentiert: {coverage.daysDocumented} Tage</span>
          <span>·</span>
          <span>Wetter: {coverage.daysWithWeather} ({Math.round(coverage.ratioWeather * 100)}%)</span>
          {coverage.daysWithEntryWeather != null && (
            <>
              <span>·</span>
              <span>Entry: {coverage.daysWithEntryWeather}</span>
            </>
          )}
          {coverage.daysWithSnapshotWeather != null && (
            <>
              <span>·</span>
              <span>Snapshot: {coverage.daysWithSnapshotWeather}</span>
            </>
          )}
          {coverage.daysWithNoWeather != null && coverage.daysWithNoWeather > 0 && (
            <>
              <span>·</span>
              <span>Keine Daten: {coverage.daysWithNoWeather}</span>
            </>
          )}
          <span>·</span>
          <span>Δ24h: {coverage.daysWithDelta24h} ({Math.round(coverage.ratioDelta24h * 100)}%)</span>
        </div>

        {/* Insufficient data */}
        {isInsufficient && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Noch nicht ausreichend Daten für eine Wetter-Kopfschmerz-Analyse.
              {pressureDelta24h.notes.length > 0 && ` ${pressureDelta24h.notes[0]}`}
            </span>
          </div>
        )}

        {/* Bucket table */}
        {pressureDelta24h.enabled && pressureDelta24h.buckets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Druckänderung</th>
                  <th className="pb-2 px-2 font-medium text-right">Tage</th>
                  <th className="pb-2 px-2 font-medium text-right">KS-Rate</th>
                  <th className="pb-2 pl-2 font-medium text-right">Ø Intensität</th>
                </tr>
              </thead>
              <tbody>
                {pressureDelta24h.buckets.map((bucket) => (
                  <tr key={bucket.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-2 text-foreground">{bucket.label}</td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{bucket.nDays}</td>
                    <td className="py-2 px-2 text-right font-medium">
                      {Math.round(bucket.headacheRate * 100)}%
                    </td>
                    <td className="py-2 pl-2 text-right text-muted-foreground">
                      {bucket.meanPainMax != null ? bucket.meanPainMax.toFixed(1) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Relative Risk */}
        {pressureDelta24h.relativeRisk && pressureDelta24h.relativeRisk.rr != null && (
          <div className="text-sm bg-muted/30 rounded-lg p-3">
            <span className="font-medium">Relatives Risiko: </span>
            <span>{pressureDelta24h.relativeRisk.rr}×</span>
            <span className="text-muted-foreground ml-1">
              ({pressureDelta24h.relativeRisk.compareLabel} vs. {pressureDelta24h.relativeRisk.referenceLabel})
            </span>
          </div>
        )}

        {/* Notes */}
        {pressureDelta24h.notes.length > 0 && !isInsufficient && (
          <div className="space-y-1">
            {pressureDelta24h.notes.map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[10px] text-muted-foreground/70 italic cursor-help">
                {disclaimer}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                Die Analyse basiert auf Ihren dokumentierten Daten und zeigt statistische Zusammenhänge.
                Dies ist keine medizinische Diagnose und ersetzt nicht die ärztliche Beurteilung.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Confidence badge */}
        {!isInsufficient && (
          <div className="flex justify-end">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              pressureDelta24h.confidence === 'high'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : pressureDelta24h.confidence === 'medium'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            }`}>
              Konfidenz: {pressureDelta24h.confidence === 'high' ? 'Hoch' : pressureDelta24h.confidence === 'medium' ? 'Mittel' : 'Niedrig'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
