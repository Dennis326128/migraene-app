import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { BaselineDaysRange, ImpairmentLevel } from "@/features/medication-courses";

const DAYS_RANGE_OPTIONS: { value: BaselineDaysRange; label: string }[] = [
  { value: "<5", label: "< 5 Tage" },
  { value: "5-10", label: "5–10 Tage" },
  { value: "11-15", label: "11–15 Tage" },
  { value: "16-20", label: "16–20 Tage" },
  { value: ">20", label: "> 20 Tage" },
  { value: "unknown", label: "Weiß nicht" },
];

const IMPAIRMENT_OPTIONS: { value: ImpairmentLevel; label: string }[] = [
  { value: "wenig", label: "Wenig" },
  { value: "mittel", label: "Mittel" },
  { value: "stark", label: "Stark" },
  { value: "unknown", label: "Weiß nicht" },
];

interface MedicationCourseStep3Props {
  baselineMigraineDays: BaselineDaysRange | "";
  setBaselineMigraineDays: (value: BaselineDaysRange | "") => void;
  baselineAcuteMedDays: BaselineDaysRange | "";
  setBaselineAcuteMedDays: (value: BaselineDaysRange | "") => void;
  baselineTriptanDoses: string;
  setBaselineTriptanDoses: (value: string) => void;
  baselineImpairment: ImpairmentLevel | "";
  setBaselineImpairment: (value: ImpairmentLevel | "") => void;
}

export const MedicationCourseStep3: React.FC<MedicationCourseStep3Props> = ({
  baselineMigraineDays,
  setBaselineMigraineDays,
  baselineAcuteMedDays,
  setBaselineAcuteMedDays,
  baselineTriptanDoses,
  setBaselineTriptanDoses,
  baselineImpairment,
  setBaselineImpairment,
}) => {
  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-muted/30">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Wie war die Situation <strong>vor Beginn</strong> dieser Behandlung? 
            <br />
            <span className="text-xs">(Optional, grobe Einschätzung für den Arztbericht)</span>
          </p>
        </CardContent>
      </Card>

      {/* Migraine Days */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-medium">Migränetage pro Monat</Label>
          <Select 
            value={baselineMigraineDays} 
            onValueChange={(v) => setBaselineMigraineDays(v as BaselineDaysRange)}
          >
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {DAYS_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="py-3">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Acute Med Days */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-medium">Tage mit Akutmedikament pro Monat</Label>
          <Select 
            value={baselineAcuteMedDays} 
            onValueChange={(v) => setBaselineAcuteMedDays(v as BaselineDaysRange)}
          >
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {DAYS_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="py-3">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Triptan Doses */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-medium" htmlFor="triptan-doses">
            Triptan-Dosen pro Monat (ca.)
          </Label>
          <Input
            id="triptan-doses"
            type="number"
            placeholder="z.B. 15"
            value={baselineTriptanDoses}
            onChange={(e) => setBaselineTriptanDoses(e.target.value)}
            min={0}
            max={100}
            className="h-12 text-base"
          />
        </CardContent>
      </Card>

      {/* Impairment Level */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-medium">Einschränkung im Alltag</Label>
          <Select 
            value={baselineImpairment} 
            onValueChange={(v) => setBaselineImpairment(v as ImpairmentLevel)}
          >
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {IMPAIRMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="py-3">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
};
