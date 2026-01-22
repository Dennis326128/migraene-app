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

export type { DoctorShareStatus, ActivateShareResult } from "./api/doctorShare.api";

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

// Legacy type alias
export type { DoctorShareStatus as DoctorShare } from "./api/doctorShare.api";
