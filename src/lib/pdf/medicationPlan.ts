/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF IM BMP-STIL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Separates PDF im Stil des bundeseinheitlichen Medikationsplans (BMP).
 * Enthält nur aktuelle Medikation + Prophylaxe-Historie, keine KI-Interpretation.
 * 
 * STRUKTUR:
 * ─────────
 * - Kopfbereich mit Patientendaten (Name, Geburtsdatum, Erstellungsdatum)
 * - Behandelnde Ärzt:innen
 * - Tabelle im BMP-Stil mit Spalten:
 *   - Wirkstoff / Handelsname
 *   - Stärke / Darreichungsform (Dosierung)
 *   - Dosierungsschema
 *   - Indikation
 *   - Einnahmehinweise / Notizen
 * - Prophylaxe-Historie (abgeschlossene Verläufe)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.15, 0.35, 0.65),      // Medizinisches Blau
  primaryLight: rgb(0.2, 0.4, 0.8),    // Helleres Blau für Überschriften
  text: rgb(0.1, 0.1, 0.1),            // Haupttext
  textLight: rgb(0.4, 0.4, 0.4),       // Sekundärtext
  border: rgb(0.7, 0.7, 0.7),          // Rahmenlinien
  headerBg: rgb(0.92, 0.95, 0.98),     // Heller Hintergrund für Header
  rowAlt: rgb(0.97, 0.97, 0.97),       // Alternierende Zeilenfarbe
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,   // A4
  margin: 40,           // Seitenrand
  lineHeight: 14,       // Standard-Zeilenabstand
  sectionGap: 20,       // Abstand zwischen Abschnitten
};

export type MedicationCourseForPlan = {
  id: string;
  medication_name: string;
  type: string;
  dose_text?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  subjective_effectiveness?: number | null;
  had_side_effects?: boolean | null;
  side_effects_text?: string | null;
  discontinuation_reason?: string | null;
  discontinuation_details?: string | null;
  baseline_migraine_days?: string | null;
  baseline_impairment_level?: string | null;
  note_for_physician?: string | null;
};

type PatientData = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  healthInsurance?: string;
  insuranceNumber?: string;
};

type DoctorData = {
  firstName?: string;
  lastName?: string;
  title?: string;
  specialty?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
};

export type BuildMedicationPlanParams = {
  medicationCourses: MedicationCourseForPlan[];
  patientData?: PatientData;
  doctors?: DoctorData[];
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sanitizeForPDF(text: string | undefined | null): string {
  if (!text) return "";
  
  return text
    .replace(/⌀/g, "Ø")
    .replace(/∅/g, "Ø")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return "-";
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    prophylaxe: "Prophylaxe",
    akut: "Akuttherapie",
    sonstige: "Sonstige Therapie",
  };
  return labels[type] || type;
}

function getIndication(type: string): string {
  const indications: Record<string, string> = {
    prophylaxe: "Migraeneprophylaxe",
    akut: "Akute Migraene",
    sonstige: "Kopfschmerz",
  };
  return indications[type] || "Migraene";
}

function getDiscontinuationLabel(reason: string | null | undefined): string {
  if (!reason) return "-";
  const labels: Record<string, string> = {
    keine_wirkung: "Keine ausreichende Wirkung",
    nebenwirkungen: "Unvertraegliche Nebenwirkungen",
    migraene_gebessert: "Besserung der Migraene",
    kinderwunsch: "Kinderwunsch/Schwangerschaft",
    andere: "Sonstige Gruende",
  };
  return labels[reason] || reason;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.text,
  maxWidth?: number
): number {
  const sanitized = sanitizeForPDF(text);
  if (maxWidth) {
    const words = sanitized.split(" ");
    let line = "";
    let currentY = y;
    
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);
      
      if (width > maxWidth && line) {
        page.drawText(line, { x, y: currentY, size, font, color });
        currentY -= LAYOUT.lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= LAYOUT.lineHeight;
    }
    
    return y - currentY;
  }
  
  page.drawText(sanitized, { x, y, size, font, color });
  return LAYOUT.lineHeight;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PDF BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export async function buildMedicationPlanPdf(params: BuildMedicationPlanParams): Promise<Uint8Array> {
  const { medicationCourses, patientData, doctors } = params;
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.margin;
  
  const contentWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
  
  // ─────────────────────────────────────────────────────────────────────────
  // HEADER - BMP-STYLE TITLE
  // ─────────────────────────────────────────────────────────────────────────
  
  // Title bar
  page.drawRectangle({
    x: LAYOUT.margin,
    y: y - 30,
    width: contentWidth,
    height: 35,
    color: COLORS.primary,
  });
  
  page.drawText("MEDIKATIONSPLAN", {
    x: LAYOUT.margin + 10,
    y: y - 22,
    size: 16,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  
  // Creation date on the right
  const creationDate = formatDate(new Date().toISOString());
  const dateText = `Erstellt: ${creationDate}`;
  const dateWidth = helvetica.widthOfTextAtSize(dateText, 10);
  page.drawText(dateText, {
    x: LAYOUT.pageWidth - LAYOUT.margin - dateWidth - 10,
    y: y - 20,
    size: 10,
    font: helvetica,
    color: rgb(1, 1, 1),
  });
  
  y -= 50;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PATIENT DATA BOX
  // ─────────────────────────────────────────────────────────────────────────
  
  if (patientData && (patientData.firstName || patientData.lastName)) {
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 70,
      width: contentWidth,
      height: 75,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    
    // Patient header
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 18,
      width: contentWidth,
      height: 20,
      color: COLORS.headerBg,
    });
    
    page.drawText("PATIENTENDATEN", {
      x: LAYOUT.margin + 8,
      y: y - 13,
      size: 9,
      font: helveticaBold,
      color: COLORS.primary,
    });
    
    // Patient info
    const patientName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    const birthDate = patientData.dateOfBirth ? formatDate(patientData.dateOfBirth) : "-";
    
    page.drawText("Name:", {
      x: LAYOUT.margin + 8,
      y: y - 35,
      size: 9,
      font: helveticaBold,
      color: COLORS.text,
    });
    page.drawText(sanitizeForPDF(patientName) || "-", {
      x: LAYOUT.margin + 80,
      y: y - 35,
      size: 10,
      font: helvetica,
      color: COLORS.text,
    });
    
    page.drawText("Geburtsdatum:", {
      x: LAYOUT.margin + 8,
      y: y - 50,
      size: 9,
      font: helveticaBold,
      color: COLORS.text,
    });
    page.drawText(birthDate, {
      x: LAYOUT.margin + 80,
      y: y - 50,
      size: 10,
      font: helvetica,
      color: COLORS.text,
    });
    
    // Right column
    if (patientData.healthInsurance || patientData.insuranceNumber) {
      const midX = LAYOUT.margin + contentWidth / 2;
      
      if (patientData.healthInsurance) {
        page.drawText("Krankenkasse:", {
          x: midX,
          y: y - 35,
          size: 9,
          font: helveticaBold,
          color: COLORS.text,
        });
        page.drawText(sanitizeForPDF(patientData.healthInsurance), {
          x: midX + 75,
          y: y - 35,
          size: 10,
          font: helvetica,
          color: COLORS.text,
        });
      }
      
      if (patientData.insuranceNumber) {
        page.drawText("Versichertennr.:", {
          x: midX,
          y: y - 50,
          size: 9,
          font: helveticaBold,
          color: COLORS.text,
        });
        page.drawText(sanitizeForPDF(patientData.insuranceNumber), {
          x: midX + 75,
          y: y - 50,
          size: 10,
          font: helvetica,
          color: COLORS.text,
        });
      }
    }
    
    y -= 85;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DOCTORS BOX
  // ─────────────────────────────────────────────────────────────────────────
  
  if (doctors && doctors.length > 0) {
    const boxHeight = 20 + doctors.length * 15;
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - boxHeight,
      width: contentWidth,
      height: boxHeight + 5,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 18,
      width: contentWidth,
      height: 20,
      color: COLORS.headerBg,
    });
    
    page.drawText("BEHANDELNDE AERZTE", {
      x: LAYOUT.margin + 8,
      y: y - 13,
      size: 9,
      font: helveticaBold,
      color: COLORS.primary,
    });
    
    let docY = y - 35;
    for (const doc of doctors) {
      const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
      const specialty = doc.specialty ? ` (${doc.specialty})` : "";
      page.drawText(sanitizeForPDF(`${docName}${specialty}`), {
        x: LAYOUT.margin + 8,
        y: docY,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      docY -= 15;
    }
    
    y -= boxHeight + 15;
  }
  
  y -= 10;
  
  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE MEDICATIONS TABLE (BMP STYLE)
  // ─────────────────────────────────────────────────────────────────────────
  
  const activeCourses = medicationCourses.filter(c => c.is_active);
  const inactiveCourses = medicationCourses.filter(c => !c.is_active);
  
  // Table header
  page.drawText("AKTUELLE MEDIKATION", {
    x: LAYOUT.margin,
    y: y,
    size: 11,
    font: helveticaBold,
    color: COLORS.primary,
  });
  y -= 20;
  
  // Column widths for BMP-style table
  const colWidths = {
    name: 140,        // Wirkstoff/Handelsname
    dose: 80,         // Stärke/Dosierung
    schema: 80,       // Dosierungsschema
    indication: 100,  // Indikation
    notes: 115,       // Hinweise
  };
  
  // Table header row
  const headerY = y;
  page.drawRectangle({
    x: LAYOUT.margin,
    y: headerY - 18,
    width: contentWidth,
    height: 22,
    color: COLORS.primary,
  });
  
  let colX = LAYOUT.margin + 5;
  const headers = [
    { text: "Wirkstoff", width: colWidths.name },
    { text: "Dosierung", width: colWidths.dose },
    { text: "Einnahmeschema", width: colWidths.schema },
    { text: "Anwendungsgebiet", width: colWidths.indication },
    { text: "Hinweise", width: colWidths.notes },
  ];
  
  for (const header of headers) {
    page.drawText(header.text, {
      x: colX,
      y: headerY - 12,
      size: 8,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    colX += header.width;
  }
  
  y = headerY - 25;
  
  // Table rows
  if (activeCourses.length === 0) {
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 20,
      width: contentWidth,
      height: 25,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    page.drawText("Keine aktiven Medikamente erfasst", {
      x: LAYOUT.margin + 10,
      y: y - 12,
      size: 9,
      font: helvetica,
      color: COLORS.textLight,
    });
    y -= 30;
  } else {
    for (let i = 0; i < activeCourses.length; i++) {
      const course = activeCourses[i];
      const rowHeight = 35;
      
      // Alternating row background
      if (i % 2 === 1) {
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight + 5,
          width: contentWidth,
          height: rowHeight,
          color: COLORS.rowAlt,
        });
      }
      
      // Row border
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - rowHeight + 5,
        width: contentWidth,
        height: rowHeight,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      
      colX = LAYOUT.margin + 5;
      
      // Medication name
      page.drawText(sanitizeForPDF(course.medication_name).substring(0, 22), {
        x: colX,
        y: y - 10,
        size: 9,
        font: helveticaBold,
        color: COLORS.text,
      });
      page.drawText(`seit ${formatDate(course.start_date)}`, {
        x: colX,
        y: y - 22,
        size: 7,
        font: helvetica,
        color: COLORS.textLight,
      });
      colX += colWidths.name;
      
      // Dose/strength
      page.drawText(sanitizeForPDF(course.dose_text || "-").substring(0, 15), {
        x: colX,
        y: y - 10,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      colX += colWidths.dose;
      
      // Schema (extract from dose_text or show type)
      const schemaText = course.type === "prophylaxe" ? "taeglich" : "bei Bedarf";
      page.drawText(schemaText, {
        x: colX,
        y: y - 10,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      colX += colWidths.schema;
      
      // Indication
      page.drawText(getIndication(course.type), {
        x: colX,
        y: y - 10,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      colX += colWidths.indication;
      
      // Notes/side effects
      const notesText = course.note_for_physician || 
        (course.had_side_effects && course.side_effects_text ? `NW: ${course.side_effects_text}` : "-");
      page.drawText(sanitizeForPDF(notesText).substring(0, 18), {
        x: colX,
        y: y - 10,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      y -= rowHeight;
      
      // Page break if needed
      if (y < 150) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.margin;
      }
    }
  }
  
  y -= 25;
  
  // ─────────────────────────────────────────────────────────────────────────
  // MEDICATION HISTORY (INACTIVE/COMPLETED)
  // ─────────────────────────────────────────────────────────────────────────
  
  if (inactiveCourses.length > 0) {
    // Page break if needed
    if (y < 200) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      y = LAYOUT.pageHeight - LAYOUT.margin;
    }
    
    page.drawText("THERAPIEHISTORIE (ABGESCHLOSSENE BEHANDLUNGEN)", {
      x: LAYOUT.margin,
      y: y,
      size: 11,
      font: helveticaBold,
      color: COLORS.primary,
    });
    y -= 20;
    
    // History table header
    const histHeaderY = y;
    page.drawRectangle({
      x: LAYOUT.margin,
      y: histHeaderY - 18,
      width: contentWidth,
      height: 22,
      color: COLORS.primaryLight,
    });
    
    const histHeaders = [
      { text: "Medikament", x: LAYOUT.margin + 5 },
      { text: "Therapieart", x: LAYOUT.margin + 145 },
      { text: "Behandlungszeitraum", x: LAYOUT.margin + 220 },
      { text: "Beendigungsgrund", x: LAYOUT.margin + 340 },
      { text: "Wirkung", x: LAYOUT.margin + 470 },
    ];
    
    for (const h of histHeaders) {
      page.drawText(h.text, {
        x: h.x,
        y: histHeaderY - 12,
        size: 8,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
    }
    
    y = histHeaderY - 25;
    
    for (let i = 0; i < inactiveCourses.length; i++) {
      const course = inactiveCourses[i];
      const rowHeight = 22;
      
      if (i % 2 === 1) {
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight + 5,
          width: contentWidth,
          height: rowHeight,
          color: COLORS.rowAlt,
        });
      }
      
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - rowHeight + 5,
        width: contentWidth,
        height: rowHeight,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      
      // Medication name
      page.drawText(sanitizeForPDF(course.medication_name).substring(0, 22), {
        x: LAYOUT.margin + 5,
        y: y - 10,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      
      // Type
      page.drawText(getTypeLabel(course.type), {
        x: LAYOUT.margin + 145,
        y: y - 10,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      // Period
      const period = `${formatDate(course.start_date)} - ${formatDate(course.end_date)}`;
      page.drawText(period, {
        x: LAYOUT.margin + 220,
        y: y - 10,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      // Discontinuation reason
      page.drawText(getDiscontinuationLabel(course.discontinuation_reason).substring(0, 20), {
        x: LAYOUT.margin + 340,
        y: y - 10,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      // Effectiveness
      const effectText = course.subjective_effectiveness !== null && course.subjective_effectiveness !== undefined
        ? `${course.subjective_effectiveness}/10`
        : "-";
      page.drawText(effectText, {
        x: LAYOUT.margin + 470,
        y: y - 10,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      y -= rowHeight;
      
      // Page break if needed
      if (y < 100) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.margin;
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // FOOTER ON ALL PAGES
  // ─────────────────────────────────────────────────────────────────────────
  
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    
    // Footer line
    p.drawLine({
      start: { x: LAYOUT.margin, y: 35 },
      end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: 35 },
      thickness: 0.5,
      color: COLORS.border,
    });
    
    // Page number
    const pageText = `Seite ${i + 1} von ${pages.length}`;
    const pageWidth = helvetica.widthOfTextAtSize(pageText, 8);
    p.drawText(pageText, {
      x: LAYOUT.pageWidth - LAYOUT.margin - pageWidth,
      y: 22,
      size: 8,
      font: helvetica,
      color: COLORS.textLight,
    });
    
    // App reference
    p.drawText("Erstellt mit Kopfschmerztagebuch-App", {
      x: LAYOUT.margin,
      y: 22,
      size: 8,
      font: helvetica,
      color: COLORS.textLight,
    });
  }
  
  return pdfDoc.save();
}
