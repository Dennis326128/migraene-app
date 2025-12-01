// API
export {
  getMedicationCourses,
  getActiveMedicationCourses,
  getMedicationCoursesByType,
  createMedicationCourse,
  updateMedicationCourse,
  deleteMedicationCourse,
  getMedicationCourseById,
  type MedicationCourse,
  type MedicationCourseType,
  type BaselineDaysRange,
  type ImpairmentLevel,
  type DiscontinuationReason,
  type CreateMedicationCourseInput,
  type UpdateMedicationCourseInput,
} from "./api/medicationCourses.api";

// Hooks
export {
  useMedicationCourses,
  useActiveMedicationCourses,
  useMedicationCoursesByType,
  useMedicationCourse,
  useCreateMedicationCourse,
  useUpdateMedicationCourse,
  useDeleteMedicationCourse,
} from "./hooks/useMedicationCourses";
