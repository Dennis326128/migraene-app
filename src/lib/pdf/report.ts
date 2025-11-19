import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PainEntry } from "@/types/painApp";

type BuildReportParams = {
  title?: string;
  from: string;
  to: string;
  entries: PainEntry[];
  selectedMeds: string[];
  includeStats?: boolean;
  includeChart?: boolean;
  includeAnalysis?: boolean;
  includeEntriesList?: boolean;
  analysisReport?: string;
  medicationStats?: Array<{
    name: string;
    count: number;
    avgEffect: number;
    ratedCount: number;
  }>;
  patientData?: {
    firstName?: string;
    lastName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
  };
  doctors?: Array<{
    firstName?: string;
    lastName?: string;
    specialty?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
    email?: string;
  }>;
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

function painLevelToNumericValue(painLevel: string): number {
  const str = painLevelToNumber(painLevel);
  const num = parseInt(str);
  return isNaN(num) ? 0 : num;
}

function drawSimpleChart(
  page: any, 
  entries: PainEntry[], 
  from: string, 
  to: string, 
  x: number, 
  y: number, 
  width: number, 
  height: number,
  font: any,
  fontBold: any
) {
  // Chart frame
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
  });
  
  // Title
  page.drawText("Intensitätsverlauf", {
    x: x + width / 2 - 50,
    y: y + 10,
    size: 12,
    font: fontBold,
  });
  
  // Group entries by date and get max pain per day
  const painByDate = new Map<string, number>();
  entries.forEach(entry => {
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
    const pain = painLevelToNumericValue(entry.pain_level);
    const existing = painByDate.get(date);
    if (existing === undefined || pain > existing) {
      painByDate.set(date, pain);
    }
  });
  
  // Sort dates
  const sortedDates = Array.from(painByDate.keys()).sort();
  
  if (sortedDates.length === 0) return;
  
  // Calculate chart dimensions
  const chartMargin = 30;
  const chartWidth = width - 2 * chartMargin;
  const chartHeight = height - 2 * chartMargin;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin;
  
  // Y-axis (0-10)
  for (let i = 0; i <= 10; i += 2) {
    const yPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX - 5, y: yPos },
      end: { x: chartX, y: yPos },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(i.toString(), {
      x: chartX - 20,
      y: yPos - 4,
      size: 8,
      font,
    });
  }
  
  // Draw grid lines
  for (let i = 0; i <= 10; i += 2) {
    const yPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX, y: yPos },
      end: { x: chartX + chartWidth, y: yPos },
      thickness: 0.3,
      color: rgb(0.9, 0.9, 0.9),
    });
  }
  
  // Draw data points and lines
  const maxPoints = Math.min(sortedDates.length, 30); // Limit to 30 points
  const step = Math.ceil(sortedDates.length / maxPoints);
  const displayDates = sortedDates.filter((_, i) => i % step === 0);
  
  const pointSpacing = chartWidth / (displayDates.length - 1 || 1);
  
  let prevX: number | null = null;
  let prevY: number | null = null;
  
  displayDates.forEach((date, i) => {
    const pain = painByDate.get(date) || 0;
    const pointX = chartX + i * pointSpacing;
    const pointY = chartY + (pain / 10) * chartHeight;
    
    // Draw line to previous point
    if (prevX !== null && prevY !== null) {
      page.drawLine({
        start: { x: prevX, y: prevY },
        end: { x: pointX, y: pointY },
        thickness: 2,
        color: rgb(0.93, 0.27, 0.27), // red color
      });
    }
    
    // Draw point
    page.drawCircle({
      x: pointX,
      y: pointY,
      size: 3,
      color: rgb(0.93, 0.27, 0.27),
    });
    
    // Draw date label (only every few dates to avoid overlap)
    if (i % Math.ceil(displayDates.length / 8) === 0) {
      const shortDate = date.slice(5); // MM-DD
      page.drawText(shortDate, {
        x: pointX - 12,
        y: chartY - 15,
        size: 7,
        font,
      });
    }
    
    prevX = pointX;
    prevY = pointY;
  });
  
  // Y-axis label
  page.drawText("Schmerzstärke", {
    x: chartX - 25,
    y: chartY + chartHeight + 10,
    size: 9,
    font: fontBold,
  });
}

export async function buildDiaryPdf(params: BuildReportParams): Promise<Uint8Array> {
  const { 
    title = "Kopfschmerztagebuch",
    from,
    to,
    entries,
    includeStats = true,
    includeChart = true,
    includeAnalysis = false,
    includeEntriesList = true,
    analysisReport = "",
    medicationStats = [],
    patientData,
    doctors = [],
  } = params;

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let yPos = page.getHeight() - 50;

  page.drawText(title, { x: 50, y: yPos, size: 16, font: fontBold });
  yPos -= 20;

  const dateRangeText = `Zeitraum: ${formatDateRange(from, to)}`;
  page.drawText(dateRangeText, { x: 50, y: yPos, size: 10, font });
  yPos -= 30;

  // Patient Information (if provided)
  if (patientData && (patientData.firstName || patientData.lastName)) {
    page.drawText("PATIENT", { x: 50, y: yPos, size: 12, font: fontBold, color: rgb(0.2, 0.4, 0.8) });
    yPos -= 18;
    
    if (patientData.firstName || patientData.lastName) {
      const name = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
      page.drawText(`Name: ${name}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    if (patientData.dateOfBirth) {
      page.drawText(`Geburtsdatum: ${patientData.dateOfBirth}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    if (patientData.street || patientData.postalCode || patientData.city) {
      const address = [
        patientData.street,
        [patientData.postalCode, patientData.city].filter(Boolean).join(" ")
      ].filter(Boolean).join(", ");
      page.drawText(`Adresse: ${address}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    if (patientData.phone) {
      page.drawText(`Telefon: ${patientData.phone}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    if (patientData.email) {
      page.drawText(`E-Mail: ${patientData.email}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    yPos -= 10;
  }

  // Doctor Information (if provided)
  if (doctors && doctors.length > 0) {
    const doctorLabel = doctors.length === 1 ? "BEHANDELNDER ARZT" : "BEHANDELNDE ÄRZTE";
    page.drawText(doctorLabel, { x: 50, y: yPos, size: 12, font: fontBold, color: rgb(0.2, 0.4, 0.8) });
    yPos -= 18;
    
    for (const doctor of doctors) {
      if (doctor.firstName || doctor.lastName) {
        const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(" ");
        page.drawText(`Name: ${name}`, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      if (doctor.specialty) {
        page.drawText(`Fachgebiet: ${doctor.specialty}`, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      if (doctor.street || doctor.postalCode || doctor.city) {
        const address = [
          doctor.street,
          [doctor.postalCode, doctor.city].filter(Boolean).join(" ")
        ].filter(Boolean).join(", ");
        page.drawText(`Adresse: ${address}`, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      if (doctor.phone) {
        page.drawText(`Telefon: ${doctor.phone}`, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      if (doctor.email) {
        page.drawText(`E-Mail: ${doctor.email}`, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      yPos -= 10; // Space between doctors
    }
  }

  // Analysis Report (if included)
  if (includeAnalysis && analysisReport) {
    const maxWidth = 495;
    const lines = analysisReport.split('\n');
    
    page.drawText("Professioneller Analysebericht", { x: 50, y: yPos, size: 12, font: fontBold });
    yPos -= 20;
    
    for (const line of lines) {
      if (yPos < 80) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = 841.89 - 50;
      }
      
      // Simple text wrapping
      const words = line.split(' ');
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const width = font.widthOfTextAtSize(testLine, 10);
        
        if (width > maxWidth && currentLine) {
          page.drawText(currentLine, { x: 50, y: yPos, size: 10, font });
          yPos -= 14;
          currentLine = word;
          
          if (yPos < 80) {
            page = pdfDoc.addPage([595.28, 841.89]);
            yPos = 841.89 - 50;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) {
        page.drawText(currentLine, { x: 50, y: yPos, size: 10, font });
        yPos -= 14;
      }
      
      yPos -= 6;
    }
    
    yPos -= 20;
  }

  // Medication Statistics (if included)
  if (includeStats && medicationStats && medicationStats.length > 0) {
    if (yPos < 150) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    
    page.drawText("Medikamenten-Statistiken", { x: 50, y: yPos, size: 12, font: fontBold });
    yPos -= 20;
    
    for (const stat of medicationStats) {
      if (yPos < 80) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = 841.89 - 50;
      }
      
      page.drawText(`${stat.name}: ${stat.count}x verwendet`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
      
      if (stat.ratedCount > 0 && stat.avgEffect !== null) {
        page.drawText(`  Durchschn. Wirkung: ${stat.avgEffect.toFixed(1)}/10 (${stat.ratedCount} Bewertungen)`, 
          { x: 60, y: yPos, size: 9, font });
        yPos -= 14;
      }
    }
    
    yPos -= 20;
  }

  // Chart (if included)
  if (includeChart && entries.length > 0) {
    const chartHeight = 200;
    if (yPos - chartHeight < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    drawSimpleChart(page, entries, from, to, 50, yPos, 495, chartHeight, font, fontBold);
    yPos -= chartHeight + 20;
  }

  // Entries list (if included)
  if (!includeEntriesList) {
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  // Table header
  if (yPos < 150) {
    page = pdfDoc.addPage([595.28, 841.89]);
    yPos = 841.89 - 50;
  }
  
  // Table header for entries list
  const margin = 50;
  const colX = { dt: margin, pain: margin + 180, meds: margin + 260, note: margin + 420 };
  let y = yPos;
  
  page.drawText("Datum/Zeit", { x: colX.dt, y, size: 10, font: fontBold });
  page.drawText("Schmerz",    { x: colX.pain, y, size: 10, font: fontBold });
  page.drawText("Medikamente",{ x: colX.meds, y, size: 10, font: fontBold });
  page.drawText("Notiz",      { x: colX.note, y, size: 10, font: fontBold });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  y -= 8;
  
  let pdf = pdfDoc; // For compatibility with existing helper functions

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
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
      // draw header row again on new page
      page.drawText("Datum/Zeit", { x: colX.dt, y, size: 10, font: fontBold });
      page.drawText("Schmerz",    { x: colX.pain, y, size: 10, font: fontBold });
      page.drawText("Medikamente",{ x: colX.meds, y, size: 10, font: fontBold });
      page.drawText("Notiz",      { x: colX.note, y, size: 10, font: fontBold });
      y -= 12;
      page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
      y -= 8;
    }
  };

  for (const e of entries) {
    drawRow(e);
    addPageIfNeeded();
  }

  return await pdf.save();
}