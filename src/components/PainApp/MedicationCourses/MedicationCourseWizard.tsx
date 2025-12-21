import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Check, Pill, Clock, Activity, Star, Loader2 } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { 
  EditDialogLayout, 
  DialogFooterButtons 
} from "@/components/ui/edit-dialog-layout";
import { 
  buildDoseText, 
  parseDoseText,
  getDefaultStructuredDosage,
  type StructuredDosage 
} from "./StructuredDosageInput";
import { MedicationCourseStep1 } from "./MedicationCourseStep1";
import { MedicationCourseStep2 } from "./MedicationCourseStep2";
import { MedicationCourseStep3 } from "./MedicationCourseStep3";
import { MedicationCourseStep4 } from "./MedicationCourseStep4";
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

export const MedicationCourseWizard: React.FC<MedicationCourseWizardProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingCourse,
}) => {
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedRef = useRef(false);

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

  // Reset hydration flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      hydratedRef.current = false;
      setIsHydrated(false);
    }
  }, [isOpen]);

  // Initialize form with existing data - ONLY ONCE per open
  useEffect(() => {
    if (!isOpen || hydratedRef.current) return;
    
    if (existingCourse) {
      // Edit mode: prefill all values from existing course
      console.log('[MedicationCourseWizard] Hydrating form with existing course:', existingCourse.medication_name);
      
      setMedicationName(existingCourse.medication_name);
      setCustomMedication("");
      setType(existingCourse.type);
      
      // Parse existing dose_text into structured format
      if (existingCourse.dose_text) {
        const parsed = parseDoseText(existingCourse.dose_text);
        const defaultDosage = getDefaultStructuredDosage();
        setStructuredDosage({
          ...defaultDosage,
          ...parsed,
          // Ensure rhythm is set based on type if not parsed
          doseRhythm: parsed.doseRhythm || (existingCourse.type === 'akut' ? 'as_needed' : 'daily'),
        });
      } else {
        // No dose_text - set sensible defaults based on type
        setStructuredDosage({
          ...getDefaultStructuredDosage(),
          doseRhythm: existingCourse.type === 'akut' ? 'as_needed' : 'daily',
        });
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
      
      hydratedRef.current = true;
      setIsHydrated(true);
    } else {
      // Create mode: reset to defaults
      resetForm();
      hydratedRef.current = true;
      setIsHydrated(true);
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
        return true;
      case 3:
        return true;
      case 4:
        return true;
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

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
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
            isEditMode={!!existingCourse}
          />
        );
      case 2:
        return (
          <MedicationCourseStep2
            isActive={isActive}
            setIsActive={setIsActive}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
          />
        );
      case 3:
        return (
          <MedicationCourseStep3
            baselineMigraineDays={baselineMigraineDays}
            setBaselineMigraineDays={setBaselineMigraineDays}
            baselineAcuteMedDays={baselineAcuteMedDays}
            setBaselineAcuteMedDays={setBaselineAcuteMedDays}
            baselineTriptanDoses={baselineTriptanDoses}
            setBaselineTriptanDoses={setBaselineTriptanDoses}
            baselineImpairment={baselineImpairment}
            setBaselineImpairment={setBaselineImpairment}
          />
        );
      case 4:
        return (
          <MedicationCourseStep4
            effectiveness={effectiveness}
            setEffectiveness={setEffectiveness}
            hadSideEffects={hadSideEffects}
            setHadSideEffects={setHadSideEffects}
            sideEffectsText={sideEffectsText}
            setSideEffectsText={setSideEffectsText}
            isActive={isActive}
            discontinuationReason={discontinuationReason}
            setDiscontinuationReason={setDiscontinuationReason}
            discontinuationDetails={discontinuationDetails}
            setDiscontinuationDetails={setDiscontinuationDetails}
            noteForPhysician={noteForPhysician}
            setNoteForPhysician={setNoteForPhysician}
          />
        );
      default:
        return null;
    }
  };

  const footerContent = (
    <div className="flex justify-between w-full">
      <Button
        variant="outline"
        onClick={currentStep === 1 ? handleClose : handleBack}
        className="min-w-[100px]"
      >
        {currentStep === 1 ? "Abbrechen" : <><ChevronLeft className="h-4 w-4 mr-1" /> Zurück</>}
      </Button>
      
      {currentStep < STEPS.length ? (
        <Button onClick={handleNext} disabled={!canProceed()} className="min-w-[100px]">
          Weiter <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <SaveButton 
          onClick={handleSubmit} 
          disabled={!canProceed()}
          loading={isSubmitting}
        />
      )}
    </div>
  );

  // Show loading state while hydrating
  const isLoading = !isHydrated || medsLoading;

  return (
    <EditDialogLayout
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      title={existingCourse ? "Behandlung bearbeiten" : "Neue Behandlung hinzufügen"}
      description="Dokumentiere deine Behandlungen für den Arztbericht"
      footer={footerContent}
      isLoading={isLoading}
    >
      {renderStepIndicator()}
      <div className="min-h-[300px]">
        {renderCurrentStep()}
      </div>
    </EditDialogLayout>
  );
};
