import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUpdateMed, type Med, type UpdateMedInput } from "@/features/meds/hooks/useMeds";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronDown, Bell, AlertTriangle, Sparkles, Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";
import { MedicationReminderSheet } from "@/components/Reminders/MedicationReminderSheet";
import {
  FREQUENCY_OPTIONS,
  detectImplicitFrequency,
  type RegularFrequency,
} from "@/lib/medications/medicationFrequency";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";
import { classifyMedication } from "@/lib/medications/classifyMedication";

interface MedicationEditModalProps {
  medication: Med | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PurposeKey = "prophylaxe" | "akut" | "sonstiges";
type IntakeKey = "regular" | "as_needed";

const PURPOSE_OPTIONS: { value: PurposeKey; label: string }[] = [
  { value: "prophylaxe", label: "Prophylaxe" },
  { value: "akut", label: "Akut" },
  { value: "sonstiges", label: "Sonstiges" },
];

const INTAKE_OPTIONS: { value: IntakeKey; label: string }[] = [
  { value: "regular", label: "Regelmäßig" },
  { value: "as_needed", label: "Bei Bedarf" },
];

const DARREICHUNGSFORMEN = [
  "Tablette", "Kapsel", "Filmtablette", "Tropfen", "Lösung", "Spray",
  "Nasenspray", "Injektionslösung", "Fertigspritze", "Pen",
  "Zäpfchen", "Pflaster", "Sonstiges",
];

const STRENGTH_UNITS = ["mg", "µg", "g", "ml", "IE"];

function mapArtToPurpose(art: string | null | undefined, intake: IntakeKey): PurposeKey {
  if (art === "prophylaxe") return "prophylaxe";
  if (art === "akut") return "akut";
  if (intake === "as_needed") return "akut";
  return "sonstiges";
}

function purposeToArt(purpose: PurposeKey, intake: IntakeKey): string {
  if (purpose === "prophylaxe") return "prophylaxe";
  if (purpose === "akut") return intake === "regular" ? "akut" : "bedarf";
  return intake === "regular" ? "regelmaessig" : "bedarf";
}

function deriveFrequency(med: Med | null): RegularFrequency | "" {
  if (!med) return "";
  if (med.regular_frequency) return med.regular_frequency as RegularFrequency;
  // Implicit detection (e.g., Ajovy → monthly)
  const implicit = detectImplicitFrequency(med.name);
  if (implicit) return implicit;
  // Derive from existing dose fields
  const filled = [med.dosis_morgens, med.dosis_mittags, med.dosis_abends, med.dosis_nacht]
    .filter((d) => d && d.trim().length > 0).length;
  if (filled === 3) return "daily_3x";
  if (filled === 2) return "daily_2x";
  if (filled === 1) return "daily_1x";
  const wd = med.regular_weekdays || [];
  if (wd.length > 0 && wd.length < 7) return "weekly";
  return "";
}

// Tiny segmented control component (mobile-first, app-feeling)
function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid gap-1 p-1 rounded-lg bg-muted/40 border border-border/40"
         style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "text-sm font-medium py-2.5 rounded-md transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const MedicationEditModal = ({ medication, open, onOpenChange }: MedicationEditModalProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const updateMed = useUpdateMed();
  const reminderStatus = useMedicationReminderStatus(medication);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Core simplified state
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<PurposeKey>("akut");
  const [intake, setIntake] = useState<IntakeKey>("as_needed");
  const [frequency, setFrequency] = useState<RegularFrequency | "">("");
  const [doseText, setDoseText] = useState("");

  // Optional/advanced state
  const [strengthValue, setStrengthValue] = useState("");
  const [strengthUnit, setStrengthUnit] = useState("mg");
  const [wirkstoff, setWirkstoff] = useState("");
  const [form, setForm] = useState("Tablette");
  const [hinweise, setHinweise] = useState("");
  const [maxPer24h, setMaxPer24h] = useState<number | "">("");
  const [maxDaysPerMonth, setMaxDaysPerMonth] = useState<number | "">("");
  const [intolerant, setIntolerant] = useState(false);
  const [intoleranceNotes, setIntoleranceNotes] = useState("");
  const [archived, setArchived] = useState(false);
  const [effectCategory, setEffectCategory] = useState<string>("");

  useEffect(() => {
    if (!medication) return;
    const inferredIntake: IntakeKey =
      medication.intake_type === "regular" ||
      medication.art === "prophylaxe" ||
      medication.art === "regelmaessig"
        ? "regular"
        : "as_needed";

    setName(medication.name || "");
    setIntake(inferredIntake);
    setPurpose(mapArtToPurpose(medication.art, inferredIntake));
    setFrequency(deriveFrequency(medication));
    // Dose: prefer structured single field. For daily grid, show first non-empty.
    const dailyDose =
      medication.dosis_morgens ||
      medication.dosis_mittags ||
      medication.dosis_abends ||
      medication.dosis_nacht ||
      "";
    setDoseText(medication.as_needed_standard_dose || dailyDose || medication.dosis_bedarf || "");

    setStrengthValue(medication.strength_value || "");
    setStrengthUnit(medication.strength_unit || "mg");
    setWirkstoff(medication.wirkstoff || "");
    setForm(medication.darreichungsform || "Tablette");
    setHinweise(medication.hinweise || medication.regular_notes || medication.as_needed_notes || "");
    setMaxPer24h(medication.as_needed_max_per_24h ?? "");
    setMaxDaysPerMonth(medication.as_needed_max_days_per_month ?? "");
    setIntolerant(!!medication.intolerance_flag);
    setIntoleranceNotes(medication.intolerance_notes || "");
    setArchived(medication.is_active === false);
    setEffectCategory(medication.effect_category || "");
    setAdvancedOpen(false);
  }, [medication]);

  // Smart defaults: when switching to regular, suggest a frequency
  useEffect(() => {
    if (intake === "regular" && !frequency) {
      const implicit = detectImplicitFrequency(name);
      setFrequency(implicit || "daily_1x");
    }
  }, [intake, frequency, name]);

  const handleAutoFill = () => {
    if (!name.trim()) return;
    const meta = lookupMedicationMetadata(name);
    if (meta) {
      if (!wirkstoff && meta.wirkstoff) setWirkstoff(meta.wirkstoff);
      if (meta.darreichungsform) setForm(meta.darreichungsform);
      if (!effectCategory) {
        const cls = classifyMedication(name);
        if (cls.isTriptan) setEffectCategory("triptan");
        else if (cls.isGepant) setEffectCategory("gepant");
      }
      toast({ title: "Vorschläge übernommen" });
    } else {
      toast({ title: "Keine Vorschläge gefunden" });
    }
  };

  const handleSave = async () => {
    if (!medication) return;
    if (!name.trim()) {
      toast({ title: "Name erforderlich", variant: "destructive" });
      return;
    }

    const isRegular = intake === "regular";
    const art = purposeToArt(purpose, intake);

    // Build dose fields: for daily grid, write into dosis_morgens; otherwise into as_needed_standard_dose.
    let dosis_morgens: string | undefined = "";
    let dosis_mittags: string | undefined = "";
    let dosis_abends: string | undefined = "";
    let dosis_nacht: string | undefined = "";
    let as_needed_standard_dose: string | undefined = "";

    if (isRegular && (frequency === "daily_1x" || frequency === "daily_2x" || frequency === "daily_3x")) {
      const slots = frequency === "daily_3x" ? 3 : frequency === "daily_2x" ? 2 : 1;
      dosis_morgens = doseText || "";
      dosis_mittags = slots >= 3 ? doseText : "";
      dosis_abends = slots >= 2 ? doseText : "";
    } else if (isRegular) {
      // weekly/monthly/quarterly/other: store dose label in as_needed_standard_dose for SSOT
      as_needed_standard_dose = doseText || "";
    } else {
      // as_needed
      as_needed_standard_dose = doseText || "";
    }

    const finalData: UpdateMedInput = {
      name: name.trim(),
      art,
      intake_type: intake,
      regular_frequency: isRegular ? (frequency || null) as any : null as any,
      dosis_morgens,
      dosis_mittags,
      dosis_abends,
      dosis_nacht,
      as_needed_standard_dose,
      as_needed_max_per_24h: typeof maxPer24h === "number" ? maxPer24h : undefined,
      as_needed_max_days_per_month: typeof maxDaysPerMonth === "number" ? maxDaysPerMonth : undefined,
      strength_value: strengthValue || "",
      strength_unit: strengthUnit || "mg",
      wirkstoff: wirkstoff || "",
      darreichungsform: form || "Tablette",
      hinweise: hinweise || "",
      regular_notes: isRegular ? hinweise || "" : "",
      as_needed_notes: !isRegular ? hinweise || "" : "",
      intolerance_flag: intolerant,
      intolerance_notes: intolerant ? intoleranceNotes || "" : "",
      effect_category: effectCategory || "",
      is_active: !archived && !intolerant,
    };

    if (intolerant) {
      finalData.medication_status = "intolerant";
      finalData.discontinued_at = new Date().toISOString();
    } else if (archived) {
      finalData.medication_status = "stopped";
      finalData.discontinued_at = new Date().toISOString();
    } else {
      finalData.medication_status = "active";
      finalData.discontinued_at = null;
    }

    try {
      await updateMed.mutateAsync({ id: medication.id, input: finalData });
      toast({ title: "Gespeichert" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const isRegular = intake === "regular";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "p-0 gap-0 border-border/50 bg-background overflow-hidden",
            isMobile
              ? "max-w-full w-screen h-[100dvh] rounded-none sm:rounded-none"
              : "max-w-md max-h-[90vh]"
          )}
        >
          {/* Sticky header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pill className="h-4 w-4 text-primary" />
              Medikament bearbeiten
            </DialogTitle>
            <DialogDescription className="sr-only">
              Bearbeite Name, Einnahme und Rhythmus deines Medikaments.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable body — single scroll surface */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {/* 1. Medikament */}
            <div className="space-y-2">
              <Label htmlFor="med-name" className="text-sm font-medium">Medikament</Label>
              <div className="flex gap-2">
                <Input
                  id="med-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Ajovy 225 mg"
                  className="h-11 text-base"
                  autoComplete="off"
                />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={handleAutoFill} title="Vorschläge laden">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 2. Wofür */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Wofür?</Label>
              <Segmented value={purpose} onChange={setPurpose} options={PURPOSE_OPTIONS} />
            </div>

            {/* 3. Einnahme */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Einnahme</Label>
              <Segmented value={intake} onChange={(v) => { setIntake(v); if (v === "as_needed") setFrequency(""); }} options={INTAKE_OPTIONS} />
            </div>

            {/* 4. Rhythmus — nur bei Regelmäßig */}
            {isRegular && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Wie oft?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      className={cn(
                        "text-sm font-medium py-3 px-3 rounded-lg border transition-colors text-center",
                        frequency === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-card/40 text-foreground hover:border-border"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Dosis */}
            <div className="space-y-2">
              <Label htmlFor="dose" className="text-sm font-medium">
                Dosis {isRegular ? "pro Einnahme" : "(optional)"}
              </Label>
              <Input
                id="dose"
                value={doseText}
                onChange={(e) => setDoseText(e.target.value)}
                placeholder={isRegular && frequency === "monthly" ? "z. B. 1 Injektion" : "z. B. 1 Tablette"}
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>

            {/* Weitere Angaben — Progressive Disclosure */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium">Weitere Angaben</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-5 pt-4">
                {/* Stärke */}
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <div className="space-y-2">
                    <Label htmlFor="strength" className="text-sm">Stärke</Label>
                    <Input id="strength" value={strengthValue} inputMode="decimal" onChange={(e) => setStrengthValue(e.target.value)} placeholder="z. B. 225" className="h-10" />
                  </div>
                  <div className="space-y-2 w-20">
                    <Label className="text-sm">Einheit</Label>
                    <Select value={strengthUnit} onValueChange={setStrengthUnit}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STRENGTH_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Wirkstoff */}
                <div className="space-y-2">
                  <Label htmlFor="wirkstoff" className="text-sm">Wirkstoff</Label>
                  <Input id="wirkstoff" value={wirkstoff} onChange={(e) => setWirkstoff(e.target.value)} placeholder="z. B. Fremanezumab" className="h-10" />
                </div>

                {/* Darreichungsform */}
                <div className="space-y-2">
                  <Label className="text-sm">Darreichungsform</Label>
                  <Select value={form} onValueChange={setForm}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DARREICHUNGSFORMEN.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Bedarfs-Limits (nur bei Bedarf) */}
                {!isRegular && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Max./Tag</Label>
                      <Input type="number" min={1} max={20} value={maxPer24h} onChange={(e) => setMaxPer24h(e.target.value ? parseInt(e.target.value) : "")} className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Max. Tage/Monat</Label>
                      <Input type="number" min={1} max={31} value={maxDaysPerMonth} onChange={(e) => setMaxDaysPerMonth(e.target.value ? parseInt(e.target.value) : "")} className="h-10" />
                    </div>
                  </div>
                )}

                {/* Hinweise */}
                <div className="space-y-2">
                  <Label htmlFor="hinweise" className="text-sm">Hinweise</Label>
                  <Textarea id="hinweise" value={hinweise} onChange={(e) => setHinweise(e.target.value)} rows={2} placeholder="z. B. mit Wasser einnehmen" />
                </div>

                {/* Kategorie (Triptan/Gepant) */}
                <div className="space-y-2">
                  <Label className="text-sm">Kategorie (Migräne-Analyse)</Label>
                  <Select value={effectCategory || "none"} onValueChange={(v) => setEffectCategory(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Triptan/Gepant</SelectItem>
                      <SelectItem value="triptan">Triptan</SelectItem>
                      <SelectItem value="gepant">Gepant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Erinnerung */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {reminderStatus.isActive
                        ? `${reminderStatus.reminderCount} Erinnerung${reminderStatus.reminderCount !== 1 ? "en" : ""}`
                        : "Keine Erinnerung"}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowReminderSheet(true)}>
                    {reminderStatus.isActive ? "Bearbeiten" : "Hinzufügen"}
                  </Button>
                </div>

                {/* Archiviert */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Archiviert</Label>
                    <p className="text-xs text-muted-foreground">Aus aktueller Liste entfernen</p>
                  </div>
                  <Switch checked={archived} onCheckedChange={setArchived} />
                </div>

                {/* Unverträglichkeit */}
                <div className={cn(
                  "p-3 rounded-lg border space-y-3",
                  intolerant ? "border-destructive/50 bg-destructive/5" : "border-border/40 bg-muted/30"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn("h-4 w-4", intolerant ? "text-destructive" : "text-muted-foreground")} />
                      <Label className="text-sm font-medium">Unverträglich</Label>
                    </div>
                    <Switch checked={intolerant} onCheckedChange={setIntolerant} />
                  </div>
                  {intolerant && (
                    <Textarea
                      value={intoleranceNotes}
                      onChange={(e) => setIntoleranceNotes(e.target.value)}
                      placeholder="Beschreibung (optional)"
                      rows={2}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="h-2" />
          </div>

          {/* Sticky footer */}
          <div className="shrink-0 border-t border-border/40 px-5 py-3 flex items-center gap-3 bg-background">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 h-11">
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={updateMed.isPending || !name.trim()} className="flex-1 h-11">
              {updateMed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {medication && (
        <MedicationReminderSheet
          open={showReminderSheet}
          onOpenChange={setShowReminderSheet}
          medication={medication}
        />
      )}
    </>
  );
};
