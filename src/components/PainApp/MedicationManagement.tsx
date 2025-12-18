import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeds, useAddMed, useDeleteMed, type Med, type CreateMedInput } from "@/features/meds/hooks/useMeds";
import { useCreateReminder } from "@/features/reminders/hooks/useReminders";
import { useMedicationsReminderMap, useCoursesReminderMap, type MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";
import { parseMedicationInput, parsedToMedInput } from "@/lib/utils/parseMedicationInput";
import { Pill, Plus, Pencil, Trash2, Bell, BellOff, ArrowLeft, Clock, AlertTriangle, Download, Loader2, Ban, History, ChevronDown, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MedicationReminderSheet } from "@/components/Reminders/MedicationReminderSheet";
import { MedicationEditModal } from "./MedicationEditModal";

import { MedicationCoursesList, MedicationCourseCard } from "./MedicationCourses";
import type { MedicationCourse } from "@/features/medication-courses";
import { format } from "date-fns";
import type { ReminderRepeat } from "@/types/reminder.types";
import { buildMedicationPlanPdf, type PdfExportOptions } from "@/lib/pdf/medicationPlan";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { isBrowserSttSupported } from "@/lib/voice/sttConfig";

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
  reminderStatus?: MedicationReminderStatus;
  onEdit: () => void;
  onDelete: () => void;
  onReminder: () => void;
}> = ({ med, reminderStatus, onEdit, onDelete, onReminder }) => {
  const isInactive = med.is_active === false || !!med.discontinued_at || med.intolerance_flag;
  const hasActiveReminder = reminderStatus?.isActive ?? false;
  const isIntervalMed = reminderStatus?.isIntervalMed ?? false;
  
  // Format next trigger date for interval meds
  const formatNextDate = () => {
    if (!reminderStatus?.nextTriggerDate) return null;
    return format(reminderStatus.nextTriggerDate, 'dd.MM.yyyy');
  };
  
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
            {/* Mini-line for interval medications (Ajovy, etc.) */}
            {!isInactive && isIntervalMed && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight mt-1">
                {hasActiveReminder ? (
                  <>
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span>Erinnerung aktiv{formatNextDate() && ` · nächste: ${formatNextDate()}`}</span>
                  </>
                ) : (
                  <>
                    <BellOff className="h-3.5 w-3.5" />
                    <span>Keine Erinnerung eingerichtet</span>
                  </>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {!isInactive && (
              <Button
                variant={hasActiveReminder ? "secondary" : "ghost"}
                size="icon"
                onClick={onReminder}
                title={hasActiveReminder ? "Erinnerung aktiv" : "Erinnerung einrichten"}
                className={cn(
                  "h-10 w-10",
                  hasActiveReminder && "bg-primary/10 hover:bg-primary/20"
                )}
              >
                {hasActiveReminder ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
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
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationCourses } = useMedicationCourses();
  const { data: medicationLimits } = useMedicationLimits();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const createReminder = useCreateReminder();
  
  // Get reminder status for all medications and courses
  const reminderStatusMap = useMedicationsReminderMap(medications || []);
  const courseReminderMap = useCoursesReminderMap(medicationCourses?.filter(c => c.is_active) || []);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showCourseReminderModal, setShowCourseReminderModal] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Collapsible sections state
  const [showInactive, setShowInactive] = useState(false);
  const [showIntolerance, setShowIntolerance] = useState(true);
  
  const [selectedMedication, setSelectedMedication] = useState<Med | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<MedicationCourse | null>(null);
  const [medicationName, setMedicationName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Remember user preference for "edit after add" in localStorage
  const [editAfterAdd, setEditAfterAdd] = useState(() => {
    const stored = localStorage.getItem('med-edit-after-add');
    return stored === 'true';
  });
  
  const handleEditAfterAddChange = (checked: boolean) => {
    setEditAfterAdd(checked);
    localStorage.setItem('med-edit-after-add', String(checked));
  };

  // Voice input for medication name
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { state: voiceState, startRecording, stopRecording, resetTranscript } = useSpeechRecognition({
    language: "de-DE",
    continuous: false,
    pauseThreshold: 2,
    onTranscriptReady: (transcript) => {
      if (transcript.trim()) {
        setMedicationName(transcript.trim());
        // Focus input after voice input
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    onError: (error) => {
      setVoiceError(error);
      setTimeout(() => setVoiceError(null), 4000);
    }
  });

  const handleVoiceClick = async () => {
    if (!isBrowserSttSupported()) {
      setVoiceError("Spracheingabe nicht verfügbar. Bitte tippe den Namen ein.");
      setTimeout(() => setVoiceError(null), 4000);
      return;
    }
    
    if (voiceState.isRecording) {
      stopRecording();
    } else {
      setVoiceError(null);
      resetTranscript();
      await startRecording();
    }
  };

  // Categorize medications
  const categorizedMeds = useMemo(() => {
    if (!medications) return { regular: [], onDemand: [], inactive: [], intolerant: [] };
    
    const regular: Med[] = [];
    const onDemand: Med[] = [];
    const inactive: Med[] = [];
    const intolerant: Med[] = [];
    
    for (const med of medications) {
      // Unverträglichkeiten immer separat
      if (med.intolerance_flag) {
        intolerant.push(med);
        continue;
      }
      
      // Inaktiv = is_active === false ODER hat ein Enddatum (end_date)
      const isInactive = med.is_active === false || !!med.discontinued_at || !!med.end_date;
      
      if (isInactive) {
        inactive.push(med);
      } else if (
        med.intake_type === "regular" || 
        med.art === "prophylaxe" || 
        med.art === "regelmaessig"
      ) {
        regular.push(med);
      } else {
        onDemand.push(med);
      }
    }
    
    // Sortierung: alphabetisch nach Name (A-Z) für aktive Medikamente
    const sortByName = (a: Med, b: Med) => a.name.localeCompare(b.name, 'de');
    regular.sort(sortByName);
    onDemand.sort(sortByName);
    intolerant.sort(sortByName);
    
    // Inaktive: nach Enddatum absteigend (neueste zuerst), dann nach Startdatum
    inactive.sort((a, b) => {
      const endA = a.end_date || a.discontinued_at || '';
      const endB = b.end_date || b.discontinued_at || '';
      if (endA && endB) return endB.localeCompare(endA);
      if (endA) return -1;
      if (endB) return 1;
      // Fallback: Startdatum absteigend
      const startA = a.start_date || '';
      const startB = b.start_date || '';
      return startB.localeCompare(startA);
    });
    
    return { regular, onDemand, inactive, intolerant };
  }, [medications]);

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

  // Direct PDF generation without modal
  const handleGenerateMedicationPlan = async () => {
    const activeMeds = medications?.filter(m => m.is_active !== false && !m.intolerance_flag) || [];
    const hasMedications = (medicationCourses && medicationCourses.length > 0) || activeMeds.length > 0;
    
    if (!hasMedications) {
      toast.error("Keine Medikamente vorhanden", {
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
      });
      return;
    }

    // If multiple doctors, show selection dialog first
    if (doctors && doctors.length > 1) {
      setShowDoctorSelection(true);
      return;
    }

    // Otherwise generate directly
    await generatePdfDirectly(doctors || []);
  };

  const generatePdfDirectly = async (selectedDoctors: Doctor[]) => {
    const options: PdfExportOptions = {
      includeActive: true,
      includeInactive: false,
      includeIntolerance: true,
      includeLimits: true,
    };
    
    setIsGeneratingPdf(true);
    try {
      await generatePdfWithOptions(selectedDoctors, options);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    await generatePdfDirectly(selectedDoctors);
  };

  const handleAddMedication = async () => {
    const rawInput = medicationName.trim();
    
    if (!rawInput) {
      toast.error("Bitte geben Sie einen Medikamentennamen ein");
      return;
    }

    if (rawInput.length > 200) {
      toast.error("Eingabe darf maximal 200 Zeichen lang sein");
      return;
    }

    // Parse the input to extract structured medication info
    const parsed = parseMedicationInput(rawInput);
    
    if (!parsed.displayName) {
      toast.error("Medikamentenname konnte nicht erkannt werden");
      return;
    }

    // Validate extracted display name
    if (!/^[a-zA-ZäöüÄÖÜß0-9\s\-/().µ]+$/.test(parsed.displayName)) {
      toast.error("Medikamentenname enthält ungültige Zeichen.");
      return;
    }

    try {
      // Convert parsed info to medication input
      const medInput: CreateMedInput = {
        ...parsedToMedInput(parsed),
        // Set art based on isPrn
        art: parsed.isPrn ? "bedarf" : (parsed.frequencyPerDay && parsed.frequencyPerDay > 0 ? "regelmaessig" : "bedarf"),
      };
      
      const newMed = await addMed.mutateAsync(medInput);
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

  const openCourseReminderDialog = (course: MedicationCourse) => {
    setSelectedCourse(course);
    setShowCourseReminderModal(true);
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

  // Kategorisiere medication_courses: aktive vs. inaktive
  const activeCourses = medicationCourses?.filter(c => c.is_active) || [];
  const inactiveCourses = medicationCourses?.filter(c => !c.is_active) || [];
  
  // Sortiere aktive Courses alphabetisch
  const sortedActiveCourses = [...activeCourses].sort((a, b) => 
    a.medication_name.localeCompare(b.medication_name, 'de')
  );
  
  // Sortiere inaktive Courses nach Enddatum absteigend
  const sortedInactiveCourses = [...inactiveCourses].sort((a, b) => {
    const endA = a.end_date || '';
    const endB = b.end_date || '';
    if (endA && endB) return endB.localeCompare(endA);
    if (endA) return -1;
    if (endB) return 1;
    return (b.start_date || '').localeCompare(a.start_date || '');
  });

  const totalActive = categorizedMeds.regular.length + categorizedMeds.onDemand.length + activeCourses.length;

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
            disabled={isGeneratingPdf}
            className="w-full h-auto py-4 px-5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg"
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
                <div className="font-bold text-lg">
                  {isGeneratingPdf ? "PDF wird erstellt..." : "Medikationsplan (PDF) erstellen"}
                </div>
                <div className="opacity-90 font-normal text-sm">
                  Für Arzt, Krankenhaus oder Notfall
                </div>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>

      {/* Add Button */}
      <Button 
        onClick={() => setShowAddDialog(true)}
        className="w-full"
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Neues Medikament hinzufügen
      </Button>

      {/* ========== AKTUELLE MEDIKAMENTE ========== */}
      {(totalActive > 0 || categorizedMeds.intolerant.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Aktuelle Medikamente
          </h2>

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
                    reminderStatus={reminderStatusMap.get(med.id)}
                    onEdit={() => openEditModal(med)}
                    onDelete={() => openDeleteDialog(med)}
                    onReminder={() => {}}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Regelmäßige Medikamente (user_medications + aktive medication_courses) */}
          {(categorizedMeds.regular.length > 0 || sortedActiveCourses.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-muted-foreground">
                Regelmäßige Medikamente ({categorizedMeds.regular.length + sortedActiveCourses.length})
              </h3>
              {/* Aktive medication_courses (Prophylaxe wie Ajovy) */}
              {sortedActiveCourses.map((course) => (
                <MedicationCourseCard
                  key={course.id}
                  course={course}
                  reminderStatus={courseReminderMap.get(course.id)}
                  onEdit={(c) => {
                    // Öffne Course Wizard - wird durch MedicationCoursesList gehandhabt
                  }}
                  onDelete={(c) => {
                    // Löschen wird durch MedicationCoursesList gehandhabt
                  }}
                  onReminder={(c) => openCourseReminderDialog(c)}
                />
              ))}
              {/* Reguläre Medikamente aus user_medications */}
              {categorizedMeds.regular.map((med) => (
                <MedicationCard
                  key={med.id}
                  med={med}
                  reminderStatus={reminderStatusMap.get(med.id)}
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
              <h3 className="text-base font-semibold text-muted-foreground">
                Bedarfsmedikation ({categorizedMeds.onDemand.length})
              </h3>
              {categorizedMeds.onDemand.map((med) => (
                <MedicationCard
                  key={med.id}
                  med={med}
                  reminderStatus={reminderStatusMap.get(med.id)}
                  onEdit={() => openEditModal(med)}
                  onDelete={() => openDeleteDialog(med)}
                  onReminder={() => openReminderDialog(med)}
                />
              ))}
            </div>
          )}
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

      {/* Dezenter Link zu Grenzen & Warnungen */}
      {onNavigateToLimits && (
        <div className="flex justify-center pt-4 pb-2">
          <Button
            variant="link"
            className="text-muted-foreground hover:text-foreground text-xs h-auto py-1"
            onClick={onNavigateToLimits}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Grenzen & Warnungen öffnen
          </Button>
        </div>
      )}

      {/* ========== VERGANGENE MEDIKAMENTE & BEHANDLUNGEN ========== */}
      {(categorizedMeds.inactive.length > 0 || sortedInactiveCourses.length > 0) && (
        <>
          <Separator className="my-4" />
          <Collapsible open={showInactive} onOpenChange={setShowInactive}>
            <CollapsibleTrigger asChild>
              <Card className="border-muted cursor-pointer hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <History className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold text-muted-foreground">
                          Vergangene Medikamente & Behandlungen ({categorizedMeds.inactive.length + sortedInactiveCourses.length})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-7">
                        Frühere Medikamente und abgesetzte Prophylaxen für Arztberichte.
                      </p>
                    </div>
                    <ChevronDown className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform shrink-0",
                      showInactive && "rotate-180"
                    )} />
                  </div>
                </CardContent>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-3">
              {/* Abgesetzte Medikamente aus user_medications */}
              {categorizedMeds.inactive.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Abgesetzte Medikamente</h4>
                  {categorizedMeds.inactive.map((med) => (
                    <MedicationCard
                      key={med.id}
                      med={med}
                      reminderStatus={reminderStatusMap.get(med.id)}
                      onEdit={() => openEditModal(med)}
                      onDelete={() => openDeleteDialog(med)}
                      onReminder={() => {}}
                    />
                  ))}
                </div>
              )}

              {/* Inaktive medication_courses (frühere Behandlungen) */}
              {sortedInactiveCourses.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Frühere Behandlungen</h4>
                  {sortedInactiveCourses.map((course) => (
                    <MedicationCourseCard
                      key={course.id}
                      course={course}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* Add Dialog - Simplified for users with headaches */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open && voiceState.isRecording) {
          stopRecording();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Neues Medikament</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Main Input with Voice Button */}
            <div className="space-y-3">
              <Label htmlFor="med-name" className="text-base font-medium">
                Name des Medikaments
              </Label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="med-name"
                  placeholder="z.B. Ibuprofen 400 mg"
                  value={voiceState.isRecording ? voiceState.transcript || medicationName : medicationName}
                  onChange={(e) => setMedicationName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !addMed.isPending && medicationName.trim() && handleAddMedication()}
                  autoFocus
                  className="h-12 text-base pr-12"
                  disabled={voiceState.isRecording}
                />
                <button
                  type="button"
                  onClick={handleVoiceClick}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md transition-colors",
                    voiceState.isRecording 
                      ? "text-destructive bg-destructive/10 animate-pulse" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  aria-label={voiceState.isRecording ? "Aufnahme stoppen" : "Per Sprache eingeben"}
                >
                  {voiceState.isRecording ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>
              </div>
              
              {/* Voice recording hint */}
              {voiceState.isRecording && (
                <p className="text-sm text-primary/80 animate-pulse">
                  Sprich jetzt den Namen des Medikaments, z.B. „Ibuprofen 400 Milligramm".
                </p>
              )}
              
              {/* Voice error message */}
              {voiceError && (
                <p className="text-sm text-muted-foreground/80">
                  {voiceError}
                </p>
              )}
              
            </div>
            
            {/* Optional: Edit after add - minimal switch row */}
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
                className="text-sm text-muted-foreground cursor-pointer flex-1 font-normal"
              >
                Direkt Details bearbeiten
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
                resetTranscript();
                setVoiceError(null);
              }}
              className="flex-1 h-12 text-base text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddMedication} 
              disabled={!medicationName.trim() || addMed.isPending || voiceState.isRecording}
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
              {selectedMedication && reminderStatusMap.get(selectedMedication.id)?.isActive && (
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

      {/* Doctor Selection Dialog */}
      <DoctorSelectionDialog
        open={showDoctorSelection}
        onClose={() => setShowDoctorSelection(false)}
        doctors={doctors || []}
        onConfirm={handleDoctorSelectionConfirm}
        title="Arzt für Medikationsplan auswählen"
        description="Wählen Sie die Ärzte aus, deren Kontaktdaten im Medikationsplan erscheinen sollen."
      />

      {/* Medication Reminder Sheet */}
      <MedicationReminderSheet
        isOpen={showReminderModal}
        onClose={() => {
          setShowReminderModal(false);
          setSelectedMedication(null);
        }}
        medication={selectedMedication}
        reminderStatus={selectedMedication ? reminderStatusMap.get(selectedMedication.id) : undefined}
      />

      {/* Course Reminder Sheet (for Prophylaxis like Ajovy) */}
      <MedicationReminderSheet
        isOpen={showCourseReminderModal}
        onClose={() => {
          setShowCourseReminderModal(false);
          setSelectedCourse(null);
        }}
        medication={null}
        medicationName={selectedCourse?.medication_name}
        reminderStatus={selectedCourse ? courseReminderMap.get(selectedCourse.id) : undefined}
        isProphylaxis={true}
      />
    </div>
  );
};
