/**
 * Edge Function: get-shared-report-pdf
 *
 * Liefert exakt die bereits in der App unter „Verlauf“ gespeicherte PDF-Datei
 * (generated_reports + Storage) für die Freigabe aus.
 *
 * Es wird KEIN neues PDF erzeugt und KEIN Snapshot-PDF berechnet.
 *
 * Auth: Header x-doctor-access (signed HMAC token)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyDoctorAccess } from "../_shared/doctorAccessGuard.ts";
import { getLinkedHistoryDiaryReportById } from "../_shared/doctorSharedHistoryReport.ts";

function sanitizeFilename(value: string): string {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "") || "Kopfschmerztagebuch";
}

function buildDownloadFilename(title: string, createdAt: string): string {
  const safeTitle = sanitizeFilename(title);
  const safeDate = createdAt.slice(0, 10);
  return `${safeTitle}_${safeDate}.pdf`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessResult = await verifyDoctorAccess(req, supabase);
    if (!accessResult.valid) {
      return new Response(
        JSON.stringify({ error: "Freigabe beendet oder abgelaufen", reason: accessResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { share_id: shareId, user_id: userId } = accessResult.payload!;
    const url = new URL(req.url);
    const historyDiaryId = url.searchParams.get("historyDiaryId")?.trim();

    if (!historyDiaryId) {
      return new Response(
        JSON.stringify({ error: "historyDiaryId fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[PDF] History file request: shareId=${shareId}, userId=${userId.substring(0, 8)}..., requestedHistoryDiaryId=${historyDiaryId}`,
    );

    const linkedHistoryReport = await getLinkedHistoryDiaryReportById(supabase, shareId, userId, historyDiaryId);

    if (!linkedHistoryReport) {
      return new Response(
        JSON.stringify({ error: "Verknüpftes Verlauf-PDF nicht gefunden", historyDiaryId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[PDF] History file resolved: requestedHistoryDiaryId=${historyDiaryId}, loadedHistoryDiaryId=${linkedHistoryReport.historyDiaryId}, shareId=${shareId}, createdAt=${linkedHistoryReport.createdAt}, pdfFilePath=${linkedHistoryReport.pdfFilePath}, isTodayDiary=${linkedHistoryReport.isTodayDiary}`,
    );

    const { data: fileData, error: storageError } = await supabase.storage
      .from("generated-reports")
      .download(linkedHistoryReport.pdfFilePath);

    if (storageError || !fileData) {
      console.error("[PDF] Storage download failed:", storageError);
      return new Response(
        JSON.stringify({ error: "Gespeicherte Verlauf-PDF konnte nicht geladen werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pdfBytes = await fileData.arrayBuffer();
    const filename = buildDownloadFilename(linkedHistoryReport.title, linkedHistoryReport.createdAt);

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[PDF] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Gespeicherte Verlauf-PDF konnte nicht bereitgestellt werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
