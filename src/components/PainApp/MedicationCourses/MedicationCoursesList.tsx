import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, History, Info } from "lucide-react";
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

export const MedicationCoursesList: React.FC = () => {
  const { data: courses, isLoading } = useMedicationCourses();
  const createCourse = useCreateMedicationCourse();
  const updateCourse = useUpdateMedicationCourse();
  const deleteCourse = useDeleteMedicationCourse();

  const [showWizard, setShowWizard] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MedicationCourse | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<MedicationCourse | null>(null);

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

  // Separate active and past courses
  const activeCourses = courses?.filter((c) => c.is_active) || [];
  const pastCourses = courses?.filter((c) => !c.is_active) || [];

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

      {/* Add Button */}
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
          {activeCourses.map((course) => (
            <MedicationCourseCard
              key={course.id}
              course={course}
              onEdit={handleEdit}
              onDelete={setDeletingCourse}
            />
          ))}
        </div>
      )}

      {/* Past Courses */}
      {pastCourses.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Frühere Behandlungen</h3>
          {pastCourses.map((course) => (
            <MedicationCourseCard
              key={course.id}
              course={course}
              onEdit={handleEdit}
              onDelete={setDeletingCourse}
            />
          ))}
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
