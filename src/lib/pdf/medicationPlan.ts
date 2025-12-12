/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF - DEUTSCHER STANDARD (BMP-ÄHNLICH)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professionelles PDF im Stil des deutschen Bundeseinheitlichen Medikationsplans.
 * 
 * PRIMÄRE DATENQUELLE: user_medications (nicht medication_courses!)
 * medication_courses werden nur für Verlaufsinformationen ergänzt.
 * 
 * SECTIONS:
 * 1. Aktuelle Medikation (Regelmäßig + Bei Bedarf)
 * 2. Unverträglichkeiten / Allergien (optional)
 * 3. Früher verwendete Medikamente (optional)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.12, 0.30, 0.50),           // Dunkelblau (BMP-Stil)
  headerBg: rgb(0.90, 0.93, 0.96),          // Hellgrau-Blau
  sectionRegular: rgb(0.92, 0.96, 0.92),    // Leichtes Grün
  sectionBedarf: rgb(0.96, 0.96, 0.92),     // Leichtes Gelb
  sectionInactive: rgb(0.94, 0.94, 0.94),   // Grau
  sectionIntolerance: rgb(0.98, 0.92, 0.92), // Leichtes Rot
  text: rgb(0.1, 0.1, 0.1),
  textMuted: rgb(0.4, 0.4, 0.4),
  border: rgb(0.6, 0.6, 0.6),
  borderLight: rgb(0.82, 0.82, 0.82),
  white: rgb(1, 1, 1),
  warning: rgb(0.8, 0.2, 0.2),
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,
  marginLeft: 35,
  marginRight: 35,
  marginTop: 40,
  marginBottom: 50,
};

// Column widths for medication table - optimized for readable "Grund" column
const COL_WIDTHS = {
  wirkstoff: 75,      // narrower (-15)
  handelsname: 90,    // narrower (-10)
  staerke: 42,        // narrower (-8)
  form: 45,           // narrower (-10)
  mo: 24,             // narrower (-4)
  mi: 24,             // narrower (-4)
  ab: 24,             // narrower (-4)
  na: 24,             // narrower (-4)
  einheit: 38,        // narrower (-7)
  grund: 136,         // MUCH wider (+66) - now ~26% of table width
};

const TABLE_WIDTH = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  intolerance_flag?: boolean | null;
  intolerance_notes?: string | null;
  intolerance_reason_type?: string | null;
  discontinued_at?: string | null;
  // New structured fields
  intake_type?: string | null;
  strength_value?: string | null;
  strength_unit?: string | null;
  as_needed_standard_dose?: string | null;
  as_needed_max_per_24h?: number | null;
  as_needed_max_days_per_month?: number | null;
  as_needed_min_interval_hours?: number | null;
  as_needed_notes?: string | null;
  regular_weekdays?: string[] | null;
  regular_notes?: string | null;
  medication_status?: string | null;
};

export type MedicationCourseForPlan = {
  id: string;
  medication_name: string;
  medication_id?: string | null;
  type: string;
  dose_text?: string | null;
  start_date: string | null;
  end_date?: string | null;
  is_active: boolean;
  discontinuation_reason?: string | null;
  discontinuation_details?: string | null;
  side_effects_text?: string | null;
};

type PatientData = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  fax?: string;
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
  fax?: string;
  email?: string;
};

export type PdfExportOptions = {
  includeActive: boolean;
  includeInactive: boolean;
  includeIntolerance: boolean;
  includeLimits: boolean;
  includeGrund: boolean;
};

export type BuildMedicationPlanParams = {
  userMedications?: UserMedicationForPlan[];
  medicationCourses?: MedicationCourseForPlan[];
  medicationLimits?: Array<{
    medication_name: string;
    limit_count: number;
    period_type: string;
  }>;
  patientData?: PatientData;
  doctors?: DoctorData[];
  options?: Partial<PdfExportOptions>;
};

// Default export options
const DEFAULT_OPTIONS: PdfExportOptions = {
  includeActive: true,
  includeInactive: false,
  includeIntolerance: true,
  includeLimits: false,
  includeGrund: true,
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
    .replace(/×/g, "x")
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

function getPeriodLabel(periodType: string): string {
  const labels: Record<string, string> = {
    day: "Tag", daily: "Tag",
    week: "Woche", weekly: "Woche",
    month: "Monat", monthly: "Monat",
  };
  return labels[periodType?.toLowerCase()] || "Monat";
}

function getDiscontinuationReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    keine_wirkung: "Keine Wirkung",
    nebenwirkungen: "Nebenwirkungen",
    migraene_gebessert: "Besserung",
    kinderwunsch: "Kinderwunsch",
    andere: "Andere Gruende",
  };
  return labels[reason || ""] || reason || "";
}

function getIntoleranceReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    allergie: "Allergie",
    nebenwirkungen: "Nebenwirkungen",
    wirkungslos: "Keine Wirkung",
    sonstiges: "Sonstiges",
  };
  return labels[reason || ""] || reason || "";
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 2) + "..";
}

/**
 * Wrap text to fit within a given width, returning multiple lines
 * Used for the "Grund" column to enable multi-line text
 */
function wrapText(
  text: string, 
  font: PDFFont, 
  fontSize: number, 
  maxWidth: number
): { lines: string[]; height: number } {
  if (!text) return { lines: [], height: 0 };
  
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // Handle very long words that exceed maxWidth
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        // Truncate long single words
        let truncated = word;
        while (font.widthOfTextAtSize(truncated + "..", fontSize) > maxWidth && truncated.length > 3) {
          truncated = truncated.slice(0, -1);
        }
        currentLine = truncated + "..";
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  const lineHeight = fontSize * 1.4;
  return { lines, height: Math.max(lines.length * lineHeight, lineHeight) };
}

/**
 * Calculate dynamic row height based on text content
 */
function calculateRowHeight(
  med: MedRow, 
  font: PDFFont, 
  fontSize: number, 
  grundWidth: number,
  showGrund: boolean,
  baseHeight: number = 22
): number {
  if (!showGrund || !med.grund) return baseHeight;
  
  const wrapped = wrapText(med.grund, font, fontSize, grundWidth - 6);
  const neededHeight = wrapped.height + 10; // padding
  return Math.max(baseHeight, neededHeight);
}

/**
 * Build structured as-needed dosing text from new fields
 */
function buildAsNeededDoseText(med: UserMedicationForPlan): string {
  const parts: string[] = [];
  
  if (med.as_needed_standard_dose) {
    parts.push(med.as_needed_standard_dose);
  }
  if (med.as_needed_max_per_24h) {
    parts.push(`max. ${med.as_needed_max_per_24h}x/24h`);
  }
  if (med.as_needed_max_days_per_month) {
    parts.push(`max. ${med.as_needed_max_days_per_month} Tage/Monat`);
  }
  if (med.as_needed_min_interval_hours) {
    parts.push(`Abstand ${med.as_needed_min_interval_hours}h`);
  }
  
  // Fallback to legacy field
  if (parts.length === 0 && med.dosis_bedarf) {
    return med.dosis_bedarf;
  }
  
  return parts.join(", ");
}

/**
 * Build weekday info for regular medications
 */
function buildWeekdayInfo(med: UserMedicationForPlan): string {
  if (!med.regular_weekdays || med.regular_weekdays.length === 0) {
    return ""; // Daily
  }
  if (med.regular_weekdays.length === 7) {
    return ""; // Also daily
  }
  return `(${med.regular_weekdays.join(", ")})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION ROW TYPE (internal)
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
  grund: string;
  hinweise: string;
  isIntolerant: boolean;
  intoleranceNotes: string;
  intoleranceReason: string;
  discontinuedAt: string;
  discontinuationReason: string;
  asNeededDoseText: string;
  weekdayInfo: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA AGGREGATION: Build rows from user_medications (PRIMARY SOURCE)
// ═══════════════════════════════════════════════════════════════════════════

function buildMedicationRows(
  userMedications: UserMedicationForPlan[],
  medicationCourses: MedicationCourseForPlan[]
): {
  regular: MedRow[];
  onDemand: MedRow[];
  inactive: MedRow[];
  intolerant: MedRow[];
} {
  const regular: MedRow[] = [];
  const onDemand: MedRow[] = [];
  const inactive: MedRow[] = [];
  const intolerant: MedRow[] = [];

  // Create a map of courses by medication_id or medication_name for quick lookup
  const coursesByMedId = new Map<string, MedicationCourseForPlan>();
  const coursesByName = new Map<string, MedicationCourseForPlan>();
  for (const course of medicationCourses) {
    if (course.medication_id) {
      coursesByMedId.set(course.medication_id, course);
    }
    coursesByName.set(course.medication_name.toLowerCase(), course);
  }

  for (const med of userMedications) {
    // Find associated course (by ID first, then by name)
    const course = coursesByMedId.get(med.id) || coursesByName.get(med.name.toLowerCase());
    
    // Lookup metadata for missing fields
    const lookup = lookupMedicationMetadata(med.name);
    
    // Build combined strength (prefer new fields, fallback to legacy)
    const combinedStaerke = med.strength_value && med.strength_unit
      ? `${med.strength_value} ${med.strength_unit}`
      : med.staerke || lookup?.staerke || "";
    
    // Build dosierung
    let morgens = med.dosis_morgens || "";
    let mittags = med.dosis_mittags || "";
    let abends = med.dosis_abends || "";
    let nachts = med.dosis_nacht || "";
    
    // Determine if regular or as-needed based on new intake_type or legacy art
    const isRegular = med.intake_type === "regular" || 
                      med.art === "prophylaxe" || 
                      med.art === "regelmaessig";
    
    // Build as-needed dose text
    const asNeededDoseText = buildAsNeededDoseText(med);
    
    // Build weekday info for regular meds
    const weekdayInfo = buildWeekdayInfo(med);
    
    // If no daily dose but has as-needed dose (for display)
    const hasDailyDose = morgens || mittags || abends || nachts;
    if (!hasDailyDose && !isRegular) {
      morgens = "b.B.";  // "bei Bedarf" indicator
    }

    const row: MedRow = {
      wirkstoff: sanitize(med.wirkstoff || lookup?.wirkstoff || ""),
      handelsname: sanitize(med.name),
      staerke: sanitize(combinedStaerke),
      form: sanitize(med.darreichungsform || lookup?.darreichungsform || "Tbl."),
      morgens,
      mittags,
      abends,
      nachts,
      einheit: sanitize(med.einheit || lookup?.einheit || "St."),
      grund: sanitize(med.anwendungsgebiet || lookup?.anwendungsgebiet || ""),
      hinweise: sanitize(med.hinweise || med.as_needed_notes || med.regular_notes || ""),
      isIntolerant: !!med.intolerance_flag,
      intoleranceNotes: sanitize(med.intolerance_notes || course?.side_effects_text || ""),
      intoleranceReason: getIntoleranceReasonLabel(med.intolerance_reason_type),
      discontinuedAt: med.discontinued_at ? formatDate(med.discontinued_at) : 
                      (course?.end_date ? formatDate(course.end_date) : ""),
      discontinuationReason: getDiscontinuationReasonLabel(course?.discontinuation_reason),
      asNeededDoseText: sanitize(asNeededDoseText),
      weekdayInfo: sanitize(weekdayInfo),
    };

    // Categorize based on status
    if (med.intolerance_flag || med.medication_status === "intolerant") {
      intolerant.push(row);
    } else if (med.is_active === false || med.discontinued_at || med.medication_status === "stopped") {
      inactive.push(row);
    } else if (isRegular) {
      regular.push(row);
    } else {
      onDemand.push(row);
    }
  }

  return { regular, onDemand, inactive, intolerant };
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE DRAWING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function drawTableHeader(
  page: PDFPage,
  y: number,
  tableX: number,
  fonts: { helvetica: PDFFont; helveticaBold: PDFFont },
  showGrund: boolean
): number {
  const { helvetica, helveticaBold } = fonts;
  const headerHeight = 18;
  const subHeaderHeight = 14;
  
  const effectiveTableWidth = showGrund ? TABLE_WIDTH : TABLE_WIDTH - COL_WIDTHS.grund;
  
  // Main header background
  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: effectiveTableWidth,
    height: headerHeight,
    color: COLORS.headerBg,
  });
  
  // Borders
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + effectiveTableWidth, y }, thickness: 1.2, color: COLORS.border });
  page.drawLine({ start: { x: tableX, y: y - headerHeight }, end: { x: tableX + effectiveTableWidth, y: y - headerHeight }, thickness: 0.5, color: COLORS.border });
  
  // Column headers
  const fs = 7;
  let hx = tableX + 3;
  const headerY = y - 12;
  
  page.drawText("Wirkstoff", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.wirkstoff;
  page.drawText("Handelsname", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.handelsname;
  page.drawText("Staerke", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.staerke;
  page.drawText("Form", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.form;
  
  // "Dosierung" spanning columns
  const doseWidth = COL_WIDTHS.mo + COL_WIDTHS.mi + COL_WIDTHS.ab + COL_WIDTHS.na;
  page.drawText("Dosierung", { x: hx + doseWidth / 2 - 16, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += doseWidth;
  
  page.drawText("Einheit", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.einheit;
  
  if (showGrund) {
    page.drawText("Grund", { x: hx, y: headerY, size: fs, font: helveticaBold, color: COLORS.text });
  }
  
  // Sub-header for dose columns (Mo, Mi, Ab, Na)
  const subY = y - headerHeight;
  page.drawRectangle({
    x: tableX,
    y: subY - subHeaderHeight,
    width: effectiveTableWidth,
    height: subHeaderHeight,
    color: rgb(0.95, 0.95, 0.95),
  });
  page.drawLine({ start: { x: tableX, y: subY - subHeaderHeight }, end: { x: tableX + effectiveTableWidth, y: subY - subHeaderHeight }, thickness: 0.8, color: COLORS.border });
  
  const doseStartX = tableX + COL_WIDTHS.wirkstoff + COL_WIDTHS.handelsname + COL_WIDTHS.staerke + COL_WIDTHS.form;
  const doseLabels = ["Mo", "Mi", "Ab", "Na"];
  let dx = doseStartX;
  for (let i = 0; i < 4; i++) {
    page.drawText(doseLabels[i], { x: dx + (COL_WIDTHS.mo - 8) / 2, y: subY - 10, size: 6, font: helvetica, color: COLORS.textMuted });
    if (i > 0) {
      page.drawLine({ start: { x: dx, y: subY }, end: { x: dx, y: subY - subHeaderHeight }, thickness: 0.3, color: COLORS.borderLight });
    }
    dx += COL_WIDTHS.mo;
  }
  
  return y - headerHeight - subHeaderHeight;
}

function drawSectionHeader(
  page: PDFPage,
  y: number,
  tableX: number,
  title: string,
  bgColor: typeof COLORS.sectionRegular,
  fonts: { helveticaBold: PDFFont },
  showGrund: boolean
): number {
  const sectionHeight = 16;
  const effectiveWidth = showGrund ? TABLE_WIDTH : TABLE_WIDTH - COL_WIDTHS.grund;
  
  page.drawRectangle({
    x: tableX,
    y: y - sectionHeight,
    width: effectiveWidth,
    height: sectionHeight,
    color: bgColor,
  });
  page.drawLine({ start: { x: tableX, y: y - sectionHeight }, end: { x: tableX + effectiveWidth, y: y - sectionHeight }, thickness: 0.5, color: COLORS.border });
  page.drawText(sanitize(title), {
    x: tableX + 6,
    y: y - 11,
    size: 7.5,
    font: fonts.helveticaBold,
    color: COLORS.text,
  });
  
  return y - sectionHeight;
}

function drawMedicationRow(
  page: PDFPage,
  y: number,
  tableX: number,
  med: MedRow,
  fonts: { helvetica: PDFFont; helveticaBold: PDFFont },
  showGrund: boolean,
  isIntolerantSection: boolean = false
): number {
  const { helvetica, helveticaBold } = fonts;
  const fs = 7;
  const grundFontSize = 6.5;
  const effectiveWidth = showGrund ? TABLE_WIDTH : TABLE_WIDTH - COL_WIDTHS.grund;
  
  // Calculate dynamic row height based on "Grund" text
  const rowHeight = calculateRowHeight(med, helvetica, grundFontSize, COL_WIDTHS.grund, showGrund, 22);
  
  // Row background
  page.drawRectangle({
    x: tableX,
    y: y - rowHeight,
    width: effectiveWidth,
    height: rowHeight,
    color: isIntolerantSection ? rgb(0.99, 0.96, 0.96) : COLORS.white,
  });
  page.drawLine({ start: { x: tableX, y: y - rowHeight }, end: { x: tableX + effectiveWidth, y: y - rowHeight }, thickness: 0.3, color: COLORS.borderLight });
  
  let cx = tableX + 3;
  const textY = y - 14;
  
  // Wirkstoff
  page.drawText(truncateText(med.wirkstoff, 14), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.wirkstoff;
  
  // Handelsname (bold) - allow wrapping for long names
  const handelsWrapped = wrapText(med.handelsname, helveticaBold, fs, COL_WIDTHS.handelsname - 4);
  handelsWrapped.lines.forEach((line, idx) => {
    page.drawText(line, { x: cx, y: textY - (idx * fs * 1.3), size: fs, font: helveticaBold, color: COLORS.text });
  });
  cx += COL_WIDTHS.handelsname;
  
  // Stärke
  page.drawText(truncateText(med.staerke, 8), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.staerke;
  
  // Form
  page.drawText(truncateText(med.form, 8), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.form;
  
  // Dose columns
  const doseVals = [med.morgens || "-", med.mittags || "-", med.abends || "-", med.nachts || "-"];
  for (let i = 0; i < 4; i++) {
    if (i > 0) {
      page.drawLine({ start: { x: cx, y }, end: { x: cx, y: y - rowHeight }, thickness: 0.2, color: COLORS.borderLight });
    }
    page.drawText(truncateText(doseVals[i], 3), { x: cx + 3, y: textY, size: fs, font: helvetica, color: COLORS.text });
    cx += COL_WIDTHS.mo;
  }
  
  // Einheit
  page.drawText(truncateText(med.einheit, 6), { x: cx + 2, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.einheit;
  
  // Grund (if shown) - with multi-line wrapping
  if (showGrund && med.grund) {
    const wrapped = wrapText(med.grund, helvetica, grundFontSize, COL_WIDTHS.grund - 6);
    wrapped.lines.forEach((line, idx) => {
      page.drawText(line, { 
        x: cx + 3, 
        y: textY - (idx * grundFontSize * 1.4), 
        size: grundFontSize, 
        font: helvetica, 
        color: COLORS.textMuted 
      });
    });
  }
  
  return y - rowHeight;
}

/**
 * Draw a row for as-needed medication with structured dosing info
 */
function drawAsNeededMedicationRow(
  page: PDFPage,
  y: number,
  tableX: number,
  med: MedRow,
  fonts: { helvetica: PDFFont; helveticaBold: PDFFont },
  showGrund: boolean
): number {
  const { helvetica, helveticaBold } = fonts;
  const fs = 7;
  const grundFontSize = 6.5;
  const effectiveWidth = showGrund ? TABLE_WIDTH : TABLE_WIDTH - COL_WIDTHS.grund;
  
  // Calculate dynamic row height
  const baseHeight = med.asNeededDoseText ? 30 : 22;
  const rowHeight = calculateRowHeight(med, helvetica, grundFontSize, COL_WIDTHS.grund, showGrund, baseHeight);
  
  // Row background
  page.drawRectangle({
    x: tableX,
    y: y - rowHeight,
    width: effectiveWidth,
    height: rowHeight,
    color: COLORS.white,
  });
  page.drawLine({ start: { x: tableX, y: y - rowHeight }, end: { x: tableX + effectiveWidth, y: y - rowHeight }, thickness: 0.3, color: COLORS.borderLight });
  
  let cx = tableX + 3;
  const textY = y - 12;
  
  // Wirkstoff
  page.drawText(truncateText(med.wirkstoff, 14), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.wirkstoff;
  
  // Handelsname (bold) - allow wrapping for long names
  const handelsWrapped = wrapText(med.handelsname, helveticaBold, fs, COL_WIDTHS.handelsname - 4);
  handelsWrapped.lines.forEach((line, idx) => {
    page.drawText(line, { x: cx, y: textY - (idx * fs * 1.3), size: fs, font: helveticaBold, color: COLORS.text });
  });
  cx += COL_WIDTHS.handelsname;
  
  // Stärke
  page.drawText(truncateText(med.staerke, 8), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.staerke;
  
  // Form
  page.drawText(truncateText(med.form, 8), { x: cx, y: textY, size: fs, font: helvetica, color: COLORS.text });
  cx += COL_WIDTHS.form;
  
  // For as-needed: Show "b.B." in first column, then structured dose info spanning rest
  page.drawText("b.B.", { x: cx + 3, y: textY, size: fs, font: helvetica, color: COLORS.text });
  
  // Show structured dose text below if available
  if (med.asNeededDoseText) {
    const doseTextX = cx + COL_WIDTHS.mo;
    const doseWidth = COL_WIDTHS.mi + COL_WIDTHS.ab + COL_WIDTHS.na + COL_WIDTHS.einheit;
    // Wrap dose text if needed
    const doseWrapped = wrapText(med.asNeededDoseText, helvetica, 6, doseWidth - 4);
    doseWrapped.lines.forEach((line, idx) => {
      page.drawText(line, { 
        x: doseTextX, 
        y: textY - (idx * 8), 
        size: 6, 
        font: helvetica, 
        color: COLORS.textMuted 
      });
    });
  }
  
  cx += COL_WIDTHS.mo + COL_WIDTHS.mi + COL_WIDTHS.ab + COL_WIDTHS.na + COL_WIDTHS.einheit;
  
  // Grund (if shown) - with multi-line wrapping
  if (showGrund && med.grund) {
    const wrapped = wrapText(med.grund, helvetica, grundFontSize, COL_WIDTHS.grund - 6);
    wrapped.lines.forEach((line, idx) => {
      page.drawText(line, { 
        x: cx + 3, 
        y: textY - (idx * grundFontSize * 1.4), 
        size: grundFontSize, 
        font: helvetica, 
        color: COLORS.textMuted 
      });
    });
  }
  
  return y - rowHeight;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PDF BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export async function buildMedicationPlanPdf(params: BuildMedicationPlanParams): Promise<Uint8Array> {
  const { 
    userMedications = [], 
    medicationCourses = [],
    medicationLimits = [], 
    patientData, 
    doctors,
    options: userOptions,
  } = params;
  
  const options: PdfExportOptions = { ...DEFAULT_OPTIONS, ...userOptions };
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { helvetica, helveticaBold };
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.marginTop;
  const contentWidth = LAYOUT.pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;
  const effectiveTableWidth = options.includeGrund ? TABLE_WIDTH : TABLE_WIDTH - COL_WIDTHS.grund;
  const tableX = LAYOUT.marginLeft + (contentWidth - effectiveTableWidth) / 2;
  const creationDate = formatDate(new Date().toISOString());
  
  // Build categorized medication rows (PRIMARY from user_medications)
  const medRows = buildMedicationRows(userMedications, medicationCourses);
  
  // Build limits map
  const limitsMap = new Map<string, { limit: number; period: string }>();
  for (const l of medicationLimits) {
    limitsMap.set(l.medication_name.toLowerCase(), { limit: l.limit_count, period: l.period_type });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - BMP-STYLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const headerHeight = 75;
  
  // Header background
  page.drawRectangle({
    x: LAYOUT.marginLeft,
    y: y - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.97, 0.98, 0.99),
  });
  
  // Top border (prominent)
  page.drawLine({ start: { x: LAYOUT.marginLeft, y }, end: { x: LAYOUT.marginLeft + contentWidth, y }, thickness: 2, color: COLORS.primary });
  page.drawLine({ start: { x: LAYOUT.marginLeft, y: y - headerHeight }, end: { x: LAYOUT.marginLeft + contentWidth, y: y - headerHeight }, thickness: 1, color: COLORS.border });
  
  // Title
  page.drawText("MEDIKATIONSPLAN", {
    x: LAYOUT.marginLeft + 10,
    y: y - 25,
    size: 16,
    font: helveticaBold,
    color: COLORS.primary,
  });
  page.drawText("(Patienten-Version)", {
    x: LAYOUT.marginLeft + 10,
    y: y - 38,
    size: 7,
    font: helvetica,
    color: COLORS.textMuted,
  });
  
  // Patient data (center)
  const col2X = LAYOUT.marginLeft + 160;
  let patY = y - 12;
  
  if (patientData) {
    const patName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    if (patName) {
      page.drawText("Patient:", { x: col2X, y: patY, size: 6.5, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patName), { x: col2X + 35, y: patY, size: 9, font: helveticaBold, color: COLORS.text });
      patY -= 12;
    }
    if (patientData.dateOfBirth) {
      page.drawText("Geb.-Datum:", { x: col2X, y: patY, size: 6.5, font: helvetica, color: COLORS.textMuted });
      page.drawText(formatDate(patientData.dateOfBirth), { x: col2X + 48, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 12;
    }
    const address = [patientData.street, [patientData.postalCode, patientData.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (address) {
      page.drawText("Adresse:", { x: col2X, y: patY, size: 6.5, font: helvetica, color: COLORS.textMuted });
      page.drawText(truncateText(sanitize(address), 40), { x: col2X + 35, y: patY, size: 7.5, font: helvetica, color: COLORS.text });
      patY -= 12;
    }
    if (patientData.healthInsurance) {
      page.drawText("Kasse:", { x: col2X, y: patY, size: 6.5, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.healthInsurance), { x: col2X + 30, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 12;
    }
    if (patientData.insuranceNumber) {
      page.drawText("Vers.-Nr.:", { x: col2X, y: patY, size: 6.5, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.insuranceNumber), { x: col2X + 40, y: patY, size: 8, font: helvetica, color: COLORS.text });
    }
  }
  
  // Creation date (right)
  const col3X = LAYOUT.marginLeft + contentWidth - 90;
  page.drawText("Erstellt am:", { x: col3X, y: y - 12, size: 6.5, font: helvetica, color: COLORS.textMuted });
  page.drawText(creationDate, { x: col3X, y: y - 25, size: 10, font: helveticaBold, color: COLORS.text });
  
  y -= headerHeight + 12;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DOCTOR SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (doctors && doctors.length > 0) {
    const doc = doctors[0];
    const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
    
    page.drawText("Behandelnde/r Aerztin/Arzt:", { x: LAYOUT.marginLeft, y, size: 7, font: helveticaBold, color: COLORS.text });
    
    let docInfo = docName;
    if (doc.specialty) docInfo += ` - ${doc.specialty}`;
    page.drawText(sanitize(docInfo), { x: LAYOUT.marginLeft + 110, y, size: 8, font: helvetica, color: COLORS.text });
    y -= 11;
    
    const docAddress = [doc.street, [doc.postalCode, doc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (docAddress) {
      page.drawText(sanitize(docAddress), { x: LAYOUT.marginLeft + 110, y, size: 7.5, font: helvetica, color: COLORS.text });
      y -= 11;
    }
    
    const contact = [doc.phone ? `Tel: ${doc.phone}` : "", doc.fax ? `Fax: ${doc.fax}` : ""].filter(Boolean).join(", ");
    if (contact) {
      page.drawText(sanitize(contact), { x: LAYOUT.marginLeft + 110, y, size: 7, font: helvetica, color: COLORS.textMuted });
      y -= 11;
    }
    
    y -= 6;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INTOLERANCE SECTION (if any and enabled)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeIntolerance && medRows.intolerant.length > 0) {
    // Warning box
    const boxHeight = 14 + medRows.intolerant.length * 16;
    page.drawRectangle({
      x: tableX,
      y: y - boxHeight,
      width: effectiveTableWidth,
      height: boxHeight,
      color: COLORS.sectionIntolerance,
      borderColor: COLORS.warning,
      borderWidth: 1,
    });
    
    page.drawText("UNVERTRAEGLICHKEITEN / ALLERGIEN - NICHT ANWENDEN:", {
      x: tableX + 6,
      y: y - 10,
      size: 7.5,
      font: helveticaBold,
      color: COLORS.warning,
    });
    
    let iy = y - 26;
    for (const med of medRows.intolerant) {
      // Build intolerance line with reason
      let text = `${med.handelsname}`;
      if (med.wirkstoff) text += ` (${med.wirkstoff})`;
      
      const reasonParts: string[] = [];
      if (med.intoleranceReason) reasonParts.push(med.intoleranceReason);
      if (med.intoleranceNotes) reasonParts.push(med.intoleranceNotes);
      if (reasonParts.length > 0) {
        text += `: ${reasonParts.join(" - ")}`;
      }
      
      page.drawText(truncateText(sanitize(text), 95), { x: tableX + 10, y: iy, size: 7, font: helvetica, color: COLORS.text });
      iy -= 14;
    }
    
    y -= boxHeight + 12;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE MEDICATIONS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeActive) {
    // Table header
    y = drawTableHeader(page, y, tableX, fonts, options.includeGrund);
    
    // Always show both sections (even if empty) for clarity
    
    // Section: Regelmäßige Medikation
    y = drawSectionHeader(page, y, tableX, "Regelmaessige Medikation (Prophylaxe / Dauermedikation)", COLORS.sectionRegular, fonts, options.includeGrund);
    
    if (medRows.regular.length === 0) {
      // Empty state for regular meds
      const emptyRowH = 22;
      page.drawRectangle({ x: tableX, y: y - emptyRowH, width: effectiveTableWidth, height: emptyRowH, color: COLORS.white });
      page.drawLine({ start: { x: tableX, y: y - emptyRowH }, end: { x: tableX + effectiveTableWidth, y: y - emptyRowH }, thickness: 0.3, color: COLORS.borderLight });
      page.drawText("Derzeit keine Medikamente in dieser Kategorie.", { x: tableX + 8, y: y - 14, size: 7, font: helvetica, color: COLORS.textMuted });
      y -= emptyRowH;
    } else {
      for (const med of medRows.regular) {
        // Page break check
        if (y < LAYOUT.marginBottom + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
          y = drawTableHeader(page, y, tableX, fonts, options.includeGrund);
        }
        y = drawMedicationRow(page, y, tableX, med, fonts, options.includeGrund);
        
        // Add weekday info if present
        if (med.weekdayInfo) {
          page.drawText(med.weekdayInfo, { 
            x: tableX + 6, 
            y: y + 4, 
            size: 5.5, 
            font: helvetica, 
            color: COLORS.textMuted 
          });
        }
      }
    }
    
    // Section: Bedarfsmedikation
    y = drawSectionHeader(page, y, tableX, "Bei Bedarf anzuwendende Medikamente (Akutmedikation)", COLORS.sectionBedarf, fonts, options.includeGrund);
    
    if (medRows.onDemand.length === 0) {
      // Empty state for as-needed meds
      const emptyRowH = 22;
      page.drawRectangle({ x: tableX, y: y - emptyRowH, width: effectiveTableWidth, height: emptyRowH, color: COLORS.white });
      page.drawLine({ start: { x: tableX, y: y - emptyRowH }, end: { x: tableX + effectiveTableWidth, y: y - emptyRowH }, thickness: 0.3, color: COLORS.borderLight });
      page.drawText("Derzeit keine Medikamente in dieser Kategorie.", { x: tableX + 8, y: y - 14, size: 7, font: helvetica, color: COLORS.textMuted });
      y -= emptyRowH;
    } else {
      for (const med of medRows.onDemand) {
        if (y < LAYOUT.marginBottom + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
          y = drawTableHeader(page, y, tableX, fonts, options.includeGrund);
        }
        // Use enhanced as-needed row drawing
        y = drawAsNeededMedicationRow(page, y, tableX, med, fonts, options.includeGrund);
      }
    }
    
    // Table bottom border
    page.drawLine({ start: { x: tableX, y }, end: { x: tableX + effectiveTableWidth, y }, thickness: 1, color: COLORS.border });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INACTIVE / FORMER MEDICATIONS (if enabled)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeInactive && medRows.inactive.length > 0) {
    y -= 18;
    
    // Page break check
    if (y < LAYOUT.marginBottom + 100) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
    }
    
    page.drawText("FRUEHER VERWENDETE MEDIKAMENTE (Auszug)", {
      x: tableX,
      y,
      size: 8,
      font: helveticaBold,
      color: COLORS.textMuted,
    });
    y -= 14;
    
    // Simple list format for inactive meds
    for (const med of medRows.inactive) {
      if (y < LAYOUT.marginBottom + 40) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
      }
      
      let line = `- ${med.handelsname}`;
      if (med.wirkstoff) line += ` (${med.wirkstoff})`;
      if (med.staerke) line += ` ${med.staerke}`;
      if (med.discontinuedAt) line += ` - abgesetzt am ${med.discontinuedAt}`;
      if (med.discontinuationReason) line += ` (${med.discontinuationReason})`;
      
      page.drawText(truncateText(sanitize(line), 95), { x: tableX + 4, y, size: 7, font: helvetica, color: COLORS.textMuted });
      y -= 12;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MEDICATION LIMITS (if enabled)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeLimits && medicationLimits.length > 0) {
    y -= 16;
    
    if (y < LAYOUT.marginBottom + 80) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
    }
    
    page.drawText("EINNAHME-LIMITS (Uebergebrauch vermeiden)", {
      x: tableX,
      y,
      size: 8,
      font: helveticaBold,
      color: COLORS.textMuted,
    });
    y -= 12;
    
    for (const limit of medicationLimits) {
      const line = `- ${limit.medication_name}: max. ${limit.limit_count}x pro ${getPeriodLabel(limit.period_type)}`;
      page.drawText(sanitize(line), { x: tableX + 4, y, size: 7, font: helvetica, color: COLORS.textMuted });
      y -= 11;
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
      x: LAYOUT.pageWidth - LAYOUT.marginRight - 55,
      y: 25,
      size: 8,
      font: helvetica,
      color: COLORS.textMuted,
    });
    
    // Disclaimer
    p.drawText("Erstellt mit der Kopfschmerztagebuch-App. Dieser Plan ersetzt keine aerztliche Beratung.", {
      x: LAYOUT.marginLeft,
      y: 25,
      size: 6.5,
      font: helvetica,
      color: COLORS.textMuted,
    });
  }
  
  return pdfDoc.save();
}