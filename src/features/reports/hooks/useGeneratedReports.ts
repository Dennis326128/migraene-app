/**
 * Generated Reports Hooks
 * React Query hooks for managing PDF report history
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchGeneratedReports,
  fetchGeneratedReportsByType,
  deleteGeneratedReport,
  saveGeneratedReport,
  downloadGeneratedReport,
  type ReportType,
  type SaveGeneratedReportInput,
} from "../api/generatedReports.api";
import { toast } from "sonner";

const QUERY_KEY = ['generated-reports'];

export function useGeneratedReports() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchGeneratedReports,
  });
}

export function useGeneratedReportsByType(reportType: ReportType) {
  return useQuery({
    queryKey: [...QUERY_KEY, reportType],
    queryFn: () => fetchGeneratedReportsByType(reportType),
  });
}

export function useSaveGeneratedReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: saveGeneratedReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteGeneratedReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteGeneratedReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Bericht gelöscht");
    },
    onError: () => {
      toast.error("Fehler beim Löschen");
    },
  });
}

export function useDownloadGeneratedReport() {
  return useMutation({
    mutationFn: async ({ id, filename }: { id: string; filename: string }) => {
      const bytes = await downloadGeneratedReport(id);
      if (!bytes) {
        throw new Error('PDF nicht gefunden');
      }
      
      // Create blob and trigger download
      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      return true;
    },
    onError: () => {
      toast.error("Fehler beim Herunterladen");
    },
  });
}

// Re-export types
export type { ReportType, SaveGeneratedReportInput };
