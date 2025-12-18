import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, MapPin, Brain, Pill, Info } from "lucide-react";
import { formatPainLocation, formatAuraType } from "@/lib/utils/pain";
import type { PatternStatistics, MedicationLimitInfo } from "@/lib/statistics";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PatternCardsProps {
  statistics: PatternStatistics;
  isLoading?: boolean;
}

// Component for displaying the rolling 30-day limit info
function Rolling30DayLimitDisplay({ limitInfo }: { limitInfo: MedicationLimitInfo }) {
  const percentage = Math.min(100, (limitInfo.rolling30Count / limitInfo.limit) * 100);
  const isWarning = percentage >= 80 && percentage < 100;
  const isOver = limitInfo.isOverLimit;

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">30-Tage-Limit</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px]">
              <p className="text-xs">Rollierend: zählt die letzten 30 Tage ab heute.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`font-medium ${isOver ? 'text-destructive' : isWarning ? 'text-warning' : 'text-foreground'}`}>
          Letzte 30 Tage: {limitInfo.rolling30Count} / {limitInfo.limit}
        </span>
        <span className={`text-xs ${isOver ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
          {isOver 
            ? `+${limitInfo.overBy} über Limit` 
            : `Noch ${limitInfo.remaining} übrig`
          }
        </span>
      </div>
      
      <Progress 
        value={percentage} 
        className={`h-2 ${isOver ? '[&>div]:bg-destructive' : isWarning ? '[&>div]:bg-warning' : ''}`}
      />
    </div>
  );
}

export function PatternCards({ statistics, isLoading = false }: PatternCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 mb-6">
        <h3 className="text-lg font-semibold">Deine Muster in diesem Zeitraum</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
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

  // Determine if Aura Card should be shown
  // Show if there's any explicit aura documentation OR any symptoms documented
  const showAuraCard = auraAndSymptoms.hasAuraDocumentation || auraAndSymptoms.hasSymptomDocumentation;

  return (
    <div className="space-y-4 mb-6">
      <h3 className="text-lg font-semibold">Deine Muster in diesem Zeitraum</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Schmerzprofil */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Schmerzprofil</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Verteilung deiner Schmerzstärke im gewählten Zeitraum
            </CardDescription>
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
            <p className="text-xs text-muted-foreground pt-2">
              Im gewählten Zeitraum: {painProfile.totalEpisodes} Migräne-Episoden
            </p>
          </CardContent>
        </Card>

        {/* Schmerzlokalisation */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Schmerzlokalisation</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Wo sitzen deine Schmerzen am häufigsten?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {painLocation.mostCommon ? (
              <>
                {painLocation.distribution.length < 3 && (
                  <div className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                    <span className="font-medium">⚠️</span>
                    <span>Zu wenig Daten für aussagekräftige Statistik</span>
                  </div>
                )}
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-sm font-medium">Meistens:</span>
                  <span className="text-lg font-bold text-primary">
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
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Im gewählten Zeitraum wurden keine Einträge mit Schmerzlokalisation dokumentiert.
                </p>
                <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-md">
                  💡 <span className="font-medium">Tipp:</span> Wähle einen längeren Zeitraum (z.B. "Alle") oder dokumentiere die Schmerzlokalisation bei neuen Einträgen.
                </p>
              </div>
            )}
            
            {/* Mini-Info wenn Aura-Card ausgeblendet */}
            {!showAuraCard && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                <Brain className="h-3.5 w-3.5" />
                <span>Aura: keine dokumentiert (im Zeitraum)</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs">Du kannst Aura/Symptome in Einträgen dokumentieren.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aura & Symptome - nur wenn Daten vorhanden */}
        {showAuraCard && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Aura & Begleitsymptome</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Wie oft tritt eine Aura auf und welche Symptome begleiten dich?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {auraAndSymptoms.mostCommonAura && auraAndSymptoms.mostCommonAura.percentage < 20 && (
                <div className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                  <span className="font-medium">⚠️</span>
                  <span>Wenige Aura-Einträge für aussagekräftige Statistik</span>
                </div>
              )}
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
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Im gewählten Zeitraum wurden keine Symptome dokumentiert.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-md">
                    💡 <span className="font-medium">Tipp:</span> Wähle einen längeren Zeitraum oder dokumentiere Symptome bei zukünftigen Einträgen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Medikamente & Wirkung */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Medikamente & Wirkung</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Wie häufig nimmst du welche Medikamente und wie gut wirken sie?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {medicationAndEffect.mostUsed ? (
              <>
                {medicationAndEffect.topMedications.length < 2 && (
                  <div className="text-xs text-amber-500 mb-2 flex items-center gap-1">
                    <span className="font-medium">⚠️</span>
                    <span>Wenige Medikations-Einträge für umfassende Statistik</span>
                  </div>
                )}
                <div className="pb-2 border-b border-border">
                  <p className="text-sm font-medium mb-1">Am häufigsten:</p>
                  <p className="text-base font-bold text-primary">
                    {medicationAndEffect.mostUsed.name}
                  </p>
                  
                  {/* Zeile 1: Einnahmen im Zeitraum */}
                  <p className="text-xs text-muted-foreground mt-1">
                    Im Zeitraum: {medicationAndEffect.mostUsed.rangeCount} Einnahmen
                    {medicationAndEffect.mostUsed.avgRating > 0 && (
                      <span className="ml-1">• Ø Wirkung {medicationAndEffect.mostUsed.avgRating}/10</span>
                    )}
                  </p>
                  
                  {medicationAndEffect.mostUsed.sideEffectCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Nebenwirkungen bei {medicationAndEffect.mostUsed.sideEffectCount} Episoden dokumentiert
                    </p>
                  )}
                  
                  {/* Zeile 2: Rolling 30-Tage-Limit */}
                  {medicationAndEffect.mostUsed.limitInfo ? (
                    <Rolling30DayLimitDisplay limitInfo={medicationAndEffect.mostUsed.limitInfo} />
                  ) : (
                    <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/50">
                      Kein 30-Tage-Limit festgelegt
                    </p>
                  )}
                </div>
                
                {medicationAndEffect.topMedications.length > 1 && (
                  <div className="space-y-1.5 text-sm">
                    {medicationAndEffect.topMedications.slice(1, 3).map((med, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-muted-foreground">{med.name}:</span>
                        <span className="font-medium">
                          {med.rangeCount}x im Zeitraum
                          {med.avgRating > 0 && <> (Ø {med.avgRating}/10)</>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Im gewählten Zeitraum wurden keine Medikamente dokumentiert.
                </p>
                <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-md">
                  💡 <span className="font-medium">Tipp:</span> Wähle einen längeren Zeitraum oder dokumentiere Medikamente bei zukünftigen Einträgen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
