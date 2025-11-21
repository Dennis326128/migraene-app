/**
 * ⚠️ DEPRECATED - NUR FÜR LEGACY-SUPPORT
 * 
 * Diese Datei wird nicht mehr aktiv verwendet.
 * Bitte verwenden Sie stattdessen: src/lib/pdf/report.ts → buildDiaryPdf()
 * 
 * Die zentrale PDF-Funktion für alle Nutzer:innen ist buildDiaryPdf() in report.ts
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { MigraineEntry } from "@/types/painApp";

type ProfessionalReportParams = {
  // Metadaten
  dateRange: { from: string; to: string };
  generatedAt: string;
  
  // Patientendaten
  patientData?: {
    salutation?: string;
    title?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    street?: string;
    postal_code?: string;
    city?: string;
    phone?: string;
    email?: string;
    health_insurance?: string;
    insurance_number?: string;
  };
  
  // Ärzte
  doctors?: Array<{
    salutation?: string;
    title?: string;
    first_name?: string;
    last_name?: string;
    specialty?: string;
    street?: string;
    postal_code?: string;
    city?: string;
    phone?: string;
    email?: string;
  }>;
  
  // Zusammenfassung
  summary: {
    totalEntries: number;
    avgPainLevel: number;
    daysWithPain: number;
    medicationDays: number;
  };
  
  // Medikamentenstatistiken
  medicationStats?: Array<{
    name: string;
    totalCount: number;
    avgEffectiveness: number;
    ratedCount: number;
  }>;
  
  // KI-Analyse
  aiAnalysis?: string;
  
  // Detaillierte Einträge
  entries?: MigraineEntry[];
};

export async function buildProfessionalReport(params: ProfessionalReportParams): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;
  
  let page = pdf.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - margin;
  
  // === KOPFBEREICH (Titel + Datum) ===
  page.drawRectangle({
    x: 0,
    y: pageHeight - 120,
    width: pageWidth,
    height: 120,
    color: rgb(0.95, 0.97, 1.0),
  });
  
  page.drawText("KOPFSCHMERZTAGEBUCH", {
    x: margin,
    y: pageHeight - 60,
    size: 24,
    font: helveticaBold,
    color: rgb(0.2, 0.3, 0.6),
  });
  
  page.drawText(`Berichtszeitraum: ${formatDate(params.dateRange.from)} - ${formatDate(params.dateRange.to)}`, {
    x: margin,
    y: pageHeight - 85,
    size: 11,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(`Erstellt am: ${formatDate(params.generatedAt)}`, {
    x: margin,
    y: pageHeight - 105,
    size: 9,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  yPos = pageHeight - 150;
  
  // === PATIENTENDATEN (wenn vorhanden) ===
  if (params.patientData) {
    yPos = drawSection(page, "PATIENTENDATEN", yPos, helveticaBold, margin, contentWidth);
    
    const p = params.patientData;
    const fullName = [p.salutation, p.title, p.first_name, p.last_name]
      .filter(Boolean)
      .join(" ");
    
    if (fullName) {
      yPos = drawKeyValue(page, "Name:", fullName, yPos, helvetica, helveticaBold, margin);
    }
    if (p.date_of_birth) {
      yPos = drawKeyValue(page, "Geburtsdatum:", formatDate(p.date_of_birth), yPos, helvetica, helveticaBold, margin);
    }
    if (p.street || p.postal_code || p.city) {
      const address = [p.street, `${p.postal_code || ''} ${p.city || ''}`.trim()]
        .filter(Boolean)
        .join(", ");
      yPos = drawKeyValue(page, "Adresse:", address, yPos, helvetica, helveticaBold, margin);
    }
    if (p.phone) {
      yPos = drawKeyValue(page, "Telefon:", p.phone, yPos, helvetica, helveticaBold, margin);
    }
    if (p.email) {
      yPos = drawKeyValue(page, "E-Mail:", p.email, yPos, helvetica, helveticaBold, margin);
    }
    if (p.health_insurance) {
      yPos = drawKeyValue(page, "Krankenkasse:", p.health_insurance, yPos, helvetica, helveticaBold, margin);
    }
    if (p.insurance_number) {
      yPos = drawKeyValue(page, "Versichertennummer:", p.insurance_number, yPos, helvetica, helveticaBold, margin);
    }
    
    yPos -= 15;
  }
  
  // === BEHANDELNDE ÄRZTE ===
  if (params.doctors && params.doctors.length > 0) {
    yPos = drawSection(page, "BEHANDELNDE ÄRZTE", yPos, helveticaBold, margin, contentWidth);
    
    params.doctors.forEach((doc, idx) => {
      const docName = [doc.salutation, doc.title, doc.first_name, doc.last_name]
        .filter(Boolean)
        .join(" ");
      
      if (docName) {
        yPos = drawKeyValue(
          page, 
          `Arzt ${idx + 1}:`, 
          `${docName}${doc.specialty ? ` (${doc.specialty})` : ''}`, 
          yPos, 
          helvetica, 
          helveticaBold, 
          margin
        );
        
        if (doc.phone || doc.email) {
          const contact = [doc.phone, doc.email].filter(Boolean).join(" | ");
          yPos = drawText(page, `  ${contact}`, yPos, helvetica, margin, 9, rgb(0.4, 0.4, 0.4));
        }
        
        yPos -= 8;
      }
    });
    
    yPos -= 15;
  }
  
  // === ZUSAMMENFASSUNG ===
  yPos = drawSection(page, "ZUSAMMENFASSUNG", yPos, helveticaBold, margin, contentWidth);
  
  // Statistik-Box
  page.drawRectangle({
    x: margin,
    y: yPos - 90,
    width: contentWidth,
    height: 85,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });
  
  const statBoxY = yPos - 25;
  const colWidth = contentWidth / 4;
  
  // 4 Spalten für Statistiken
  drawStatBox(page, margin + colWidth * 0, statBoxY, colWidth, 
    params.summary.totalEntries.toString(), "Einträge gesamt", helveticaBold, helvetica);
  
  drawStatBox(page, margin + colWidth * 1, statBoxY, colWidth,
    params.summary.avgPainLevel.toFixed(1) + "/10", "Ø Schmerzstärke", helveticaBold, helvetica);
  
  drawStatBox(page, margin + colWidth * 2, statBoxY, colWidth,
    params.summary.daysWithPain.toString(), "Tage mit Schmerzen", helveticaBold, helvetica);
  
  drawStatBox(page, margin + colWidth * 3, statBoxY, colWidth,
    params.summary.medicationDays.toString(), "Tage mit Medikation", helveticaBold, helvetica);
  
  yPos -= 110;
  
  // === MEDIKAMENTENSTATISTIKEN ===
  if (params.medicationStats && params.medicationStats.length > 0) {
    yPos = drawSection(page, "EINGENOMMENE MEDIKAMENTE", yPos, helveticaBold, margin, contentWidth);
    
    // Tabellen-Header
    const tableY = yPos - 20;
    const col1 = margin;
    const col2 = margin + 200;
    const col3 = margin + 320;
    const col4 = margin + 420;
    
    page.drawText("Medikament", { x: col1, y: tableY, size: 9, font: helveticaBold });
    page.drawText("Einnahmen", { x: col2, y: tableY, size: 9, font: helveticaBold });
    page.drawText("Bewertungen", { x: col3, y: tableY, size: 9, font: helveticaBold });
    page.drawText("Ø Wirksamkeit", { x: col4, y: tableY, size: 9, font: helveticaBold });
    
    // Trennlinie
    page.drawLine({
      start: { x: margin, y: tableY - 5 },
      end: { x: margin + contentWidth, y: tableY - 5 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    yPos = tableY - 20;
    
    for (const med of params.medicationStats) {
      if (yPos < margin + 50) {
        page = pdf.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
      }
      
      page.drawText(med.name, { x: col1, y: yPos, size: 9, font: helvetica });
      page.drawText(med.totalCount.toString(), { x: col2, y: yPos, size: 9, font: helvetica });
      page.drawText(med.ratedCount.toString(), { x: col3, y: yPos, size: 9, font: helvetica });
      
      const effectiveness = med.ratedCount > 0 
        ? `${med.avgEffectiveness.toFixed(1)}/10` 
        : "—";
      page.drawText(effectiveness, { x: col4, y: yPos, size: 9, font: helvetica });
      
      yPos -= 15;
    }
    
    yPos -= 20;
  }
  
  // === KI-ANALYSEBERICHT (wenn vorhanden) ===
  if (params.aiAnalysis) {
    // Seitenwechsel für Analyse
    page = pdf.addPage([pageWidth, pageHeight]);
    yPos = pageHeight - margin;
    
    yPos = drawSection(page, "PROFESSIONELLE ANALYSE", yPos, helveticaBold, margin, contentWidth);
    
    yPos -= 10;
    
    // Analyse-Text (mit Zeilenumbruch)
    const lines = wrapText(params.aiAnalysis, contentWidth - 20, 10, helvetica);
    
    for (const line of lines) {
      if (yPos < margin + 20) {
        page = pdf.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
      }
      
      page.drawText(line, {
        x: margin + 5,
        y: yPos,
        size: 10,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
        maxWidth: contentWidth - 20,
      });
      
      yPos -= 14;
    }
  }
  
  // === FUßZEILE AUF ALLEN SEITEN ===
  const totalPages = pdf.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdf.getPage(i);
    p.drawText(`Seite ${i + 1} von ${totalPages}`, {
      x: pageWidth - margin - 80,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    p.drawText("Vertrauliches medizinisches Dokument", {
      x: margin,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  
  return pdf.save();
}

// === HILFSFUNKTIONEN ===

function drawSection(
  page: PDFPage, 
  title: string, 
  yPos: number, 
  font: PDFFont, 
  margin: number, 
  width: number
): number {
  page.drawText(title, {
    x: margin,
    y: yPos,
    size: 14,
    font,
    color: rgb(0.2, 0.3, 0.6),
  });
  
  page.drawLine({
    start: { x: margin, y: yPos - 5 },
    end: { x: margin + width, y: yPos - 5 },
    thickness: 2,
    color: rgb(0.2, 0.3, 0.6),
  });
  
  return yPos - 25;
}

function drawKeyValue(
  page: PDFPage,
  key: string,
  value: string,
  yPos: number,
  font: PDFFont,
  fontBold: PDFFont,
  margin: number
): number {
  page.drawText(key, {
    x: margin,
    y: yPos,
    size: 10,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(value, {
    x: margin + 150,
    y: yPos,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  return yPos - 16;
}

function drawText(
  page: PDFPage,
  text: string,
  yPos: number,
  font: PDFFont,
  x: number,
  size: number,
  color: ReturnType<typeof rgb>
): number {
  page.drawText(text, { x, y: yPos, size, font, color });
  return yPos - size - 4;
}

function drawStatBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  value: string,
  label: string,
  fontBold: PDFFont,
  font: PDFFont
) {
  // Wert (groß)
  const valueWidth = fontBold.widthOfTextAtSize(value, 20);
  page.drawText(value, {
    x: x + width / 2 - valueWidth / 2,
    y: y,
    size: 20,
    font: fontBold,
    color: rgb(0.2, 0.3, 0.6),
  });
  
  // Label (klein)
  const labelWidth = font.widthOfTextAtSize(label, 9);
  page.drawText(label, {
    x: x + width / 2 - labelWidth / 2,
    y: y - 25,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}
