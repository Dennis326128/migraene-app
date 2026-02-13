import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, MapPin, Brain, Pill, Info, Calendar } from "lucide-react";
import { formatPainLocation, formatAuraType } from "@/lib/utils/pain";
import { getEffectLabel } from "@/lib/utils/medicationEffects";
import type { PatternStatistics, MedicationLimitInfo, MedicationEffectStats } from "@/lib/statistics";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OveruseInfo {
  hasWarning: boolean;
  medicationsWithWarning: MedicationEffectStats[];
  onNavigateToLimits?: () => void;
  warningThreshold: number;
}

interface PatternCardsProps {
  statistics: PatternStatistics;
  isLoading?: boolean;
  overuseInfo?: OveruseInfo;
  daysInRange?: number;
}

// Helper component for Info icon with tooltip
function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground/60 cursor-help hover:text-muted-foreground transition-colors" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <p className="text-xs">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Component for displaying the rolling 30-day limit info
function Rolling30DayLimitDisplay({ limitInfo }: { limitInfo: MedicationLimitInfo }) {
  const percentage = Math.min(100, (limitInfo.rolling30Count / limitInfo.limit) * 100);
  const isOver = limitInfo.isOverLimit;

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">30-Tage-Limit</span>
        {isOver && <span className="text-amber-500 text-xs">⚠</span>}
        <InfoTooltip content="Rollierend: zählt die letzten 30 Tage ab heute." />
      </div>
      
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`font-medium ${isOver ? 'text-destructive' : 'text-foreground'}`}>
          {limitInfo.rolling30Count} / {limitInfo.limit}
        </span>
        {isOver ? (
          <span className="text-xs font-semibold text-destructive">
            +{limitInfo.overBy} über
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {limitInfo.remaining} übrig
          </span>
        )}
      </div>
      
      <Progress 
        value={percentage} 
        className={`h-1.5 ${isOver ? '[&>div]:bg-destructive' : '[&>div]:bg-green-600'}`}
      />
    </div>
  );
}

// TEIL E: Component for medication effect display
function MedicationEffectDisplay({ med, showLimit = false, onNavigateToLimits }: { med: MedicationEffectStats; showLimit?: boolean; onNavigateToLimits?: () => void }) {
  return (
    <div className="py-2 border-b border-border/30 last:border-0">
      <div className="flex justify-between items-start">
        <span className="font-medium text-sm">{med.name}</span>
        <span className="text-xs text-muted-foreground">{med.rangeCount}x</span>
      </div>
      
      {/* Effect display */}
      <div className="mt-1 flex items-center gap-2 text-sm">
        {med.avgEffect !== null ? (
          <>
            <span className="text-muted-foreground">Ø Wirkung:</span>
            <span className="font-medium">{med.avgEffect}/10</span>
            <span className="text-xs text-muted-foreground">
              ({getEffectLabel(Math.round(med.avgEffect))})
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">Keine Bewertungen</span>
        )}
      </div>
      
      {/* Show rated count if not all are rated */}
      {med.avgEffect !== null && med.ratedCount < med.rangeCount && (
        <div className="text-xs text-muted-foreground mt-0.5">
          Bewertet: {med.ratedCount}/{med.rangeCount}
        </div>
      )}
      
      {/* Rolling 30-day limit - always show when available */}
      {showLimit && med.limitInfo && (
        <>
          <Rolling30DayLimitDisplay limitInfo={med.limitInfo} />
          {med.limitInfo.isOverLimit && onNavigateToLimits && (
            <Button 
              variant="outline" 
              size="sm"
              className="h-7 text-xs mt-2"
              onClick={onNavigateToLimits}
            >
              Limits-Übersicht
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function PatternCards({ statistics, isLoading = false, overuseInfo, daysInRange }: PatternCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { painProfile, painLocation, auraAndSymptoms, medicationAndEffect } = statistics;

  // TEIL C: Show Aura Card only if meaningful aura data exists OR symptoms are documented
  const showAuraCard = auraAndSymptoms.hasMeaningfulAura || auraAndSymptoms.hasSymptomDocumentation;

  

  return (
    <div className="space-y-4 mb-6">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Schmerzprofil */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Schmerzprofil</CardTitle>
              </div>
              <InfoTooltip content="Verteilung deiner Schmerzstärke im gewählten Zeitraum" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <span className="text-sm font-medium">Durchschnitt:</span>
              <span className="text-lg font-bold text-primary">
                {painProfile.average.toFixed(1)} / 10
              </span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Leicht (0-3):</span>
                <span className="font-medium">{painProfile.distribution.leicht.percentage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mittel (4-6):</span>
                <span className="font-medium">{painProfile.distribution.mittel.percentage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stark (7-8):</span>
                <span className="font-medium">{painProfile.distribution.stark.percentage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sehr stark (9-10):</span>
                <span className="font-medium">{painProfile.distribution.sehr_stark.percentage}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              {painProfile.totalEpisodes} Episoden
            </p>
          </CardContent>
        </Card>

        {/* Schmerzlokalisation */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Schmerzlokalisation</CardTitle>
              </div>
              <InfoTooltip content="Wo sitzen deine Schmerzen am häufigsten?" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {painLocation.mostCommon ? (
              <>
                {painLocation.distribution.length < 3 && (
                  <div className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                    <span className="font-medium">⚠️</span>
                    <span>Wenige Daten</span>
                  </div>
                )}
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-sm font-medium">Meistens:</span>
                  <span className="text-base font-bold text-primary">
                    {formatPainLocation(painLocation.mostCommon.location)} ({painLocation.mostCommon.percentage}%)
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  {painLocation.distribution.slice(0, 4).map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {formatPainLocation(item.location)}:
                      </span>
                      <span className="font-medium">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Lokalisationsdaten im Zeitraum
              </p>
            )}
            
            {/* TEIL C: Mini-Info wenn Aura-Card ausgeblendet */}
            {!showAuraCard && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                <Brain className="h-3.5 w-3.5" />
                <span>Aura: keine im Zeitraum</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* TEIL C: Aura & Symptome - nur wenn echte Daten vorhanden */}
        {showAuraCard && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Aura & Begleitsymptome</CardTitle>
                </div>
                <InfoTooltip content="Wie oft tritt eine Aura auf und welche Symptome begleiten dich?" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between pb-1">
                  <span className="text-muted-foreground">Keine Aura:</span>
                  <span className="font-medium">{auraAndSymptoms.noAuraPercentage}%</span>
                </div>
                {auraAndSymptoms.mostCommonAura && (
                  <div className="flex justify-between pb-2 border-b border-border">
                    <span className="text-muted-foreground">Häufigste Aura:</span>
                    <span className="font-medium">
                      {formatAuraType(auraAndSymptoms.mostCommonAura.type)} ({auraAndSymptoms.mostCommonAura.percentage}%)
                    </span>
                  </div>
                )}
              </div>
              {auraAndSymptoms.topSymptoms.length > 0 && (
                <>
                  <p className="text-xs font-medium text-foreground pt-1">Top Symptome:</p>
                  <div className="space-y-1.5 text-sm">
                    {auraAndSymptoms.topSymptoms.map((symptom, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-muted-foreground">{symptom.name}:</span>
                        <span className="font-medium">{symptom.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {auraAndSymptoms.topSymptoms.length === 0 && !auraAndSymptoms.mostCommonAura && (
                <p className="text-sm text-muted-foreground">
                  Keine Symptome dokumentiert
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* TEIL E: Medikamente & Wirkung */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Medikamente & Wirkung</CardTitle>
              </div>
              <InfoTooltip content="Wie häufig nimmst du welche Medikamente und wie gut wirken sie?" />
            </div>
          </CardHeader>
          <CardContent>
            {medicationAndEffect.mostUsed ? (
              <div className="space-y-1">
                {medicationAndEffect.topMedications.length < 2 && (
                  <div className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                    <span className="font-medium">⚠️</span>
                    <span>Wenige Daten</span>
                  </div>
                )}
                
                {/* All top medications with limit info inline */}
                {medicationAndEffect.topMedications.slice(0, 3).map((med, idx) => (
                  <MedicationEffectDisplay 
                    key={idx}
                    med={med} 
                    showLimit={true}
                    onNavigateToLimits={overuseInfo?.onNavigateToLimits}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Medikamente im Zeitraum
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
