/**
 * Edge Function: get-shared-report-pdf
 * Generiert PDF für die Arzt-Ansicht.
 *
 * SSOT-Prinzip: Verwendet den bei der Freigabe gepinnten Snapshot
 * aus doctor_share_report_snapshots als alleinige Datenquelle.
 * Fragt KEINE Live-Daten aus pain_entries ab.
 *
 * Auth: Header x-doctor-access (signed HMAC token)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyDoctorAccess } from "../_shared/doctorAccessGuard.ts";
import {
  buildDoctorReportSnapshot,
  upsertSnapshot,
  getCachedSnapshot,
  type DoctorReportJSON,
} from "../_shared/doctorReportSnapshot.ts";

// --- Helpers ---
function painLevelLabel(level: string): string {
  const map: Record<string, string> = { "-": "Kein Schmerz", "leicht": "Leicht", "mittel": "Mittel", "stark": "Stark", "sehr_stark": "Sehr stark" };
  return map[level] ?? level;
}

function formatDateGerman(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  return timeStr.substring(0, 5);
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { share_id: shareId, user_id: userId } = accessResult.payload!;
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "3m";

    console.log(`[PDF] Request: shareId=${shareId}, userId=${userId.substring(0, 8)}..., range=${range}`);

    // ─────────────────────────────────────────────────────────────────────
    // SSOT: Load the pinned snapshot created during share activation.
    // Only build a new snapshot as fallback if none exists.
    // ─────────────────────────────────────────────────────────────────────
    let reportJson: DoctorReportJSON;
    const cached = await getCachedSnapshot(supabase, shareId, range);

    if (cached && cached.reportJson) {
      console.log(`[PDF] ✅ Using pinned snapshot: snapshotId=${cached.id}, generatedAt=${cached.generatedAt}, entries=${cached.reportJson.tables?.entriesTotal ?? 0}`);
      reportJson = cached.reportJson;
    } else {
      // Fallback: build on-demand (should rarely happen if activate pins correctly)
      console.log(`[PDF] ⚠️ No pinned snapshot found, building on-demand for shareId=${shareId}, range=${range}`);
      const { reportJson: newReport, sourceUpdatedAt } = await buildDoctorReportSnapshot(supabase, {
        userId, range, page: 1, includePatientData: true,
      });
      await upsertSnapshot(supabase, shareId, range, newReport, sourceUpdatedAt, null);
      reportJson = newReport;
    }

    // Extract data from snapshot
    const patientData = reportJson.optional?.patientData ?? null;
    const entries = reportJson.tables?.entries ?? [];
    const summary = reportJson.summary;
    const meta = reportJson.meta;

    const fromDate = meta?.fromDate ?? "";
    const toDate = meta?.toDate ?? "";

    let patientName = "Patient";
    if (patientData) {
      const parts: string[] = [];
      if (patientData.title) parts.push(patientData.title);
      if (patientData.firstName) parts.push(patientData.firstName);
      if (patientData.lastName) parts.push(patientData.lastName);
      if (parts.length > 0) patientName = parts.join(" ");
    }

    // PDF generation from snapshot data
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText("Kopfschmerztagebuch", { x: margin, y, size: 20, font: helveticaBold, color: rgb(0.15, 0.35, 0.65) });
    y -= 30;

    // Patient data
    page.drawText("Patientendaten", { x: margin, y, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
    page.drawText(`Name: ${patientName}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
    if (patientData?.dateOfBirth) { page.drawText(`Geburtsdatum: ${formatDateGerman(patientData.dateOfBirth)}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    if (patientData?.street || patientData?.postalCode || patientData?.city) {
      const ap: string[] = [];
      if (patientData.street) ap.push(patientData.street);
      if (patientData.postalCode && patientData.city) ap.push(`${patientData.postalCode} ${patientData.city}`);
      else if (patientData.city) ap.push(patientData.city);
      if (ap.length > 0) { page.drawText(`Adresse: ${ap.join(", ")}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    }
    if (patientData?.phone) { page.drawText(`Telefon: ${patientData.phone}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    if (patientData?.healthInsurance || patientData?.insuranceNumber) {
      let it = "Versicherung: ";
      if (patientData.healthInsurance) it += patientData.healthInsurance;
      if (patientData.insuranceNumber) it += patientData.healthInsurance ? ` (${patientData.insuranceNumber})` : patientData.insuranceNumber;
      page.drawText(it, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14;
    }
    y -= 10;

    page.drawText(`Zeitraum: ${formatDateGerman(fromDate)} – ${formatDateGerman(toDate)}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) }); y -= 15;
    page.drawText(`Erstellt am: ${formatDateGerman(new Date().toISOString().split("T")[0])}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) }); y -= 15;
    page.drawText(`Datenquelle: Gepinnter Snapshot (SSOT)`, { x: margin, y, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) }); y -= 25;

    // Summary from snapshot
    page.drawText("Zusammenfassung", { x: margin, y, size: 14, font: helveticaBold, color: rgb(0.15, 0.35, 0.65) }); y -= 20;
    const summaryItems = [
      { label: "Kopfschmerztage", value: String(summary?.headacheDays ?? 0) },
      { label: "Migränetage", value: String(summary?.migraineDays ?? 0) },
      { label: "Triptantage", value: String(summary?.triptanDays ?? 0) },
      { label: "Tage mit Akutmedikation", value: String(summary?.acuteMedDays ?? 0) },
      { label: "Ø Intensität", value: (summary?.avgIntensity ?? 0).toFixed(1) },
    ];
    summaryItems.forEach(item => {
      page.drawText(`${item.label}:`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(item.value, { x: margin + 200, y, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 15;
    });
    y -= 20;

    // Entries table from snapshot
    page.drawText("Episoden-Liste", { x: margin, y, size: 14, font: helveticaBold, color: rgb(0.15, 0.35, 0.65) }); y -= 20;
    const colWidths = [80, 60, 150, 200];
    const headers = ["Datum", "Intensität", "Medikamente", "Notizen"];
    let x = margin;
    headers.forEach((header, i) => { page.drawText(header, { x, y, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) }); x += colWidths[i]; });
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); y -= 12;

    const maxEntriesPerPage = 35;
    let entriesOnPage = 0;

    for (const entry of entries) {
      if (y < margin + 50 || entriesOnPage >= maxEntriesPerPage) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        entriesOnPage = 0;
        x = margin;
        headers.forEach((header, i) => { page.drawText(header, { x, y, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) }); x += colWidths[i]; });
        y -= 5;
        page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); y -= 12;
      }

      x = margin;
      const dateTime = `${formatDateGerman(entry.date)}${entry.time ? `, ${formatTime(entry.time)}` : ""}`;
      page.drawText(dateTime.substring(0, 15), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[0];
      page.drawText(entry.intensityLabel || painLevelLabel(entry.intensity || "-"), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[1];
      const meds = (entry.medications || []).join(", ");
      page.drawText(meds.substring(0, 30) + (meds.length > 30 ? "..." : ""), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[2];
      const notes = (entry.note || "").replace(/\n/g, " ");
      page.drawText(notes.substring(0, 40) + (notes.length > 40 ? "..." : ""), { x, y, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
      entriesOnPage++;
    }

    // Footer
    const pages = pdfDoc.getPages();
    pages.forEach((p, index) => {
      p.drawText(`Seite ${index + 1} von ${pages.length}`, { x: pageWidth / 2 - 30, y: 20, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
      p.drawText("Generiert für ärztliche Einsicht", { x: margin, y: 20, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
    });

    const pdfBytes = await pdfDoc.save();
    const filename = `Kopfschmerztagebuch_${formatDateGerman(fromDate)}-${formatDateGerman(toDate)}.pdf`.replace(/\./g, "-");

    console.log(`[PDF] ✅ Generated PDF: ${pages.length} pages, ${entries.length} entries, ${pdfBytes.length} bytes`);

    return new Response(pdfBytes, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });

  } catch (err) {
    console.error("[PDF] Unexpected error:", err);
    try {
      const errDoc = await PDFDocument.create();
      const errFont = await errDoc.embedFont(StandardFonts.Helvetica);
      const errPage = errDoc.addPage([595.28, 841.89]);
      errPage.drawText("Der Bericht konnte nicht erstellt werden.", { x: 40, y: 780, size: 14, font: errFont, color: rgb(0.6, 0.1, 0.1) });
      errPage.drawText("Bitte versuchen Sie es erneut oder wenden Sie sich an den Patienten.", { x: 40, y: 760, size: 10, font: errFont, color: rgb(0.3, 0.3, 0.3) });
      const errBytes = await errDoc.save();
      return new Response(errBytes, {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Fehler.pdf"' },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "PDF-Generierung fehlgeschlagen" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
  }
});
