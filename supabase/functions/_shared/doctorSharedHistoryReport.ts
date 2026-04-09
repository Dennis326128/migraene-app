import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface LinkedHistoryDiaryReport {
  historyDiaryId: string;
  createdAt: string;
  pdfFilePath: string;
  title: string;
  isTodayDiary: boolean;
}

function isTodayIso(dateTime: string): boolean {
  return dateTime.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export async function getLinkedHistoryDiaryReport(
  supabase: SupabaseClient,
  shareId: string,
  userId: string,
): Promise<LinkedHistoryDiaryReport | null> {
  const { data: shareSettings, error: shareSettingsError } = await supabase
    .from("doctor_share_settings")
    .select("generated_report_id")
    .eq("share_id", shareId)
    .maybeSingle();

  if (shareSettingsError) {
    console.error("[SharedHistoryReport] Failed to load share settings:", shareSettingsError);
    throw shareSettingsError;
  }

  if (!shareSettings?.generated_report_id) {
    return null;
  }

  const { data: generatedReport, error: generatedReportError } = await supabase
    .from("generated_reports")
    .select("id, user_id, created_at, title, storage_path, report_type")
    .eq("id", shareSettings.generated_report_id)
    .eq("user_id", userId)
    .eq("report_type", "diary")
    .maybeSingle();

  if (generatedReportError) {
    console.error("[SharedHistoryReport] Failed to load generated report:", generatedReportError);
    throw generatedReportError;
  }

  if (!generatedReport?.storage_path) {
    return null;
  }

  return {
    historyDiaryId: generatedReport.id,
    createdAt: generatedReport.created_at,
    pdfFilePath: generatedReport.storage_path,
    title: generatedReport.title,
    isTodayDiary: isTodayIso(generatedReport.created_at),
  };
}

export async function getLinkedHistoryDiaryReportById(
  supabase: SupabaseClient,
  shareId: string,
  userId: string,
  historyDiaryId: string,
): Promise<LinkedHistoryDiaryReport | null> {
  const linkedReport = await getLinkedHistoryDiaryReport(supabase, shareId, userId);

  if (!linkedReport) {
    return null;
  }

  if (linkedReport.historyDiaryId !== historyDiaryId) {
    console.warn(
      `[SharedHistoryReport] Linked report mismatch: requested=${historyDiaryId}, linked=${linkedReport.historyDiaryId}, shareId=${shareId}`,
    );
    return null;
  }

  return linkedReport;
}