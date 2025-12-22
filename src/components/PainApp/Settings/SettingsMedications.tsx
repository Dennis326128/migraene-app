import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMeds, useAddMed, useDeleteMed, useUpdateMed, useIntoleranceMeds, useInactiveMeds, type Med } from "@/features/meds/hooks/useMeds";
import { useMedicationCourses } from "@/features/medication-courses";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { useMedicationsReminderMap, type MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";
import { useEndActivePhase, useStartNewPhase, useAllPhases } from "@/features/medication-phases";
import { buildMedicationPlanPdf, type PdfExportOptions } from "@/lib/pdf/medicationPlan";
import { Trash2, Plus, Pill, Loader2, Pencil, Download, Calendar, Bell, BellOff, RotateCcw } from "lucide-react";
import { MedicationEditModal } from "../MedicationEditModal";
import { MedicationPlanExportDialog } from "../MedicationPlanExportDialog";
import { MedicationDeactivateSheet } from "../MedicationDeactivateSheet";
import { MedicationReminderSheet } from "@/components/Reminders/MedicationReminderSheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast as sonnerToast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DoctorSelectionDialog, type Doctor } from "../DoctorSelectionDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MedicationListItemProps {
  med: Med;
  onEdit: (med: Med) => void;
  onDeactivate?: (med: Med) => void;
  onReactivate?: (med: Med) => void;
  onDelete: (name: string) => void;
  onReminderClick?: (med: Med) => void;
  isDeleting: boolean;
  isMobile: boolean;
  variant: "active" | "inactive";
  reminderStatus?: MedicationReminderStatus;
  latestPhase?: { start_date: string; end_date: string | null; stop_reason: string | null } | null;
  isReactivating?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

const getStopReasonLabel = (reason: string | null | undefined): string => {
  const labels: Record<string, string> = {
    keine_wirkung: "Keine Wirkung",
    nebenwirkungen: "Nebenwirkungen",
    therapie_gewechselt: "Therapie gewechselt",
    sonstiges: "Sonstiges",
  };
  return labels[reason || ""] || "";
};

const MedicationListItem = ({
  med,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  onReminderClick,
  isDeleting,
  isMobile,
  variant,
  reminderStatus,
  latestPhase,
  isReactivating = false,
}: MedicationListItemProps) => {
  const isInactive = variant === "inactive";

  const formatDateRange = () => {
    if (!latestPhase) return null;
    const start = format(new Date(latestPhase.start_date), "MM/yyyy", { locale: de });
    const end = latestPhase.end_date
      ? format(new Date(latestPhase.end_date), "MM/yyyy", { locale: de })
      : "heute";
    return `${start} – ${end}`;
  };

  const hasActiveReminder = reminderStatus?.isActive ?? false;
  const isIntervalMed = reminderStatus?.isIntervalMed ?? false;
  const nextTriggerDate = reminderStatus?.nextTriggerDate;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg transition-colors",
        isInactive
          ? "bg-muted/30"
          : "bg-secondary/20",
        isMobile && "p-2"
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "font-medium block truncate",
              isMobile && "text-sm",
              isInactive && "text-muted-foreground"
            )}>
              {med.name}
            </span>
            {med.intake_type === "regular" && (
              <Badge variant="outline" className="text-xs shrink-0 bg-primary/10 border-primary/30">
                Regelmäßig
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {(med.wirkstoff || med.staerke || med.darreichungsform) && (
                <span className="truncate">
                  {[med.wirkstoff, med.staerke, med.darreichungsform].filter(Boolean).join(" · ")}
                </span>
              )}
              {isInactive && formatDateRange() && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateRange()}
                </span>
              )}
              {isInactive && latestPhase?.stop_reason && (
                <Badge variant="outline" className="text-xs">
                  {getStopReasonLabel(latestPhase.stop_reason)}
                </Badge>
              )}
              {!isInactive && med.start_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Seit {format(new Date(med.start_date), "MM/yyyy", { locale: de })}
                </span>
              )}
            </div>
            {/* Reminder mini-line for interval medications */}
            {!isInactive && isIntervalMed && onReminderClick && (
              <div className="flex items-center gap-1.5 text-xs">
                {hasActiveReminder ? (
                  <span className="text-primary flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Erinnerung aktiv
                    {nextTriggerDate && (
                      <> · nächste: {format(nextTriggerDate, "dd.MM.yyyy", { locale: de })}</>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <BellOff className="h-3 w-3" />
                    Keine Erinnerung
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Reactivate button for inactive medications */}
        {isInactive && onReactivate && (
          <Button
            variant="outline"
            size={isMobile ? "sm" : "default"}
            onClick={() => onReactivate(med)}
            disabled={isReactivating}
            className="gap-1"
          >
            {isReactivating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            <span className={isMobile ? "hidden" : ""}>Reaktivieren</span>
          </Button>
        )}

        {/* Reminder bell for active medications */}
        {!isInactive && onReminderClick && (
          <Button
            variant="ghost"
            size={isMobile ? "sm" : "icon"}
            onClick={() => onReminderClick(med)}
            className={cn(
              "hover:bg-primary/10",
              hasActiveReminder ? "text-primary" : "text-muted-foreground hover:text-primary"
            )}
            title={hasActiveReminder ? "Erinnerungen verwalten" : "Erinnerung einrichten"}
          >
            {hasActiveReminder ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
        )}

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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const SettingsMedications = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // UI State
  const [newMedName, setNewMedName] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editingMed, setEditingMed] = useState<Med | null>(null);
  const [deactivatingMed, setDeactivatingMed] = useState<Med | null>(null);
  const [reactivatingMedId, setReactivatingMedId] = useState<string | null>(null);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [pendingExportOptions, setPendingExportOptions] = useState<PdfExportOptions | undefined>();
  const [reminderMed, setReminderMed] = useState<Med | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");

  // Data Queries
  const { data: medications = [], isLoading: medsLoading } = useMeds();
  const { data: intoleranceMeds = [] } = useIntoleranceMeds();
  const { data: inactiveMedsList = [] } = useInactiveMeds();
  const { data: courses } = useMedicationCourses();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationLimits } = useMedicationLimits();
  const { data: allPhases = [] } = useAllPhases();
  const reminderStatusMap = useMedicationsReminderMap(medications);

  // Mutations
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const updateMed = useUpdateMed();
  const endPhase = useEndActivePhase();
  const startPhase = useStartNewPhase();

  // ─────────────────────────────────────────────────────────────────────────
  // Derived Data
  // ─────────────────────────────────────────────────────────────────────────

  const activeMedications = medications.filter(m => m.is_active !== false);
  const inactiveMedications = medications.filter(m => m.is_active === false);

  // Split active by intake type
  const regularMedications = activeMedications.filter(m => m.intake_type === "regular");
  const asNeededMedications = activeMedications.filter(m => m.intake_type !== "regular");

  // Phase lookup map
  const phasesByMedId = new Map<string, typeof allPhases[0]>();
  for (const phase of allPhases) {
    const existing = phasesByMedId.get(phase.medication_id);
    // Keep the most recent phase
    if (!existing || new Date(phase.start_date) > new Date(existing.start_date)) {
      phasesByMedId.set(phase.medication_id, phase);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleAddMedication = async () => {
    if (!newMedName.trim()) return;
    try {
      const today = new Date().toISOString().split("T")[0];
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

  const handleDeactivateClick = (med: Med) => {
    setDeactivatingMed(med);
  };

  const handleDeactivateConfirm = async (endDate: string, stopReason: string | null) => {
    if (!deactivatingMed) return;

    try {
      // End the phase
      await endPhase.mutateAsync({
        medicationId: deactivatingMed.id,
        endDate,
        stopReason,
      });

      // Update medication status
      await updateMed.mutateAsync({
        id: deactivatingMed.id,
        input: {
          is_active: false,
          end_date: endDate,
        },
      });

      setDeactivatingMed(null);
      toast({
        title: "Einnahme beendet",
        description: `${deactivatingMed.name} wurde deaktiviert`,
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async (med: Med) => {
    setReactivatingMedId(med.id);
    try {
      const today = new Date().toISOString().split("T")[0];

      // Start new phase
      await startPhase.mutateAsync({
        medicationId: med.id,
        startDate: today,
      });

      // Update medication status
      await updateMed.mutateAsync({
        id: med.id,
        input: {
          is_active: true,
          end_date: null,
          start_date: today,
        },
      });

      toast({
        title: "Medikament reaktiviert",
        description: `${med.name} ist wieder aktiv`,
      });

      // Switch to active tab
      setActiveTab("active");
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReactivatingMedId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PDF Generation
  // ─────────────────────────────────────────────────────────────────────────

  const generatePdfWithDoctors = async (selectedDoctors: Doctor[], options?: PdfExportOptions) => {
    setIsGeneratingPdf(true);
    try {
      // Combine active, intolerance, and inactive meds based on options
      let medsForPdf = [...activeMedications];
      
      // Add intolerance meds if requested
      if (options?.includeIntolerance) {
        const intoleranceMedsNotInActive = intoleranceMeds.filter(m => !activeMedications.some(a => a.id === m.id));
        medsForPdf = [...medsForPdf, ...intoleranceMedsNotInActive];
      }
      
      // Add inactive meds if requested
      if (options?.includeInactive) {
        const inactiveMedsNotIncluded = inactiveMedications.filter(m => !medsForPdf.some(a => a.id === m.id));
        medsForPdf = [...medsForPdf, ...inactiveMedsNotIncluded];
      }

      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: courses || [],
        userMedications: medsForPdf?.map(m => ({
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
          intolerance_flag: m.intolerance_flag,
          intolerance_notes: m.intolerance_notes,
          intolerance_reason_type: m.intolerance_reason_type,
          start_date: m.start_date,
          discontinued_at: m.discontinued_at,
          medication_status: m.medication_status,
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
        options,
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

  const handleGenerateMedicationPlan = () => {
    const hasMedications = (courses && courses.length > 0) || activeMedications.length > 0;

    if (!hasMedications) {
      toast({
        title: "Keine Medikamente vorhanden",
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
        variant: "destructive",
      });
      return;
    }

    setShowExportDialog(true);
  };

  const handleExportConfirm = async (options: PdfExportOptions) => {
    setShowExportDialog(false);

    if (doctors && doctors.length > 1) {
      setPendingExportOptions(options);
      setShowDoctorSelection(true);
      return;
    }

    await generatePdfWithDoctors(doctors || [], options);
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    await generatePdfWithDoctors(selectedDoctors, pendingExportOptions);
    setPendingExportOptions(undefined);
  };

  const totalActiveMedications = (courses?.filter(c => c.is_active)?.length || 0) + activeMedications.length;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (medsLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PDF Button */}
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
                    : `${totalActiveMedications} aktive Medikamente`}
                </div>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>

      {/* Medications Card with Tabs */}
      <Card className={cn("p-6", isMobile && "p-4")}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className={cn("text-lg font-medium flex items-center gap-2", isMobile && "text-base")}>
            <Pill className="h-5 w-5" />
            Medikamente verwalten
          </h2>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "inactive")}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="active" className="flex-1">
              Aktiv
              <Badge variant="secondary" className="ml-2 text-xs">
                {activeMedications.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="inactive" className="flex-1">
              Inaktiv / Verlauf
              <Badge variant="outline" className="ml-2 text-xs">
                {inactiveMedications.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* ACTIVE TAB */}
          <TabsContent value="active" className="space-y-5 mt-0">
            {/* Add medication input */}
            <div className="flex gap-2">
              <Input
                placeholder="Neues Medikament hinzufügen..."
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMedication()}
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

            {/* Regular Medications */}
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
                      onDeactivate={handleDeactivateClick}
                      onDelete={handleDeleteMedication}
                      onReminderClick={(m) => setReminderMed(m)}
                      isDeleting={deleteMed.isPending}
                      isMobile={isMobile}
                      variant="active"
                      reminderStatus={reminderStatusMap.get(med.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* As-Needed Medications */}
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
                    onDeactivate={handleDeactivateClick}
                    onDelete={handleDeleteMedication}
                    onReminderClick={(m) => setReminderMed(m)}
                    isDeleting={deleteMed.isPending}
                    isMobile={isMobile}
                    variant="active"
                    reminderStatus={reminderStatusMap.get(med.id)}
                  />
                ))}

                {asNeededMedications.length === 0 && regularMedications.length === 0 && (
                  <p className={cn("text-center text-muted-foreground py-4", isMobile && "text-sm")}>
                    Noch keine Medikamente hinzugefügt
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* INACTIVE TAB */}
          <TabsContent value="inactive" className="space-y-4 mt-0">
            {inactiveMedications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Keine abgesetzten Medikamente
              </p>
            ) : (
              <div className="space-y-2">
                {inactiveMedications.map((med) => (
                  <MedicationListItem
                    key={med.id}
                    med={med}
                    onEdit={setEditingMed}
                    onReactivate={handleReactivate}
                    onDelete={handleDeleteMedication}
                    isDeleting={deleteMed.isPending}
                    isMobile={isMobile}
                    variant="inactive"
                    latestPhase={phasesByMedId.get(med.id)}
                    isReactivating={reactivatingMedId === med.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Modals & Sheets */}
      <MedicationEditModal
        medication={editingMed}
        open={!!editingMed}
        onOpenChange={(open) => !open && setEditingMed(null)}
      />

      <MedicationDeactivateSheet
        open={!!deactivatingMed}
        onOpenChange={(open) => !open && setDeactivatingMed(null)}
        medication={deactivatingMed}
        onConfirm={handleDeactivateConfirm}
        isLoading={endPhase.isPending || updateMed.isPending}
      />

      <MedicationPlanExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        onExport={handleExportConfirm}
        intoleranceMeds={intoleranceMeds}
        inactiveMeds={inactiveMedications}
      />

      <DoctorSelectionDialog
        open={showDoctorSelection}
        onClose={() => setShowDoctorSelection(false)}
        doctors={doctors || []}
        onConfirm={handleDoctorSelectionConfirm}
        title="Arzt für Medikationsplan auswählen"
        description="Wählen Sie die Ärzte aus, deren Kontaktdaten im Medikationsplan erscheinen sollen."
      />

      {reminderMed && (
        <MedicationReminderSheet
          isOpen={!!reminderMed}
          onClose={() => setReminderMed(null)}
          medication={reminderMed}
          reminderStatus={reminderStatusMap.get(reminderMed.id) || {
            hasReminder: false,
            isActive: false,
            reminderCount: 0,
            reminders: [],
            nextTriggerDate: null,
            isIntervalMed: false,
            repeatType: null,
          }}
        />
      )}
    </div>
  );
};
