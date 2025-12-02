import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed, type Med } from "@/features/meds/hooks/useMeds";
import { useMedicationCourses } from "@/features/medication-courses";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { Trash2, Plus, Pill, FileText, Loader2, Pencil, Download } from "lucide-react";
import { MedicationLimitsSettings } from "../MedicationLimitsSettings";
import { MedicationEditModal } from "../MedicationEditModal";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast as sonnerToast } from "sonner";

export const SettingsMedications = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [newMedName, setNewMedName] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editingMed, setEditingMed] = useState<Med | null>(null);
  
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { data: courses } = useMedicationCourses();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationLimits } = useMedicationLimits();
  
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      await addMed.mutateAsync(newMedName.trim());
      setNewMedName("");
      toast({
        title: "✅ Medikament hinzugefügt",
        description: `${newMedName} wurde zur Liste hinzugefügt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteMedication = async (medName: string) => {
    try {
      await deleteMed.mutateAsync(medName);
      toast({
        title: "✅ Medikament entfernt",
        description: `${medName} wurde aus der Liste entfernt`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler beim Entfernen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateMedicationPlan = async () => {
    const hasMedications = (courses && courses.length > 0) || (medications && medications.length > 0);
    
    if (!hasMedications) {
      toast({
        title: "Keine Medikamente vorhanden",
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: courses || [],
        userMedications: medications?.map(m => ({
          id: m.id,
          name: m.name,
          wirkstoff: m.wirkstoff,
          staerke: m.staerke,
          darreichungsform: m.darreichungsform,
          einheit: m.einheit,
          dosis_morgens: m.dosis_morgens,
          dosis_mittags: m.dosis_mittags,
          dosis_abends: m.dosis_abends,
          dosis_nacht: m.dosis_nacht,
          dosis_bedarf: m.dosis_bedarf,
          anwendungsgebiet: m.anwendungsgebiet,
          hinweise: m.hinweise,
          art: m.art,
        })),
        medicationLimits: medicationLimits?.map(l => ({
          medication_name: l.medication_name,
          limit_count: l.limit_count,
          period_type: l.period_type,
        })),
        patientData: patientData ? {
          firstName: patientData.first_name,
          lastName: patientData.last_name,
          dateOfBirth: patientData.date_of_birth,
          street: patientData.street,
          postalCode: patientData.postal_code,
          city: patientData.city,
          phone: patientData.phone,
          healthInsurance: patientData.health_insurance,
          insuranceNumber: patientData.insurance_number,
        } : undefined,
        doctors: doctors?.map(doc => ({
          firstName: doc.first_name,
          lastName: doc.last_name,
          title: doc.title,
          specialty: doc.specialty,
          street: doc.street,
          postalCode: doc.postal_code,
          city: doc.city,
          phone: doc.phone,
        })),
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Medikationsplan_${new Date().toISOString().split("T")[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      sonnerToast.success("Medikationsplan erstellt", {
        description: "Das PDF wurde heruntergeladen.",
      });
    } catch (error) {
      console.error("Error generating medication plan:", error);
      toast({
        title: "Fehler beim Erstellen",
        description: "Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const totalMedications = (courses?.length || 0) + (medications?.length || 0);

  if (medsLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PROMINENT: Medikationsplan Button - styled like Kopfschmerztagebuch PDF button */}
      <Button
        onClick={handleGenerateMedicationPlan}
        disabled={isGeneratingPdf || totalMedications === 0}
        variant="outline"
        className={cn(
          "w-full justify-start gap-3 h-auto py-3 px-4",
          "border-primary/30 hover:border-primary/50 hover:bg-primary/5",
          "transition-all duration-200"
        )}
      >
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          {isGeneratingPdf ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <Download className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 text-left">
          <div className={cn("font-semibold text-foreground", isMobile && "text-sm")}>
            Medikationsplan (PDF) erstellen
          </div>
          <div className={cn("text-xs text-muted-foreground font-normal", isMobile && "text-[11px]")}>
            {isGeneratingPdf ? "Wird erstellt..." : "Alle Medikamente für Arzt, Krankenhaus oder Notfall"}
          </div>
        </div>
      </Button>

      {/* Medication Management */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <h2 className={cn("text-lg font-medium mb-4 flex items-center gap-2", isMobile && "text-base")}>
          <Pill className="h-5 w-5" />
          Medikamente verwalten
        </h2>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Hier verwaltest du deine Akut- und Bedarfsmedikamente. Klicke auf das Stift-Symbol, um Details zu bearbeiten.
        </p>
        
        <div className="space-y-4">
          {/* Add medication input */}
          <div className="flex gap-2">
            <Input
              placeholder="Medikamentenname eingeben..."
              value={newMedName}
              onChange={(e) => setNewMedName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMedication()}
            />
            <Button
              onClick={handleAddMedication}
              disabled={!newMedName.trim() || addMed.isPending}
              size={isMobile ? "sm" : "default"}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Medications list with modern scrollbar */}
          <div className={cn(
            "space-y-2 max-h-[280px] overflow-y-auto modern-scrollbar pr-1",
            medications.length > 5 && "pb-2"
          )}>
            {medications.map((med) => (
              <div
                key={med.id}
                className={cn(
                  "flex items-center justify-between p-3 bg-secondary/20 rounded-lg",
                  isMobile && "p-2"
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className={cn("font-medium block truncate", isMobile && "text-sm")}>{med.name}</span>
                  {(med.wirkstoff || med.staerke || med.darreichungsform) && (
                    <span className="text-xs text-muted-foreground truncate block">
                      {[med.wirkstoff, med.staerke, med.darreichungsform].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "icon"}
                    onClick={() => setEditingMed(med)}
                    className="hover:bg-primary/10 hover:text-primary"
                    title="Bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "icon"}
                    onClick={() => handleDeleteMedication(med.name)}
                    disabled={deleteMed.isPending}
                    className="hover:bg-destructive/10 hover:text-destructive"
                    title="Löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {medications.length === 0 && (
              <p className={cn("text-center text-muted-foreground py-4", isMobile && "text-sm")}>
                Noch keine Medikamente hinzugefügt
              </p>
            )}
          </div>
        </div>
      </Card>

      <Separator />

      {/* Medication Limits */}
      <MedicationLimitsSettings />

      {/* Edit Modal */}
      <MedicationEditModal
        medication={editingMed}
        open={!!editingMed}
        onOpenChange={(open) => !open && setEditingMed(null)}
      />
    </div>
  );
};
