/**
 * Doctor Share Feature
 * Public exports
 */

// API exports
export { 
  getDoctorShareStatus,
  activateDoctorShare,
  revokeDoctorShare,
  getPermanentDoctorCode,
  fetchDoctorShares,
  fetchActiveDoctorShares,
  createDoctorShare,
} from "./api/doctorShare.api";

export {
  getShareSettings,
  upsertShareSettings,
  createShareSettings,
  linkReportToShare,
} from "./api/doctorShareSettings.api";

// Type exports
export type { 
  DoctorShareStatus, 
  ActivateShareResult,
  PatientInfo,
  ReportSummary,
  ChartData,
  PainEntry,
  MedicationStat,
  MedicationCourse,
  UserMedication,
  DoctorReportData,
  ValidateShareResponse,
  PingSessionResponse,
  DoctorShare,
} from "./api/types";

export type {
  DoctorShareSettings,
  UpdateShareSettingsInput,
  CreateShareSettingsInput,
} from "./api/doctorShareSettings.api";

// Hooks exports
export {
  useDoctorShareStatus,
  useActivateDoctorShare,
  useRevokeDoctorShare,
  usePermanentDoctorCode,
  useDoctorShares,
  useActiveDoctorShares,
  useCreateDoctorShare,
} from "./hooks/useDoctorShare";

export {
  useShareSettings,
  useUpsertShareSettings,
  useCreateShareSettings,
  useLinkReportToShare,
} from "./hooks/useShareSettings";
