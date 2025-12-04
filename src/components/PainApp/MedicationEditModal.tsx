import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useUpdateMed, type Med, type UpdateMedInput } from "@/features/meds/hooks/useMeds";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertTriangle, Pill, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MedicationEditModalProps {
  medication: Med | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DARREICHUNGSFORMEN = [
  "Tablette",
  "Kapsel",
  "Filmtablette",
  "Schmelztablette",
  "Brausetablette",
  "Tropfen",
  "Lösung",
  "Sirup",
  "Nasenspray",
  "Spray",
  "Injektionslösung",
  "Fertigspritze",
  "Pen",
  "Zäpfchen",
  "Creme",
  "Salbe",
  "Pflaster",
];

const EINHEITEN = ["Stück", "ml", "mg", "g", "IE", "Hub", "Tropfen"];

const ART_OPTIONS = [
  { value: "bedarf", label: "Bei Bedarf" },
  { value: "akut", label: "Akutmedikation" },
  { value: "prophylaxe", label: "Prophylaxe (Dauermedikation)" },
  { value: "regelmaessig", label: "Regelmäßig" },
  { value: "notfall", label: "Notfallmedikation" },
];

export const MedicationEditModal = ({ medication, open, onOpenChange }: MedicationEditModalProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const updateMed = useUpdateMed();

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
  });

  // Reset form when medication changes
  useEffect(() => {
    if (medication) {
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
        title: "✨ Auto-Fill angewendet",
        description: "Vorschläge wurden eingetragen. Du kannst sie anpassen.",
      });
    } else {
      toast({
        title: "Keine Vorschläge gefunden",
        description: "Für dieses Medikament sind keine Auto-Fill-Daten verfügbar.",
      });
    }
  };

  const handleSave = async () => {
    if (!medication) return;

    // If marking as intolerant, also discontinue
    const finalData = { ...formData };
    if (formData.intolerance_flag && medication.is_active !== false) {
      finalData.is_active = false;
      finalData.discontinued_at = new Date().toISOString();
    }

    try {
      await updateMed.mutateAsync({
        id: medication.id,
        input: finalData,
      });
      toast({
        title: "✅ Gespeichert",
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

  const updateField = (field: keyof UpdateMedInput, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isRegularMedication = formData.art === "prophylaxe" || formData.art === "regelmaessig";

  return (
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

        <Accordion type="multiple" defaultValue={["basis"]} className="w-full">
          {/* Basis - Always visible */}
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
                    placeholder="z.B. Sumatriptan 100 mg"
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

              {/* Art */}
              <div className="space-y-2">
                <Label>Art der Einnahme</Label>
                <Select
                  value={formData.art || "bedarf"}
                  onValueChange={(v) => updateField("art", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ART_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Anwendungsgebiet */}
              <div className="space-y-2">
                <Label htmlFor="anwendungsgebiet">Anwendungsgebiet / Grund</Label>
                <Input
                  id="anwendungsgebiet"
                  value={formData.anwendungsgebiet || ""}
                  onChange={(e) => updateField("anwendungsgebiet", e.target.value)}
                  placeholder="z.B. Akute Migräneattacke, Migräne-Prophylaxe"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Pharma-Details */}
          <AccordionItem value="pharma">
            <AccordionTrigger className="text-base font-semibold">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Pharmazeutische Details
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {/* Wirkstoff + Stärke */}
              <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
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
                  <Label htmlFor="staerke">Stärke</Label>
                  <Input
                    id="staerke"
                    value={formData.staerke || ""}
                    onChange={(e) => updateField("staerke", e.target.value)}
                    placeholder="z.B. 100 mg"
                  />
                </div>
              </div>

              {/* Form + Einheit */}
              <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
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
                <div className="space-y-2">
                  <Label>Einheit</Label>
                  <Select
                    value={formData.einheit || "Stück"}
                    onValueChange={(v) => updateField("einheit", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EINHEITEN.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Dosierung */}
          <AccordionItem value="dosierung">
            <AccordionTrigger className="text-base font-semibold">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Dosierung
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {isRegularMedication ? (
                <div className="space-y-2">
                  <Label>Tagesdosierung (Mo-Mi-Ab-Na)</Label>
                  <div className={cn("grid gap-2", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                    <div>
                      <span className="text-xs text-muted-foreground">Morgens</span>
                      <Input
                        value={formData.dosis_morgens || ""}
                        onChange={(e) => updateField("dosis_morgens", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Mittags</span>
                      <Input
                        value={formData.dosis_mittags || ""}
                        onChange={(e) => updateField("dosis_mittags", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Abends</span>
                      <Input
                        value={formData.dosis_abends || ""}
                        onChange={(e) => updateField("dosis_abends", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Nachts</span>
                      <Input
                        value={formData.dosis_nacht || ""}
                        onChange={(e) => updateField("dosis_nacht", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="dosis_bedarf">Bedarfsdosierung</Label>
                  <Input
                    id="dosis_bedarf"
                    value={formData.dosis_bedarf || ""}
                    onChange={(e) => updateField("dosis_bedarf", e.target.value)}
                    placeholder="z.B. max. 2 Tabletten/Tag, max. 10 Tage/Monat"
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Verträglichkeit */}
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
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <Checkbox
                  id="intolerance_flag"
                  checked={formData.intolerance_flag || false}
                  onCheckedChange={(checked) => updateField("intolerance_flag", !!checked)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="intolerance_flag"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Medikament ist unverträglich
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Nicht mehr einnehmen (z.B. Allergie, schwere Nebenwirkungen)
                  </p>
                </div>
              </div>

              {/* Intolerance Notes */}
              {formData.intolerance_flag && (
                <div className="space-y-2">
                  <Label htmlFor="intolerance_notes">Grund der Unverträglichkeit</Label>
                  <Textarea
                    id="intolerance_notes"
                    value={formData.intolerance_notes || ""}
                    onChange={(e) => updateField("intolerance_notes", e.target.value)}
                    placeholder="z.B. Hautausschlag, Atemnot, starke Übelkeit..."
                    rows={2}
                  />
                </div>
              )}

              {/* Hinweise */}
              <div className="space-y-2">
                <Label htmlFor="hinweise">Allgemeine Hinweise</Label>
                <Textarea
                  id="hinweise"
                  value={formData.hinweise || ""}
                  onChange={(e) => updateField("hinweise", e.target.value)}
                  placeholder="z.B. Nicht mit anderen Triptanen kombinieren, Nicht bei Herzerkrankungen..."
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
  );
};
