import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useMeds, useAddMed, useDeleteMed, useUpdateMed, type Med } from "@/features/meds/hooks/useMeds";
import { useMedicationCourses } from "@/features/medication-courses";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { Trash2, Plus, Pill, Loader2, Pencil, Download, Eye, EyeOff } from "lucide-react";
import { MedicationLimitsSettings } from "../MedicationLimitsSettings";
import { MedicationEditModal } from "../MedicationEditModal";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast as sonnerToast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const SettingsMedications = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [newMedName, setNewMedName] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editingMed, setEditingMed] = useState<Med | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { data: courses } = useMedicationCourses();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationLimits } = useMedicationLimits();
  
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const updateMed = useUpdateMed();

  // Filter medications by active status
  const activeMedications = medications.filter(m => m.is_active !== false);
  const inactiveMedications = medications.filter(m => m.is_active === false);
  const displayedMedications = showInactive ? medications : activeMedications;

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      await addMed.mutateAsync(newMedName.trim());
      setNewMedName("");
      toast({
        title: "Medikament hinzugefügt",
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
        title: "Medikament entfernt",
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

  const handleToggleActive = async (med: Med) => {
    try {
      await updateMed.mutateAsync({
        id: med.id,
        input: { is_active: med.is_active === false ? true : false },
      });
      toast({
        title: med.is_active !== false ? "Medikament deaktiviert" : "Medikament aktiviert",
        description: `${med.name} wurde ${med.is_active !== false ? "deaktiviert" : "aktiviert"}`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateMedicationPlan = async () => {
    const hasMedications = (courses && courses.length > 0) || (activeMedications && activeMedications.length > 0);
    
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
        userMedications: activeMedications?.map(m => ({
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
          is_active: m.is_active,
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
          email: doc.email,
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

  const totalActiveMedications = (courses?.filter(c => c.is_active)?.length || 0) + activeMedications.length;

  if (medsLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PROMINENT: Medikationsplan Button - Primary Action, direkt unter Überschrift */}
      <Card className={cn(
        "border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5",
        "hover:border-primary/60 transition-all duration-200"
      )}>
        <CardContent className="p-4">
          <Button
            onClick={handleGenerateMedicationPlan}
            disabled={isGeneratingPdf || totalActiveMedications === 0}
            className={cn(
              "w-full h-auto py-4 px-5",
              "bg-primary hover:bg-primary/90 text-primary-foreground",
              "shadow-md hover:shadow-lg transition-all duration-200"
            )}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="p-2.5 rounded-xl bg-primary-foreground/20 shrink-0">
                {isGeneratingPdf ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Download className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className={cn("font-bold", isMobile ? "text-base" : "text-lg")}>
                  Medikationsplan (PDF) erstellen
                </div>
                <div className={cn("opacity-90 font-normal", isMobile ? "text-xs" : "text-sm")}>
                  {isGeneratingPdf 
                    ? "Wird erstellt..." 
                    : `${totalActiveMedications} aktive Medikamente - für Arzt, Krankenhaus oder Notfall`}
                </div>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>

      {/* Medication Management */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className={cn("text-lg font-medium flex items-center gap-2", isMobile && "text-base")}>
            <Pill className="h-5 w-5" />
            Medikamente verwalten
          </h2>
          {inactiveMedications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              className="text-muted-foreground"
            >
              {showInactive ? (
                <>
                  <EyeOff className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Inaktive ausblenden</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Inaktive einblenden</span>
                  <span className="sm:hidden">({inactiveMedications.length})</span>
                  <span className="hidden sm:inline ml-1">({inactiveMedications.length})</span>
                </>
              )}
            </Button>
          )}
        </div>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Hier verwaltest du deine Akut- und Bedarfsmedikamente. Inaktive Medikamente erscheinen nicht im Medikationsplan.
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
            "space-y-2 max-h-[320px] overflow-y-auto modern-scrollbar pr-1",
            displayedMedications.length > 5 && "pb-2"
          )}>
            {displayedMedications.map((med) => {
              const isInactive = med.is_active === false;
              return (
                <div
                  key={med.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors",
                    isInactive 
                      ? "bg-muted/30 opacity-60" 
                      : "bg-secondary/20",
                    isMobile && "p-2"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Active/Inactive Toggle */}
                    <Switch
                      checked={med.is_active !== false}
                      onCheckedChange={() => handleToggleActive(med)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium block truncate", 
                          isMobile && "text-sm",
                          isInactive && "line-through"
                        )}>
                          {med.name}
                        </span>
                        {isInactive && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            Inaktiv
                          </Badge>
                        )}
                      </div>
                      {(med.wirkstoff || med.staerke || med.darreichungsform) && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {[med.wirkstoff, med.staerke, med.darreichungsform].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
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
              );
            })}
            
            {displayedMedications.length === 0 && (
              <p className={cn("text-center text-muted-foreground py-4", isMobile && "text-sm")}>
                {showInactive ? "Noch keine Medikamente hinzugefügt" : "Keine aktiven Medikamente"}
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
