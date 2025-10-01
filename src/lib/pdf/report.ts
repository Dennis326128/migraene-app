import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PainEntry } from "@/types/painApp";

type BuildReportParams = {
  title?: string;
  from: string;
  to: string;
  entries: PainEntry[];
  selectedMeds: string[];
  includeNoMeds: boolean;
};

function toLabel(e: PainEntry) {
  if (e.selected_date && e.selected_time) return `${e.selected_date} ${e.selected_time}`;
  const d = new Date(e.timestamp_created);
  const ds = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const ts = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${ds} ${ts}`;
}

function formatDateRange(from: string, to: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromFormatted = fromDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  const toFormatted = toDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  return `${fromFormatted} bis ${toFormatted}`;
}

function painLevelToNumber(painLevel: string): string {
  const level = (painLevel || "").toLowerCase().replace(/_/g, " ");
  if (level.includes("sehr") && level.includes("stark")) return "9";
  if (level.includes("stark")) return "7";
  if (level.includes("mittel")) return "5";
  if (level.includes("leicht")) return "2";
  // If it's already a number, return as-is
  const num = parseInt(painLevel);
  if (!isNaN(num)) return num.toString();
  return painLevel; // fallback
}

export async function buildDiaryPdf(params: BuildReportParams): Promise<Uint8Array> {
  const { title = "Kopfschmerztagebuch", from, to, entries, selectedMeds, includeNoMeds } = params;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait (pt)
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let y = page.getHeight() - margin;

  // Header
  page.drawText(title, { x: margin, y, size: 18, font: fontBold, color: rgb(0,0,0) });
  y -= 22;
  page.drawText(`Zeitraum: ${formatDateRange(from, to)}`, { x: margin, y, size: 11, font });
  y -= 20;

  // Table header
  const colX = { dt: margin, pain: margin + 180, meds: margin + 260, note: margin + 420 };
  page.drawText("Datum/Zeit", { x: colX.dt, y, size: 10, font: fontBold });
  page.drawText("Schmerz",    { x: colX.pain, y, size: 10, font: fontBold });
  page.drawText("Medikamente",{ x: colX.meds, y, size: 10, font: fontBold });
  page.drawText("Notiz",      { x: colX.note, y, size: 10, font: fontBold });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  y -= 8;

  const drawRow = (e: PainEntry) => {
    const dt = toLabel(e);
    const meds = (e.medications || []).join(", ");
    const note = (e.notes || "").replace(/\s+/g, " ").trim();

    // Umbruch-begrenzte Zeichnung
    const write = (text: string, x: number, maxWidth: number, size = 10) => {
      const words = text.split(" ");
      let line = "";
      let outY = y;
      const lines: string[] = [];
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        const width = font.widthOfTextAtSize(test, size);
        if (width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      lines.forEach((ln, i) => {
        page.drawText(ln, { x, y: outY - (i*12), size, font });
      });
      return outY - (lines.length - 1) * 12;
    };

    // Zeile schreiben
    let rowBottomY = y;
    rowBottomY = Math.min(rowBottomY, write(dt,   colX.dt,   160));
    rowBottomY = Math.min(rowBottomY, write(painLevelToNumber(e.pain_level), colX.pain, 70));
    rowBottomY = Math.min(rowBottomY, write(meds || "–",   colX.meds, 150));
    rowBottomY = Math.min(rowBottomY, write(note || "–",   colX.note, page.getWidth() - margin - colX.note));

    y = rowBottomY - 10;
  };

  const addPageIfNeeded = () => {
    if (y < margin + 40) {
      const p = pdf.addPage([595.28, 841.89]);
      y = p.getHeight() - margin;
      // Re-assign current page reference
      const pages = pdf.getPages();
      const last = pages[pages.length - 1];
      // draw header row again on new page
      last.drawText("Datum/Zeit", { x: colX.dt, y, size: 10, font: fontBold });
      last.drawText("Schmerz",    { x: colX.pain, y, size: 10, font: fontBold });
      last.drawText("Medikamente",{ x: colX.meds, y, size: 10, font: fontBold });
      last.drawText("Notiz",      { x: colX.note, y, size: 10, font: fontBold });
      y -= 12;
      last.drawLine({ start: { x: margin, y }, end: { x: last.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
      y -= 8;
    }
  };

  for (const e of entries) {
    drawRow(e);
    addPageIfNeeded();
  }

  return await pdf.save();
}