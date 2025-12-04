import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeds, useAddMed, useDeleteMed, type Med } from "@/features/meds/hooks/useMeds";
import { useReminders, useCreateReminder } from "@/features/reminders/hooks/useReminders";
import { Pill, Plus, Pencil, Trash2, Bell, ArrowLeft, Clock, AlertTriangle, Download, Loader2, Ban, History, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MedicationReminderModal } from "@/components/Reminders/MedicationReminderModal";
import { MedicationEditModal } from "./MedicationEditModal";
import { MedicationPlanExportDialog } from "./MedicationPlanExportDialog";
import { MedicationCoursesList } from "./MedicationCourses";
import { format } from "date-fns";
import type { ReminderRepeat } from "@/types/reminder.types";
import { buildMedicationPlanPdf, type PdfExportOptions } from "@/lib/pdf/medicationPlan";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";
import { cn } from "@/lib/utils";

interface MedicationManagementProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
}

// Helper: Get badge for medication type - only show when explicitly set
const getMedicationBadge = (med: Med) => {
  if (med.intolerance_flag) {
    return <Badge variant="destructive" className="text-xs">Unverträglich</Badge>;
  }
  if (med.is_active === false || med.discontinued_at) {
    return <Badge variant="secondary" className="text-xs">Abgesetzt</Badge>;
  }
  if (med.art === "prophylaxe" || med.art === "regelmaessig") {
    return <Badge variant="default" className="text-xs bg-primary/80">Regelmäßig</Badge>;
  }
  // "Bei Bedarf" wird nicht als Badge angezeigt - Gruppierung zeigt die Kategorie bereits
  if (med.art === "akut") {
    return <Badge variant="outline" className="text-xs">Akut</Badge>;
  }
  if (med.art === "notfall") {
    return <Badge variant="destructive" className="text-xs">Notfall</Badge>;
  }
  // Kein Badge wenn keine art gesetzt
  return null;
};

// Medication Card Component
const MedicationCard: React.FC<{
  med: Med;
  reminderCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onReminder: () => void;
}> = ({ med, reminderCount, onEdit, onDelete, onReminder }) => {
  const isInactive = med.is_active === false || !!med.discontinued_at || med.intolerance_flag;
  
  return (
    <Card className={cn(
      "hover:shadow-md transition-shadow",
      isInactive && "opacity-70",
      med.intolerance_flag && "border-destructive/30 bg-destructive/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Pill className={cn("h-5 w-5 shrink-0", med.intolerance_flag ? "text-destructive" : "text-primary")} />
              <h3 className="font-semibold text-sm leading-tight line-clamp-2 break-words">{med.name}</h3>
              {getMedicationBadge(med)}
            </div>
            {med.wirkstoff && (
              <p className="text-xs text-muted-foreground mb-1">{med.wirkstoff} {med.staerke}</p>
            )}
            {med.intolerance_notes && (
              <p className="text-xs text-destructive mt-1">⚠️ {med.intolerance_notes}</p>
            )}
            {reminderCount > 0 && !isInactive && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight mt-1">
                <Clock className="h-4 w-4" />
                <span>{reminderCount} aktive Erinnerung{reminderCount !== 1 ? 'en' : ''}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {!isInactive && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onReminder}
                title="Erinnerungen verwalten"
                className="h-10 w-10"
              >
                <Bell className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title="Bearbeiten"
              className="h-10 w-10"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Löschen"
              className="h-10 w-10"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const MedicationManagement: React.FC<MedicationManagementProps> = ({ onBack, onNavigateToLimits }) => {
  const { data: medications, isLoading } = useMeds();
  const { data: reminders } = useReminders();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationCourses } = useMedicationCourses();
  const { data: medicationLimits } = useMedicationLimits();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const createReminder = useCreateReminder();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  const [pendingExportOptions, setPendingExportOptions] = useState<PdfExportOptions | null>(null);
  
  // Collapsible sections state
  const [showInactive, setShowInactive] = useState(false);
  const [showIntolerance, setShowIntolerance] = useState(true);
  
  const [selectedMedication, setSelectedMedication] = useState<Med | null>(null);
  const [medicationName, setMedicationName] = useState("");
  
  // Remember user preference for "edit after add" in localStorage
  const [editAfterAdd, setEditAfterAdd] = useState(() => {
    const stored = localStorage.getItem('med-edit-after-add');
    return stored === 'true';
  });
  
  const handleEditAfterAddChange = (checked: boolean) => {
    setEditAfterAdd(checked);
    localStorage.setItem('med-edit-after-add', String(checked));
  };

  // Categorize medications
  const categorizedMeds = useMemo(() => {
    if (!medications) return { regular: [], onDemand: [], inactive: [], intolerant: [] };
    
    const regular: Med[] = [];
    const onDemand: Med[] = [];
    const inactive: Med[] = [];
    const intolerant: Med[] = [];
    
    for (const med of medications) {
      if (med.intolerance_flag) {
        intolerant.push(med);
      } else if (med.is_active === false || med.discontinued_at) {
        inactive.push(med);
      } else if (med.art === "prophylaxe" || med.art === "regelmaessig") {
        regular.push(med);
      } else {
        onDemand.push(med);
      }
    }
    
    return { regular, onDemand, inactive, intolerant };
  }, [medications]);

  // Get reminders count for a medication
  const getMedicationRemindersCount = (medName: string) => {
    return reminders?.filter(r => 
      r.type === 'medication' && 
      r.medications?.includes(medName) &&
      r.status === 'pending'
    ).length || 0;
  };

  // PDF Generation with options
  const generatePdfWithOptions = async (selectedDoctors: Doctor[], options: PdfExportOptions) => {
    const allMeds = medications || [];
    
    try {
      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: medicationCourses || [],
        userMedications: allMeds.map(m => ({
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
          discontinued_at: m.discontinued_at,
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

      toast.success("Medikationsplan erstellt", {
        description: "Das PDF wurde heruntergeladen.",
      });
    } catch (error) {
      console.error("Error generating medication plan:", error);
      toast.error("Fehler beim Erstellen", {
        description: "Bitte versuchen Sie es erneut.",
      });
    }
  };

  // Handler for export dialog
  const handleExportWithOptions = async (options: PdfExportOptions) => {
    // Check if we need doctor selection
    if (doctors && doctors.length > 1) {
      setPendingExportOptions(options);
      setShowDoctorSelection(true);
      return;
    }
    
    await generatePdfWithOptions(doctors || [], options);
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    const options = pendingExportOptions || {
      includeActive: true,
      includeInactive: false,
      includeIntolerance: true,
      includeLimits: false,
      includeGrund: true,
    };
    setPendingExportOptions(null);
    await generatePdfWithOptions(selectedDoctors, options);
  };

  const handleGenerateMedicationPlan = () => {
    const activeMeds = medications?.filter(m => m.is_active !== false && !m.intolerance_flag) || [];
    const hasMedications = (medicationCourses && medicationCourses.length > 0) || activeMeds.length > 0;
    
    if (!hasMedications) {
      toast.error("Keine Medikamente vorhanden", {
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
      });
      return;
    }

    setShowExportDialog(true);
  };

  const handleAddMedication = async () => {
    const trimmedName = medicationName.trim();
    
    if (!trimmedName) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    if (trimmedName.length > 100) {
      toast.error("Medikamentenname darf maximal 100 Zeichen lang sein");
      return;
    }

    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/.test(trimmedName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen.");
      return;
    }

    try {
      const newMed = await addMed.mutateAsync(trimmedName);
      setMedicationName("");
      setShowAddDialog(false);
      
      if (editAfterAdd && newMed) {
        setSelectedMedication(newMed);
        setShowEditModal(true);
        toast.success("Medikament hinzugefügt – Details bearbeiten");
      } else {
        toast.success("Medikament hinzugefügt");
      }
    } catch (error) {
      toast.error("Fehler beim Hinzufügen des Medikaments.");
    }
  };

  const handleDeleteMedication = async () => {
    if (!selectedMedication) return;

    try {
      await deleteMed.mutateAsync(selectedMedication.name);
      toast.success("Medikament gelöscht");
      setSelectedMedication(null);
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("Fehler beim Löschen des Medikaments");
    }
  };

  const openEditModal = (med: Med) => {
    setSelectedMedication(med);
    setShowEditModal(true);
  };

  const openDeleteDialog = (med: Med) => {
    setSelectedMedication(med);
    setShowDeleteDialog(true);
  };

  const openReminderDialog = (med: Med) => {
    setSelectedMedication(med);
    setShowReminderModal(true);
  };

  const handleCreateReminders = async (remindersData: {
    time: string;
    repeat: ReminderRepeat;
    notification_enabled: boolean;
  }[]) => {
    if (!selectedMedication) return;

    try {
      for (const reminderData of remindersData) {
        const today = format(new Date(), 'yyyy-MM-dd');
        const dateTime = `${today}T${reminderData.time}:00`;
        
        await createReminder.mutateAsync({
          type: 'medication',
          title: selectedMedication.name,
          date_time: dateTime,
          repeat: reminderData.repeat,
          notification_enabled: reminderData.notification_enabled,
          medications: [selectedMedication.name],
        });
      }

      const count = remindersData.length;
      toast.success(`${count} Erinnerung${count > 1 ? 'en' : ''} erstellt`);
    } catch (error) {
      toast.error("Fehler beim Erstellen der Erinnerungen");
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const totalActive = categorizedMeds.regular.length + categorizedMeds.onDemand.length;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Medikamente verwalten</h1>
          <p className="text-sm text-muted-foreground">
            {totalActive} aktive Medikamente
          </p>
        </div>
      </div>

      {/* PROMINENT: Medikationsplan PDF Button */}
      <Card className="border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5 hover:border-primary/60 transition-all duration-200">
        <CardContent className="p-4">
          <Button
            onClick={handleGenerateMedicationPlan}
            className="w-full h-auto py-4 px-5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg"
          >
            <div className="flex items-center gap-4 w-full">
              <div className="p-2.5 rounded-xl bg-primary-foreground/20 shrink-0">
                <Download className="h-6 w-6" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-lg">Medikationsplan (PDF) erstellen</div>
                <div className="opacity-90 font-normal text-sm">
                  Für Arzt, Krankenhaus oder Notfall
                </div>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>

      {/* Cross-Link to Limits */}
      {onNavigateToLimits && (
        <Card 
          className="border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-all"
          onClick={onNavigateToLimits}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-lg font-semibold">Medikamenten-Übergebrauch vermeiden</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Setze Limits und überwache deine Einnahme
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Button */}
      <Button 
        onClick={() => setShowAddDialog(true)}
        className="w-full"
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Neues Medikament hinzufügen
      </Button>

      {/* Unverträglichkeiten Section */}
      {categorizedMeds.intolerant.length > 0 && (
        <Collapsible open={showIntolerance} onOpenChange={setShowIntolerance}>
          <CollapsibleTrigger asChild>
            <Card className="border-destructive/30 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ban className="h-5 w-5 text-destructive" />
                    <span className="font-semibold text-destructive">
                      Unverträglichkeiten ({categorizedMeds.intolerant.length})
                    </span>
                  </div>
                  <ChevronDown className={cn(
                    "h-5 w-5 text-destructive transition-transform",
                    showIntolerance && "rotate-180"
                  )} />
                </div>
              </CardContent>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-3">
            {categorizedMeds.intolerant.map((med) => (
              <MedicationCard
                key={med.id}
                med={med}
                reminderCount={0}
                onEdit={() => openEditModal(med)}
                onDelete={() => openDeleteDialog(med)}
                onReminder={() => {}}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Regelmäßige Medikation */}
      {categorizedMeds.regular.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Regelmäßige Medikation ({categorizedMeds.regular.length})
          </h2>
          {categorizedMeds.regular.map((med) => (
            <MedicationCard
              key={med.id}
              med={med}
              reminderCount={getMedicationRemindersCount(med.name)}
              onEdit={() => openEditModal(med)}
              onDelete={() => openDeleteDialog(med)}
              onReminder={() => openReminderDialog(med)}
            />
          ))}
        </div>
      )}

      {/* Bedarfsmedikation */}
      {categorizedMeds.onDemand.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Bedarfsmedikation ({categorizedMeds.onDemand.length})
          </h2>
          {categorizedMeds.onDemand.map((med) => (
            <MedicationCard
              key={med.id}
              med={med}
              reminderCount={getMedicationRemindersCount(med.name)}
              onEdit={() => openEditModal(med)}
              onDelete={() => openDeleteDialog(med)}
              onReminder={() => openReminderDialog(med)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {totalActive === 0 && categorizedMeds.intolerant.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Pill className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Noch keine Medikamente hinzugefügt</p>
            <p className="text-sm mt-1">Fügen Sie Ihr erstes Medikament hinzu</p>
          </CardContent>
        </Card>
      )}

      {/* Früher verwendete Medikamente */}
      {categorizedMeds.inactive.length > 0 && (
        <Collapsible open={showInactive} onOpenChange={setShowInactive}>
          <CollapsibleTrigger asChild>
            <Card className="border-muted cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-muted-foreground">
                      Früher verwendete Medikamente ({categorizedMeds.inactive.length})
                    </span>
                  </div>
                  <ChevronDown className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform",
                    showInactive && "rotate-180"
                  )} />
                </div>
              </CardContent>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-3">
            {categorizedMeds.inactive.map((med) => (
              <MedicationCard
                key={med.id}
                med={med}
                reminderCount={0}
                onEdit={() => openEditModal(med)}
                onDelete={() => openDeleteDialog(med)}
                onReminder={() => {}}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Medication Courses Section */}
      <Separator className="my-6" />
      <MedicationCoursesList />

      {/* Add Dialog - Simplified for users with headaches */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl">Neues Medikament</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground/90">
              Gib den Namen des Medikaments ein
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Main Input */}
            <div className="space-y-3">
              <Label htmlFor="med-name" className="text-base font-medium">
                Medikamentenname
              </Label>
              <Input
                id="med-name"
                placeholder="z.B. Ibuprofen 400mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !addMed.isPending && medicationName.trim() && handleAddMedication()}
                autoFocus
                className="h-12 text-base"
              />
              <p className="text-sm text-muted-foreground/80">
                Details wie Dosierung oder Einnahmerhythmus kannst du später ergänzen.
              </p>
            </div>
            
            {/* Optional: Edit after add - light switch row */}
            <div 
              className="flex items-center gap-3 py-2 cursor-pointer"
              onClick={() => handleEditAfterAddChange(!editAfterAdd)}
            >
              <Checkbox
                id="edit-after-add"
                checked={editAfterAdd}
                onCheckedChange={(checked) => handleEditAfterAddChange(checked === true)}
                className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label 
                htmlFor="edit-after-add" 
                className="text-xs text-muted-foreground/80 cursor-pointer flex-1 font-normal"
              >
                Details nach dem Hinzufügen öffnen
              </Label>
            </div>
          </div>
          
          {/* Footer - Clear hierarchy: Secondary left, Primary right */}
          <DialogFooter className="flex-row gap-3 sm:gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddDialog(false);
                setMedicationName("");
              }}
              className="flex-1 h-12 text-base text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddMedication} 
              disabled={!medicationName.trim() || addMed.isPending}
              className="flex-1 h-12 text-base font-medium"
            >
              {addMed.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal (Full) */}
      <MedicationEditModal
        medication={selectedMedication}
        open={showEditModal}
        onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) setSelectedMedication(null);
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Medikament löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie "{selectedMedication?.name}" wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
              {getMedicationRemindersCount(selectedMedication?.name || '') > 0 && (
                <span className="block mt-2 text-warning font-medium">
                  ⚠️ Es gibt noch aktive Erinnerungen für dieses Medikament.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedMedication(null)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMedication}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Doctor Selection Dialog */}
      {/* Export Options Dialog */}
      <MedicationPlanExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        onExport={handleExportWithOptions}
        hasInactive={categorizedMeds.inactive.length > 0}
        hasIntolerance={categorizedMeds.intolerant.length > 0}
        hasLimits={(medicationLimits?.length || 0) > 0}
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

      {/* Medication Reminder Modal */}
      {selectedMedication && (
        <MedicationReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedMedication(null);
          }}
          medicationName={selectedMedication.name}
          existingReminders={reminders?.filter(r => 
            r.type === 'medication' && 
            r.medications?.includes(selectedMedication.name)
          )}
          onSubmit={handleCreateReminders}
        />
      )}
    </div>
  );
};
