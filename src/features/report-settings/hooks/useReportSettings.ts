import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReportSettings, upsertReportSettings, type ReportSettings } from "../api/reportSettings.api";

export function useReportSettings() {
  return useQuery<ReportSettings | null>({
    queryKey: ["report_settings"],
    queryFn: getReportSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertReportSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertReportSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report_settings"] });
    },
  });
}
