import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUpdateMed, type Med, type UpdateMedInput } from "@/features/meds/hooks/useMeds";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertTriangle, Pill, Clock, FileText, Calendar, ChevronDown, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserDefaults } from "@/features/settings/hooks/useUserSettings";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { WeekdayPicker, type Weekday, formatWeekdays } from "@/components/ui/weekday-picker";
import { format } from "date-fns";

interface MedicationEditModalProps {
  medication: Med | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DARREICHUNGSFORMEN = [
  "Tablette", "Kapsel", "Filmtablette", "Schmelztablette", "Brausetablette",
  "Tropfen", "Lösung", "Sirup", "Nasenspray", "Spray",
  "Injektionslösung", "Fertigspritze", "Pen",
  "Zäpfchen", "Creme", "Salbe", "Pflaster", "Infusion", "Sonstiges"
];

// Reduced unit list for simplicity
const STRENGTH_UNITS = [
  { value: "mg", label: "mg" },
  { value: "µg", label: "µg" },
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "IE", label: "IE" },
];

const INTAKE_TYPES = [
  { value: "as_needed", label: "Bei Bedarf" },
  { value: "regular", label: "Regelmäßig" },
];

const TYPICAL_INDICATIONS = [
  "Akute Migräneattacke",
  "Migräneprophylaxe",
  "Übelkeit / Erbrechen",
  "Schlafstörung",
  "Angst / Unruhe",
  "Schmerzen allgemein",
];

const INTOLERANCE_REASONS = [
  { value: "allergie", label: "Allergie" },
  { value: "nebenwirkungen", label: "Schwere Nebenwirkungen" },
  { value: "wirkungslos", label: "Wirkt nicht / unzureichende Wirkung" },
  { value: "sonstiges", label: "Sonstiges" },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Extract strength and unit from medication name
// ═══════════════════════════════════════════════════════════════════════════
function extractStrengthFromName(name: string): { strength: string; unit: string; wirkstoff: string } {
  // Match patterns like "Sumatriptan 100 mg", "Zopiclon 7,5mg", "Ibuprofen 400"
  const match = name.match(/^(.+?)\s*(\d+(?:[,\.]\d+)?)\s*(mg|µg|g|ml|IE)?$/i);
  
  if (match) {
    const wirkstoff = match[1].trim();
    const strength = match[2].replace(',', '.');
    const unit = match[3]?.toLowerCase() || 'mg';
    return { strength, unit, wirkstoff };
  }
  
  // Try to find any number in the name for strength
  const numberMatch = name.match(/(\d+(?:[,\.]\d+)?)/);
  if (numberMatch) {
    const strength = numberMatch[1].replace(',', '.');
    // Extract text before the number as potential wirkstoff
    const beforeNumber = name.slice(0, name.indexOf(numberMatch[0])).trim();
    return { strength, unit: 'mg', wirkstoff: beforeNumber || '' };
  }
  
  return { strength: '', unit: 'mg', wirkstoff: '' };
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLAPSIBLE SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection = ({ title, icon, hint, badge, defaultOpen = false, children }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg bg-card/30 border border-border/30">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition-colors rounded-lg">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">{icon}</div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{title}</span>
                {badge}
              </div>
              {hint && !isOpen && (
                <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
              )}
            </div>
          </div>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2 space-y-4">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const MedicationEditModal = ({ medication, open, onOpenChange }: MedicationEditModalProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const updateMed = useUpdateMed();
  const [showIntakeChangeConfirm, setShowIntakeChangeConfirm] = useState(false);
  const [pendingIntakeType, setPendingIntakeType] = useState<string | null>(null);
  const [customReasons, setCustomReasons] = useState<string[]>([]);
  const [hasStartDate, setHasStartDate] = useState(false);
  const [scheduleType, setScheduleType] = useState<"daily" | "weekdays">("daily");

  const [formData, setFormData] = useState<UpdateMedInput>({
    name: "",
    wirkstoff: "",
    staerke: "",
    darreichungsform: "Tablette",
    einheit: "Stück",
    dosis_morgens: "",
    dosis_mittags: "",
    dosis_abends: "",
    dosis_nacht: "",
    dosis_bedarf: "",
    anwendungsgebiet: "",
    hinweise: "",
    art: "bedarf",
    intolerance_flag: false,
    intolerance_notes: "",
    intolerance_reason_type: "",
    intake_type: "as_needed",
    strength_value: "",
    strength_unit: "mg",
    typical_indication: "",
    as_needed_standard_dose: "",
    as_needed_max_per_24h: undefined,
    as_needed_max_days_per_month: undefined,
    as_needed_min_interval_hours: undefined,
    as_needed_notes: "",
    regular_weekdays: [],
    regular_notes: "",
    medication_status: "active",
    start_date: "",
    end_date: "",
    is_active: true,
  });

  // Load custom reasons from user profile
  useEffect(() => {
    const loadCustomReasons = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('user_profiles')
        .select('custom_medication_reasons')
        .eq('user_id', user.id)
        .single();
      
      if (data?.custom_medication_reasons) {
        setCustomReasons(data.custom_medication_reasons as string[]);
      }
    };
    
    if (open) {
      loadCustomReasons();
    }
  }, [open]);

  // Reset form when medication changes
  useEffect(() => {
    if (medication) {
      const inferredIntakeType = medication.intake_type || 
        (medication.art === "prophylaxe" || medication.art === "regelmaessig" ? "regular" : "as_needed");
      
      // Determine if start date should be shown (has existing start_date)
      const hasExistingStartDate = !!medication.start_date;
      setHasStartDate(hasExistingStartDate);
      
      // Determine schedule type from weekdays
      const hasWeekdays = medication.regular_weekdays && medication.regular_weekdays.length > 0;
      setScheduleType(hasWeekdays ? "weekdays" : "daily");
      
      setFormData({
        name: medication.name || "",
        wirkstoff: medication.wirkstoff || "",
        staerke: medication.staerke || "",
        darreichungsform: medication.darreichungsform || "Tablette",
        einheit: medication.einheit || "Stück",
        dosis_morgens: medication.dosis_morgens || "",
        dosis_mittags: medication.dosis_mittags || "",
        dosis_abends: medication.dosis_abends || "",
        dosis_nacht: medication.dosis_nacht || "",
        dosis_bedarf: medication.dosis_bedarf || "",
        anwendungsgebiet: medication.anwendungsgebiet || "",
        hinweise: medication.hinweise || "",
        art: medication.art || "bedarf",
        intolerance_flag: medication.intolerance_flag || false,
        intolerance_notes: medication.intolerance_notes || "",
        intolerance_reason_type: medication.intolerance_reason_type || "",
        intake_type: inferredIntakeType,
        strength_value: medication.strength_value || "",
        strength_unit: medication.strength_unit || "mg",
        typical_indication: medication.typical_indication || "",
        as_needed_standard_dose: medication.as_needed_standard_dose || "",
        as_needed_max_per_24h: medication.as_needed_max_per_24h || undefined,
        as_needed_max_days_per_month: medication.as_needed_max_days_per_month || undefined,
        as_needed_min_interval_hours: medication.as_needed_min_interval_hours || undefined,
        as_needed_notes: medication.as_needed_notes || "",
        regular_weekdays: medication.regular_weekdays || [],
        regular_notes: medication.regular_notes || "",
        medication_status: medication.medication_status || "active",
        start_date: medication.start_date || "",
        end_date: medication.end_date || "",
        is_active: medication.is_active !== false,
      });
    } else {
      // Reset for new medication
      setHasStartDate(false);
      setScheduleType("daily");
    }
  }, [medication]);

  // Auto-extract strength/unit/wirkstoff from name when name changes
  const handleNameChange = (newName: string) => {
    setFormData(prev => {
      const updated = { ...prev, name: newName };
      
      // Only auto-fill if the fields are currently empty
      if (!prev.strength_value && !prev.wirkstoff) {
        const extracted = extractStrengthFromName(newName);
        if (extracted.strength) {
          updated.strength_value = extracted.strength;
        }
        if (extracted.unit) {
          updated.strength_unit = extracted.unit;
        }
        if (extracted.wirkstoff && !prev.wirkstoff) {
          updated.wirkstoff = extracted.wirkstoff;
        }
      }
      
      return updated;
    });
  };

  const handleAutoFill = () => {
    if (!formData.name) return;
    
    const metadata = lookupMedicationMetadata(formData.name);
    if (metadata) {
      setFormData(prev => ({
        ...prev,
        wirkstoff: metadata.wirkstoff || prev.wirkstoff,
        staerke: metadata.staerke || prev.staerke,
        darreichungsform: metadata.darreichungsform || prev.darreichungsform,
        art: metadata.art || prev.art,
        anwendungsgebiet: metadata.anwendungsgebiet || prev.anwendungsgebiet,
        hinweise: metadata.hinweise || prev.hinweise,
      }));
      toast({
        title: "Auto-Fill angewendet",
        description: "Vorschläge wurden eingetragen. Du kannst sie anpassen.",
      });
    } else {
      toast({
        title: "Keine Vorschläge gefunden",
        description: "Für dieses Medikament sind keine Auto-Fill-Daten verfügbar.",
      });
    }
  };

  const handleIntakeTypeChange = (newType: string) => {
    if (formData.intake_type === "regular" && newType === "as_needed") {
      const hasDoses = formData.dosis_morgens || formData.dosis_mittags || 
                       formData.dosis_abends || formData.dosis_nacht;
      if (hasDoses) {
        setPendingIntakeType(newType);
        setShowIntakeChangeConfirm(true);
        return;
      }
    }
    if (formData.intake_type === "as_needed" && newType === "regular") {
      const hasAsNeededData = formData.as_needed_standard_dose || formData.as_needed_max_per_24h;
      if (hasAsNeededData) {
        setPendingIntakeType(newType);
        setShowIntakeChangeConfirm(true);
        return;
      }
    }
    applyIntakeTypeChange(newType);
  };

  const applyIntakeTypeChange = (newType: string) => {
    if (newType === "as_needed") {
      setFormData(prev => ({
        ...prev,
        intake_type: newType,
        art: "bedarf",
        dosis_morgens: "",
        dosis_mittags: "",
        dosis_abends: "",
        dosis_nacht: "",
        regular_weekdays: [],
        regular_notes: "",
      }));
      setScheduleType("daily");
    } else {
      setFormData(prev => ({
        ...prev,
        intake_type: newType,
        art: "regelmaessig",
        as_needed_standard_dose: "",
        as_needed_max_per_24h: undefined,
        as_needed_max_days_per_month: undefined,
        as_needed_min_interval_hours: undefined,
        as_needed_notes: "",
        dosis_bedarf: "",
      }));
    }
    setShowIntakeChangeConfirm(false);
    setPendingIntakeType(null);
  };

  // Handler for start date toggle
  const handleStartDateToggle = (enabled: boolean) => {
    setHasStartDate(enabled);
    if (enabled) {
      // Set to today when enabling
      const today = format(new Date(), 'yyyy-MM-dd');
      updateField("start_date", today);
    } else {
      // Clear when disabling
      updateField("start_date", "");
    }
  };

  // Handler for schedule type change
  const handleScheduleTypeChange = (type: "daily" | "weekdays") => {
    setScheduleType(type);
    if (type === "daily") {
      updateField("regular_weekdays", []);
    }
  };

  // Handler for weekdays change
  const handleWeekdaysChange = (days: Weekday[]) => {
    updateField("regular_weekdays", days);
  };

  const handleActiveToggle = (isActive: boolean) => {
    setFormData(prev => {
      const updated = { ...prev, is_active: isActive };
      if (!isActive && !prev.end_date) {
        // Set end date to today when deactivating
        updated.end_date = new Date().toISOString().split('T')[0];
      }
      if (isActive) {
        // Clear end date when reactivating
        updated.end_date = "";
      }
      return updated;
    });
  };

  const handleIntoleranceToggle = (isIntolerant: boolean) => {
    setFormData(prev => {
      const updated = { ...prev, intolerance_flag: isIntolerant };
      if (isIntolerant) {
        // Auto-deactivate and set end date when marking as intolerant
        updated.is_active = false;
        if (!prev.end_date) {
          updated.end_date = new Date().toISOString().split('T')[0];
        }
      }
      return updated;
    });
  };

  const saveCustomReason = async (reason: string) => {
    if (!reason || reason.length < 3) return;
    if (customReasons.includes(reason)) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const newReasons = [...customReasons, reason];
    setCustomReasons(newReasons);
    
    await supabase
      .from('user_profiles')
      .update({ custom_medication_reasons: newReasons } as any)
      .eq('user_id', user.id);
  };

  const removeCustomReason = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const newReasons = customReasons.filter(r => r !== reason);
    setCustomReasons(newReasons);
    
    await supabase
      .from('user_profiles')
      .update({ custom_medication_reasons: newReasons } as any)
      .eq('user_id', user.id);
  };

  const handleSave = async () => {
    if (!medication) return;

    const combinedStaerke = formData.strength_value && formData.strength_unit
      ? `${formData.strength_value} ${formData.strength_unit}`
      : formData.staerke;

    const finalData: UpdateMedInput = { 
      ...formData,
      staerke: combinedStaerke,
      // Only save start_date if toggle is ON
      start_date: hasStartDate ? formData.start_date : null,
      // For regular medications with weekdays schedule, ensure weekdays are saved
      regular_weekdays: isRegular && scheduleType === "weekdays" ? formData.regular_weekdays : [],
    };
    
    if (formData.intolerance_flag) {
      finalData.is_active = false;
      finalData.discontinued_at = new Date().toISOString();
      finalData.medication_status = "intolerant";
    } else if (!formData.is_active) {
      finalData.discontinued_at = formData.end_date ? new Date(formData.end_date).toISOString() : new Date().toISOString();
      finalData.medication_status = "stopped";
    } else {
      finalData.medication_status = "active";
      finalData.discontinued_at = null;
    }

    // Save custom reason if it's new
    const customReason = formData.anwendungsgebiet?.trim();
    if (customReason && customReason.length >= 3) {
      const isBuiltIn = TYPICAL_INDICATIONS.includes(customReason);
      if (!isBuiltIn && !customReasons.includes(customReason)) {
        await saveCustomReason(customReason);
      }
    }

    try {
      await updateMed.mutateAsync({
        id: medication.id,
        input: finalData,
      });
      toast({
        title: "Gespeichert",
        description: "Medikamenten-Stammdaten wurden aktualisiert.",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Fehler beim Speichern",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateField = (field: keyof UpdateMedInput, value: string | boolean | number | string[] | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTypicalIndicationSelect = (indication: string) => {
    updateField("typical_indication", indication);
    updateField("anwendungsgebiet", indication);
  };

  const handleCustomReasonSelect = (reason: string) => {
    updateField("anwendungsgebiet", reason);
  };

  const isRegular = formData.intake_type === "regular";
  const isActive = formData.is_active !== false;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(
          "max-w-xl max-h-[90vh] overflow-y-auto modern-scrollbar",
          "bg-background border-border/50",
          isMobile && "max-w-[95vw] p-4"
        )}>
          <DialogHeader>
            <DialogTitle className={cn("text-lg flex items-center gap-2", isMobile && "text-base")}>
              <Pill className="h-5 w-5 text-primary" />
              Medikament bearbeiten
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* KURZBEREICH - Always Visible */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">
              {/* Name + Stärke + Unit in one row */}
              <div className="space-y-2">
                <Label htmlFor="name">Handelsname</Label>
                <div className="flex gap-2">
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="z.B. Sumatriptan 100 mg"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAutoFill}
                    title="Auto-Fill Vorschläge laden"
                    className="shrink-0"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tipp: Stärke im Namen (z.B. „Ibuprofen 400 mg") wird automatisch erkannt
                </p>
              </div>

              {/* Strength + Unit row (compact) */}
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="strength_value" className="text-sm">Stärke</Label>
                  <Input
                    id="strength_value"
                    value={formData.strength_value || ""}
                    onChange={(e) => updateField("strength_value", e.target.value)}
                    placeholder="z.B. 100"
                    inputMode="decimal"
                    className="h-9"
                  />
                </div>
                <div className="w-20 space-y-2">
                  <Label className="text-sm">Einheit</Label>
                  <Select
                    value={formData.strength_unit || "mg"}
                    onValueChange={(v) => updateField("strength_unit", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRENGTH_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Intake Type */}
              <div className="space-y-2">
                <Label>Art der Einnahme</Label>
                <Select
                  value={formData.intake_type || "as_needed"}
                  onValueChange={handleIntakeTypeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {INTAKE_TYPES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date Toggle */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Startdatum hinzufügen</Label>
                    <p className="text-xs text-muted-foreground">
                      Nur falls du dokumentieren möchtest, seit wann du es nimmst
                    </p>
                  </div>
                  <Switch
                    checked={hasStartDate}
                    onCheckedChange={handleStartDateToggle}
                  />
                </div>
                
                {hasStartDate && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <Label htmlFor="start_date" className="text-sm">Startdatum</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date || ""}
                      onChange={(e) => updateField("start_date", e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
              </div>

              {/* Active Toggle + End Date */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Medikament ist aktiv</Label>
                    <p className="text-xs text-muted-foreground">
                      Aktive Medikamente erscheinen im Medikationsplan
                    </p>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={handleActiveToggle}
                  />
                </div>
                
                {!isActive && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <Label htmlFor="end_date" className="text-sm">Ende der Einnahme</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date || ""}
                      onChange={(e) => updateField("end_date", e.target.value)}
                      className="h-9"
                    />
                    {!formData.end_date && (
                      <p className="text-xs text-amber-500">
                        Bitte ein Enddatum angeben für den Therapieverlauf
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Dosage Fields based on intake type */}
              {!isRegular ? (
                // Bei Bedarf: show standard dose + max per 24h
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-sm font-medium text-muted-foreground">Dosierung (Bei Bedarf)</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="as_needed_standard_dose" className="text-sm">Standarddosis</Label>
                      <Input
                        id="as_needed_standard_dose"
                        value={formData.as_needed_standard_dose || ""}
                        onChange={(e) => updateField("as_needed_standard_dose", e.target.value)}
                        placeholder="z.B. 1 Tablette"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="as_needed_max_per_24h" className="text-sm">Max. pro 24h</Label>
                      <Input
                        id="as_needed_max_per_24h"
                        type="number"
                        min={1}
                        max={20}
                        value={formData.as_needed_max_per_24h || ""}
                        onChange={(e) => updateField("as_needed_max_per_24h", e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="z.B. 2"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                // Regular: show schedule type + doses
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-sm font-medium text-muted-foreground">Einnahmeplan (Regelmäßig)</p>
                  
                  {/* Schedule Type Selector */}
                  <div className="space-y-2">
                    <Label className="text-sm">Frequenz</Label>
                    <Select
                      value={scheduleType}
                      onValueChange={(v) => handleScheduleTypeChange(v as "daily" | "weekdays")}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Täglich</SelectItem>
                        <SelectItem value="weekdays">Bestimmte Wochentage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Weekday Picker (only when weekdays selected) */}
                  {scheduleType === "weekdays" && (
                    <div className="space-y-2">
                      <Label className="text-sm">Einnahme an</Label>
                      <WeekdayPicker
                        value={(formData.regular_weekdays || []) as Weekday[]}
                        onChange={handleWeekdaysChange}
                        size="sm"
                      />
                      {formData.regular_weekdays?.length === 0 && (
                        <p className="text-xs text-amber-500">
                          Bitte mindestens einen Tag auswählen
                        </p>
                      )}
                      {formData.regular_weekdays && formData.regular_weekdays.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatWeekdays(formData.regular_weekdays as Weekday[])}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Time-based doses */}
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <Label className="text-sm">Dosierung pro Einnahme</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: "dosis_morgens", label: "Mo" },
                        { key: "dosis_mittags", label: "Mi" },
                        { key: "dosis_abends", label: "Ab" },
                        { key: "dosis_nacht", label: "Na" },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs text-center block">{label}</Label>
                          <Input
                            value={(formData as any)[key] || ""}
                            onChange={(e) => updateField(key as any, e.target.value)}
                            placeholder="0"
                            className="text-center h-9"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* COLLAPSIBLE SECTIONS */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <div className="space-y-2">
              {/* Pharmazeutische Details */}
              <CollapsibleSection
                title="Pharmazeutische Details"
                icon={<FileText className="h-4 w-4" />}
                hint="Optional – für detaillierten Medikationsplan"
              >
                <div className="space-y-2">
                  <Label htmlFor="wirkstoff">Wirkstoff</Label>
                  <Input
                    id="wirkstoff"
                    value={formData.wirkstoff || ""}
                    onChange={(e) => updateField("wirkstoff", e.target.value)}
                    placeholder="z.B. Sumatriptan"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Darreichungsform</Label>
                  <Select
                    value={formData.darreichungsform || "Tablette"}
                    onValueChange={(v) => updateField("darreichungsform", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tablette" />
                    </SelectTrigger>
                    <SelectContent>
                      {DARREICHUNGSFORMEN.map((form) => (
                        <SelectItem key={form} value={form}>{form}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Anwendungsgebiet / Grund (optional)</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TYPICAL_INDICATIONS.map((ind) => (
                      <Button
                        key={ind}
                        type="button"
                        variant={formData.anwendungsgebiet === ind ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleTypicalIndicationSelect(ind)}
                      >
                        {ind}
                      </Button>
                    ))}
                  </div>
                  
                  {/* Custom Reasons */}
                  {customReasons.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Eigene Gründe:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {customReasons.map((reason) => (
                          <Badge
                            key={reason}
                            variant={formData.anwendungsgebiet === reason ? "default" : "outline"}
                            className="cursor-pointer text-xs pr-1 flex items-center gap-1"
                            onClick={() => handleCustomReasonSelect(reason)}
                          >
                            {reason}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomReason(reason);
                              }}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Input
                    value={formData.anwendungsgebiet || ""}
                    onChange={(e) => updateField("anwendungsgebiet", e.target.value)}
                    placeholder="z.B. Thrombose, Bluthochdruck"
                  />
                  <p className="text-xs text-muted-foreground">
                    Eigene Gründe werden automatisch gespeichert und stehen für andere Medikamente zur Auswahl
                  </p>
                </div>
              </CollapsibleSection>

              {/* Erweiterte Grenzen (nur bei Bedarf) */}
              {!isRegular && (
                <CollapsibleSection
                  title="Erweiterte Grenzen"
                  icon={<Settings2 className="h-4 w-4" />}
                  hint="Optional – für Medikations-Übergebrauch-Warnung"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="as_needed_max_days_per_month">Max. Tage pro Monat</Label>
                      <Input
                        id="as_needed_max_days_per_month"
                        type="number"
                        min={1}
                        max={31}
                        value={formData.as_needed_max_days_per_month || ""}
                        onChange={(e) => updateField("as_needed_max_days_per_month", e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="z.B. 10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="as_needed_min_interval_hours">Mindestabstand (Std.)</Label>
                      <Input
                        id="as_needed_min_interval_hours"
                        type="number"
                        min={0.5}
                        max={72}
                        step={0.5}
                        value={formData.as_needed_min_interval_hours || ""}
                        onChange={(e) => updateField("as_needed_min_interval_hours", e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="z.B. 4"
                      />
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* Hinweise - combined field */}
              <CollapsibleSection
                title="Hinweise"
                icon={<Clock className="h-4 w-4" />}
                hint="Optional – Einnahmehinweise, Warnungen"
              >
                <Textarea
                  value={formData.hinweise || formData.as_needed_notes || formData.regular_notes || ""}
                  onChange={(e) => {
                    updateField("hinweise", e.target.value);
                    // Also sync to type-specific field
                    if (isRegular) {
                      updateField("regular_notes", e.target.value);
                    } else {
                      updateField("as_needed_notes", e.target.value);
                    }
                  }}
                  placeholder="z.B. Nicht mit anderen Triptanen kombinieren, Einnahme zu den Mahlzeiten, nur Mo/Mi/Fr einnehmen..."
                  rows={2}
                />
              </CollapsibleSection>

              {/* Verträglichkeit */}
              <CollapsibleSection
                title="Verträglichkeit"
                icon={<AlertTriangle className="h-4 w-4" />}
                hint="Optional – Unverträglichkeiten dokumentieren"
                badge={formData.intolerance_flag ? (
                  <span className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded">
                    Unverträglich
                  </span>
                ) : undefined}
              >
                <div className={cn(
                  "flex items-start space-x-3 p-3 rounded-lg border",
                  formData.intolerance_flag 
                    ? "border-destructive/50 bg-destructive/10" 
                    : "border-border/50 bg-muted/20"
                )}>
                  <Checkbox
                    id="intolerance_flag"
                    checked={formData.intolerance_flag || false}
                    onCheckedChange={(checked) => handleIntoleranceToggle(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="intolerance_flag"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Medikament ist unverträglich
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Nicht mehr einnehmen (z.B. Allergie, schwere Nebenwirkungen)
                    </p>
                  </div>
                </div>

                {formData.intolerance_flag && (
                  <div className="space-y-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <div className="space-y-2">
                      <Label>Grund</Label>
                      <Select
                        value={formData.intolerance_reason_type || ""}
                        onValueChange={(v) => updateField("intolerance_reason_type", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {INTOLERANCE_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="intolerance_notes">Beschreibung (optional)</Label>
                      <Textarea
                        id="intolerance_notes"
                        value={formData.intolerance_notes || ""}
                        onChange={(e) => updateField("intolerance_notes", e.target.value)}
                        placeholder="z.B. Hautausschlag, starker Schwindel..."
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            </div>
          </div>

          <DialogFooter className={cn("gap-2 mt-4", isMobile && "flex-col")}>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={updateMed.isPending || !formData.name?.trim()}>
              {updateMed.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Speichern...
                </>
              ) : (
                "Speichern"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Intake Type Change Confirmation */}
      <AlertDialog open={showIntakeChangeConfirm} onOpenChange={setShowIntakeChangeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einnahmeart ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingIntakeType === "as_needed" 
                ? "Beim Wechsel auf 'Bei Bedarf' werden die festen Einnahmezeiten gelöscht."
                : "Beim Wechsel auf 'Regelmäßig' werden die Bedarfsdosierungsdaten gelöscht."}
              <br /><br />
              Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowIntakeChangeConfirm(false);
              setPendingIntakeType(null);
            }}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingIntakeType && applyIntakeTypeChange(pendingIntakeType)}>
              Ja, ändern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};