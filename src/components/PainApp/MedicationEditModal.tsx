import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUpdateMed, type Med, type UpdateMedInput } from "@/features/meds/hooks/useMeds";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertTriangle, Pill, Clock, FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

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

const STRENGTH_UNITS = [
  { value: "mg", label: "mg" },
  { value: "µg", label: "µg" },
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "Tropfen", label: "Tropfen" },
  { value: "Hub", label: "Hub" },
  { value: "mg/ml", label: "mg/ml" },
  { value: "IE", label: "IE" },
  { value: "Sonstiges", label: "Sonstiges" },
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

const WEEKDAYS = [
  { value: "Mo", label: "Mo" },
  { value: "Di", label: "Di" },
  { value: "Mi", label: "Mi" },
  { value: "Do", label: "Do" },
  { value: "Fr", label: "Fr" },
  { value: "Sa", label: "Sa" },
  { value: "So", label: "So" },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const MedicationEditModal = ({ medication, open, onOpenChange }: MedicationEditModalProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const updateMed = useUpdateMed();
  const [showIntakeChangeConfirm, setShowIntakeChangeConfirm] = useState(false);
  const [pendingIntakeType, setPendingIntakeType] = useState<string | null>(null);

  const [formData, setFormData] = useState<UpdateMedInput>({
    name: "",
    wirkstoff: "",
    staerke: "",
    darreichungsform: "",
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
  });

  // Reset form when medication changes
  useEffect(() => {
    if (medication) {
      // Infer intake_type from art if not set
      const inferredIntakeType = medication.intake_type || 
        (medication.art === "prophylaxe" || medication.art === "regelmaessig" ? "regular" : "as_needed");
      
      setFormData({
        name: medication.name || "",
        wirkstoff: medication.wirkstoff || "",
        staerke: medication.staerke || "",
        darreichungsform: medication.darreichungsform || "",
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
      });
    }
  }, [medication]);

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
    // Check if switching from regular to as_needed with existing doses
    if (formData.intake_type === "regular" && newType === "as_needed") {
      const hasDoses = formData.dosis_morgens || formData.dosis_mittags || 
                       formData.dosis_abends || formData.dosis_nacht;
      if (hasDoses) {
        setPendingIntakeType(newType);
        setShowIntakeChangeConfirm(true);
        return;
      }
    }
    // Check if switching from as_needed to regular with existing as_needed data
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
      // Clear regular doses, keep art synced
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
    } else {
      // Clear as-needed fields, keep art synced
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

  const handleSave = async () => {
    if (!medication) return;

    // Build combined staerke for backwards compatibility
    const combinedStaerke = formData.strength_value && formData.strength_unit
      ? `${formData.strength_value} ${formData.strength_unit}`
      : formData.staerke;

    // If marking as intolerant, also set status and discontinue
    const finalData: UpdateMedInput = { 
      ...formData,
      staerke: combinedStaerke,
    };
    
    if (formData.intolerance_flag) {
      finalData.is_active = false;
      finalData.discontinued_at = new Date().toISOString();
      finalData.medication_status = "intolerant";
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

  const toggleWeekday = (day: string) => {
    const current = formData.regular_weekdays || [];
    const newDays = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    updateField("regular_weekdays", newDays);
  };

  const handleTypicalIndicationSelect = (indication: string) => {
    updateField("typical_indication", indication);
    // Also append to free text field
    const current = formData.anwendungsgebiet || "";
    if (!current.includes(indication)) {
      updateField("anwendungsgebiet", current ? `${current}, ${indication}` : indication);
    }
  };

  const isRegular = formData.intake_type === "regular";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(
          "max-w-2xl max-h-[90vh] overflow-y-auto modern-scrollbar",
          isMobile && "max-w-[95vw] p-4"
        )}>
          <DialogHeader>
            <DialogTitle className={cn("text-lg flex items-center gap-2", isMobile && "text-base")}>
              <Pill className="h-5 w-5 text-primary" />
              Medikament bearbeiten
            </DialogTitle>
          </DialogHeader>

          <Accordion type="multiple" defaultValue={["basis", "dosierung"]} className="w-full">
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* BASISINFORMATIONEN */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <AccordionItem value="basis">
              <AccordionTrigger className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4" />
                  Basisinformationen
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {/* Name + Auto-Fill */}
                <div className="space-y-2">
                  <Label htmlFor="name">Handelsname / Name *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="z.B. Sumatriptan"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAutoFill}
                      className="shrink-0"
                      title="Auto-Fill Vorschläge laden"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
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
                  <p className="text-xs text-muted-foreground">
                    {isRegular 
                      ? "Regelmäßige Einnahme zu festen Tageszeiten" 
                      : "Einnahme nur bei Bedarf (z.B. Migräneattacke)"}
                  </p>
                </div>

                {/* Anwendungsgebiet */}
                <div className="space-y-2">
                  <Label>Anwendungsgebiet / Grund</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TYPICAL_INDICATIONS.map((ind) => (
                      <Button
                        key={ind}
                        type="button"
                        variant={formData.typical_indication === ind ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleTypicalIndicationSelect(ind)}
                      >
                        {ind}
                      </Button>
                    ))}
                  </div>
                  <Input
                    id="anwendungsgebiet"
                    value={formData.anwendungsgebiet || ""}
                    onChange={(e) => updateField("anwendungsgebiet", e.target.value)}
                    placeholder="z.B. Akute Migräneattacke, Migräne-Prophylaxe"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* PHARMAZEUTISCHE DETAILS */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <AccordionItem value="pharma">
              <AccordionTrigger className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pharmazeutische Details
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {/* Wirkstoff */}
                <div className="space-y-2">
                  <Label htmlFor="wirkstoff">Wirkstoff</Label>
                  <Input
                    id="wirkstoff"
                    value={formData.wirkstoff || ""}
                    onChange={(e) => updateField("wirkstoff", e.target.value)}
                    placeholder="z.B. Sumatriptan"
                  />
                </div>

                {/* Stärke + Einheit (getrennt) */}
                <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label htmlFor="strength_value">Stärke</Label>
                    <Input
                      id="strength_value"
                      value={formData.strength_value || ""}
                      onChange={(e) => updateField("strength_value", e.target.value)}
                      placeholder="z.B. 100"
                      type="text"
                      inputMode="decimal"
                    />
                    <p className="text-xs text-muted-foreground">Nur die Zahl eingeben</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Einheit</Label>
                    <Select
                      value={formData.strength_unit || "mg"}
                      onValueChange={(v) => updateField("strength_unit", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STRENGTH_UNITS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Darreichungsform */}
                <div className="space-y-2">
                  <Label>Darreichungsform</Label>
                  <Select
                    value={formData.darreichungsform || ""}
                    onValueChange={(v) => updateField("darreichungsform", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DARREICHUNGSFORMEN.map((form) => (
                        <SelectItem key={form} value={form}>{form}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* DOSIERUNG */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <AccordionItem value="dosierung">
              <AccordionTrigger className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Dosierung
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({isRegular ? "Regelmäßig" : "Bei Bedarf"})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {isRegular ? (
                  /* ═══════════════════════════════════════════════════════════════════════════ */
                  /* REGULAR DOSING UI */
                  /* ═══════════════════════════════════════════════════════════════════════════ */
                  <>
                    <p className="text-sm text-muted-foreground">
                      Geben Sie die Dosis zu den jeweiligen Tageszeiten an.
                    </p>
                    
                    {/* Tageszeiten Grid */}
                    <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                      {[
                        { key: "dosis_morgens", label: "Morgens" },
                        { key: "dosis_mittags", label: "Mittags" },
                        { key: "dosis_abends", label: "Abends" },
                        { key: "dosis_nacht", label: "Nachts" },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              id={`${key}_check`}
                              checked={!!(formData as any)[key]}
                              onCheckedChange={(checked) => {
                                if (!checked) updateField(key as any, "");
                                else updateField(key as any, "1");
                              }}
                            />
                            <Label htmlFor={`${key}_check`} className="text-sm font-medium cursor-pointer">
                              {label}
                            </Label>
                          </div>
                          <Input
                            value={(formData as any)[key] || ""}
                            onChange={(e) => updateField(key as any, e.target.value)}
                            placeholder="0"
                            className="text-center"
                            disabled={!(formData as any)[key]}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Wochentage (optional) */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Einnahme an folgenden Wochentagen (optional)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Leer = täglich
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((day) => (
                          <Button
                            key={day.value}
                            type="button"
                            variant={(formData.regular_weekdays || []).includes(day.value) ? "default" : "outline"}
                            size="sm"
                            className="h-8 w-10"
                            onClick={() => toggleWeekday(day.value)}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Regular Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="regular_notes">Zusätzliche Dosierhinweise (optional)</Label>
                      <Textarea
                        id="regular_notes"
                        value={formData.regular_notes || ""}
                        onChange={(e) => updateField("regular_notes", e.target.value)}
                        placeholder="z.B. nur unter der Woche, Einnahme zu den Mahlzeiten"
                        rows={2}
                      />
                    </div>
                  </>
                ) : (
                  /* ═══════════════════════════════════════════════════════════════════════════ */
                  /* AS-NEEDED DOSING UI */
                  /* ═══════════════════════════════════════════════════════════════════════════ */
                  <>
                    <p className="text-sm text-muted-foreground font-medium">
                      Bedarfsdosierung
                    </p>

                    {/* Standard Dose */}
                    <div className="space-y-2">
                      <Label htmlFor="as_needed_standard_dose">Standarddosis pro Einnahme</Label>
                      <Input
                        id="as_needed_standard_dose"
                        value={formData.as_needed_standard_dose || ""}
                        onChange={(e) => updateField("as_needed_standard_dose", e.target.value)}
                        placeholder="z.B. 1 Tablette"
                      />
                    </div>

                    {/* Max per 24h + Max days per month */}
                    <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                      <div className="space-y-2">
                        <Label htmlFor="as_needed_max_per_24h">Max. Anzahl pro 24 Stunden</Label>
                        <Input
                          id="as_needed_max_per_24h"
                          type="number"
                          min={1}
                          max={20}
                          value={formData.as_needed_max_per_24h || ""}
                          onChange={(e) => updateField("as_needed_max_per_24h", e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="z.B. 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="as_needed_max_days_per_month">Max. Tage pro Monat (optional)</Label>
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
                    </div>

                    {/* Min interval */}
                    <div className="space-y-2">
                      <Label htmlFor="as_needed_min_interval_hours">Mindestabstand zwischen Einnahmen (Stunden, optional)</Label>
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

                    {/* As-needed Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="as_needed_notes">Zusätzliche Hinweise zur Bedarfsdosierung (optional)</Label>
                      <Textarea
                        id="as_needed_notes"
                        value={formData.as_needed_notes || ""}
                        onChange={(e) => updateField("as_needed_notes", e.target.value)}
                        placeholder="z.B. nur bei starker Migräne, nicht zusammen mit anderen Triptanen einnehmen"
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            {/* VERTRÄGLICHKEIT & WARNHINWEISE */}
            {/* ═══════════════════════════════════════════════════════════════════════════ */}
            <AccordionItem value="vertraeglichkeit">
              <AccordionTrigger className="text-base font-semibold">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Verträglichkeit & Warnhinweise
                  {formData.intolerance_flag && (
                    <span className="ml-2 text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded">
                      Unverträglich
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2">
                {/* Intolerance Checkbox */}
                <div className={cn(
                  "flex items-start space-x-3 p-3 rounded-lg border",
                  formData.intolerance_flag 
                    ? "border-destructive bg-destructive/10" 
                    : "border-destructive/30 bg-destructive/5"
                )}>
                  <Checkbox
                    id="intolerance_flag"
                    checked={formData.intolerance_flag || false}
                    onCheckedChange={(checked) => updateField("intolerance_flag", !!checked)}
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

                {/* Intolerance Details (shown when intolerant) */}
                {formData.intolerance_flag && (
                  <div className="space-y-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    {/* Reason Type Dropdown */}
                    <div className="space-y-2">
                      <Label>Grund der Unverträglichkeit</Label>
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

                    {/* Intolerance Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="intolerance_notes">Beschreibung der Unverträglichkeit (optional)</Label>
                      <Textarea
                        id="intolerance_notes"
                        value={formData.intolerance_notes || ""}
                        onChange={(e) => updateField("intolerance_notes", e.target.value)}
                        placeholder="z.B. Hautausschlag, starker Schwindel, keine Wirkung trotz mehrfacher Einnahme..."
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {/* General Warnings */}
                <div className="space-y-2">
                  <Label htmlFor="hinweise">Allgemeine Hinweise</Label>
                  <Textarea
                    id="hinweise"
                    value={formData.hinweise || ""}
                    onChange={(e) => updateField("hinweise", e.target.value)}
                    placeholder="z.B. Nicht mit anderen Triptanen kombinieren, Nicht bei Herzerkrankungen, Kein Autofahren nach Einnahme..."
                    rows={2}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
