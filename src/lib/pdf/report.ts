import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PainEntry } from "@/types/painApp";

/**
 * PDF-Report-Optionen für Krankenkasse & Ärzte
 * Alle Flags steuern, welche Abschnitte im PDF erscheinen
 */
type BuildReportParams = {
  title?: string;
  from: string;
  to: string;
  entries: PainEntry[];
  selectedMeds: string[];
  
  // Content inclusion flags
  includeStats?: boolean;
  includeChart?: boolean;
  includeAnalysis?: boolean;
  includeEntriesList?: boolean;
  includePatientData?: boolean;  // NEU: Patientendaten anzeigen
  includeDoctorData?: boolean;   // NEU: Arztkontakte anzeigen
  
  // Optional content
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

/**
 * Eintrag-Label formatieren: dd.mm.yyyy, HH:mm
 */
function toLabel(e: PainEntry) {
  if (e.selected_date && e.selected_time) {
    return formatDateTime(e.selected_date, e.selected_time);
  }
  return formatDateTime(e.timestamp_created);
}

/**
 * Einheitliche Datumsformatierung für Ärzte/Krankenkassen: dd.mm.yyyy
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric" 
  });
}

/**
 * Datumsbereich formatieren: dd.mm.yyyy - dd.mm.yyyy
 */
function formatDateRange(from: string, to: string): string {
  return `${formatDate(from)} - ${formatDate(to)}`;
}

/**
 * Datum + Uhrzeit formatieren: dd.mm.yyyy, HH:mm
 */
function formatDateTime(dateStr: string, timeStr?: string): string {
  const date = new Date(dateStr);
  const dateFormatted = formatDate(dateStr);
  
  if (timeStr) {
    return `${dateFormatted}, ${timeStr}`;
  }
  
  const time = date.toLocaleTimeString("de-DE", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  return `${dateFormatted}, ${time}`;
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

/**
 * Standard-PDF-Report für Krankenkasse & Ärzte
 * Verwendet buildDiaryPdf (report.ts)
 */
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
    includePatientData = false,   // NEU: Checkbox-gesteuert
    includeDoctorData = false,    // NEU: Checkbox-gesteuert
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

  // Professional header
  page.drawText(title, { x: 50, y: yPos, size: 18, font: fontBold, color: rgb(0.15, 0.35, 0.65) });
  yPos -= 15;
  
  // Horizontal line under title
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: 545, y: yPos },
    thickness: 1,
    color: rgb(0.15, 0.35, 0.65),
  });
  yPos -= 20;

  const dateRangeText = `Berichtszeitraum: ${formatDateRange(from, to)}`;
  page.drawText(dateRangeText, { x: 50, y: yPos, size: 11, font: fontBold });
  yPos -= 10;
  page.drawText(`Erstellt am: ${formatDate(new Date().toISOString())}`, 
    { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  yPos -= 25;

  // PATIENTENDATEN - nur bei aktivierter Option und vorhandenen Daten
  if (includePatientData && patientData && (patientData.firstName || patientData.lastName)) {
    page.drawText("PATIENT", { x: 50, y: yPos, size: 12, font: fontBold, color: rgb(0.2, 0.4, 0.8) });
    yPos -= 18;
    
    if (patientData.firstName || patientData.lastName) {
      const name = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
      page.drawText(`Name: ${name}`, { x: 50, y: yPos, size: 10, font });
      yPos -= 14;
    }
    
    if (patientData.dateOfBirth) {
      page.drawText(`Geburtsdatum: ${formatDate(patientData.dateOfBirth)}`, { x: 50, y: yPos, size: 10, font });
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

  // ARZTKONTAKTE - nur bei aktivierter Option und vorhandenen Daten
  if (includeDoctorData && doctors && doctors.length > 0) {
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

  // KI-KURZBERICHT FÜR ÄRZTE - nur bei aktivierter Option
  if (includeAnalysis && analysisReport) {
    // Check if we need a new page
    if (yPos < 200) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    
    // Draw box background and border
    const boxX = 50;
    const boxWidth = 495;
    const boxPadding = 12;
    
    // Title - professionell für Ärzte
    page.drawText("ÄRZTLICHE AUSWERTUNG", { 
      x: boxX, 
      y: yPos, 
      size: 12, 
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8)
    });
    yPos -= 15;
    
    // Horizontal line
    page.drawLine({
      start: { x: boxX, y: yPos },
      end: { x: boxX + boxWidth, y: yPos },
      thickness: 2,
      color: rgb(0.2, 0.4, 0.8),
    });
    yPos -= 18;
    
    // Subtitle
    page.drawText("KI-gestützte Mustererkennung zur diagnostischen Unterstützung", { 
      x: boxX, 
      y: yPos, 
      size: 8, 
      font,
      color: rgb(0.4, 0.4, 0.4)
    });
    yPos -= 20;
    
    // Draw box border (will be completed after content)
    const boxTopY = yPos + 8;
    
    // Parse markdown-like formatting and render text
    const maxWidth = boxWidth - (2 * boxPadding);
    const lines = analysisReport.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (yPos < 80) {
        // Complete current box
        const boxHeight = boxTopY - (yPos - 8);
        page.drawRectangle({
          x: boxX,
          y: yPos - 8,
          width: boxWidth,
          height: boxHeight,
          borderColor: rgb(0.7, 0.8, 0.9),
          borderWidth: 1,
          color: rgb(0.97, 0.98, 1)
        });
        
        // New page
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = 841.89 - 50;
      }
      
      // Handle bullet points
      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
      const cleanLine = line.replace(/^[•\-]\s*/, '').trim();
      
      if (!cleanLine) {
        yPos -= 6; // Empty line spacing
        continue;
      }
      
      // Check if line is bold (starts with **)
      const isBold = cleanLine.startsWith('**') && cleanLine.includes('**');
      const textContent = isBold ? cleanLine.replace(/\*\*/g, '') : cleanLine;
      const currentFont = isBold ? fontBold : font;
      
      // Word wrapping
      const words = textContent.split(' ');
      let currentLine = '';
      const indent = isBullet ? 12 : 0;
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const width = currentFont.widthOfTextAtSize(testLine, 9);
        
        if (width > maxWidth - indent && currentLine) {
          // Draw bullet for first line only
          if (isBullet && !currentLine.includes(' ')) {
            page.drawText('•', { 
              x: boxX + boxPadding, 
              y: yPos, 
              size: 9, 
              font 
            });
          }
          
          page.drawText(currentLine, { 
            x: boxX + boxPadding + indent, 
            y: yPos, 
            size: 9, 
            font: currentFont 
          });
          yPos -= 12;
          currentLine = word;
          
          if (yPos < 80) {
            // Complete current box
            const boxHeight = boxTopY - (yPos - 8);
            page.drawRectangle({
              x: boxX,
              y: yPos - 8,
              width: boxWidth,
              height: boxHeight,
              borderColor: rgb(0.7, 0.8, 0.9),
              borderWidth: 1,
              color: rgb(0.97, 0.98, 1)
            });
            
            page = pdfDoc.addPage([595.28, 841.89]);
            yPos = 841.89 - 50;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) {
        if (isBullet) {
          page.drawText('•', { 
            x: boxX + boxPadding, 
            y: yPos, 
            size: 9, 
            font 
          });
        }
        page.drawText(currentLine, { 
          x: boxX + boxPadding + indent, 
          y: yPos, 
          size: 9, 
          font: currentFont 
        });
        yPos -= 12;
      }
      
      yPos -= 2; // Line spacing
    }
    
    // Complete the box
    const boxHeight = boxTopY - (yPos - 8);
    page.drawRectangle({
      x: boxX,
      y: yPos - 8,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.7, 0.8, 0.9),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 1)
    });
    
    yPos -= 25;
  }

  // Executive Summary (at the beginning, after patient/doctor data)
  if (includeStats || includeAnalysis) {
    if (yPos < 200) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    
    page.drawText("ZUSAMMENFASSUNG", { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0.15, 0.35, 0.65) });
    yPos -= 5;
    page.drawLine({
      start: { x: 50, y: yPos },
      end: { x: 200, y: yPos },
      thickness: 0.5,
      color: rgb(0.15, 0.35, 0.65),
    });
    yPos -= 20;
    
    // Key statistics
    const validEntries = entries.filter(e => painLevelToNumericValue(e.pain_level) > 0);
    const avgPain = validEntries.length > 0 
      ? validEntries.reduce((sum, e) => sum + painLevelToNumericValue(e.pain_level), 0) / validEntries.length
      : 0;
    const maxPain = Math.max(...entries.map(e => painLevelToNumericValue(e.pain_level)));
    const entriesWithMeds = entries.filter(e => e.medications && e.medications.length > 0).length;
    
    page.drawText(`• Anzahl Migräne-Episoden: ${entries.length}`, { x: 60, y: yPos, size: 10, font });
    yPos -= 14;
    page.drawText(`• Durchschnittliche Schmerzintensität: ${avgPain.toFixed(1)}/10`, { x: 60, y: yPos, size: 10, font });
    yPos -= 14;
    page.drawText(`• Maximale Schmerzintensität: ${maxPain}/10`, { x: 60, y: yPos, size: 10, font });
    yPos -= 14;
    page.drawText(`• Episoden mit Medikamenteneinnahme: ${entriesWithMeds} (${Math.round(entriesWithMeds/entries.length*100)}%)`, 
      { x: 60, y: yPos, size: 10, font });
    yPos -= 25;
  }

  // Medication Statistics (if included)
  if (includeStats && medicationStats && medicationStats.length > 0) {
    if (yPos < 150) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    
    page.drawText("MEDIKAMENTEN-STATISTIK", { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0.15, 0.35, 0.65) });
    yPos -= 5;
    page.drawLine({
      start: { x: 50, y: yPos },
      end: { x: 230, y: yPos },
      thickness: 0.5,
      color: rgb(0.15, 0.35, 0.65),
    });
    yPos -= 15;
    page.drawText("Häufigkeit und Wirksamkeit der verwendeten Medikamente", 
      { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    yPos -= 20;
    
    for (const stat of medicationStats) {
      if (yPos < 80) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = 841.89 - 50;
      }
      
      // Professional medication box
      const boxY = yPos - 5;
      page.drawRectangle({
        x: 55,
        y: boxY - 45,
        width: 485,
        height: 43,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
        color: rgb(0.97, 0.97, 0.97),
      });
      
      page.drawText(`${stat.name}`, { x: 65, y: yPos, size: 10, font: fontBold });
      yPos -= 14;
      
      // Two-column layout for better readability
      page.drawText(`Einnahmen: ${stat.count}x`, { x: 65, y: yPos, size: 9, font });
      
      if (stat.ratedCount > 0 && stat.avgEffect !== null) {
        const effectPercent = Math.round((stat.avgEffect / 10) * 100);
        page.drawText(`Wirksamkeit: ${effectPercent}% (⌀ aus ${stat.ratedCount} Bewertungen)`, 
          { x: 250, y: yPos, size: 9, font });
      }
      yPos -= 30;
    }
    
    yPos -= 20;
  }

  // Chart (if included) with professional styling
  if (includeChart && entries.length > 0) {
    const chartHeight = 200;
    if (yPos - chartHeight < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      yPos = 841.89 - 50;
    }
    
    page.drawText("INTENSITÄTSVERLAUF", { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0.15, 0.35, 0.65) });
    yPos -= 5;
    page.drawLine({
      start: { x: 50, y: yPos },
      end: { x: 200, y: yPos },
      thickness: 0.5,
      color: rgb(0.15, 0.35, 0.65),
    });
    yPos -= 15;
    page.drawText("Verlauf der Schmerzintensität über den Berichtszeitraum", 
      { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    yPos -= 20;
    
    drawSimpleChart(page, entries, from, to, 50, yPos, 495, chartHeight, font, fontBold);
    yPos -= chartHeight + 20;
  }

  // Entries list (if included)
  if (!includeEntriesList) {
    // Add footer with disclaimer before finishing
    const pages = pdfDoc.getPages();
    pages.forEach((p, index) => {
      p.drawText(`Seite ${index + 1} von ${pages.length}`, { 
        x: 50, 
        y: 30, 
        size: 8, 
        font, 
        color: rgb(0.5, 0.5, 0.5) 
      });
      p.drawText(`Erstellt: ${new Date().toLocaleDateString("de-DE")} | Vertrauliches medizinisches Dokument`, { 
        x: 250, 
        y: 30, 
        size: 8, 
        font, 
        color: rgb(0.5, 0.5, 0.5) 
      });
    });
    
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  // Detailed entries list with professional styling
  if (yPos < 150) {
    page = pdfDoc.addPage([595.28, 841.89]);
    yPos = 841.89 - 50;
  }
  
  page.drawText("DETAILLIERTE EPISODEN-LISTE", { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0.15, 0.35, 0.65) });
  yPos -= 5;
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: 260, y: yPos },
    thickness: 0.5,
    color: rgb(0.15, 0.35, 0.65),
  });
  yPos -= 15;
  page.drawText("Chronologische Auflistung aller dokumentierten Migräne-Episoden", 
    { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  yPos -= 20;
  
  // Professional table header
  const margin = 50;
  const colX = { dt: margin, pain: margin + 110, aura: margin + 170, meds: margin + 250, note: margin + 420 };
  let y = yPos;
  
  // Draw header background with color
  page.drawRectangle({
    x: margin,
    y: y - 12,
    width: 495,
    height: 14,
    color: rgb(0.15, 0.35, 0.65),
  });
  
  // White text on colored background
  page.drawText("Datum/Zeit", { x: colX.dt + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Schmerz", { x: colX.pain + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Aura", { x: colX.aura + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Medikamente", { x: colX.meds + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Notizen", { x: colX.note + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  y -= 8;
  
  let pdf = pdfDoc; // For compatibility with existing helper functions

  const drawRow = (e: PainEntry) => {
    const dt = toLabel(e);
    const auraText = e.aura_type === "keine" ? "–" : e.aura_type || "–";
    const meds = (e.medications || []).join(", ");
    const note = (e.notes || "").replace(/\s+/g, " ").trim();

    // Word-wrap text rendering
    const write = (text: string, x: number, maxWidth: number, size = 9) => {
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
        page.drawText(ln, { x, y: outY - (i*11), size, font });
      });
      return outY - (lines.length - 1) * 11;
    };

    // Draw row with alternating background
    let rowBottomY = y;
    rowBottomY = Math.min(rowBottomY, write(dt,   colX.dt,   100));
    rowBottomY = Math.min(rowBottomY, write(painLevelToNumber(e.pain_level), colX.pain, 50));
    rowBottomY = Math.min(rowBottomY, write(auraText, colX.aura, 70));
    rowBottomY = Math.min(rowBottomY, write(meds || "–",   colX.meds, 160));
    rowBottomY = Math.min(rowBottomY, write(note || "–",   colX.note, page.getWidth() - margin - colX.note));

    y = rowBottomY - 8;
  };

  const addPageIfNeeded = () => {
    if (y < margin + 40) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
      
      // Redraw professional header on new page
      page.drawRectangle({
        x: margin,
        y: y - 12,
        width: 495,
        height: 14,
        color: rgb(0.15, 0.35, 0.65),
      });
      
      page.drawText("Datum/Zeit", { x: colX.dt + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText("Schmerz", { x: colX.pain + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText("Aura", { x: colX.aura + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText("Medikamente", { x: colX.meds + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText("Notizen", { x: colX.note + 2, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
      y -= 12;
      page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth()-margin, y }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
      y -= 8;
    }
  };

  for (const e of entries) {
    drawRow(e);
    addPageIfNeeded();
  }

  // Add professional footer to all pages
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Seite ${index + 1} von ${pages.length}`, { 
      x: 50, 
      y: 30, 
      size: 8, 
      font, 
      color: rgb(0.5, 0.5, 0.5) 
    });
    p.drawText(`Erstellt: ${new Date().toLocaleDateString("de-DE")} | Vertrauliches medizinisches Dokument`, { 
      x: 250, 
      y: 30, 
      size: 8, 
      font, 
      color: rgb(0.5, 0.5, 0.5) 
    });
  });

  return await pdf.save();
}