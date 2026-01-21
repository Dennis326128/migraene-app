// API
export {
  fetchGeneratedReports,
  fetchGeneratedReportsByType,
  deleteGeneratedReport,
  saveGeneratedReport,
  downloadGeneratedReport,
  getReportTypeLabel,
  type ReportType,
  type GeneratedReport,
  type SaveGeneratedReportInput,
} from "./api/generatedReports.api";

// Hooks
export {
  useGeneratedReports,
  useGeneratedReportsByType,
  useSaveGeneratedReport,
  useDeleteGeneratedReport,
  useDownloadGeneratedReport,
} from "./hooks/useGeneratedReports";
