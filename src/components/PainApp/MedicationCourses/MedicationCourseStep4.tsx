import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { DiscontinuationReason } from "@/features/medication-courses";

const DISCONTINUATION_OPTIONS: { value: DiscontinuationReason; label: string }[] = [
  { value: "keine_wirkung", label: "Keine ausreichende Wirkung" },
  { value: "nebenwirkungen", label: "Nebenwirkungen" },
  { value: "migraene_gebessert", label: "Migräne gebessert" },
  { value: "kinderwunsch", label: "Kinderwunsch / Schwangerschaft" },
  { value: "andere", label: "Andere Gründe" },
];

interface MedicationCourseStep4Props {
  effectiveness: number;
  setEffectiveness: (value: number) => void;
  hadSideEffects: boolean;
  setHadSideEffects: (value: boolean) => void;
  sideEffectsText: string;
  setSideEffectsText: (value: string) => void;
  isActive: boolean;
  discontinuationReason: DiscontinuationReason | "";
  setDiscontinuationReason: (value: DiscontinuationReason | "") => void;
  discontinuationDetails: string;
  setDiscontinuationDetails: (value: string) => void;
  noteForPhysician: string;
  setNoteForPhysician: (value: string) => void;
}

export const MedicationCourseStep4: React.FC<MedicationCourseStep4Props> = ({
  effectiveness,
  setEffectiveness,
  hadSideEffects,
  setHadSideEffects,
  sideEffectsText,
  setSideEffectsText,
  isActive,
  discontinuationReason,
  setDiscontinuationReason,
  discontinuationDetails,
  setDiscontinuationDetails,
  noteForPhysician,
  setNoteForPhysician,
}) => {
  return (
    <div className="space-y-6">
      {/* Effectiveness Slider */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <Label className="text-base font-medium">Wie gut hat diese Behandlung geholfen?</Label>
          <div className="px-2 pt-2">
            <Slider
              value={[effectiveness]}
              onValueChange={([v]) => setEffectiveness(v)}
              min={0}
              max={10}
              step={1}
              className="touch-none"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-3">
              <span>Gar nicht</span>
              <span className="font-semibold text-primary text-lg">{effectiveness}/10</span>
              <span>Sehr gut</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side Effects */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Relevante Nebenwirkungen?</Label>
            <Switch 
              checked={hadSideEffects} 
              onCheckedChange={setHadSideEffects}
              className="scale-110"
            />
          </div>
          
          {hadSideEffects && (
            <Textarea
              placeholder="Beschreibe kurz die Nebenwirkungen..."
              value={sideEffectsText}
              onChange={(e) => setSideEffectsText(e.target.value)}
              rows={3}
              className="text-base"
            />
          )}
        </CardContent>
      </Card>

      {/* Discontinuation Reason - Only if not active */}
      {!isActive && (
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-4">
            <Label className="text-base font-medium">Warum wurde die Behandlung beendet?</Label>
            <Select 
              value={discontinuationReason} 
              onValueChange={(v) => setDiscontinuationReason(v as DiscontinuationReason)}
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {DISCONTINUATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="py-3">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {discontinuationReason && (
              <Input
                placeholder="Details (optional)..."
                value={discontinuationDetails}
                onChange={(e) => setDiscontinuationDetails(e.target.value)}
                className="h-12 text-base"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Note for Physician */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <Label className="text-base font-medium" htmlFor="note">
            Notiz für den Arzt (optional)
          </Label>
          <Textarea
            id="note"
            placeholder="Zusätzliche Informationen für Ihren Arzt..."
            value={noteForPhysician}
            onChange={(e) => setNoteForPhysician(e.target.value)}
            rows={3}
            className="text-base"
          />
        </CardContent>
      </Card>
    </div>
  );
};
