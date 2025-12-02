import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeds, useAddMed, useDeleteMed } from "@/features/meds/hooks/useMeds";
import { useReminders, useCreateReminder } from "@/features/reminders/hooks/useReminders";
import { Pill, Plus, Pencil, Trash2, Bell, ArrowLeft, Clock, AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { MedicationReminderModal } from "@/components/Reminders/MedicationReminderModal";
import { MedicationCoursesList } from "./MedicationCourses";
import { format, addMinutes } from "date-fns";
import type { ReminderRepeat } from "@/types/reminder.types";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";

interface MedicationManagementProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
}

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
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  
  const [selectedMedication, setSelectedMedication] = useState<any>(null);
  const [medicationName, setMedicationName] = useState("");

  // Get reminders count for a medication
  const getMedicationRemindersCount = (medName: string) => {
    return reminders?.filter(r => 
      r.type === 'medication' && 
      r.medications?.includes(medName) &&
      r.status === 'pending'
    ).length || 0;
  };

  // PDF Generation
  const generatePdfWithDoctors = async (selectedDoctors: Doctor[]) => {
    const activeMeds = medications?.filter(m => m.is_active !== false) || [];
    
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: medicationCourses || [],
        userMedications: activeMeds.map(m => ({
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

      toast.success("Medikationsplan erstellt", {
        description: "Das PDF wurde heruntergeladen.",
      });
    } catch (error) {
      console.error("Error generating medication plan:", error);
      toast.error("Fehler beim Erstellen", {
        description: "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleGenerateMedicationPlan = async () => {
    const activeMeds = medications?.filter(m => m.is_active !== false) || [];
    const hasMedications = (medicationCourses && medicationCourses.length > 0) || activeMeds.length > 0;
    
    if (!hasMedications) {
      toast.error("Keine Medikamente vorhanden", {
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
      });
      return;
    }

    if (doctors && doctors.length > 1) {
      setShowDoctorSelection(true);
      return;
    }

    await generatePdfWithDoctors(doctors || []);
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    await generatePdfWithDoctors(selectedDoctors);
  };

  const handleAddMedication = async () => {
    const trimmedName = medicationName.trim();
    
    if (!trimmedName) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    // Validate medication name
    if (trimmedName.length > 100) {
      toast.error("Medikamentenname darf maximal 100 Zeichen lang sein");
      return;
    }

    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/.test(trimmedName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt.");
      return;
    }

    try {
      await addMed.mutateAsync(trimmedName);
      toast.success("Medikament hinzugefügt");
      setMedicationName("");
      setShowAddDialog(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[MedicationManagement] Add medication error:', error);
      }
      toast.error("Fehler beim Hinzufügen des Medikaments. Bitte versuchen Sie es erneut.");
    }
  };

  const handleEditMedication = async () => {
    const trimmedName = medicationName.trim();
    
    if (!trimmedName || !selectedMedication) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    // Validate medication name
    if (trimmedName.length > 100) {
      toast.error("Medikamentenname darf maximal 100 Zeichen lang sein");
      return;
    }

    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().]+$/.test(trimmedName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen. Nur Buchstaben, Zahlen und -/() sind erlaubt.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sie sind nicht angemeldet.");
        return;
      }
      
      const { error } = await supabase
        .from("user_medications")
        .update({ name: trimmedName })
        .eq("id", selectedMedication.id)
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast.success("Medikament aktualisiert");
      setMedicationName("");
      setSelectedMedication(null);
      setShowEditDialog(false);
      
      // Invalidate query to refresh list
      await addMed.mutateAsync(""); // Trigger refetch
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[MedicationManagement] Edit medication error:', error);
      }
      toast.error("Fehler beim Aktualisieren des Medikaments. Bitte versuchen Sie es erneut.");
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

  const openEditDialog = (med: any) => {
    setSelectedMedication(med);
    setMedicationName(med.name);
    setShowEditDialog(true);
  };

  const openDeleteDialog = (med: any) => {
    setSelectedMedication(med);
    setShowDeleteDialog(true);
  };

  const openReminderDialog = (med: any) => {
    setSelectedMedication(med);
    setShowReminderModal(true);
  };

  const handleCreateReminders = async (reminders: {
    time: string;
    repeat: ReminderRepeat;
    notification_enabled: boolean;
  }[]) => {
    if (!selectedMedication) return;

    try {
      // Create reminders for each time slot
      for (const reminderData of reminders) {
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

      const count = reminders.length;
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
          <p className="text-sm text-muted-foreground">Ihre Medikamente und Erinnerungen</p>
        </div>
      </div>

      {/* PROMINENT: Medikationsplan PDF Button - TOP ACTION */}
      <Card className="border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5 hover:border-primary/60 transition-all duration-200">
        <CardContent className="p-4">
          <Button
            onClick={handleGenerateMedicationPlan}
            disabled={isGeneratingPdf}
            className="w-full h-auto py-4 px-5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg"
          >
            {isGeneratingPdf ? (
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="font-bold text-lg">PDF wird erstellt...</span>
              </div>
            ) : (
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
            )}
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

      {/* Medications List */}
      <div className="space-y-3">
        {medications && medications.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Pill className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Noch keine Medikamente hinzugefügt</p>
              <p className="text-sm mt-1">Fügen Sie Ihr erstes Medikament hinzu</p>
            </CardContent>
          </Card>
        ) : (
          medications?.map((med) => {
            const reminderCount = getMedicationRemindersCount(med.name);
            
            return (
              <Card key={med.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill className="h-5 w-5 text-primary shrink-0" />
                        <h3 className="font-semibold text-sm leading-tight line-clamp-2 break-words">{med.name}</h3>
                      </div>
                      {reminderCount > 0 && (
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground leading-tight">
                          <Clock className="h-5 w-5" />
                          <span>{reminderCount} aktive Erinnerung{reminderCount !== 1 ? 'en' : ''}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openReminderDialog(med)}
                        title="Erinnerungen verwalten"
                        className="h-10 w-10"
                      >
                        <Bell className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(med)}
                        title="Bearbeiten"
                        className="h-10 w-10"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(med)}
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
          })
        )}
      </div>

      {/* Medication Courses Section */}
      <Separator className="my-6" />
      <MedicationCoursesList />

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Medikament hinzufügen</DialogTitle>
            <DialogDescription>
              Geben Sie den Namen des Medikaments ein
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="med-name">Medikamentenname</Label>
              <Input
                id="med-name"
                placeholder="z.B. Ibuprofen 400mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMedication()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setMedicationName("");
            }}>
              Abbrechen
            </Button>
            <Button onClick={handleAddMedication} disabled={!medicationName.trim()}>
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Medikament bearbeiten</DialogTitle>
            <DialogDescription>
              Ändern Sie den Namen des Medikaments
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-med-name">Medikamentenname</Label>
              <Input
                id="edit-med-name"
                placeholder="z.B. Ibuprofen 400mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditMedication()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setMedicationName("");
              setSelectedMedication(null);
            }}>
              Abbrechen
            </Button>
            <Button onClick={handleEditMedication} disabled={!medicationName.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
