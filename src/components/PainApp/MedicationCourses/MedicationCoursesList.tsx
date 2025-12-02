import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, History, Info, FileText, Loader2 } from "lucide-react";
import { MedicationCourseCard } from "./MedicationCourseCard";
import { MedicationCourseWizard } from "./MedicationCourseWizard";
import {
  useMedicationCourses,
  useCreateMedicationCourse,
  useUpdateMedicationCourse,
  useDeleteMedicationCourse,
  type MedicationCourse,
  type CreateMedicationCourseInput,
} from "@/features/medication-courses";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMeds } from "@/features/meds/hooks/useMeds";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { toast } from "sonner";

export const MedicationCoursesList: React.FC = () => {
  const { data: courses, isLoading } = useMedicationCourses();
  const createCourse = useCreateMedicationCourse();
  const updateCourse = useUpdateMedicationCourse();
  const deleteCourse = useDeleteMedicationCourse();
  const { data: patientData } = usePatientData();
  const { data: doctors } = useDoctors();
  const { data: userMedications } = useMeds();
  const { data: medicationLimits } = useMedicationLimits();

  const [showWizard, setShowWizard] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MedicationCourse | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<MedicationCourse | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleCreate = async (data: CreateMedicationCourseInput) => {
    await createCourse.mutateAsync(data);
  };

  const handleUpdate = async (data: CreateMedicationCourseInput) => {
    if (!editingCourse) return;
    await updateCourse.mutateAsync({ id: editingCourse.id, input: data });
  };

  const handleDelete = async () => {
    if (!deletingCourse) return;
    await deleteCourse.mutateAsync(deletingCourse.id);
    setDeletingCourse(null);
  };

  const handleEdit = (course: MedicationCourse) => {
    setEditingCourse(course);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditingCourse(null);
  };

  const handleGenerateMedicationPlan = async () => {
    // Allow generation even without courses - we'll include user_medications
    const hasMedications = (courses && courses.length > 0) || (userMedications && userMedications.length > 0);
    
    if (!hasMedications) {
      toast.error("Keine Medikamente vorhanden", {
        description: "Bitte fügen Sie zuerst Medikamente hinzu.",
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: courses || [],
        userMedications: userMedications?.map(m => ({
          id: m.id,
          name: m.name,
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

  // Separate active and past courses
  const activeCourses = courses?.filter((c) => c.is_active) || [];
  const pastCourses = courses?.filter((c) => !c.is_active) || [];

  // Check if we have any medications at all
  const totalMedications = (courses?.length || 0) + (userMedications?.length || 0);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PROMINENT: Medikationsplan Button */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Medikationsplan (PDF)</h3>
                <p className="text-xs text-muted-foreground">
                  Für Arzt, Krankenhaus oder Notfall
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerateMedicationPlan}
              disabled={isGeneratingPdf || totalMedications === 0}
              className="shrink-0"
              size="default"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Erstelle...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF erstellen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="flex items-start gap-3">
        <History className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Therapieverlauf</h2>
          <p className="text-sm text-muted-foreground">
            Dokumentiere vergangene und aktuelle Behandlungen für deinen Arztbericht.
          </p>
        </div>
      </div>

      {/* Info Card */}
      {courses?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Wofür ist das?</p>
                <p>
                  Hier kannst du prophylaktische Medikamente (z.B. Ajovy, Topiramat, Propranolol, Botox) und 
                  wichtige Akutmedikamente dokumentieren. Diese Informationen erscheinen im ärztlichen Bericht
                  und im Medikationsplan.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Treatment Button */}
      <Button 
        onClick={() => setShowWizard(true)}
        variant="outline"
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Behandlung hinzufügen
      </Button>

      {/* Active Courses */}
      {activeCourses.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Aktuelle Behandlungen</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto modern-scrollbar pr-1">
            {activeCourses.map((course) => (
              <MedicationCourseCard
                key={course.id}
                course={course}
                onEdit={handleEdit}
                onDelete={setDeletingCourse}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past Courses */}
      {pastCourses.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Frühere Behandlungen</h3>
          <div className="space-y-2 max-h-[250px] overflow-y-auto modern-scrollbar pr-1">
            {pastCourses.map((course) => (
              <MedicationCourseCard
                key={course.id}
                course={course}
                onEdit={handleEdit}
                onDelete={setDeletingCourse}
              />
            ))}
          </div>
        </div>
      )}

      {/* Wizard */}
      <MedicationCourseWizard
        isOpen={showWizard}
        onClose={handleCloseWizard}
        onSubmit={editingCourse ? handleUpdate : handleCreate}
        existingCourse={editingCourse}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCourse} onOpenChange={(open) => !open && setDeletingCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verlauf löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du den Verlauf für „{deletingCourse?.medication_name}" wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
