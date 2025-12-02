/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF IM BMP-STIL (BUNDESEINHEITLICHER MEDIKATIONSPLAN)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professionelles PDF im Stil des bundeseinheitlichen Medikationsplans.
 * Enthält ALLE relevanten Medikamente:
 * - Prophylaktische Medikamente (aus medication_courses)
 * - Akutmedikation / Bei-Bedarf-Medikamente (aus user_medications)
 * - Medikamente mit definierten Limits
 * 
 * STRUKTUR:
 * ─────────
 * - Kopfbereich mit Titel und Erstellungsdatum
 * - Patientendaten (Name, Geburtsdatum, Versicherung)
 * - Behandelnde Ärzte
 * - Aktuelle Medikation (Tabelle im BMP-Stil)
 * - Therapiehistorie (abgeschlossene Prophylaxe-Verläufe)
 * - Hinweise und Disclaimer
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.15, 0.35, 0.55),      // Professionelles Blau
  primaryDark: rgb(0.1, 0.25, 0.45),   // Dunkleres Blau für Header
  text: rgb(0.1, 0.1, 0.1),            // Haupttext
  textLight: rgb(0.35, 0.35, 0.35),    // Sekundärtext
  border: rgb(0.75, 0.75, 0.75),       // Rahmenlinien
  headerBg: rgb(0.9, 0.93, 0.97),      // Heller Hintergrund für Header
  rowAlt: rgb(0.96, 0.96, 0.96),       // Alternierende Zeilenfarbe
  white: rgb(1, 1, 1),
  accent: rgb(0.2, 0.6, 0.4),          // Grün für Akzente
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,   // A4
  margin: 45,           // Seitenrand
  lineHeight: 13,       // Standard-Zeilenabstand
  sectionGap: 18,       // Abstand zwischen Abschnitten
};

export type MedicationCourseForPlan = {
  id: string;
  medication_name: string;
  type: string;
  dose_text?: string | null;
  start_date: string | null;
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

export type UserMedicationForPlan = {
  id: string;
  name: string;
  // Optional limit info
  limit_count?: number | null;
  period_type?: string | null;
};

type PatientData = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
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
  userMedications?: UserMedicationForPlan[];
  medicationLimits?: Array<{
    medication_name: string;
    limit_count: number;
    period_type: string;
  }>;
  patientData?: PatientData;
  doctors?: DoctorData[];
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sanitizeForPDF(text: string | undefined | null): string {
  if (!text) return "";
  
  return text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/⌀/g, "O")
    .replace(/∅/g, "O")
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

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    prophylaxe: "Prophylaxe",
    akut: "Akutmedikation",
    sonstige: "Sonstige",
    bedarf: "Bei Bedarf",
  };
  return labels[type?.toLowerCase()] || "Sonstige";
}

function getIndication(type: string): string {
  const indications: Record<string, string> = {
    prophylaxe: "Migraeneprophylaxe",
    akut: "Akute Migraene",
    sonstige: "Kopfschmerz",
    bedarf: "Bei Bedarf",
  };
  return indications[type?.toLowerCase()] || "Migraene/Kopfschmerz";
}

function getPeriodLabel(periodType: string): string {
  const labels: Record<string, string> = {
    day: "Tag",
    daily: "Tag",
    week: "Woche",
    weekly: "Woche",
    month: "Monat",
    monthly: "Monat",
  };
  return labels[periodType?.toLowerCase()] || "Monat";
}

function getDiscontinuationLabel(reason: string | null | undefined): string {
  if (!reason) return "-";
  const labels: Record<string, string> = {
    keine_wirkung: "Keine Wirkung",
    nebenwirkungen: "Nebenwirkungen",
    migraene_gebessert: "Besserung",
    kinderwunsch: "Kinderwunsch",
    andere: "Sonstige",
  };
  return labels[reason] || reason;
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function drawTableHeader(
  page: PDFPage, 
  y: number, 
  contentWidth: number, 
  font: PDFFont,
  headers: { text: string; width: number }[]
): number {
  const headerHeight = 24;
  
  // Header background
  page.drawRectangle({
    x: LAYOUT.margin,
    y: y - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: COLORS.primaryDark,
  });
  
  // Header text
  let x = LAYOUT.margin + 6;
  for (const header of headers) {
    page.drawText(sanitizeForPDF(header.text), {
      x,
      y: y - 16,
      size: 8,
      font,
      color: COLORS.white,
    });
    x += header.width;
  }
  
  return y - headerHeight - 2;
}

function checkPageBreak(
  pdfDoc: PDFDocument,
  page: PDFPage,
  y: number,
  requiredHeight: number = 100
): { page: PDFPage; y: number } {
  if (y < LAYOUT.margin + requiredHeight) {
    const newPage = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    return { page: newPage, y: LAYOUT.pageHeight - LAYOUT.margin - 20 };
  }
  return { page, y };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PDF BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export async function buildMedicationPlanPdf(params: BuildMedicationPlanParams): Promise<Uint8Array> {
  const { medicationCourses, userMedications = [], medicationLimits = [], patientData, doctors } = params;
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.margin;
  
  const contentWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
  
  // ─────────────────────────────────────────────────────────────────────────
  // HEADER - PROFESSIONAL TITLE
  // ─────────────────────────────────────────────────────────────────────────
  
  // Blue header bar
  page.drawRectangle({
    x: 0,
    y: LAYOUT.pageHeight - 65,
    width: LAYOUT.pageWidth,
    height: 65,
    color: COLORS.primary,
  });
  
  // Title
  page.drawText("MEDIKATIONSPLAN", {
    x: LAYOUT.margin,
    y: LAYOUT.pageHeight - 40,
    size: 22,
    font: helveticaBold,
    color: COLORS.white,
  });
  
  // Subtitle
  page.drawText("Kopfschmerztagebuch - Aktuelle Medikation", {
    x: LAYOUT.margin,
    y: LAYOUT.pageHeight - 56,
    size: 10,
    font: helvetica,
    color: rgb(0.85, 0.9, 0.95),
  });
  
  // Creation date on the right
  const creationDate = formatDate(new Date().toISOString());
  const dateText = `Erstellt: ${creationDate}`;
  const dateWidth = helvetica.widthOfTextAtSize(dateText, 10);
  page.drawText(dateText, {
    x: LAYOUT.pageWidth - LAYOUT.margin - dateWidth,
    y: LAYOUT.pageHeight - 40,
    size: 10,
    font: helvetica,
    color: COLORS.white,
  });
  
  y = LAYOUT.pageHeight - 85;
  
  // ─────────────────────────────────────────────────────────────────────────
  // PATIENT DATA BOX
  // ─────────────────────────────────────────────────────────────────────────
  
  if (patientData && (patientData.firstName || patientData.lastName)) {
    const boxHeight = 65;
    
    // Box border
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - boxHeight,
      width: contentWidth,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    
    // Section header
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 18,
      width: contentWidth,
      height: 18,
      color: COLORS.headerBg,
    });
    
    page.drawText("PATIENTENDATEN", {
      x: LAYOUT.margin + 8,
      y: y - 13,
      size: 9,
      font: helveticaBold,
      color: COLORS.primary,
    });
    
    // Left column
    const patientName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    
    page.drawText("Name:", {
      x: LAYOUT.margin + 8,
      y: y - 35,
      size: 8,
      font: helveticaBold,
      color: COLORS.textLight,
    });
    page.drawText(sanitizeForPDF(patientName) || "-", {
      x: LAYOUT.margin + 70,
      y: y - 35,
      size: 9,
      font: helvetica,
      color: COLORS.text,
    });
    
    page.drawText("Geburtsdatum:", {
      x: LAYOUT.margin + 8,
      y: y - 50,
      size: 8,
      font: helveticaBold,
      color: COLORS.textLight,
    });
    page.drawText(formatDate(patientData.dateOfBirth), {
      x: LAYOUT.margin + 70,
      y: y - 50,
      size: 9,
      font: helvetica,
      color: COLORS.text,
    });
    
    // Right column
    const midX = LAYOUT.margin + contentWidth / 2;
    
    if (patientData.healthInsurance) {
      page.drawText("Krankenkasse:", {
        x: midX,
        y: y - 35,
        size: 8,
        font: helveticaBold,
        color: COLORS.textLight,
      });
      page.drawText(sanitizeForPDF(patientData.healthInsurance), {
        x: midX + 70,
        y: y - 35,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
    }
    
    if (patientData.insuranceNumber) {
      page.drawText("Versichertennr.:", {
        x: midX,
        y: y - 50,
        size: 8,
        font: helveticaBold,
        color: COLORS.textLight,
      });
      page.drawText(sanitizeForPDF(patientData.insuranceNumber), {
        x: midX + 70,
        y: y - 50,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
    }
    
    y -= boxHeight + 12;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DOCTORS BOX
  // ─────────────────────────────────────────────────────────────────────────
  
  if (doctors && doctors.length > 0) {
    const boxHeight = 18 + Math.min(doctors.length, 3) * 16;
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - boxHeight,
      width: contentWidth,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 18,
      width: contentWidth,
      height: 18,
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
    for (let i = 0; i < Math.min(doctors.length, 3); i++) {
      const doc = doctors[i];
      const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
      const specialty = doc.specialty ? ` (${sanitizeForPDF(doc.specialty)})` : "";
      const phone = doc.phone ? ` | Tel: ${doc.phone}` : "";
      
      page.drawText(sanitizeForPDF(`${docName}${specialty}${phone}`), {
        x: LAYOUT.margin + 8,
        y: docY,
        size: 9,
        font: helvetica,
        color: COLORS.text,
      });
      docY -= 16;
    }
    
    y -= boxHeight + 15;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PREPARE MEDICATION DATA
  // ─────────────────────────────────────────────────────────────────────────
  
  // Active prophylaxis courses
  const activeProphylaxe = medicationCourses.filter(c => c.is_active && c.type === "prophylaxe");
  const activeAkut = medicationCourses.filter(c => c.is_active && c.type !== "prophylaxe");
  const inactiveCourses = medicationCourses.filter(c => !c.is_active);
  
  // Build limits map for quick lookup
  const limitsMap = new Map<string, { limit: number; period: string }>();
  for (const limit of medicationLimits) {
    limitsMap.set(limit.medication_name.toLowerCase(), {
      limit: limit.limit_count,
      period: limit.period_type,
    });
  }
  
  // Get "Bei Bedarf" medications - user_medications that are NOT in active courses
  const activeCourseNames = new Set(
    [...activeProphylaxe, ...activeAkut].map(c => c.medication_name.toLowerCase())
  );
  const bedarfMedications = userMedications.filter(
    m => !activeCourseNames.has(m.name.toLowerCase())
  );
  
  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: AKTUELLE MEDIKATION
  // ─────────────────────────────────────────────────────────────────────────
  
  page.drawText("AKTUELLE MEDIKATION", {
    x: LAYOUT.margin,
    y: y,
    size: 12,
    font: helveticaBold,
    color: COLORS.primary,
  });
  
  page.drawLine({
    start: { x: LAYOUT.margin, y: y - 5 },
    end: { x: LAYOUT.margin + contentWidth, y: y - 5 },
    thickness: 2,
    color: COLORS.primary,
  });
  
  y -= 25;
  
  // Column definitions
  const columns = [
    { text: "Wirkstoff/Handelsname", width: 130 },
    { text: "Dosierung", width: 80 },
    { text: "Einnahmeschema", width: 95 },
    { text: "Anwendungsgebiet", width: 95 },
    { text: "Hinweise", width: contentWidth - 400 },
  ];
  
  y = drawTableHeader(page, y, contentWidth, helveticaBold, columns);
  
  // Check if we have any medications
  const totalActiveMeds = activeProphylaxe.length + activeAkut.length + bedarfMedications.length;
  
  if (totalActiveMeds === 0) {
    // Empty state
    page.drawRectangle({
      x: LAYOUT.margin,
      y: y - 30,
      width: contentWidth,
      height: 30,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    page.drawText("Keine aktiven Medikamente erfasst", {
      x: LAYOUT.margin + 10,
      y: y - 20,
      size: 9,
      font: helvetica,
      color: COLORS.textLight,
    });
    y -= 40;
  } else {
    let rowIndex = 0;
    
    // ═══════════════════════════════════════════════════════════════════════
    // A) PROPHYLAXE-MEDIKAMENTE (from medication_courses)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (activeProphylaxe.length > 0) {
      // Section sub-header
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - 18,
        width: contentWidth,
        height: 18,
        color: rgb(0.92, 0.96, 0.92),
      });
      page.drawText("Prophylaktische Medikation (Dauermedikation)", {
        x: LAYOUT.margin + 6,
        y: y - 13,
        size: 8,
        font: helveticaBold,
        color: COLORS.accent,
      });
      y -= 20;
      
      for (const course of activeProphylaxe) {
        const rowHeight = 32;
        
        ({ page, y } = checkPageBreak(pdfDoc, page, y, rowHeight + 20));
        
        // Alternating row background
        if (rowIndex % 2 === 1) {
          page.drawRectangle({
            x: LAYOUT.margin,
            y: y - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: COLORS.rowAlt,
          });
        }
        
        // Row border
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          borderColor: COLORS.border,
          borderWidth: 0.5,
        });
        
        let colX = LAYOUT.margin + 6;
        
        // Column 1: Medication name
        const medName = sanitizeForPDF(course.medication_name);
        page.drawText(medName.substring(0, 24), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helveticaBold,
          color: COLORS.text,
        });
        if (course.start_date) {
          page.drawText(`seit ${formatDate(course.start_date)}`, {
            x: colX,
            y: y - 24,
            size: 7,
            font: helvetica,
            color: COLORS.textLight,
          });
        }
        colX += columns[0].width;
        
        // Column 2: Dosierung
        const doseText = sanitizeForPDF(course.dose_text || "-");
        page.drawText(doseText.substring(0, 14), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[1].width;
        
        // Column 3: Einnahmeschema
        // Parse dose_text for schema info or use default
        let schema = "1x taeglich";
        if (course.dose_text) {
          const dLower = course.dose_text.toLowerCase();
          if (dLower.includes("monat") || dLower.includes("/monat") || dLower.includes("1x/m")) {
            schema = "1x monatlich";
          } else if (dLower.includes("woche") || dLower.includes("/woche")) {
            schema = "1x woechentlich";
          } else if (dLower.includes("2x") || dLower.includes("zweimal")) {
            schema = "2x taeglich";
          } else if (dLower.includes("3x") || dLower.includes("dreimal")) {
            schema = "3x taeglich";
          } else if (dLower.includes("abend")) {
            schema = "abends";
          } else if (dLower.includes("morgen")) {
            schema = "morgens";
          }
        }
        page.drawText(schema, {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[2].width;
        
        // Column 4: Anwendungsgebiet
        page.drawText("Migraeneprophylaxe", {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[3].width;
        
        // Column 5: Hinweise
        const notes = course.note_for_physician || 
          (course.had_side_effects && course.side_effects_text ? `NW: ${course.side_effects_text}` : "");
        if (notes) {
          const wrappedNotes = wrapText(sanitizeForPDF(notes), helvetica, 7, columns[4].width - 10);
          let noteY = y - 10;
          for (let i = 0; i < Math.min(wrappedNotes.length, 3); i++) {
            page.drawText(wrappedNotes[i], {
              x: colX,
              y: noteY,
              size: 7,
              font: helvetica,
              color: COLORS.text,
            });
            noteY -= 9;
          }
        } else {
          page.drawText("-", {
            x: colX,
            y: y - 12,
            size: 8,
            font: helvetica,
            color: COLORS.textLight,
          });
        }
        
        y -= rowHeight;
        rowIndex++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // B) AKUT-MEDIKAMENTE (from medication_courses, type != prophylaxe)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (activeAkut.length > 0) {
      ({ page, y } = checkPageBreak(pdfDoc, page, y, 60));
      
      y -= 8;
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - 18,
        width: contentWidth,
        height: 18,
        color: rgb(0.96, 0.94, 0.9),
      });
      page.drawText("Akutmedikation (dokumentierte Behandlungen)", {
        x: LAYOUT.margin + 6,
        y: y - 13,
        size: 8,
        font: helveticaBold,
        color: rgb(0.6, 0.4, 0.2),
      });
      y -= 20;
      
      for (const course of activeAkut) {
        const rowHeight = 32;
        
        ({ page, y } = checkPageBreak(pdfDoc, page, y, rowHeight + 20));
        
        if (rowIndex % 2 === 1) {
          page.drawRectangle({
            x: LAYOUT.margin,
            y: y - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: COLORS.rowAlt,
          });
        }
        
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          borderColor: COLORS.border,
          borderWidth: 0.5,
        });
        
        let colX = LAYOUT.margin + 6;
        
        // Column 1: Medication name
        page.drawText(sanitizeForPDF(course.medication_name).substring(0, 24), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helveticaBold,
          color: COLORS.text,
        });
        colX += columns[0].width;
        
        // Column 2: Dosierung
        page.drawText(sanitizeForPDF(course.dose_text || "-").substring(0, 14), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[1].width;
        
        // Column 3: Schema
        page.drawText("Bei Bedarf", {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[2].width;
        
        // Column 4: Anwendungsgebiet
        page.drawText(getIndication(course.type), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[3].width;
        
        // Column 5: Hinweise
        const notes = course.note_for_physician || "-";
        page.drawText(sanitizeForPDF(notes).substring(0, 25), {
          x: colX,
          y: y - 12,
          size: 7,
          font: helvetica,
          color: COLORS.text,
        });
        
        y -= rowHeight;
        rowIndex++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // C) BEI-BEDARF-MEDIKAMENTE (from user_medications)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (bedarfMedications.length > 0) {
      ({ page, y } = checkPageBreak(pdfDoc, page, y, 60));
      
      y -= 8;
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - 18,
        width: contentWidth,
        height: 18,
        color: rgb(0.9, 0.94, 0.98),
      });
      page.drawText("Bei-Bedarf-Medikation (Triptane, Schmerzmittel, etc.)", {
        x: LAYOUT.margin + 6,
        y: y - 13,
        size: 8,
        font: helveticaBold,
        color: rgb(0.2, 0.4, 0.6),
      });
      y -= 20;
      
      for (const med of bedarfMedications) {
        const rowHeight = 28;
        
        ({ page, y } = checkPageBreak(pdfDoc, page, y, rowHeight + 20));
        
        if (rowIndex % 2 === 1) {
          page.drawRectangle({
            x: LAYOUT.margin,
            y: y - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: COLORS.rowAlt,
          });
        }
        
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          borderColor: COLORS.border,
          borderWidth: 0.5,
        });
        
        let colX = LAYOUT.margin + 6;
        
        // Column 1: Medication name
        page.drawText(sanitizeForPDF(med.name).substring(0, 24), {
          x: colX,
          y: y - 12,
          size: 9,
          font: helveticaBold,
          color: COLORS.text,
        });
        colX += columns[0].width;
        
        // Column 2: Dosierung
        page.drawText("-", {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.textLight,
        });
        colX += columns[1].width;
        
        // Column 3: Schema - with limit info if available
        const limitInfo = limitsMap.get(med.name.toLowerCase());
        let schemaText = "Bei Bedarf";
        if (limitInfo) {
          const periodLabel = getPeriodLabel(limitInfo.period);
          schemaText = `Bei Bedarf, max. ${limitInfo.limit}/${periodLabel}`;
        }
        page.drawText(schemaText, {
          x: colX,
          y: y - 12,
          size: 8,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[2].width;
        
        // Column 4: Anwendungsgebiet
        // Try to categorize common medications
        let indication = "Migraene/Kopfschmerz";
        const nameLower = med.name.toLowerCase();
        if (nameLower.includes("triptan") || nameLower.includes("rizatriptan") || 
            nameLower.includes("sumatriptan") || nameLower.includes("zolmitriptan")) {
          indication = "Akute Migraene";
        } else if (nameLower.includes("ibuprofen") || nameLower.includes("paracetamol") || 
                   nameLower.includes("aspirin") || nameLower.includes("ass") ||
                   nameLower.includes("novaminsulfon") || nameLower.includes("metamizol")) {
          indication = "Schmerz/Migraene";
        } else if (nameLower.includes("diazepam") || nameLower.includes("lorazepam")) {
          indication = "Notfall/Angst";
        } else if (nameLower.includes("zopiclon") || nameLower.includes("zolpidem")) {
          indication = "Schlafstoerungen";
        } else if (nameLower.includes("mcp") || nameLower.includes("metoclopramid") ||
                   nameLower.includes("domperidon") || nameLower.includes("vomex")) {
          indication = "Uebelkeit";
        }
        
        page.drawText(indication, {
          x: colX,
          y: y - 12,
          size: 9,
          font: helvetica,
          color: COLORS.text,
        });
        colX += columns[3].width;
        
        // Column 5: Hinweise - show limit warning if applicable
        let hinweis = "-";
        if (limitInfo) {
          hinweis = `Limit: ${limitInfo.limit}x pro ${getPeriodLabel(limitInfo.period)}`;
        }
        page.drawText(sanitizeForPDF(hinweis), {
          x: colX,
          y: y - 12,
          size: 7,
          font: helvetica,
          color: limitInfo ? rgb(0.6, 0.3, 0.1) : COLORS.textLight,
        });
        
        y -= rowHeight;
        rowIndex++;
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // SECTION: THERAPIEHISTORIE (abgeschlossene Behandlungen)
  // ─────────────────────────────────────────────────────────────────────────
  
  if (inactiveCourses.length > 0) {
    ({ page, y } = checkPageBreak(pdfDoc, page, y, 120));
    
    y -= 25;
    
    page.drawText("THERAPIEHISTORIE (Abgeschlossene Behandlungen)", {
      x: LAYOUT.margin,
      y: y,
      size: 12,
      font: helveticaBold,
      color: COLORS.primary,
    });
    
    page.drawLine({
      start: { x: LAYOUT.margin, y: y - 5 },
      end: { x: LAYOUT.margin + contentWidth, y: y - 5 },
      thickness: 1.5,
      color: COLORS.primary,
    });
    
    y -= 25;
    
    // History table header
    const histColumns = [
      { text: "Medikament", width: 120 },
      { text: "Typ", width: 70 },
      { text: "Zeitraum", width: 130 },
      { text: "Beendigungsgrund", width: 120 },
      { text: "Wirkung", width: contentWidth - 440 },
    ];
    
    y = drawTableHeader(page, y, contentWidth, helveticaBold, histColumns);
    
    for (let i = 0; i < inactiveCourses.length; i++) {
      const course = inactiveCourses[i];
      const rowHeight = 24;
      
      ({ page, y } = checkPageBreak(pdfDoc, page, y, rowHeight + 20));
      
      if (i % 2 === 1) {
        page.drawRectangle({
          x: LAYOUT.margin,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: COLORS.rowAlt,
        });
      }
      
      page.drawRectangle({
        x: LAYOUT.margin,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      
      let colX = LAYOUT.margin + 6;
      
      // Medikament
      page.drawText(sanitizeForPDF(course.medication_name).substring(0, 20), {
        x: colX,
        y: y - 15,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      colX += histColumns[0].width;
      
      // Typ
      page.drawText(getTypeLabel(course.type), {
        x: colX,
        y: y - 15,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      colX += histColumns[1].width;
      
      // Zeitraum
      const startDate = course.start_date ? formatDate(course.start_date) : "?";
      const endDate = course.end_date ? formatDate(course.end_date) : "?";
      page.drawText(`${startDate} - ${endDate}`, {
        x: colX,
        y: y - 15,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      colX += histColumns[2].width;
      
      // Beendigungsgrund
      page.drawText(getDiscontinuationLabel(course.discontinuation_reason), {
        x: colX,
        y: y - 15,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      colX += histColumns[3].width;
      
      // Wirkung
      const effectText = course.subjective_effectiveness !== null && course.subjective_effectiveness !== undefined
        ? `${course.subjective_effectiveness}/10`
        : "-";
      page.drawText(effectText, {
        x: colX,
        y: y - 15,
        size: 8,
        font: helvetica,
        color: COLORS.text,
      });
      
      y -= rowHeight;
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
      start: { x: LAYOUT.margin, y: 40 },
      end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: 40 },
      thickness: 0.5,
      color: COLORS.border,
    });
    
    // Page number
    const pageText = `Seite ${i + 1} von ${pages.length}`;
    const pageNumWidth = helvetica.widthOfTextAtSize(pageText, 8);
    p.drawText(pageText, {
      x: LAYOUT.pageWidth - LAYOUT.margin - pageNumWidth,
      y: 28,
      size: 8,
      font: helvetica,
      color: COLORS.textLight,
    });
    
    // App reference
    p.drawText("Erstellt mit Kopfschmerztagebuch-App", {
      x: LAYOUT.margin,
      y: 28,
      size: 8,
      font: helvetica,
      color: COLORS.textLight,
    });
    
    // Disclaimer
    p.drawText("Dieser Plan ersetzt keine aerztliche Beratung.", {
      x: LAYOUT.margin + 170,
      y: 28,
      size: 7,
      font: helvetica,
      color: COLORS.textLight,
    });
  }
  
  return pdfDoc.save();
}
