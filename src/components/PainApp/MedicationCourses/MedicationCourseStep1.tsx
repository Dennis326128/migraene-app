import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Shield, 
  Zap, 
  MoreHorizontal, 
  Mic, 
  ChevronDown, 
  Check,
  Clock,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MedicationCourseType } from "@/features/medication-courses";
import type { Med } from "@/features/meds/hooks/useMeds";
import { VoiceInputButton } from "./VoiceInputButton";
import type { StructuredDosage, DosageSchedule } from "./StructuredDosageInput";

interface MedicationCourseStep1Props {
  medications: Med[];
  medicationName: string;
  setMedicationName: (name: string) => void;
  customMedication: string;
  setCustomMedication: (name: string) => void;
  type: MedicationCourseType;
  setType: (type: MedicationCourseType) => void;
  structuredDosage: StructuredDosage;
  setStructuredDosage: React.Dispatch<React.SetStateAction<StructuredDosage>>;
  onVoiceData: (data: {
    medicationName: string;
    type: MedicationCourseType;
    dosage: Partial<StructuredDosage>;
    startDate: Date | undefined;
    isActive: boolean;
  }) => void;
}

// Treatment type options with icons and descriptions
const TREATMENT_TYPES = [
  { 
    value: "prophylaxe" as const, 
    label: "Prophylaxe", 
    subtitle: "Vorbeugende Behandlung",
    description: "Regelmäßige Einnahme zur Vorbeugung",
    icon: Shield,
    defaultRhythm: "daily" as const,
    examples: "Ajovy, Topiramat, Propranolol"
  },
  { 
    value: "akut" as const, 
    label: "Akutmedikation", 
    subtitle: "Bei Attacken",
    description: "Einnahme nur bei Kopfschmerzen",
    icon: Zap,
    defaultRhythm: "as_needed" as const,
    examples: "Triptan, Ibuprofen, Aspirin"
  },
  { 
    value: "sonstige" as const, 
    label: "Sonstige", 
    subtitle: "Andere Medikamente",
    description: "Weitere relevante Behandlungen",
    icon: MoreHorizontal,
    defaultRhythm: "daily" as const,
    examples: "Nahrungsergänzung, etc."
  },
];

// Intake rhythm presets for regular use
const REGULAR_PRESETS = [
  { value: "1x", label: "1× täglich", schedule: { morning: 1, noon: 0, evening: 0, night: 0 } },
  { value: "2x", label: "2× täglich", schedule: { morning: 1, noon: 0, evening: 1, night: 0 } },
  { value: "3x", label: "3× täglich", schedule: { morning: 1, noon: 1, evening: 1, night: 0 } },
  { value: "weekly", label: "1×/Woche", schedule: { morning: 1, noon: 0, evening: 0, night: 0 } },
  { value: "monthly", label: "1×/Monat", schedule: { morning: 1, noon: 0, evening: 0, night: 0 } },
  { value: "custom", label: "Andere", schedule: null },
];

const DOSE_UNITS = [
  { value: "mg", label: "mg" },
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "Tabletten", label: "Stück" },
  { value: "Tropfen", label: "Tropfen" },
  { value: "Spritzen", label: "Spritze(n)" },
  { value: "Hub", label: "Hub(e)" },
];

const ADMIN_ROUTES = [
  { value: "oral", label: "Oral (Tablette/Kapsel)" },
  { value: "sc", label: "Subkutan (Spritze unter die Haut)" },
  { value: "im", label: "Intramuskulär (Spritze in den Muskel)" },
  { value: "nasal", label: "Nasenspray" },
  { value: "other", label: "Andere" },
];

// Helper to build summary text
function buildSummaryText(
  medName: string,
  type: MedicationCourseType,
  dosage: StructuredDosage
): string {
  const parts: string[] = [];
  
  if (medName) parts.push(medName);
  
  if (dosage.doseValue && dosage.doseUnit) {
    parts.push(`${dosage.doseValue} ${dosage.doseUnit}`);
  }
  
  const typeLabel = TREATMENT_TYPES.find(t => t.value === type)?.label;
  if (typeLabel) parts.push(typeLabel);
  
  // Rhythm
  if (dosage.doseRhythm === "daily") {
    const { morning, noon, evening, night } = dosage.doseSchedule;
    const total = morning + noon + evening + night;
    if (total > 0) {
      parts.push(`${total}× täglich`);
    }
  } else if (dosage.doseRhythm === "weekly") {
    parts.push("1×/Woche");
  } else if (dosage.doseRhythm === "monthly") {
    parts.push("1×/Monat");
  } else if (dosage.doseRhythm === "as_needed") {
    parts.push("bei Bedarf");
  }
  
  // Admin route (if not oral)
  if (dosage.administrationRoute && dosage.administrationRoute !== "oral") {
    const routeLabel = ADMIN_ROUTES.find(r => r.value === dosage.administrationRoute)?.label;
    if (routeLabel) parts.push(routeLabel.split(" ")[0]);
  }
  
  return parts.join(" – ");
}

export const MedicationCourseStep1: React.FC<MedicationCourseStep1Props> = ({
  medications,
  medicationName,
  setMedicationName,
  customMedication,
  setCustomMedication,
  type,
  setType,
  structuredDosage,
  setStructuredDosage,
  onVoiceData,
}) => {
  const [intakeMode, setIntakeMode] = useState<"regular" | "as_needed">(
    structuredDosage.doseRhythm === "as_needed" ? "as_needed" : "regular"
  );
  const [regularPreset, setRegularPreset] = useState<string>("1x");
  const [showDetails, setShowDetails] = useState(false);
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);

  // Get final medication name
  const finalMedName = medicationName === "__custom__" ? customMedication : medicationName;

  // Update intake mode when type changes (smart defaults)
  useEffect(() => {
    if (type === "akut") {
      setIntakeMode("as_needed");
      setStructuredDosage(prev => ({ ...prev, doseRhythm: "as_needed" }));
    } else if (type === "prophylaxe") {
      setIntakeMode("regular");
      if (structuredDosage.doseRhythm === "as_needed") {
        setStructuredDosage(prev => ({ ...prev, doseRhythm: "daily" }));
      }
    }
  }, [type]);

  // Update dosage when preset changes
  const handlePresetChange = (preset: string) => {
    setRegularPreset(preset);
    const selected = REGULAR_PRESETS.find(p => p.value === preset);
    
    if (preset === "custom") {
      setShowCustomSchedule(true);
      return;
    }
    
    setShowCustomSchedule(false);
    
    if (preset === "weekly") {
      setStructuredDosage(prev => ({ ...prev, doseRhythm: "weekly" }));
    } else if (preset === "monthly") {
      setStructuredDosage(prev => ({ ...prev, doseRhythm: "monthly" }));
    } else if (selected?.schedule) {
      setStructuredDosage(prev => ({ 
        ...prev, 
        doseRhythm: "daily",
        doseSchedule: selected.schedule 
      }));
    }
  };

  // Toggle intake mode
  const handleIntakeModeChange = (mode: "regular" | "as_needed") => {
    setIntakeMode(mode);
    if (mode === "as_needed") {
      setStructuredDosage(prev => ({ ...prev, doseRhythm: "as_needed" }));
    } else {
      handlePresetChange(regularPreset);
    }
  };

  const updateDosageField = <K extends keyof StructuredDosage>(
    field: K,
    value: StructuredDosage[K]
  ) => {
    setStructuredDosage(prev => ({ ...prev, [field]: value }));
  };

  const updateSchedule = (key: keyof DosageSchedule, value: number) => {
    setStructuredDosage(prev => ({
      ...prev,
      doseSchedule: { ...prev.doseSchedule, [key]: value }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Voice Input - Prominent floating button */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="font-medium text-foreground/90">Per Sprache ausfüllen</p>
              <p className="text-sm text-muted-foreground">
                Ideal bei Kopfschmerzen – einfach diktieren
              </p>
            </div>
            <VoiceInputButton
              userMeds={medications}
              onDataRecognized={onVoiceData}
              className="h-12 w-12 rounded-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Medication & Treatment Type */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-5">
          {/* Medication Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Medikament *</Label>
            <Select value={medicationName} onValueChange={setMedicationName}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Medikament auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {medications.map((med) => (
                  <SelectItem key={med.id} value={med.name} className="py-3">
                    {med.name}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" className="py-3">
                  + Neues Medikament eingeben
                </SelectItem>
              </SelectContent>
            </Select>
            
            {medicationName === "__custom__" && (
              <Input
                placeholder="Medikamentenname eingeben..."
                value={customMedication}
                onChange={(e) => setCustomMedication(e.target.value)}
                className="h-12 text-base"
                autoFocus
              />
            )}
          </div>

          {/* Treatment Type Cards */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Art der Behandlung *</Label>
            <div className="grid grid-cols-1 gap-3">
              {TREATMENT_TYPES.map((option) => {
                const Icon = option.icon;
                const isSelected = type === option.value;
                
                return (
                  <Card 
                    key={option.value}
                    className={cn(
                      "cursor-pointer transition-all active:scale-[0.98]",
                      isSelected 
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5" 
                        : "hover:border-muted-foreground/30 hover:bg-accent/30"
                    )}
                    onClick={() => setType(option.value)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                          isSelected 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{option.label}</p>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{option.description}</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            z.B. {option.examples}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Intake Rhythm - Only shown after medication + type selected */}
      {finalMedName && (
        <Card className="border-border/50">
          <CardContent className="p-5 space-y-5">
            {/* Intake Mode Toggle */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Einnahme-Rhythmus</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={intakeMode === "regular" ? "default" : "outline"}
                  className={cn(
                    "h-12 text-base font-medium",
                    intakeMode === "regular" && "ring-2 ring-primary/30"
                  )}
                  onClick={() => handleIntakeModeChange("regular")}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Regelmäßig
                </Button>
                <Button
                  type="button"
                  variant={intakeMode === "as_needed" ? "default" : "outline"}
                  className={cn(
                    "h-12 text-base font-medium",
                    intakeMode === "as_needed" && "ring-2 ring-primary/30"
                  )}
                  onClick={() => handleIntakeModeChange("as_needed")}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Bei Bedarf
                </Button>
              </div>
            </div>

            {/* Regular Presets */}
            {intakeMode === "regular" && (
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Wie oft?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {REGULAR_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={regularPreset === preset.value ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-11",
                        regularPreset === preset.value && "ring-1 ring-primary/30"
                      )}
                      onClick={() => handlePresetChange(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {/* Custom Schedule */}
                {showCustomSchedule && (
                  <Card className="bg-muted/30">
                    <CardContent className="p-4">
                      <Label className="text-sm mb-3 block">Einnahmen pro Tageszeit</Label>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { key: "morning" as const, label: "Morgens" },
                          { key: "noon" as const, label: "Mittags" },
                          { key: "evening" as const, label: "Abends" },
                          { key: "night" as const, label: "Nachts" },
                        ].map((time) => (
                          <div key={time.key} className="text-center">
                            <p className="text-xs text-muted-foreground mb-2">{time.label}</p>
                            <Input
                              type="number"
                              min={0}
                              max={9}
                              value={structuredDosage.doseSchedule[time.key]}
                              onChange={(e) => updateSchedule(time.key, parseInt(e.target.value) || 0)}
                              className="h-11 text-center text-lg font-medium"
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* As Needed Fields */}
            {intakeMode === "as_needed" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Empfohlene Grenzen (optional, aber hilfreich für die Dokumentation)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Max. pro Tag</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="z.B. 2"
                        value={structuredDosage.maxPerPeriod.split("/")[0]?.replace(/\D/g, "") || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const monthly = structuredDosage.maxPerPeriod.match(/(\d+)\s*Tage/)?.[1] || "";
                          updateDosageField("maxPerPeriod", 
                            [val ? `${val}/Tag` : "", monthly ? `${monthly} Tage/Monat` : ""]
                              .filter(Boolean).join(", ")
                          );
                        }}
                        className="h-11"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Einheiten</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Max. Tage/Monat</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={31}
                        placeholder="z.B. 10"
                        className="h-11"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Tage</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dose Input - Combined field */}
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Dosis (optional)</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="z.B. 225"
                    value={structuredDosage.doseValue}
                    onChange={(e) => updateDosageField("doseValue", e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
                <Select 
                  value={structuredDosage.doseUnit} 
                  onValueChange={(v) => updateDosageField("doseUnit", v)}
                >
                  <SelectTrigger className="w-28 h-12">
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
          </CardContent>
        </Card>
      )}

      {/* Section 3: Optional Details - Collapsible */}
      {finalMedName && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between h-12 text-muted-foreground hover:text-foreground"
            >
              <span>Weitere Details anzeigen</span>
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                showDetails && "rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="border-border/50 mt-2">
              <CardContent className="p-5 space-y-4">
                {/* Administration Route */}
                <div className="space-y-2">
                  <Label>Verabreichungsweg</Label>
                  <Select
                    value={structuredDosage.administrationRoute}
                    onValueChange={(v) => updateDosageField("administrationRoute", v as StructuredDosage["administrationRoute"])}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ADMIN_ROUTES.map((route) => (
                        <SelectItem key={route.value} value={route.value} className="py-3">
                          {route.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Live Summary */}
      {finalMedName && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Zusammenfassung</p>
            <p className="font-medium text-foreground">
              {buildSummaryText(finalMedName, type, structuredDosage) || "–"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
