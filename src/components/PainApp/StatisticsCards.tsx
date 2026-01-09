import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Calendar, Clock, Pill, TrendingUp } from "lucide-react";
import { formatAuraType, formatPainLocation } from "@/lib/utils/pain";

interface StatisticsCardsProps {
  totalEntries: number;
  avgIntensity: number;
  withMedicationCount: number;
  mostCommonTimeHour: number | null;
  mostCommonAura: string | null;
  mostCommonLocation: string | null;
  daysInRange?: number;
  isLoading?: boolean;
}

export function StatisticsCards({
  totalEntries,
  avgIntensity,
  withMedicationCount,
  mostCommonTimeHour,
  mostCommonAura,
  mostCommonLocation,
  daysInRange,
  isLoading = false
}: StatisticsCardsProps) {
  const medicationPercentage = totalEntries > 0 ? Math.round((withMedicationCount / totalEntries) * 100) : 0;
  
  const formatTime = (hour: number | null) => {
    if (hour === null) return 'Keine Daten';
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[...Array(7)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {/* Zeitraum gesamt - erste Karte */}
      {daysInRange !== undefined && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zeitraum gesamt</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{daysInRange} Tage</div>
            <p className="text-xs text-muted-foreground">
              Gesamttage im ausgewählten Zeitraum
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt Einträge</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalEntries}</div>
          <p className="text-xs text-muted-foreground">
            Migräne-Episoden im Zeitraum
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ø Intensität</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgIntensity.toFixed(1)}/10</div>
          <p className="text-xs text-muted-foreground">
            Durchschnittliche Schmerzstärke
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Medikation</CardTitle>
          <Pill className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{medicationPercentage}%</div>
          <p className="text-xs text-muted-foreground">
            {withMedicationCount} von {totalEntries} mit Medikation
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Häufigste Zeit</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatTime(mostCommonTimeHour)}</div>
          <p className="text-xs text-muted-foreground">
            Häufigste Tageszeit für Migräne
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Häufigste Aura</CardTitle>
          <BarChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-sm leading-tight">
            {mostCommonAura ? formatAuraType(mostCommonAura) : 'Keine Daten'}
          </div>
          <p className="text-xs text-muted-foreground">
            Häufigster Aura-Typ
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Häufigste Lokalisation</CardTitle>
          <BarChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-sm leading-tight">
            {mostCommonLocation ? formatPainLocation(mostCommonLocation) : 'Keine Daten'}
          </div>
          <p className="text-xs text-muted-foreground">
            Häufigste Schmerzlokation
          </p>
        </CardContent>
      </Card>
    </div>
  );
}