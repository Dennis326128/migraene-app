import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";

interface StatisticsFilterProps {
  timeRange: TimeRangePreset;
  onTimeRangeChange: (value: TimeRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  selectedLevels: string[];
  onLevelToggle: (level: string) => void;
  selectedAuraTypes: string[];
  onAuraTypeToggle: (type: string) => void;
  selectedPainLocations: string[];
  onPainLocationToggle: (location: string) => void;
  onClearFilters: () => void;
}

const painLevels = [
  { value: 'leicht', label: 'Leicht', color: 'bg-green-100 text-green-800' },
  { value: 'mittel', label: 'Mittel', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'stark', label: 'Stark', color: 'bg-orange-100 text-orange-800' },
  { value: 'sehr_stark', label: 'Sehr Stark', color: 'bg-red-100 text-red-800' }
];

const auraTypes = [
  { value: 'keine', label: 'Keine Aura' },
  { value: 'visuell', label: 'Visuell' },
  { value: 'sensorisch', label: 'Sensorisch' },
  { value: 'sprachlich', label: 'Sprachlich' },
  { value: 'gemischt', label: 'Gemischt' }
];

const painLocations = [
  { value: 'einseitig_links', label: 'Einseitig Links' },
  { value: 'einseitig_rechts', label: 'Einseitig Rechts' },
  { value: 'beidseitig', label: 'Beidseitig' },
  { value: 'stirn', label: 'Stirn' },
  { value: 'nacken', label: 'Nacken' },
  { value: 'schlaefe', label: 'Schläfe' }
];

export function StatisticsFilter({
  timeRange,
  onTimeRangeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  selectedLevels,
  onLevelToggle,
  selectedAuraTypes,
  onAuraTypeToggle,
  selectedPainLocations,
  onPainLocationToggle,
  onClearFilters
}: StatisticsFilterProps) {
  const hasFilters = selectedLevels.length > 0 || selectedAuraTypes.length > 0 || selectedPainLocations.length > 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Filter & Zeitraum
          </CardTitle>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X className="h-4 w-4 mr-2" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time Range Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Zeitraum</Label>
          <TimeRangeButtons value={timeRange} onChange={onTimeRangeChange} />
        </div>

        {/* Custom Date Range */}
        {timeRange === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-date" className="text-sm">Von</Label>
              <Input
                id="from-date"
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date" className="text-sm">Bis</Label>
              <Input
                id="to-date"
                type="date"
                value={customTo}
                onChange={(e) => onCustomToChange(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Pain Level Filter */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Schmerzstärke</Label>
          <div className="flex flex-wrap gap-2">
            {painLevels.map((level) => (
              <Badge
                key={level.value}
                variant={selectedLevels.includes(level.value) ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  selectedLevels.includes(level.value) ? level.color : 'hover:bg-muted'
                }`}
                onClick={() => onLevelToggle(level.value)}
              >
                {level.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Aura Type Filter */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Aura-Typ</Label>
          <div className="flex flex-wrap gap-2">
            {auraTypes.map((aura) => (
              <Badge
                key={aura.value}
                variant={selectedAuraTypes.includes(aura.value) ? "default" : "outline"}
                className="cursor-pointer transition-colors hover:bg-muted"
                onClick={() => onAuraTypeToggle(aura.value)}
              >
                {aura.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Pain Location Filter */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Schmerzlokation</Label>
          <div className="flex flex-wrap gap-2">
            {painLocations.map((location) => (
              <Badge
                key={location.value}
                variant={selectedPainLocations.includes(location.value) ? "default" : "outline"}
                className="cursor-pointer transition-colors hover:bg-muted"
                onClick={() => onPainLocationToggle(location.value)}
              >
                {location.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}