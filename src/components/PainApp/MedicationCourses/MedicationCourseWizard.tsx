import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarIcon, ChevronLeft, ChevronRight, Check, Pill, Clock, Activity, Star } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { 
  buildDoseText, 
  parseDoseText,
  getDefaultStructuredDosage,
  type StructuredDosage 
} from "./StructuredDosageInput";
import { MedicationCourseStep1 } from "./MedicationCourseStep1";
import type { 
  MedicationCourse, 
  MedicationCourseType, 
  BaselineDaysRange, 
  ImpairmentLevel,
  DiscontinuationReason,
  CreateMedicationCourseInput 
} from "@/features/medication-courses";

interface MedicationCourseWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMedicationCourseInput) => Promise<void>;
  existingCourse?: MedicationCourse | null;
}

const STEPS = [
  { id: 1, title: "Grunddaten", icon: Pill },
  { id: 2, title: "Zeitraum", icon: Clock },
  { id: 3, title: "Ausgangslage", icon: Activity },
  { id: 4, title: "Bewertung", icon: Star },
];

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

const DISCONTINUATION_OPTIONS: { value: DiscontinuationReason; label: string }[] = [
  { value: "keine_wirkung", label: "Keine ausreichende Wirkung" },
  { value: "nebenwirkungen", label: "Nebenwirkungen" },
  { value: "migraene_gebessert", label: "Migräne gebessert" },
  { value: "kinderwunsch", label: "Kinderwunsch / Schwangerschaft" },
  { value: "andere", label: "Andere Gründe" },
];

export const MedicationCourseWizard: React.FC<MedicationCourseWizardProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingCourse,
}) => {
  const { data: medications = [] } = useMeds();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [medicationName, setMedicationName] = useState("");
  const [customMedication, setCustomMedication] = useState("");
  const [type, setType] = useState<MedicationCourseType>("prophylaxe");
  const [structuredDosage, setStructuredDosage] = useState<StructuredDosage>(getDefaultStructuredDosage());
  
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  const [baselineMigraineDays, setBaselineMigraineDays] = useState<BaselineDaysRange | "">("");
  const [baselineAcuteMedDays, setBaselineAcuteMedDays] = useState<BaselineDaysRange | "">("");
  const [baselineTriptanDoses, setBaselineTriptanDoses] = useState<string>("");
  const [baselineImpairment, setBaselineImpairment] = useState<ImpairmentLevel | "">("");
  
  const [effectiveness, setEffectiveness] = useState<number>(5);
  const [hadSideEffects, setHadSideEffects] = useState(false);
  const [sideEffectsText, setSideEffectsText] = useState("");
  const [discontinuationReason, setDiscontinuationReason] = useState<DiscontinuationReason | "">("");
  const [discontinuationDetails, setDiscontinuationDetails] = useState("");
  const [noteForPhysician, setNoteForPhysician] = useState("");

  // Initialize form with existing data
  useEffect(() => {
    if (existingCourse) {
      setMedicationName(existingCourse.medication_name);
      setType(existingCourse.type);
      // Parse existing dose_text into structured format
      if (existingCourse.dose_text) {
        const parsed = parseDoseText(existingCourse.dose_text);
        setStructuredDosage({
          ...getDefaultStructuredDosage(),
          ...parsed,
        });
      } else {
        setStructuredDosage(getDefaultStructuredDosage());
      }
      setIsActive(existingCourse.is_active);
      setStartDate(existingCourse.start_date ? new Date(existingCourse.start_date) : undefined);
      setEndDate(existingCourse.end_date ? new Date(existingCourse.end_date) : undefined);
      setBaselineMigraineDays(existingCourse.baseline_migraine_days || "");
      setBaselineAcuteMedDays(existingCourse.baseline_acute_med_days || "");
      setBaselineTriptanDoses(existingCourse.baseline_triptan_doses_per_month?.toString() || "");
      setBaselineImpairment(existingCourse.baseline_impairment_level || "");
      setEffectiveness(existingCourse.subjective_effectiveness ?? 5);
      setHadSideEffects(existingCourse.had_side_effects || false);
      setSideEffectsText(existingCourse.side_effects_text || "");
      setDiscontinuationReason(existingCourse.discontinuation_reason || "");
      setDiscontinuationDetails(existingCourse.discontinuation_details || "");
      setNoteForPhysician(existingCourse.note_for_physician || "");
    } else {
      resetForm();
    }
  }, [existingCourse, isOpen]);

  const resetForm = () => {
    setCurrentStep(1);
    setMedicationName("");
    setCustomMedication("");
    setType("prophylaxe");
    setStructuredDosage(getDefaultStructuredDosage());
    setIsActive(true);
    setStartDate(undefined);
    setEndDate(undefined);
    setBaselineMigraineDays("");
    setBaselineAcuteMedDays("");
    setBaselineTriptanDoses("");
    setBaselineImpairment("");
    setEffectiveness(5);
    setHadSideEffects(false);
    setSideEffectsText("");
    setDiscontinuationReason("");
    setDiscontinuationDetails("");
    setNoteForPhysician("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getFinalMedicationName = () => {
    return medicationName === "__custom__" ? customMedication : medicationName;
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return getFinalMedicationName().trim().length > 0;
      case 2:
        return true; // Start date is now optional
      case 3:
        return true; // All optional
      case 4:
        return true; // All optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const doseText = buildDoseText(structuredDosage);
      const data: CreateMedicationCourseInput = {
        medication_name: getFinalMedicationName().trim(),
        type,
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
        end_date: !isActive && endDate ? format(endDate, "yyyy-MM-dd") : null,
        is_active: isActive,
        dose_text: doseText || null,
        baseline_migraine_days: baselineMigraineDays || null,
        baseline_acute_med_days: baselineAcuteMedDays || null,
        baseline_triptan_doses_per_month: baselineTriptanDoses ? parseInt(baselineTriptanDoses) : null,
        baseline_impairment_level: baselineImpairment || null,
        subjective_effectiveness: effectiveness,
        had_side_effects: hadSideEffects,
        side_effects_text: hadSideEffects ? sideEffectsText.trim() || null : null,
        discontinuation_reason: !isActive ? discontinuationReason || null : null,
        discontinuation_details: !isActive ? discontinuationDetails.trim() || null : null,
        note_for_physician: noteForPhysician.trim() || null,
      };
      
      await onSubmit(data);
      handleClose();
    } catch (error) {
      console.error("Error submitting medication course:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Voice input handler
  const handleVoiceData = (data: {
    medicationName: string;
    type: MedicationCourseType;
    dosage: Partial<StructuredDosage>;
    startDate: Date | undefined;
    isActive: boolean;
  }) => {
    if (data.medicationName) {
      // Check if it's a known medication from user's list
      const existingMed = medications.find(
        (m) => m.name.toLowerCase() === data.medicationName.toLowerCase()
      );
      if (existingMed) {
        setMedicationName(existingMed.name);
        setCustomMedication("");
      } else {
        setMedicationName("__custom__");
        setCustomMedication(data.medicationName);
      }
    }
    
    setType(data.type);
    setStructuredDosage((prev) => ({
      ...prev,
      ...data.dosage,
    }));
    
    if (data.startDate) {
      setStartDate(startOfMonth(data.startDate));
    }
    
    setIsActive(data.isActive);
  };

  const renderStepIndicator = () => (
    <div className="mb-6">
      <Progress value={(currentStep / STEPS.length) * 100} className="h-2 mb-3" />
      <div className="flex justify-between">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          
          return (
            <div
              key={step.id}
              className={cn(
                "flex flex-col items-center gap-1",
                isCurrent ? "text-primary" : isCompleted ? "text-green-600" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center border-2",
                isCurrent ? "border-primary bg-primary/10" : 
                isCompleted ? "border-green-600 bg-green-600 text-white" : 
                "border-muted"
              )}>
                {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className="text-xs hidden sm:block">{step.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <MedicationCourseStep1
      medications={medications}
      medicationName={medicationName}
      setMedicationName={setMedicationName}
      customMedication={customMedication}
      setCustomMedication={setCustomMedication}
      type={type}
      setType={setType}
      structuredDosage={structuredDosage}
      setStructuredDosage={setStructuredDosage}
      onVoiceData={handleVoiceData}
    />
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>Nimmst du dieses Medikament aktuell?</Label>
        <div className="flex items-center gap-3">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span className="text-sm">{isActive ? "Ja, aktuell in Einnahme" : "Nein, nicht mehr"}</span>
        </div>
      </div>

      <div className="space-y-3">
        <Label>
          {isActive ? "Seit wann ungefähr?" : "Von wann ungefähr?"} 
          <span className="text-muted-foreground font-normal"> (optional)</span>
        </Label>
        <p className="text-xs text-muted-foreground mb-2">
          Kannst du später nachtragen, wenn du recherchiert hast.
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "MMMM yyyy", { locale: de }) : "Monat/Jahr auswählen"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => date && setStartDate(startOfMonth(date))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
              disabled={(date) => date > new Date()}
              captionLayout="dropdown-buttons"
              fromYear={2010}
              toYear={new Date().getFullYear()}
            />
          </PopoverContent>
        </Popover>
      </div>

      {!isActive && (
        <div className="space-y-3">
          <Label>Bis wann ungefähr?</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMMM yyyy", { locale: de }) : "Monat/Jahr auswählen"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(startOfMonth(date))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                disabled={(date) => date > new Date() || (startDate && date < startDate)}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Wie war die Situation <strong>vor Beginn</strong> dieser Behandlung? (optional, grobe Einschätzung)
      </p>

      <div className="space-y-3">
        <Label>Migränetage pro Monat</Label>
        <Select value={baselineMigraineDays} onValueChange={(v) => setBaselineMigraineDays(v as BaselineDaysRange)}>
          <SelectTrigger>
            <SelectValue placeholder="Auswählen..." />
          </SelectTrigger>
          <SelectContent>
            {DAYS_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Tage mit Akutmedikament pro Monat</Label>
        <Select value={baselineAcuteMedDays} onValueChange={(v) => setBaselineAcuteMedDays(v as BaselineDaysRange)}>
          <SelectTrigger>
            <SelectValue placeholder="Auswählen..." />
          </SelectTrigger>
          <SelectContent>
            {DAYS_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="triptan-doses">Triptan-Dosen pro Monat (ca.)</Label>
        <Input
          id="triptan-doses"
          type="number"
          placeholder="z.B. 15"
          value={baselineTriptanDoses}
          onChange={(e) => setBaselineTriptanDoses(e.target.value)}
          min={0}
          max={100}
        />
      </div>

      <div className="space-y-3">
        <Label>Einschränkung im Alltag</Label>
        <Select value={baselineImpairment} onValueChange={(v) => setBaselineImpairment(v as ImpairmentLevel)}>
          <SelectTrigger>
            <SelectValue placeholder="Auswählen..." />
          </SelectTrigger>
          <SelectContent>
            {IMPAIRMENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>Wie gut hat diese Behandlung geholfen?</Label>
        <div className="px-2">
          <Slider
            value={[effectiveness]}
            onValueChange={([v]) => setEffectiveness(v)}
            min={0}
            max={10}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Gar nicht</span>
            <span className="font-medium text-primary">{effectiveness}/10</span>
            <span>Sehr gut</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch checked={hadSideEffects} onCheckedChange={setHadSideEffects} />
          <Label>Relevante Nebenwirkungen?</Label>
        </div>
        
        {hadSideEffects && (
          <Textarea
            placeholder="Beschreibe kurz die Nebenwirkungen..."
            value={sideEffectsText}
            onChange={(e) => setSideEffectsText(e.target.value)}
            rows={2}
          />
        )}
      </div>

      {!isActive && (
        <div className="space-y-3">
          <Label>Warum wurde die Behandlung beendet?</Label>
          <Select value={discontinuationReason} onValueChange={(v) => setDiscontinuationReason(v as DiscontinuationReason)}>
            <SelectTrigger>
              <SelectValue placeholder="Auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {DISCONTINUATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {discontinuationReason && (
            <Input
              placeholder="Details (optional)..."
              value={discontinuationDetails}
              onChange={(e) => setDiscontinuationDetails(e.target.value)}
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="note">Notiz für den Arzt (optional)</Label>
        <Textarea
          id="note"
          placeholder="Zusätzliche Informationen für Ihren Arzt..."
          value={noteForPhysician}
          onChange={(e) => setNoteForPhysician(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar">
        <DialogHeader>
          <DialogTitle>
            {existingCourse ? "Medikamentenverlauf bearbeiten" : "Medikamentenverlauf hinzufügen"}
          </DialogTitle>
          <DialogDescription>
            Dokumentiere deine Behandlungen für den Arztbericht
          </DialogDescription>
        </DialogHeader>

        {renderStepIndicator()}

        <div className="min-h-[300px]">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={currentStep === 1 ? handleClose : handleBack}
          >
            {currentStep === 1 ? "Abbrechen" : <><ChevronLeft className="h-4 w-4 mr-1" /> Zurück</>}
          </Button>
          
          {currentStep < STEPS.length ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Weiter <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting || !canProceed()}>
              {isSubmitting ? "Speichern..." : "Speichern"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
