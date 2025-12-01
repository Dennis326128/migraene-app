import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMedicationCourses,
  getActiveMedicationCourses,
  getMedicationCoursesByType,
  createMedicationCourse,
  updateMedicationCourse,
  deleteMedicationCourse,
  getMedicationCourseById,
  type MedicationCourse,
  type MedicationCourseType,
  type CreateMedicationCourseInput,
  type UpdateMedicationCourseInput,
} from "../api/medicationCourses.api";
import { toast } from "sonner";

const QUERY_KEY = "medication_courses";

/**
 * Hook to fetch all medication courses
 */
export function useMedicationCourses() {
  return useQuery<MedicationCourse[]>({
    queryKey: [QUERY_KEY],
    queryFn: getMedicationCourses,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch only active medication courses
 */
export function useActiveMedicationCourses() {
  return useQuery<MedicationCourse[]>({
    queryKey: [QUERY_KEY, "active"],
    queryFn: getActiveMedicationCourses,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch medication courses by type
 */
export function useMedicationCoursesByType(type: MedicationCourseType) {
  return useQuery<MedicationCourse[]>({
    queryKey: [QUERY_KEY, "type", type],
    queryFn: () => getMedicationCoursesByType(type),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single medication course by ID
 */
export function useMedicationCourse(id: string | null) {
  return useQuery<MedicationCourse | null>({
    queryKey: [QUERY_KEY, id],
    queryFn: () => (id ? getMedicationCourseById(id) : null),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a new medication course
 */
export function useCreateMedicationCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMedicationCourseInput) => createMedicationCourse(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Medikamentenverlauf gespeichert");
    },
    onError: (error: Error) => {
      console.error("Error creating medication course:", error);
      toast.error("Fehler beim Speichern des Verlaufs");
    },
  });
}

/**
 * Hook to update an existing medication course
 */
export function useUpdateMedicationCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMedicationCourseInput }) =>
      updateMedicationCourse(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Verlauf aktualisiert");
    },
    onError: (error: Error) => {
      console.error("Error updating medication course:", error);
      toast.error("Fehler beim Aktualisieren");
    },
  });
}

/**
 * Hook to delete a medication course
 */
export function useDeleteMedicationCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMedicationCourse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success("Verlauf gelöscht");
    },
    onError: (error: Error) => {
      console.error("Error deleting medication course:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}
