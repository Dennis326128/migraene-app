/**
 * AI Reports Hook
 * React Query hooks for fetching and managing AI reports
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchAIReports, 
  fetchAIReportById, 
  deleteAIReport, 
  createAIReport,
  upsertAIReportByDedupeKey,
  type AIReport,
  type CreateAIReportInput
} from "../api/aiReports.api";

export function useAIReports() {
  return useQuery({
    queryKey: ["ai_reports"],
    queryFn: fetchAIReports,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useAIReport(id: string | null) {
  return useQuery({
    queryKey: ["ai_report", id],
    queryFn: () => (id ? fetchAIReportById(id) : null),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDeleteAIReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAIReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_reports"] });
    },
  });
}

export function useCreateAIReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAIReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_reports"] });
    },
  });
}

export function useUpsertAIReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertAIReportByDedupeKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_reports"] });
    },
  });
}

export type { AIReport, CreateAIReportInput };
