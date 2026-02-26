/**
 * Edge Function: get-shared-report-pdf
 * Generiert PDF für die Arzt-Ansicht
 * Auth: Header x-doctor-session (no cookies)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders, handlePreflight, getSessionIdFromHeader } from "../_shared/cors.ts";

const SESSION_TIMEOUT_MINUTES = 60;

async function validateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ valid: boolean; userId?: string; reason?: string }> {
  const { data: session, error } = await supabase
    .from("doctor_share_sessions")
    .select(`
      id, last_activity_at, ended_at,
      doctor_shares!inner ( id, user_id, expires_at, revoked_at, is_active )
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) return { valid: false, reason: "session_not_found" };
  if (session.ended_at) return { valid: false, reason: "session_ended" };

  const share = session.doctor_shares as {
    id: string; user_id: string; expires_at: string | null;
    revoked_at: string | null; is_active: boolean;
  };
  const now = new Date();

  if (share.revoked_at) return { valid: false, reason: "share_revoked" };
  const isCurrentlyActive = share.is_active && (!share.expires_at || now < new Date(share.expires_at));
  if (!isCurrentlyActive) return { valid: false, reason: "not_shared" };

  const lastActivity = new Date(session.last_activity_at);
  if ((now.getTime() - lastActivity.getTime()) / (1000 * 60) > SESSION_TIMEOUT_MINUTES) {
    return { valid: false, reason: "session_timeout" };
  }

  return { valid: true, userId: share.user_id };
}

// --- Helpers ---
function getDateRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (range) {
    case "30d": from.setDate(from.getDate() - 30); break;
    case "3m": from.setMonth(from.getMonth() - 3); break;
    case "6m": from.setMonth(from.getMonth() - 6); break;
    case "12m": from.setFullYear(from.getFullYear() - 1); break;
    default: from.setMonth(from.getMonth() - 3);
  }
  return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
}

function painLevelToNumber(level: string): number {
  const map: Record<string, number> = { "-": 0, "leicht": 3, "mittel": 5, "stark": 7, "sehr_stark": 9 };
  return map[level] ?? 5;
}

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
    const sessionId = getSessionIdFromHeader(req);
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Keine aktive Sitzung" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sessionResult = await validateSession(supabase, sessionId);
    if (!sessionResult.valid) {
      return new Response(
        JSON.stringify({ error: "Sitzung abgelaufen", reason: sessionResult.reason }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = sessionResult.userId!;
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "3m";
    const { from, to } = getDateRange(range);

    await supabase.from("doctor_share_sessions").update({ last_activity_at: new Date().toISOString() }).eq("id", sessionId);

    const [entriesResult, patientDataResult] = await Promise.all([
      supabase.from("pain_entries").select("*").eq("user_id", userId)
        .gte("selected_date", from).lte("selected_date", to)
        .order("selected_date", { ascending: false }).order("selected_time", { ascending: false }),
      supabase.from("patient_data")
        .select("first_name, last_name, date_of_birth, street, postal_code, city, phone, health_insurance, insurance_number, title")
        .eq("user_id", userId).maybeSingle(),
    ]);

    const allEntries = entriesResult.data || [];
    const patientData = patientDataResult.data;

    let patientName = "Patient";
    if (patientData) {
      const parts: string[] = [];
      if (patientData.title) parts.push(patientData.title);
      if (patientData.first_name) parts.push(patientData.first_name);
      if (patientData.last_name) parts.push(patientData.last_name);
      if (parts.length > 0) patientName = parts.join(" ");
    }

    // Summary
    const painDays = new Set(allEntries.filter(e => e.pain_level && e.pain_level !== "-").map(e => e.selected_date));
    const migraineDays = new Set(allEntries.filter(e => e.pain_level === "stark" || e.pain_level === "sehr_stark").map(e => e.selected_date));
    const triptanKeywords = ["triptan","almotriptan","eletriptan","frovatriptan","naratriptan","rizatriptan","sumatriptan","zolmitriptan","suma","riza","zolmi","nara","almo","ele","frova","imigran","maxalt","ascotop","naramig","almogran","relpax","allegro","dolotriptan","formigran"];
    const triptanDays = new Set(allEntries.filter(e => e.medications?.some((med: string) => triptanKeywords.some(kw => med.toLowerCase().includes(kw)))).map(e => e.selected_date));
    const acuteMedDays = new Set(allEntries.filter(e => e.medications && e.medications.length > 0).map(e => e.selected_date));
    const painLevels = allEntries.filter(e => e.pain_level && e.pain_level !== "-").map(e => painLevelToNumber(e.pain_level));
    const avgIntensity = painLevels.length > 0 ? painLevels.reduce((a, b) => a + b, 0) / painLevels.length : 0;

    // PDF
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
    if (patientData?.date_of_birth) { page.drawText(`Geburtsdatum: ${formatDateGerman(patientData.date_of_birth)}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    if (patientData?.street || patientData?.postal_code || patientData?.city) {
      const ap: string[] = [];
      if (patientData.street) ap.push(patientData.street);
      if (patientData.postal_code && patientData.city) ap.push(`${patientData.postal_code} ${patientData.city}`);
      else if (patientData.city) ap.push(patientData.city);
      if (ap.length > 0) { page.drawText(`Adresse: ${ap.join(", ")}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    }
    if (patientData?.phone) { page.drawText(`Telefon: ${patientData.phone}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14; }
    if (patientData?.health_insurance || patientData?.insurance_number) {
      let it = "Versicherung: ";
      if (patientData.health_insurance) it += patientData.health_insurance;
      if (patientData.insurance_number) it += patientData.health_insurance ? ` (${patientData.insurance_number})` : patientData.insurance_number;
      page.drawText(it, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); y -= 14;
    }
    y -= 10;

    page.drawText(`Zeitraum: ${formatDateGerman(from)} – ${formatDateGerman(to)}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) }); y -= 15;
    page.drawText(`Erstellt am: ${formatDateGerman(new Date().toISOString().split("T")[0])}`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) }); y -= 30;

    // Summary
    page.drawText("Zusammenfassung", { x: margin, y, size: 14, font: helveticaBold, color: rgb(0.15, 0.35, 0.65) }); y -= 20;
    const summaryItems = [
      { label: "Kopfschmerztage", value: painDays.size.toString() },
      { label: "Migränetage (stark/sehr stark)", value: migraineDays.size.toString() },
      { label: "Triptantage", value: triptanDays.size.toString() },
      { label: "Tage mit Akutmedikation", value: acuteMedDays.size.toString() },
      { label: "Ø Intensität", value: avgIntensity.toFixed(1) },
    ];
    summaryItems.forEach(item => {
      page.drawText(`${item.label}:`, { x: margin, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(item.value, { x: margin + 200, y, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 15;
    });
    y -= 20;

    // Entries table
    page.drawText("Episoden-Liste", { x: margin, y, size: 14, font: helveticaBold, color: rgb(0.15, 0.35, 0.65) }); y -= 20;
    const colWidths = [80, 60, 150, 200];
    const headers = ["Datum", "Intensität", "Medikamente", "Notizen"];
    let x = margin;
    headers.forEach((header, i) => { page.drawText(header, { x, y, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) }); x += colWidths[i]; });
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); y -= 12;

    const maxEntriesPerPage = 35;
    let entriesOnPage = 0;

    for (const entry of allEntries) {
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
      const dateTime = `${formatDateGerman(entry.selected_date)}${entry.selected_time ? `, ${formatTime(entry.selected_time)}` : ""}`;
      page.drawText(dateTime.substring(0, 15), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[0];
      page.drawText(painLevelLabel(entry.pain_level), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[1];
      const meds = (entry.medications || []).join(", ");
      page.drawText(meds.substring(0, 30) + (meds.length > 30 ? "..." : ""), { x, y, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) }); x += colWidths[2];
      const notes = (entry.notes || "").replace(/\n/g, " ");
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
    const filename = `Kopfschmerztagebuch_${formatDateGerman(from)}-${formatDateGerman(to)}.pdf`.replace(/\./g, "-");

    return new Response(pdfBytes, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "PDF-Generierung fehlgeschlagen" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
