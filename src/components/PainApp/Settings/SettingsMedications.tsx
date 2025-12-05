import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useMeds, useAddMed, useDeleteMed, useUpdateMed, type Med } from "@/features/meds/hooks/useMeds";
import { useMedicationCourses } from "@/features/medication-courses";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { Trash2, Plus, Pill, Loader2, Pencil, Download, ChevronDown, ChevronUp, Link2, Calendar } from "lucide-react";
import { MedicationEditModal } from "../MedicationEditModal";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast as sonnerToast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DoctorSelectionDialog, type Doctor } from "../DoctorSelectionDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface MedicationListItemProps {
  med: Med;
  onEdit: (med: Med) => void;
  onToggleActive: (med: Med) => void;
  onDelete: (name: string) => void;
  isDeleting: boolean;
  isMobile: boolean;
  showDates?: boolean;
}

const MedicationListItem = ({ med, onEdit, onToggleActive, onDelete, isDeleting, isMobile, showDates }: MedicationListItemProps) => {
  const isInactive = med.is_active === false;
  
  const formatDateRange = () => {
    if (!med.start_date && !med.end_date) return null;
    const start = med.start_date ? format(new Date(med.start_date), "MM/yyyy", { locale: de }) : "?";
    const end = med.end_date ? format(new Date(med.end_date), "MM/yyyy", { locale: de }) : "heute";
    return `${start} – ${end}`;
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg transition-colors",
        isInactive 
          ? "bg-muted/30 opacity-60" 
          : "bg-secondary/20",
        isMobile && "p-2"
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!showDates && (
          <Switch
            checked={med.is_active !== false}
            onCheckedChange={() => onToggleActive(med)}
            className="shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "font-medium block truncate", 
              isMobile && "text-sm",
              isInactive && "line-through"
            )}>
              {med.name}
            </span>
            {med.intake_type === "regular" && (
              <Badge variant="outline" className="text-xs shrink-0 bg-primary/10 border-primary/30">
                Regelmäßig
              </Badge>
            )}
            {isInactive && !showDates && (
              <Badge variant="outline" className="text-xs shrink-0">
                Inaktiv
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {(med.wirkstoff || med.staerke || med.darreichungsform) && (
              <span className="truncate">
                {[med.wirkstoff, med.staerke, med.darreichungsform].filter(Boolean).join(" · ")}
              </span>
            )}
            {showDates && formatDateRange() && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateRange()}
              </span>
            )}
            {!showDates && med.start_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Seit {format(new Date(med.start_date), "MM/yyyy", { locale: de })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size={isMobile ? "sm" : "icon"}
          onClick={() => onEdit(med)}
          className="hover:bg-primary/10 hover:text-primary"
          title="Bearbeiten"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size={isMobile ? "sm" : "icon"}
          onClick={() => onDelete(med.name)}
          disabled={isDeleting}
          className="hover:bg-destructive/10 hover:text-destructive"
          title="Löschen"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export const SettingsMedications = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [newMedName, setNewMedName] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editingMed, setEditingMed] = useState<Med | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { data: courses } = useMedicationCourses();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationLimits } = useMedicationLimits();
  
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const updateMed = useUpdateMed();

  // Filter medications by active status and intake type
  const activeMedications = medications.filter(m => m.is_active !== false);
  const inactiveMedications = medications.filter(m => m.is_active === false || m.end_date);
  
  // Split active medications by intake type
  const regularMedications = activeMedications.filter(m => m.intake_type === "regular");
  const asNeededMedications = activeMedications.filter(m => m.intake_type !== "regular");

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      // Set today's date as default start_date
      const today = new Date().toISOString().split('T')[0];
      await addMed.mutateAsync({ 
        name: newMedName.trim(),
        start_date: today,
      });
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
      const newActiveState = med.is_active === false;
      const updateData: any = { is_active: newActiveState };
      
      // If deactivating, set end_date to today
      if (!newActiveState) {
        updateData.end_date = new Date().toISOString().split('T')[0];
      } else {
        // If reactivating, clear end_date
        updateData.end_date = null;
      }
      
      await updateMed.mutateAsync({
        id: med.id,
        input: updateData,
      });
      toast({
        title: newActiveState ? "Medikament aktiviert" : "Medikament deaktiviert",
        description: `${med.name} wurde ${newActiveState ? "aktiviert" : "deaktiviert"}`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const generatePdfWithDoctors = async (selectedDoctors: Doctor[]) => {
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
          fax: patientData.fax,
          healthInsurance: patientData.health_insurance,
          insuranceNumber: patientData.insurance_number,
        } : undefined,
        doctors: selectedDoctors.map(doc => ({
          firstName: doc.first_name,
          lastName: doc.last_name,
          title: doc.title,
          specialty: doc.specialty,
          street: doc.street,
          postalCode: doc.postal_code,
          city: doc.city,
          phone: doc.phone,
          fax: doc.fax,
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

    // If multiple doctors, show selection dialog
    if (doctors && doctors.length > 1) {
      setShowDoctorSelection(true);
      return;
    }

    // Otherwise generate directly
    await generatePdfWithDoctors(doctors || []);
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    await generatePdfWithDoctors(selectedDoctors);
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
      {/* PROMINENT: Medikationsplan Button - Primary Action */}
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
            Aktuelle Medikamente
          </h2>
        </div>
        <p className={cn("text-sm text-muted-foreground mb-4", isMobile && "text-xs")}>
          Hier verwaltest du deine Medikamente nach Art der Einnahme.
        </p>
        
        <div className="space-y-5">
          {/* Add medication input */}
          <div className="flex gap-2">
            <Input
              placeholder="Neues Medikament hinzufügen..."
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

          {/* Regular Medications Section */}
          {regularMedications.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                Regelmäßige Medikamente
                <Badge variant="secondary" className="text-xs">{regularMedications.length}</Badge>
              </h3>
              <div className="space-y-2">
                {regularMedications.map((med) => (
                  <MedicationListItem
                    key={med.id}
                    med={med}
                    onEdit={setEditingMed}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDeleteMedication}
                    isDeleting={deleteMed.isPending}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          )}

          {/* As-Needed Medications Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Bedarfsmedikation
              <Badge variant="secondary" className="text-xs">{asNeededMedications.length}</Badge>
            </h3>
            <div className={cn(
              "space-y-2 max-h-[280px] overflow-y-auto modern-scrollbar pr-1",
              asNeededMedications.length > 5 && "pb-2"
            )}>
              {asNeededMedications.map((med) => (
                <MedicationListItem
                  key={med.id}
                  med={med}
                  onEdit={setEditingMed}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteMedication}
                  isDeleting={deleteMed.isPending}
                  isMobile={isMobile}
                />
              ))}
              
              {asNeededMedications.length === 0 && regularMedications.length === 0 && (
                <p className={cn("text-center text-muted-foreground py-4", isMobile && "text-sm")}>
                  Noch keine Medikamente hinzugefügt
                </p>
              )}
            </div>
          </div>

          {/* Discontinued Medications (Therapieverlauf) - Collapsed */}
          {inactiveMedications.length > 0 && (
            <Collapsible open={showInactive} onOpenChange={setShowInactive}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Abgesetzte Medikamente (Therapieverlauf)
                  </span>
                  <Badge variant="outline" className="text-xs">{inactiveMedications.length}</Badge>
                </div>
                {showInactive ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 mt-2">
                  {inactiveMedications.map((med) => (
                    <MedicationListItem
                      key={med.id}
                      med={med}
                      onEdit={setEditingMed}
                      onToggleActive={handleToggleActive}
                      onDelete={handleDeleteMedication}
                      isDeleting={deleteMed.isPending}
                      isMobile={isMobile}
                      showDates
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </Card>

      {/* Link to Medication Limits */}
      <div className="flex justify-center">
        <Button
          variant="link"
          className="text-muted-foreground hover:text-foreground text-sm"
          onClick={() => {
            // Navigate to medication limits page
            window.location.hash = '#/medication-limits';
          }}
        >
          <Link2 className="h-4 w-4 mr-2" />
          Grenzen & Warnungen verwalten
        </Button>
      </div>

      {/* Edit Modal */}
      <MedicationEditModal
        medication={editingMed}
        open={!!editingMed}
        onOpenChange={(open) => !open && setEditingMed(null)}
      />

      {/* Doctor Selection Dialog */}
      <DoctorSelectionDialog
        open={showDoctorSelection}
        onClose={() => setShowDoctorSelection(false)}
        doctors={doctors || []}
        onConfirm={handleDoctorSelectionConfirm}
        title="Arzt für Medikationsplan auswählen"
        description="Wählen Sie die Ärzte aus, deren Kontaktdaten im Medikationsplan erscheinen sollen."
      />
    </div>
  );
};
