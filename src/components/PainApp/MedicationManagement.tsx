import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMeds, useAddMed, useDeleteMed, type Med, type CreateMedInput } from "@/features/meds/hooks/useMeds";
import { useCreateReminder, useCreateMultipleReminders } from "@/features/reminders/hooks/useReminders";
import { useMedicationsReminderMap, useCoursesReminderMap, type MedicationReminderStatus } from "@/features/reminders/hooks/useMedicationReminders";
import { useToggleMedicationReminders } from "@/features/reminders/hooks/useToggleMedicationReminder";
import { parseMedicationInput, parsedToMedInput } from "@/lib/utils/parseMedicationInput";
import { isPrnMedication } from "@/lib/utils/medicationReminderHeuristic";
import { Pill, Plus, Pencil, Trash2, Bell, BellOff, Clock, AlertTriangle, Download, Loader2, Ban, History, ChevronDown, Mic, MicOff } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MedicationReminderSheet } from "@/components/Reminders/MedicationReminderSheet";
import { ReminderTimePresets, getTimesForPresets, DEFAULT_TIME_PRESETS } from "@/components/Reminders/ReminderTimePresets";
import { MedicationEditModal } from "./MedicationEditModal";

import { MedicationCoursesList, MedicationCourseWizard } from "./MedicationCourses";
import type { MedicationCourse, CreateMedicationCourseInput } from "@/features/medication-courses";
import { useUpdateMedicationCourse, useDeleteMedicationCourse } from "@/features/medication-courses";
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
// MedicationLimitsCompactCard and MedicationLimitsSheet removed - Limits now has its own screen
// AccordionMedicationCard and AccordionMedicationCourseCard removed - Now using tap-to-detail pattern
import { SimpleMedicationRow } from "./SimpleMedicationRow";
import { SimpleCourseRow } from "./SimpleCourseRow";

interface MedicationManagementProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
}

// ExpandedItem type removed - no longer using accordion pattern

export const MedicationManagement: React.FC<MedicationManagementProps> = ({ onBack, onNavigateToLimits }) => {
  const { data: medications, isLoading } = useMeds();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: medicationCourses } = useMedicationCourses();
  const { data: medicationLimits } = useMedicationLimits();
  const addMed = useAddMed();
  const deleteMed = useDeleteMed();
  const createReminder = useCreateReminder();
  const createMultipleReminders = useCreateMultipleReminders();
  const toggleMedReminders = useToggleMedicationReminders();
  const updateCourse = useUpdateMedicationCourse();
  const deleteCourse = useDeleteMedicationCourse();
  
  // Track which medication is currently toggling reminders
  const [togglingReminderId, setTogglingReminderId] = useState<string | null>(null);
  
  // Get reminder status for all medications and courses
  const reminderStatusMap = useMedicationsReminderMap(medications || []);
  const courseReminderMap = useCoursesReminderMap(medicationCourses?.filter(c => c.is_active) || []);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showCourseReminderModal, setShowCourseReminderModal] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  // showLimitsSheet removed - Limits now has its own screen
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showCourseWizard, setShowCourseWizard] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MedicationCourse | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<MedicationCourse | null>(null);
  
  // Inline reminder configuration in add dialog (replaces separate prompt)
  const [reminderEnabled, setReminderEnabled] = useState(true); // Default ON for regular meds
  const [selectedReminderPresets, setSelectedReminderPresets] = useState<string[]>(['morning']); // Default: Morgens
  
  // Collapsible sections state
  const [showInactive, setShowInactive] = useState(false);
  const [showIntolerance, setShowIntolerance] = useState(true);
  
  // Accordion state removed - now using tap-to-detail pattern
  
  const [selectedMedication, setSelectedMedication] = useState<Med | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<MedicationCourse | null>(null);
  const [medicationName, setMedicationName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Determine if current medication name looks like a PRN medication
  const looksLikePrn = useMemo(() => {
    return medicationName.trim() ? isPrnMedication(medicationName) : false;
  }, [medicationName]);
  
  // Reset reminder state when dialog opens
  useEffect(() => {
    if (showAddDialog) {
      setReminderEnabled(true);
      setSelectedReminderPresets(['morning']);
    }
  }, [showAddDialog]);
  
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
      
      // Create reminders directly if enabled and presets selected (inline, no extra prompt)
      const shouldCreateReminders = reminderEnabled && selectedReminderPresets.length > 0 && !looksLikePrn;
      
      if (shouldCreateReminders && newMed) {
        const times = getTimesForPresets(selectedReminderPresets);
        const today = format(new Date(), 'yyyy-MM-dd');
        
        const reminderInputs = times.map(time => ({
          type: 'medication' as const,
          title: `${newMed.name} einnehmen`,
          date_time: `${today}T${time}:00`,
          repeat: 'daily' as const,
          notification_enabled: true,
          medications: [newMed.name],
          medication_id: newMed.id,
        }));
        
        try {
          await createMultipleReminders.mutateAsync(reminderInputs);
          const timeLabels = selectedReminderPresets
            .map(id => DEFAULT_TIME_PRESETS.find(p => p.id === id)?.label)
            .filter(Boolean)
            .join(', ');
          toast.success(`Medikament mit Erinnerung (${timeLabels}) hinzugefügt`);
        } catch (err) {
          console.error('Failed to create reminders:', err);
          toast.success("Medikament hinzugefügt (Erinnerung fehlgeschlagen)");
        }
      } else {
        toast.success("Medikament hinzugefügt");
      }
      
      setMedicationName("");
      setShowAddDialog(false);
      
      if (editAfterAdd && newMed) {
        setSelectedMedication(newMed);
        setShowEditModal(true);
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

  // Direct toggle handlers for medication reminders (no modal)
  const handleToggleMedReminder = async (med: Med) => {
    const status = reminderStatusMap.get(med.id);
    if (!status || status.reminders.length === 0) return;
    
    setTogglingReminderId(med.id);
    try {
      await toggleMedReminders.mutateAsync({
        reminders: status.reminders,
        currentlyActive: status.isActive,
      });
    } finally {
      setTogglingReminderId(null);
    }
  };

  const handleToggleCourseReminder = async (course: MedicationCourse) => {
    const status = courseReminderMap.get(course.id);
    if (!status || status.reminders.length === 0) return;
    
    setTogglingReminderId(course.id);
    try {
      await toggleMedReminders.mutateAsync({
        reminders: status.reminders,
        currentlyActive: status.isActive,
      });
    } finally {
      setTogglingReminderId(null);
    }
  };

  // Course edit/delete handlers
  const openCourseEditWizard = (course: MedicationCourse) => {
    setEditingCourse(course);
    setShowCourseWizard(true);
  };

  const openCourseDeleteDialog = (course: MedicationCourse) => {
    setDeletingCourse(course);
  };

  const handleCourseUpdate = async (data: CreateMedicationCourseInput) => {
    if (!editingCourse) return;
    try {
      await updateCourse.mutateAsync({ id: editingCourse.id, input: data });
      toast.success("Behandlung aktualisiert");
    } catch (error) {
      toast.error("Fehler beim Aktualisieren");
    }
  };

  const handleCourseDelete = async () => {
    if (!deletingCourse) return;
    try {
      await deleteCourse.mutateAsync(deletingCourse.id);
      toast.success("Behandlung gelöscht");
      setDeletingCourse(null);
    } catch (error) {
      toast.error("Fehler beim Löschen");
    }
  };

  const closeCourseWizard = () => {
    setShowCourseWizard(false);
    setEditingCourse(null);
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
    <div className="space-y-4">
      {/* Header */}
      <AppHeader
        title="Medikamente"
        subtitle={`${totalActive} aktive Medikamente`}
        onBack={onBack}
        sticky
      />

      <div className="p-4 space-y-4">

      {/* PRIMARY ACTION: Neues Medikament hinzufügen - EINZIGE dominante Aktion */}
      <Button 
        onClick={() => setShowAddDialog(true)}
        className="w-full h-14 text-base font-semibold shadow-md hover:shadow-lg"
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Neues Medikament hinzufügen
      </Button>

      {/* LIMITS SHORTCUT - Kleiner Link statt große Kachel */}
      <button
        onClick={onNavigateToLimits}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-2"
      >
        <span>→</span>
        <span>Zu Übergebrauch & Limits</span>
      </button>

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
                  <SimpleMedicationRow
                    key={med.id}
                    med={med}
                    onTap={() => openEditModal(med)}
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
                <SimpleCourseRow
                  key={course.id}
                  course={course}
                  reminderStatus={courseReminderMap.get(course.id)}
                  onTap={() => openCourseEditWizard(course)}
                />
              ))}
              {/* Reguläre Medikamente aus user_medications */}
              {categorizedMeds.regular.map((med) => (
                <SimpleMedicationRow
                  key={med.id}
                  med={med}
                  onTap={() => openEditModal(med)}
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
                <SimpleMedicationRow
                  key={med.id}
                  med={med}
                  onTap={() => openEditModal(med)}
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
                    <SimpleMedicationRow
                      key={med.id}
                      med={med}
                      onTap={() => openEditModal(med)}
                    />
                  ))}
                </div>
              )}

              {/* Inaktive medication_courses (frühere Behandlungen) */}
              {sortedInactiveCourses.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Frühere Behandlungen</h4>
                  {sortedInactiveCourses.map((course) => (
                    <SimpleCourseRow
                      key={course.id}
                      course={course}
                      onTap={() => openCourseEditWizard(course)}
                    />
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* ========== UTILITY: Medikationsplan PDF (ruhig, nicht prominent) ========== */}
      <Separator className="my-4" />
      <Card className="border-border/50 bg-card hover:bg-muted/30 transition-colors">
        <CardContent className="p-4">
          <button
            onClick={handleGenerateMedicationPlan}
            disabled={isGeneratingPdf}
            className="flex items-center gap-3 w-full text-left"
          >
            <div className="p-2 rounded-md bg-muted/50 shrink-0">
              {isGeneratingPdf ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Download className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm block">
                {isGeneratingPdf ? "PDF wird erstellt..." : "Medikationsplan (PDF) erstellen"}
              </span>
              <span className="text-xs text-muted-foreground">
                Für Arztbesuche & Notfälle
              </span>
            </div>
          </button>
        </CardContent>
      </Card>

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
            
            {/* Inline Reminder Configuration - only show for non-PRN medications */}
            {!looksLikePrn && medicationName.trim() && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="reminder-toggle" className="text-sm font-medium cursor-pointer">
                      Erinnerung
                    </Label>
                  </div>
                  <Switch
                    id="reminder-toggle"
                    checked={reminderEnabled}
                    onCheckedChange={setReminderEnabled}
                  />
                </div>
                
                {reminderEnabled && (
                  <div className="pl-6 space-y-2">
                    <ReminderTimePresets
                      selected={selectedReminderPresets}
                      onSelectionChange={setSelectedReminderPresets}
                      multiSelect={true}
                      compact={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Täglich · Mehrere Zeiten wählbar
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* PRN medication hint */}
            {looksLikePrn && medicationName.trim() && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
                <Clock className="h-3.5 w-3.5" />
                <span>Bedarfsmedikament – Erinnerung später über 🔔 möglich</span>
              </div>
            )}
            
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
        medicationId={selectedMedication?.id}
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

      {/* Course Edit Wizard */}
      <MedicationCourseWizard
        isOpen={showCourseWizard}
        onClose={closeCourseWizard}
        onSubmit={handleCourseUpdate}
        existingCourse={editingCourse}
      />

      {/* Course Delete Confirmation */}
      <AlertDialog open={!!deletingCourse} onOpenChange={(open) => !open && setDeletingCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Behandlung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du die Behandlung „{deletingCourse?.medication_name}" wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCourseDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </div>
  );
};
