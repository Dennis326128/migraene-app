import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MedicationCourseType } from "@/features/medication-courses";

export interface DosageSchedule {
  morning: number;
  noon: number;
  evening: number;
  night: number;
}

export interface StructuredDosage {
  doseValue: string;
  doseUnit: string;
  doseRhythm: "daily" | "weekly" | "monthly" | "as_needed";
  doseSchedule: DosageSchedule;
  administrationRoute: "oral" | "sc" | "im" | "nasal" | "other";
  maxPerPeriod: string;
}

interface StructuredDosageInputProps {
  value: StructuredDosage;
  onChange: (value: StructuredDosage) => void;
  type: MedicationCourseType;
}

const DOSE_UNITS = [
  { value: "mg", label: "mg" },
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "Tabletten", label: "Tablette(n)" },
  { value: "Tropfen", label: "Tropfen" },
  { value: "Spritzen", label: "Spritze(n)" },
  { value: "Hub", label: "Hub(e)" },
];

const RHYTHMS_PROPHYLAXE = [
  { value: "daily", label: "Täglich" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "monthly", label: "Monatlich" },
];

const RHYTHMS_AKUT = [
  { value: "as_needed", label: "Bei Bedarf" },
  { value: "daily", label: "Täglich (max.)" },
];

const ADMIN_ROUTES = [
  { value: "oral", label: "Oral (Mund)" },
  { value: "sc", label: "Subkutan (s.c.)" },
  { value: "im", label: "Intramuskulär (i.m.)" },
  { value: "nasal", label: "Nasal (Nase)" },
  { value: "other", label: "Andere" },
];

const SCHEDULE_LABELS = [
  { key: "morning" as const, label: "Mo", fullLabel: "Morgens" },
  { key: "noon" as const, label: "Mi", fullLabel: "Mittags" },
  { key: "evening" as const, label: "Ab", fullLabel: "Abends" },
  { key: "night" as const, label: "Na", fullLabel: "Nachts" },
];

export function buildDoseText(dosage: StructuredDosage): string {
  const parts: string[] = [];
  
  // Dose value and unit
  if (dosage.doseValue) {
    parts.push(`${dosage.doseValue} ${dosage.doseUnit}`);
  }
  
  // Administration route (if not oral)
  if (dosage.administrationRoute && dosage.administrationRoute !== "oral" && dosage.administrationRoute !== "other") {
    parts.push(dosage.administrationRoute === "sc" ? "s.c." : 
               dosage.administrationRoute === "im" ? "i.m." : 
               dosage.administrationRoute === "nasal" ? "nasal" : "");
  }
  
  // Rhythm
  if (dosage.doseRhythm === "daily") {
    const schedule = dosage.doseSchedule;
    const total = schedule.morning + schedule.noon + schedule.evening + schedule.night;
    if (total > 0) {
      parts.push(`${schedule.morning}-${schedule.noon}-${schedule.evening}-${schedule.night}`);
    } else {
      parts.push("täglich");
    }
  } else if (dosage.doseRhythm === "weekly") {
    parts.push("1×/Woche");
  } else if (dosage.doseRhythm === "monthly") {
    parts.push("1×/Monat");
  } else if (dosage.doseRhythm === "as_needed") {
    parts.push("bei Bedarf");
    if (dosage.maxPerPeriod) {
      parts.push(`(max. ${dosage.maxPerPeriod})`);
    }
  }
  
  return parts.filter(Boolean).join(" ");
}

export function parseDoseText(text: string): Partial<StructuredDosage> {
  const result: Partial<StructuredDosage> = {};
  const normalized = text.toLowerCase().trim();
  
  // Parse dose value and unit
  const doseMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|ml|tabletten?|tropfen|spritzen?|hub)/i);
  if (doseMatch) {
    result.doseValue = doseMatch[1].replace(",", ".");
    const unit = doseMatch[2].toLowerCase();
    if (unit.startsWith("tablette")) result.doseUnit = "Tabletten";
    else if (unit.startsWith("spritze")) result.doseUnit = "Spritzen";
    else result.doseUnit = unit;
  }
  
  // Parse administration route
  if (normalized.includes("s.c.") || normalized.includes("subkutan") || normalized.includes("spritze")) {
    result.administrationRoute = "sc";
  } else if (normalized.includes("i.m.") || normalized.includes("intramuskulär")) {
    result.administrationRoute = "im";
  } else if (normalized.includes("nasal") || normalized.includes("nase")) {
    result.administrationRoute = "nasal";
  }
  
  // Parse rhythm
  if (normalized.includes("monat") || normalized.includes("1×/monat") || normalized.includes("einmal im monat")) {
    result.doseRhythm = "monthly";
  } else if (normalized.includes("woche") || normalized.includes("wöchentlich")) {
    result.doseRhythm = "weekly";
  } else if (normalized.includes("bedarf")) {
    result.doseRhythm = "as_needed";
  } else if (normalized.includes("täglich") || normalized.includes("tag")) {
    result.doseRhythm = "daily";
  }
  
  // Parse schedule pattern (e.g., "1-0-1-0")
  const scheduleMatch = normalized.match(/(\d)-(\d)-(\d)-(\d)/);
  if (scheduleMatch) {
    result.doseSchedule = {
      morning: parseInt(scheduleMatch[1]),
      noon: parseInt(scheduleMatch[2]),
      evening: parseInt(scheduleMatch[3]),
      night: parseInt(scheduleMatch[4]),
    };
    result.doseRhythm = "daily";
  }
  
  // Parse max per period
  const maxMatch = normalized.match(/max\.?\s*(\d+)/);
  if (maxMatch) {
    result.maxPerPeriod = maxMatch[1];
  }
  
  return result;
}

const NumberStepper: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}> = ({ value, onChange, min = 0, max = 9, label }) => (
  <div className="flex flex-col items-center gap-1">
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Minus className="h-2.5 w-2.5" />
      </Button>
      <span className="w-6 text-center font-medium">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Plus className="h-2.5 w-2.5" />
      </Button>
    </div>
  </div>
);

export const StructuredDosageInput: React.FC<StructuredDosageInputProps> = ({
  value,
  onChange,
  type,
}) => {
  const rhythmOptions = type === "akut" ? RHYTHMS_AKUT : RHYTHMS_PROPHYLAXE;
  const showSchedule = type === "prophylaxe" && value.doseRhythm === "daily";
  const showMaxPerPeriod = type === "akut" || value.doseRhythm === "as_needed";

  const updateField = <K extends keyof StructuredDosage>(
    field: K,
    fieldValue: StructuredDosage[K]
  ) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const updateSchedule = (key: keyof DosageSchedule, amount: number) => {
    onChange({
      ...value,
      doseSchedule: { ...value.doseSchedule, [key]: amount },
    });
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Dose Value + Unit Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Stärke</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="z.B. 225"
            value={value.doseValue}
            onChange={(e) => updateField("doseValue", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Einheit</Label>
          <Select value={value.doseUnit} onValueChange={(v) => updateField("doseUnit", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOSE_UNITS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Administration Route */}
      <div className="space-y-2">
        <Label>Verabreichungsweg</Label>
        <Select
          value={value.administrationRoute}
          onValueChange={(v) => updateField("administrationRoute", v as StructuredDosage["administrationRoute"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_ROUTES.map((route) => (
              <SelectItem key={route.value} value={route.value}>
                {route.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rhythm */}
      <div className="space-y-2">
        <Label>Einnahme-Rhythmus</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rhythmOptions.map((rhythm) => (
            <Card
              key={rhythm.value}
              className={cn(
                "cursor-pointer transition-all",
                value.doseRhythm === rhythm.value
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-muted-foreground/50"
              )}
              onClick={() => updateField("doseRhythm", rhythm.value as StructuredDosage["doseRhythm"])}
            >
              <CardContent className="p-2 sm:p-3 text-center">
                <span className="text-sm font-medium">{rhythm.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Daily Schedule (Mo-Mi-Ab-Na) - Responsive 2x2 Grid on Mobile */}
      {showSchedule && (
        <div className="space-y-2">
          <Label>Einnahmeschema (Anzahl pro Tageszeit)</Label>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SCHEDULE_LABELS.map((item) => (
                  <NumberStepper
                    key={item.key}
                    label={item.fullLabel}
                    value={value.doseSchedule[item.key]}
                    onChange={(n) => updateSchedule(item.key, n)}
                    min={0}
                    max={9}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Max per period (for acute medications) */}
      {showMaxPerPeriod && (
        <div className="space-y-2">
          <Label>Maximale Einnahme</Label>
          <Input
            placeholder="z.B. 10 Tage/Monat oder 2 pro Tag"
            value={value.maxPerPeriod}
            onChange={(e) => updateField("maxPerPeriod", e.target.value)}
          />
        </div>
      )}

      {/* Preview */}
      {(value.doseValue || value.doseRhythm) && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Vorschau:</p>
          <p className="font-medium text-sm">{buildDoseText(value) || "–"}</p>
        </div>
      )}
    </div>
  );
};

export const getDefaultStructuredDosage = (): StructuredDosage => ({
  doseValue: "",
  doseUnit: "mg",
  doseRhythm: "daily",
  doseSchedule: { morning: 0, noon: 0, evening: 0, night: 0 },
  administrationRoute: "oral",
  maxPerPeriod: "",
});
