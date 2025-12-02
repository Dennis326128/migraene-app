/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF IM BMP-STIL (BUNDESEINHEITLICHER MEDIKATIONSPLAN)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professionelles PDF im Stil des bundeseinheitlichen Medikationsplans.
 * Layout angelehnt an offizielle deutsche Muster.
 * 
 * SPALTEN:
 * - Wirkstoff
 * - Handelsname
 * - Stärke
 * - Form
 * - Dosis (morgens | mittags | abends | nachts)
 * - Einheit
 * - Hinweise
 * - Grund (optional, kann ausgeblendet werden)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { lookupMedicationMetadata, guessMedicationType, suggestAnwendungsgebiet } from "@/lib/medicationLookup";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.1, 0.3, 0.5),           // Professionelles Blau
  headerBg: rgb(0.85, 0.9, 0.95),        // Heller Header
  sectionBg: rgb(0.92, 0.95, 0.92),      // Grünlich für Prophylaxe
  sectionBgOrange: rgb(0.98, 0.95, 0.9), // Orange für Akut
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  border: rgb(0.6, 0.6, 0.6),
  borderLight: rgb(0.8, 0.8, 0.8),
  white: rgb(1, 1, 1),
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,
  marginLeft: 35,
  marginRight: 35,
  marginTop: 40,
  marginBottom: 50,
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
  note_for_physician?: string | null;
};

export type UserMedicationForPlan = {
  id: string;
  name: string;
  wirkstoff?: string | null;
  staerke?: string | null;
  darreichungsform?: string | null;
  einheit?: string | null;
  dosis_morgens?: string | null;
  dosis_mittags?: string | null;
  dosis_abends?: string | null;
  dosis_nacht?: string | null;
  dosis_bedarf?: string | null;
  anwendungsgebiet?: string | null;
  hinweise?: string | null;
  art?: string | null;
  is_active?: boolean | null;
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
  email?: string;
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
  showGrund?: boolean; // Option to show/hide "Grund" column
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sanitize(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/[""]/g, '"').replace(/['']/g, "'")
    .replace(/[–—]/g, "-").replace(/•/g, "-").replace(/…/g, "...")
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
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function getPeriodLabel(periodType: string): string {
  const labels: Record<string, string> = {
    day: "Tag", daily: "Tag",
    week: "Woche", weekly: "Woche",
    month: "Monat", monthly: "Monat",
  };
  return labels[periodType?.toLowerCase()] || "Monat";
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PDF BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export async function buildMedicationPlanPdf(params: BuildMedicationPlanParams): Promise<Uint8Array> {
  const { 
    medicationCourses, 
    userMedications = [], 
    medicationLimits = [], 
    patientData, 
    doctors,
    showGrund = false 
  } = params;
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.marginTop;
  const contentWidth = LAYOUT.pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;
  const creationDate = formatDate(new Date().toISOString());
  
  // Build limits map
  const limitsMap = new Map<string, { limit: number; period: string }>();
  for (const l of medicationLimits) {
    limitsMap.set(l.medication_name.toLowerCase(), { limit: l.limit_count, period: l.period_type });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - BMP STYLE (3 columns)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const headerHeight = 95;
  const col1Width = 160;
  const col2Width = 230;
  const col3Width = contentWidth - col1Width - col2Width;
  
  // Outer border
  page.drawRectangle({
    x: LAYOUT.marginLeft,
    y: y - headerHeight,
    width: contentWidth,
    height: headerHeight,
    borderColor: COLORS.border,
    borderWidth: 1.5,
  });
  
  // Column dividers
  page.drawLine({
    start: { x: LAYOUT.marginLeft + col1Width, y },
    end: { x: LAYOUT.marginLeft + col1Width, y: y - headerHeight },
    thickness: 1,
    color: COLORS.border,
  });
  page.drawLine({
    start: { x: LAYOUT.marginLeft + col1Width + col2Width, y },
    end: { x: LAYOUT.marginLeft + col1Width + col2Width, y: y - headerHeight },
    thickness: 1,
    color: COLORS.border,
  });
  
  // COL 1: Title
  page.drawText("Medikationsplan", {
    x: LAYOUT.marginLeft + 8,
    y: y - 28,
    size: 16,
    font: helveticaBold,
    color: COLORS.primary,
  });
  
  // COL 2: Patient data
  const col2X = LAYOUT.marginLeft + col1Width + 8;
  let patY = y - 16;
  
  if (patientData) {
    const patName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    if (patName) {
      page.drawText("fuer:", { x: col2X, y: patY, size: 8, font: helvetica, color: COLORS.textLight });
      page.drawText(sanitize(patName), { x: col2X + 30, y: patY, size: 9, font: helveticaBold, color: COLORS.text });
      patY -= 14;
    }
    if (patientData.dateOfBirth) {
      page.drawText("geb. am:", { x: col2X, y: patY, size: 8, font: helvetica, color: COLORS.textLight });
      page.drawText(formatDate(patientData.dateOfBirth), { x: col2X + 40, y: patY, size: 9, font: helvetica, color: COLORS.text });
      patY -= 14;
    }
    if (patientData.healthInsurance) {
      page.drawText("Kasse:", { x: col2X, y: patY, size: 8, font: helvetica, color: COLORS.textLight });
      page.drawText(sanitize(patientData.healthInsurance), { x: col2X + 35, y: patY, size: 9, font: helvetica, color: COLORS.text });
      patY -= 14;
    }
    if (patientData.insuranceNumber) {
      page.drawText("Vers.Nr.:", { x: col2X, y: patY, size: 8, font: helvetica, color: COLORS.textLight });
      page.drawText(sanitize(patientData.insuranceNumber), { x: col2X + 42, y: patY, size: 9, font: helvetica, color: COLORS.text });
    }
  }
  
  // Divider in COL2 for doctor
  if (doctors && doctors.length > 0) {
    page.drawLine({
      start: { x: col2X - 8, y: y - 58 },
      end: { x: LAYOUT.marginLeft + col1Width + col2Width, y: y - 58 },
      thickness: 0.5,
      color: COLORS.borderLight,
    });
    
    const doc = doctors[0];
    const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
    let docY = y - 70;
    page.drawText("ausgedruckt von:", { x: col2X, y: docY, size: 7, font: helvetica, color: COLORS.textLight });
    docY -= 11;
    page.drawText(sanitize(docName + (doc.specialty ? ` (${doc.specialty})` : "")), { 
      x: col2X, y: docY, size: 8, font: helvetica, color: COLORS.text 
    });
    if (doc.phone) {
      docY -= 10;
      page.drawText(`Tel: ${doc.phone}`, { x: col2X, y: docY, size: 7, font: helvetica, color: COLORS.textLight });
    }
  }
  
  // COL 3: Creation date + placeholder for QR
  const col3X = LAYOUT.marginLeft + col1Width + col2Width + 8;
  page.drawText("Erstellt am:", { x: col3X, y: y - 16, size: 7, font: helvetica, color: COLORS.textLight });
  page.drawText(creationDate, { x: col3X, y: y - 28, size: 10, font: helveticaBold, color: COLORS.text });
  
  // QR Placeholder
  page.drawRectangle({
    x: col3X + 10,
    y: y - headerHeight + 8,
    width: 45,
    height: 45,
    borderColor: COLORS.borderLight,
    borderWidth: 0.5,
  });
  page.drawText("QR/Logo", { x: col3X + 17, y: y - headerHeight + 27, size: 7, font: helvetica, color: COLORS.textLight });
  
  y -= headerHeight + 15;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PREPARE ALL MEDICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  type MedRow = {
    wirkstoff: string;
    handelsname: string;
    staerke: string;
    form: string;
    morgens: string;
    mittags: string;
    abends: string;
    nachts: string;
    einheit: string;
    hinweise: string;
    grund: string;
    category: "prophylaxe" | "akut" | "bedarf" | "notfall" | "selbstmedikation";
  };
  
  const allMeds: MedRow[] = [];
  
  // Active prophylaxis courses
  const activeProphylaxe = medicationCourses.filter(c => c.is_active && c.type === "prophylaxe");
  const activeOther = medicationCourses.filter(c => c.is_active && c.type !== "prophylaxe");
  
  // Process courses
  for (const course of [...activeProphylaxe, ...activeOther]) {
    const lookup = lookupMedicationMetadata(course.medication_name);
    const isProphylaxe = course.type === "prophylaxe";
    
    // Parse dose_text for schema
    let morgens = "", mittags = "", abends = "", nachts = "";
    let schema = "";
    const doseText = course.dose_text?.toLowerCase() || "";
    
    if (doseText.includes("monat") || doseText.includes("/m")) {
      schema = "1x/Monat";
    } else if (doseText.includes("woche")) {
      schema = "1x/Woche";
    } else if (doseText.includes("2x") || doseText.includes("zweimal")) {
      morgens = "1"; abends = "1";
    } else if (doseText.includes("3x")) {
      morgens = "1"; mittags = "1"; abends = "1";
    } else if (doseText.includes("abend")) {
      abends = "1";
    } else if (doseText.includes("morgen")) {
      morgens = "1";
    } else if (isProphylaxe) {
      morgens = "1";
    }
    
    allMeds.push({
      wirkstoff: sanitize(lookup?.wirkstoff || course.medication_name),
      handelsname: sanitize(course.medication_name),
      staerke: sanitize(lookup?.staerke || ""),
      form: sanitize(lookup?.darreichungsform || "Tbl."),
      morgens: morgens || (schema ? schema : (isProphylaxe ? "" : "b.B.")),
      mittags,
      abends,
      nachts,
      einheit: sanitize(lookup?.einheit || "Stueck"),
      hinweise: sanitize(course.note_for_physician || lookup?.hinweise || ""),
      grund: sanitize(isProphylaxe ? "Migraeneprophylaxe" : (lookup?.anwendungsgebiet || "Akute Migraene")),
      category: isProphylaxe ? "prophylaxe" : "akut",
    });
  }
  
  // Get "Bei Bedarf" medications from user_medications (not in active courses)
  const courseNames = new Set([...activeProphylaxe, ...activeOther].map(c => c.medication_name.toLowerCase()));
  const bedarfMeds = userMedications.filter(m => 
    !courseNames.has(m.name.toLowerCase()) && 
    (m.is_active === null || m.is_active === true)
  );
  
  for (const med of bedarfMeds) {
    const lookup = lookupMedicationMetadata(med.name);
    const limit = limitsMap.get(med.name.toLowerCase());
    
    let hinweise = med.hinweise || lookup?.hinweise || "";
    if (limit) {
      hinweise = `Max. ${limit.limit}x/${getPeriodLabel(limit.period)}` + (hinweise ? `. ${hinweise}` : "");
    }
    
    const art = (med.art || lookup?.art || guessMedicationType(med.name)) as MedRow["category"];
    
    allMeds.push({
      wirkstoff: sanitize(med.wirkstoff || lookup?.wirkstoff || med.name),
      handelsname: sanitize(med.name),
      staerke: sanitize(med.staerke || lookup?.staerke || ""),
      form: sanitize(med.darreichungsform || lookup?.darreichungsform || "Tbl."),
      morgens: med.dosis_morgens || "",
      mittags: med.dosis_mittags || "",
      abends: med.dosis_abends || "",
      nachts: med.dosis_nacht || "",
      einheit: sanitize(med.einheit || lookup?.einheit || "Stueck"),
      hinweise: sanitize(hinweise),
      grund: sanitize(med.anwendungsgebiet || lookup?.anwendungsgebiet || suggestAnwendungsgebiet(med.name, art)),
      category: art === "prophylaxe" ? "bedarf" : art, // Don't duplicate prophylaxe
    });
  }
  
  // Sort by category
  const categoryOrder = { prophylaxe: 0, akut: 1, bedarf: 2, notfall: 3, selbstmedikation: 4 };
  allMeds.sort((a, b) => (categoryOrder[a.category] || 9) - (categoryOrder[b.category] || 9));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW MEDICATION TABLE - BMP STYLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Column widths (adjusted for BMP style with dose sub-columns)
  const colWidths = showGrund
    ? { wirkstoff: 70, handelsname: 70, staerke: 40, form: 45, mo: 22, mi: 22, ab: 22, na: 22, einheit: 35, hinweise: 85, grund: 65 }
    : { wirkstoff: 80, handelsname: 80, staerke: 45, form: 50, mo: 25, mi: 25, ab: 25, na: 25, einheit: 40, hinweise: 105, grund: 0 };
  
  const tableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  const tableX = LAYOUT.marginLeft + (contentWidth - tableWidth) / 2;
  
  // Table header row 1
  const headerRowHeight = 16;
  page.drawRectangle({
    x: tableX,
    y: y - headerRowHeight,
    width: tableWidth,
    height: headerRowHeight,
    color: COLORS.headerBg,
    borderColor: COLORS.border,
    borderWidth: 1,
  });
  
  let hx = tableX + 3;
  const headerFontSize = 7;
  
  page.drawText("Wirkstoff", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += colWidths.wirkstoff;
  page.drawText("Handelsname", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += colWidths.handelsname;
  page.drawText("Staerke", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += colWidths.staerke;
  page.drawText("Form", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += colWidths.form;
  
  // Dose header spanning 4 columns
  const doseWidth = colWidths.mo + colWidths.mi + colWidths.ab + colWidths.na;
  page.drawText("Dosierung", { x: hx + doseWidth / 2 - 15, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += doseWidth;
  
  page.drawText("Einheit", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += colWidths.einheit;
  page.drawText("Hinweise", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  if (showGrund) {
    hx += colWidths.hinweise;
    page.drawText("Grund", { x: hx, y: y - 11, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  }
  
  y -= headerRowHeight;
  
  // Sub-header for dose columns
  const subHeaderHeight = 12;
  page.drawRectangle({
    x: tableX,
    y: y - subHeaderHeight,
    width: tableWidth,
    height: subHeaderHeight,
    color: COLORS.headerBg,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });
  
  // Draw dose sub-headers
  const doseStartX = tableX + colWidths.wirkstoff + colWidths.handelsname + colWidths.staerke + colWidths.form;
  const doseLabels = ["mo", "mi", "ab", "na"];
  const doseLabelText = ["Mo", "Mi", "Ab", "Na"];
  let dx = doseStartX;
  for (let i = 0; i < 4; i++) {
    page.drawText(doseLabelText[i], { 
      x: dx + (colWidths.mo - 8) / 2, 
      y: y - 9, 
      size: 6, 
      font: helvetica, 
      color: COLORS.textLight 
    });
    if (i < 3) {
      page.drawLine({
        start: { x: dx + colWidths.mo, y },
        end: { x: dx + colWidths.mo, y: y - subHeaderHeight },
        thickness: 0.3,
        color: COLORS.borderLight,
      });
    }
    dx += colWidths.mo;
  }
  
  y -= subHeaderHeight;
  
  // Check for empty list
  if (allMeds.length === 0) {
    const emptyRowH = 25;
    page.drawRectangle({
      x: tableX,
      y: y - emptyRowH,
      width: tableWidth,
      height: emptyRowH,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    page.drawText("Keine aktiven Medikamente erfasst", {
      x: tableX + 10,
      y: y - 17,
      size: 9,
      font: helvetica,
      color: COLORS.textLight,
    });
    y -= emptyRowH + 20;
  } else {
    // Group and draw medications
    let currentCategory = "";
    
    for (const med of allMeds) {
      // Check page break
      if (y < LAYOUT.marginBottom + 80) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.marginTop;
        
        // Repeat header on new page
        page.drawText(`Medikationsplan - ${patientData?.firstName || ""} ${patientData?.lastName || ""} (Fortsetzung)`, {
          x: LAYOUT.marginLeft,
          y: y - 15,
          size: 10,
          font: helveticaBold,
          color: COLORS.primary,
        });
        y -= 30;
      }
      
      // Category section header
      if (med.category !== currentCategory) {
        currentCategory = med.category;
        const sectionLabels: Record<string, string> = {
          prophylaxe: "Prophylaktische Medikation (Dauermedikation)",
          akut: "Akutmedikation",
          bedarf: "Bei Bedarf anzuwendende Medikamente",
          notfall: "Notfallmedikation",
          selbstmedikation: "Selbstmedikation",
        };
        
        const sectionRowH = 14;
        const sectionColor = currentCategory === "prophylaxe" ? COLORS.sectionBg : 
                            currentCategory === "akut" ? COLORS.sectionBgOrange : rgb(0.95, 0.95, 0.98);
        
        page.drawRectangle({
          x: tableX,
          y: y - sectionRowH,
          width: tableWidth,
          height: sectionRowH,
          color: sectionColor,
          borderColor: COLORS.border,
          borderWidth: 0.5,
        });
        page.drawText(sectionLabels[currentCategory] || "Sonstige", {
          x: tableX + 5,
          y: y - 10,
          size: 7,
          font: helveticaBold,
          color: COLORS.text,
        });
        y -= sectionRowH;
      }
      
      // Calculate row height based on hinweise length
      const hinweiseLines = wrapText(med.hinweise || "-", helvetica, 6, colWidths.hinweise - 4);
      const rowHeight = Math.max(22, 10 + hinweiseLines.length * 8);
      
      // Draw row
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        borderColor: COLORS.borderLight,
        borderWidth: 0.5,
      });
      
      // Draw cell contents
      let cx = tableX + 3;
      const textY = y - 12;
      const fontSize = 7;
      
      // Wirkstoff
      page.drawText(med.wirkstoff.substring(0, 14), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += colWidths.wirkstoff;
      
      // Handelsname
      page.drawText(med.handelsname.substring(0, 14), { x: cx, y: textY, size: fontSize, font: helveticaBold, color: COLORS.text });
      cx += colWidths.handelsname;
      
      // Stärke
      page.drawText(med.staerke.substring(0, 10), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += colWidths.staerke;
      
      // Form
      page.drawText(med.form.substring(0, 10), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += colWidths.form;
      
      // Dose columns with vertical lines
      const doseVals = [med.morgens || "-", med.mittags || "-", med.abends || "-", med.nachts || "-"];
      for (let i = 0; i < 4; i++) {
        // Vertical separator
        page.drawLine({
          start: { x: cx, y },
          end: { x: cx, y: y - rowHeight },
          thickness: 0.3,
          color: COLORS.borderLight,
        });
        const val = doseVals[i] === "b.B." ? "b.B." : doseVals[i];
        page.drawText(val.substring(0, 6), { x: cx + 2, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
        cx += colWidths.mo;
      }
      
      // Vertical separator before Einheit
      page.drawLine({
        start: { x: cx, y },
        end: { x: cx, y: y - rowHeight },
        thickness: 0.3,
        color: COLORS.borderLight,
      });
      
      // Einheit
      page.drawText(med.einheit.substring(0, 8), { x: cx + 2, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += colWidths.einheit;
      
      // Vertical separator
      page.drawLine({
        start: { x: cx, y },
        end: { x: cx, y: y - rowHeight },
        thickness: 0.3,
        color: COLORS.borderLight,
      });
      
      // Hinweise (multi-line)
      let hinY = textY;
      for (const line of hinweiseLines.slice(0, 4)) {
        page.drawText(line, { x: cx + 2, y: hinY, size: 6, font: helvetica, color: COLORS.text });
        hinY -= 8;
      }
      cx += colWidths.hinweise;
      
      // Grund (optional)
      if (showGrund) {
        page.drawLine({
          start: { x: cx, y },
          end: { x: cx, y: y - rowHeight },
          thickness: 0.3,
          color: COLORS.borderLight,
        });
        const grundLines = wrapText(med.grund || "-", helvetica, 6, colWidths.grund - 4);
        let gY = textY;
        for (const line of grundLines.slice(0, 3)) {
          page.drawText(line, { x: cx + 2, y: gY, size: 6, font: helvetica, color: COLORS.text });
          gY -= 8;
        }
      }
      
      y -= rowHeight;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);
    
    // Page number
    p.drawText(`Seite ${i + 1} von ${totalPages}`, {
      x: LAYOUT.pageWidth - LAYOUT.marginRight - 60,
      y: 25,
      size: 8,
      font: helvetica,
      color: COLORS.textLight,
    });
    
    // Disclaimer
    p.drawText("Automatisch generiert mit der Kopfschmerztagebuch-App. Dieser Plan ersetzt keine aerztliche Beratung.", {
      x: LAYOUT.marginLeft,
      y: 25,
      size: 7,
      font: helvetica,
      color: COLORS.textLight,
    });
  }
  
  return pdfDoc.save();
}
