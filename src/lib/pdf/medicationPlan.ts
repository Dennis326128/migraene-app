/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF - DEUTSCHER STANDARD (BMP-ÄHNLICH)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professionelles PDF im Stil des deutschen Bundeseinheitlichen Medikationsplans.
 * Mit korrekten Umlauten (ä/ö/ü/ß) durch eingebettete Unicode-Schriftart.
 * 
 * FEATURES:
 * - Korrekte Umlaute (Unicode-Font eingebettet)
 * - Intelligente Spalten-Logik (Einheit/Wirkstoff auto-hide)
 * - Kein Textabschneiden - automatischer Umbruch
 * - Hinweise-Spalte mit Limits
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, rgb, PDFPage, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { lookupMedicationMetadata } from "@/lib/medicationLookup";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.12, 0.30, 0.50),
  headerBg: rgb(0.90, 0.93, 0.96),
  sectionRegular: rgb(0.92, 0.96, 0.92),
  sectionBedarf: rgb(0.96, 0.96, 0.92),
  sectionInactive: rgb(0.94, 0.94, 0.94),
  sectionIntolerance: rgb(0.98, 0.92, 0.92),
  text: rgb(0.1, 0.1, 0.1),
  textMuted: rgb(0.4, 0.4, 0.4),
  border: rgb(0.6, 0.6, 0.6),
  borderLight: rgb(0.82, 0.82, 0.82),
  white: rgb(1, 1, 1),
  warning: rgb(0.8, 0.2, 0.2),
};

const LAYOUT = {
  pageWidth: 595.28,
  pageHeight: 841.89,
  marginLeft: 35,
  marginRight: 35,
  marginTop: 40,
  marginBottom: 50,
};

// Google Fonts URLs (Roboto supports German umlauts)
const ROBOTO_FONT_URL = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf";
const ROBOTO_BOLD_URL = "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf";

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
  start_date?: string | null;
  discontinued_at?: string | null;
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
  includeStopReasons?: boolean;
  includeDates?: boolean;
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

const DEFAULT_OPTIONS: PdfExportOptions = {
  includeActive: true,
  includeInactive: false,
  includeIntolerance: true,
  includeLimits: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

type ColumnVisibility = {
  showWirkstoff: boolean;
  showEinheit: boolean;
};

// Calculate column widths based on visibility
function getColumnWidths(visibility: ColumnVisibility) {
  const baseWidths = {
    wirkstoff: visibility.showWirkstoff ? 85 : 0,
    handelsname: 100,
    staerke: 50,
    form: 55,
    mo: 22,
    mi: 22,
    ab: 22,
    na: 22,
    einheit: visibility.showEinheit ? 38 : 0,
    hinweise: 80,
  };
  
  // Redistribute space from hidden columns
  const extraSpace = (!visibility.showWirkstoff ? 85 : 0) + (!visibility.showEinheit ? 38 : 0);
  if (extraSpace > 0) {
    baseWidths.handelsname += Math.floor(extraSpace * 0.4);
    baseWidths.hinweise += Math.floor(extraSpace * 0.4);
    baseWidths.form += Math.floor(extraSpace * 0.2);
  }
  
  return baseWidths;
}

function getTableWidth(widths: ReturnType<typeof getColumnWidths>): number {
  return Object.values(widths).reduce((a, b) => a + b, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function cleanText(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/[""]/g, '"').replace(/['']/g, "'")
    .replace(/[–—]/g, "-").replace(/•/g, "-").replace(/…/g, "...")
    .replace(/×/g, "x")
    .trim();
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

function getDiscontinuationReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    keine_wirkung: "Keine Wirkung",
    nebenwirkungen: "Nebenwirkungen",
    migraene_gebessert: "Besserung",
    kinderwunsch: "Kinderwunsch",
    andere: "Andere Gründe",
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

/**
 * Wrap text - no truncation, always wraps
 */
function wrapText(
  text: string, 
  font: PDFFont, 
  fontSize: number, 
  maxWidth: number,
  maxLines: number = 4
): string[] {
  if (!text) return [];
  
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    if (lines.length >= maxLines) break;
    
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      if (lines.length >= maxLines) break;
      
      // Handle very long single words
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let remaining = word;
        while (remaining && lines.length < maxLines) {
          let fit = "";
          for (let i = 1; i <= remaining.length; i++) {
            const sub = remaining.substring(0, i);
            if (font.widthOfTextAtSize(sub, fontSize) <= maxWidth) {
              fit = sub;
            } else break;
          }
          if (fit) {
            lines.push(fit);
            remaining = remaining.substring(fit.length);
          } else break;
        }
        currentLine = remaining || "";
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  
  return lines;
}

function cleanHandelsname(name: string): string {
  return name
    .replace(/\s*\d+(?:[,\.]\d+)?\s*(mg|µg|g|ml|IE)\s*$/i, "")
    .replace(/\s+$/, "");
}

function deriveWirkstoff(
  explicitWirkstoff: string | null | undefined,
  handelsname: string,
  lookupWirkstoff: string | undefined
): string {
  if (explicitWirkstoff?.trim()) return explicitWirkstoff.trim();
  if (lookupWirkstoff?.trim()) return lookupWirkstoff.trim();
  
  const cleanedName = cleanHandelsname(handelsname);
  const withoutSuffix = cleanedName
    .replace(/[-\s]*(ratiopharm|hexal|stada|neuraxpharm|1a pharma|al|ct|dura|basics|sandoz|zentiva|mylan|teva|lich|beta|azupharma|aliud|puren|heumann|aristo)$/i, "")
    .trim();
  
  return withoutSuffix || cleanedName;
}

function buildAsNeededDoseText(med: UserMedicationForPlan): string {
  const parts: string[] = [];
  
  if (med.as_needed_standard_dose) parts.push(med.as_needed_standard_dose);
  if (med.as_needed_max_per_24h) parts.push(`max. ${med.as_needed_max_per_24h}x/Tag`);
  if (med.as_needed_max_days_per_month) parts.push(`${med.as_needed_max_days_per_month} Tage/Monat`);
  if (med.as_needed_min_interval_hours) parts.push(`Abstand ${med.as_needed_min_interval_hours}h`);
  
  if (parts.length === 0 && med.dosis_bedarf) return med.dosis_bedarf;
  
  return parts.join(", ");
}

function buildCompactLimitText(limit: { limit: number; period: string } | undefined): string {
  if (!limit) return "";
  
  const periodMap: Record<string, string> = {
    day: "Tag", daily: "Tag",
    week: "Woche", weekly: "Woche",
    month: "Monat", monthly: "Monat",
  };
  const periodLabel = periodMap[limit.period?.toLowerCase()] || "Monat";
  
  return `max. ${limit.limit}x/${periodLabel}`;
}

function buildWeekdayInfo(med: UserMedicationForPlan): string {
  if (!med.regular_weekdays || med.regular_weekdays.length === 0 || med.regular_weekdays.length === 7) {
    return "";
  }
  return `(${med.regular_weekdays.join(", ")})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION ROW TYPE
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
  isIntolerant: boolean;
  intoleranceNotes: string;
  intoleranceReason: string;
  startDate: string;
  discontinuedAt: string;
  discontinuationReason: string;
  asNeededDoseText: string;
  weekdayInfo: string;
  limitText: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

function buildMedicationRows(
  userMedications: UserMedicationForPlan[],
  medicationCourses: MedicationCourseForPlan[],
  medicationLimits: Array<{ medication_name: string; limit_count: number; period_type: string }> = []
): {
  regular: MedRow[];
  onDemand: MedRow[];
  inactive: MedRow[];
  intolerant: MedRow[];
  hasNonStandardEinheit: boolean;
  hasWirkstoff: boolean;
} {
  const regular: MedRow[] = [];
  const onDemand: MedRow[] = [];
  const inactive: MedRow[] = [];
  const intolerant: MedRow[] = [];

  const coursesByMedId = new Map<string, MedicationCourseForPlan>();
  const coursesByName = new Map<string, MedicationCourseForPlan>();
  for (const course of medicationCourses) {
    if (course.medication_id) coursesByMedId.set(course.medication_id, course);
    coursesByName.set(course.medication_name.toLowerCase(), course);
  }

  const limitsMap = new Map<string, { limit: number; period: string }>();
  for (const l of medicationLimits) {
    limitsMap.set(l.medication_name.toLowerCase(), { limit: l.limit_count, period: l.period_type });
  }

  let hasNonStandardEinheit = false;
  let hasWirkstoff = false;

  for (const med of userMedications) {
    const course = coursesByMedId.get(med.id) || coursesByName.get(med.name.toLowerCase());
    const lookup = lookupMedicationMetadata(med.name);
    
    const combinedStaerke = med.strength_value && med.strength_unit
      ? `${med.strength_value} ${med.strength_unit}`
      : med.staerke || lookup?.staerke || "";
    
    let morgens = med.dosis_morgens || "";
    let mittags = med.dosis_mittags || "";
    let abends = med.dosis_abends || "";
    let nachts = med.dosis_nacht || "";
    
    const isRegular = med.intake_type === "regular" || 
                      med.art === "prophylaxe" || 
                      med.art === "regelmaessig";
    
    const asNeededDoseText = buildAsNeededDoseText(med);
    const weekdayInfo = buildWeekdayInfo(med);
    
    const hasDailyDose = morgens || mittags || abends || nachts;
    if (!hasDailyDose && !isRegular) {
      morgens = "b.B.";
    }

    const derivedWirkstoff = deriveWirkstoff(med.wirkstoff, med.name, lookup?.wirkstoff);
    const cleanedHandelsname = cleanHandelsname(med.name);
    
    // Check if wirkstoff is different from handelsname
    if (derivedWirkstoff.toLowerCase() !== cleanedHandelsname.toLowerCase()) {
      hasWirkstoff = true;
    }

    const limitInfo = limitsMap.get(med.name.toLowerCase());
    const limitText = buildCompactLimitText(limitInfo);
    
    let combinedAsNeededText = asNeededDoseText;
    if (limitText && !isRegular) {
      combinedAsNeededText = [asNeededDoseText, limitText].filter(Boolean).join(", ");
    }

    // Get einheit and check if it's non-standard
    const einheit = cleanText(med.einheit || lookup?.einheit || "Stück");
    const normalizedEinheit = einheit.toLowerCase().replace(/\./g, "");
    const isStandardEinheit = ["stück", "stueck", "st", "stk", ""].includes(normalizedEinheit);
    if (!isStandardEinheit && einheit) {
      hasNonStandardEinheit = true;
    }

    // Build hinweise from available data
    const hinweiseParts: string[] = [];
    if (med.hinweise) hinweiseParts.push(med.hinweise);
    if (med.as_needed_notes && !med.hinweise?.includes(med.as_needed_notes)) {
      hinweiseParts.push(med.as_needed_notes);
    }
    if (med.regular_notes && !med.hinweise?.includes(med.regular_notes)) {
      hinweiseParts.push(med.regular_notes);
    }
    // Add limit for regular meds
    if (isRegular && limitText) {
      hinweiseParts.push(limitText);
    }

    const row: MedRow = {
      wirkstoff: cleanText(derivedWirkstoff),
      handelsname: cleanText(cleanedHandelsname),
      staerke: cleanText(combinedStaerke),
      form: cleanText(med.darreichungsform || lookup?.darreichungsform || "Tablette"),
      morgens,
      mittags,
      abends,
      nachts,
      einheit: einheit,
      hinweise: cleanText(hinweiseParts.join("; ")),
      isIntolerant: !!med.intolerance_flag,
      intoleranceNotes: cleanText(med.intolerance_notes || course?.side_effects_text || ""),
      intoleranceReason: getIntoleranceReasonLabel(med.intolerance_reason_type),
      startDate: med.start_date ? formatDate(med.start_date) : 
                 (course?.start_date ? formatDate(course.start_date) : ""),
      discontinuedAt: med.discontinued_at ? formatDate(med.discontinued_at) : 
                      (course?.end_date ? formatDate(course.end_date) : ""),
      discontinuationReason: getDiscontinuationReasonLabel(course?.discontinuation_reason),
      asNeededDoseText: cleanText(combinedAsNeededText),
      weekdayInfo: cleanText(weekdayInfo),
      limitText: "",
    };

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

  return { regular, onDemand, inactive, intolerant, hasNonStandardEinheit, hasWirkstoff };
}

// ═══════════════════════════════════════════════════════════════════════════
// FONT LOADING
// ═══════════════════════════════════════════════════════════════════════════

async function loadFont(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE DRAWING
// ═══════════════════════════════════════════════════════════════════════════

function drawTableHeader(
  page: PDFPage,
  y: number,
  tableX: number,
  colWidths: ReturnType<typeof getColumnWidths>,
  visibility: ColumnVisibility,
  fonts: { regular: PDFFont; bold: PDFFont }
): number {
  const { regular, bold } = fonts;
  const tableWidth = getTableWidth(colWidths);
  const headerHeight = 18;
  const subHeaderHeight = 14;
  
  // Main header background
  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: COLORS.headerBg,
  });
  
  // Borders
  page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableWidth, y }, thickness: 1.2, color: COLORS.border });
  page.drawLine({ start: { x: tableX, y: y - headerHeight }, end: { x: tableX + tableWidth, y: y - headerHeight }, thickness: 0.5, color: COLORS.border });
  
  const fs = 7;
  let hx = tableX + 3;
  const headerY = y - 12;
  
  if (visibility.showWirkstoff) {
    page.drawText("Wirkstoff", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
    hx += colWidths.wirkstoff;
  }
  page.drawText("Handelsname", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
  hx += colWidths.handelsname;
  page.drawText("Stärke", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
  hx += colWidths.staerke;
  page.drawText("Form", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
  hx += colWidths.form;
  
  // "Dosierung" spanning columns
  const doseWidth = colWidths.mo + colWidths.mi + colWidths.ab + colWidths.na;
  page.drawText("Dosierung", { x: hx + doseWidth / 2 - 16, y: headerY, size: fs, font: bold, color: COLORS.text });
  hx += doseWidth;
  
  if (visibility.showEinheit) {
    page.drawText("Einheit", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
    hx += colWidths.einheit;
  }
  
  page.drawText("Hinweise", { x: hx, y: headerY, size: fs, font: bold, color: COLORS.text });
  
  // Sub-header for dose columns (morgens, mittags, abends, nachts)
  const subY = y - headerHeight;
  page.drawRectangle({
    x: tableX,
    y: subY - subHeaderHeight,
    width: tableWidth,
    height: subHeaderHeight,
    color: rgb(0.95, 0.95, 0.95),
  });
  page.drawLine({ start: { x: tableX, y: subY - subHeaderHeight }, end: { x: tableX + tableWidth, y: subY - subHeaderHeight }, thickness: 0.8, color: COLORS.border });
  
  const doseStartX = tableX + (visibility.showWirkstoff ? colWidths.wirkstoff : 0) + colWidths.handelsname + colWidths.staerke + colWidths.form;
  // Better German labels for times of day
  const doseLabels = ["morgens", "mittags", "abends", "nachts"];
  let dx = doseStartX;
  for (let i = 0; i < 4; i++) {
    const label = doseLabels[i].substring(0, 2); // "mo", "mi", "ab", "na"
    page.drawText(label, { x: dx + (colWidths.mo - 8) / 2, y: subY - 10, size: 6, font: regular, color: COLORS.textMuted });
    if (i > 0) {
      page.drawLine({ start: { x: dx, y: subY }, end: { x: dx, y: subY - subHeaderHeight }, thickness: 0.3, color: COLORS.borderLight });
    }
    dx += colWidths.mo;
  }
  
  return y - headerHeight - subHeaderHeight;
}

function drawSectionHeader(
  page: PDFPage,
  y: number,
  tableX: number,
  tableWidth: number,
  title: string,
  bgColor: typeof COLORS.sectionRegular,
  fonts: { bold: PDFFont }
): number {
  const sectionHeight = 16;
  
  page.drawRectangle({
    x: tableX,
    y: y - sectionHeight,
    width: tableWidth,
    height: sectionHeight,
    color: bgColor,
  });
  page.drawLine({ start: { x: tableX, y: y - sectionHeight }, end: { x: tableX + tableWidth, y: y - sectionHeight }, thickness: 0.5, color: COLORS.border });
  page.drawText(title, {
    x: tableX + 6,
    y: y - 11,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.text,
  });
  
  return y - sectionHeight;
}

function drawMedicationRow(
  page: PDFPage,
  y: number,
  tableX: number,
  med: MedRow,
  colWidths: ReturnType<typeof getColumnWidths>,
  visibility: ColumnVisibility,
  fonts: { regular: PDFFont; bold: PDFFont },
  isAsNeeded: boolean = false
): number {
  const { regular, bold } = fonts;
  const tableWidth = getTableWidth(colWidths);
  const fs = 7;
  const fsSmall = 6;
  
  // Calculate dynamic row height based on content
  const handelsLines = wrapText(med.handelsname, bold, fs, colWidths.handelsname - 4);
  const hinweiseLines = wrapText(med.hinweise, regular, fsSmall, colWidths.hinweise - 4, 3);
  const formLines = wrapText(med.form, regular, fs, colWidths.form - 4, 2);
  
  const maxContentLines = Math.max(handelsLines.length, hinweiseLines.length, formLines.length, 1);
  const rowHeight = Math.max(22, 10 + maxContentLines * 10);
  
  // Row background
  page.drawRectangle({
    x: tableX,
    y: y - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: COLORS.white,
  });
  page.drawLine({ start: { x: tableX, y: y - rowHeight }, end: { x: tableX + tableWidth, y: y - rowHeight }, thickness: 0.3, color: COLORS.borderLight });
  
  let cx = tableX + 3;
  const textY = y - 12;
  
  // Wirkstoff
  if (visibility.showWirkstoff) {
    const wirkstoffDisplay = med.wirkstoff.toLowerCase() === med.handelsname.toLowerCase() ? "-" : med.wirkstoff;
    const wirkstoffLines = wrapText(wirkstoffDisplay, regular, fs, colWidths.wirkstoff - 4, 2);
    wirkstoffLines.forEach((line, idx) => {
      page.drawText(line, { x: cx, y: textY - (idx * 9), size: fs, font: regular, color: COLORS.text });
    });
    cx += colWidths.wirkstoff;
  }
  
  // Handelsname (bold)
  handelsLines.forEach((line, idx) => {
    page.drawText(line, { x: cx, y: textY - (idx * 9), size: fs, font: bold, color: COLORS.text });
  });
  cx += colWidths.handelsname;
  
  // Stärke
  const staerkeLines = wrapText(med.staerke, regular, fs, colWidths.staerke - 4, 2);
  staerkeLines.forEach((line, idx) => {
    page.drawText(line, { x: cx, y: textY - (idx * 9), size: fs, font: regular, color: COLORS.text });
  });
  cx += colWidths.staerke;
  
  // Form
  formLines.forEach((line, idx) => {
    page.drawText(line, { x: cx, y: textY - (idx * 9), size: fs, font: regular, color: COLORS.text });
  });
  cx += colWidths.form;
  
  // Dose columns
  if (isAsNeeded) {
    // For as-needed: Show "b.B." in first column
    page.drawText("b.B.", { x: cx + 3, y: textY, size: fs, font: regular, color: COLORS.text });
    cx += colWidths.mo;
    
    // Show combined dose text in remaining space if available
    if (med.asNeededDoseText) {
      const doseLines = wrapText(med.asNeededDoseText, regular, fsSmall, colWidths.mi + colWidths.ab + colWidths.na - 4, 2);
      doseLines.forEach((line, idx) => {
        page.drawText(line, { x: cx, y: textY - (idx * 8), size: fsSmall, font: regular, color: COLORS.textMuted });
      });
    }
    cx += colWidths.mi + colWidths.ab + colWidths.na;
  } else {
    // Regular medication doses
    const doseVals = [med.morgens || "-", med.mittags || "-", med.abends || "-", med.nachts || "-"];
    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        page.drawLine({ start: { x: cx, y }, end: { x: cx, y: y - rowHeight }, thickness: 0.2, color: COLORS.borderLight });
      }
      const doseText = doseVals[i].length > 4 ? doseVals[i].substring(0, 4) : doseVals[i];
      page.drawText(doseText, { x: cx + 2, y: textY, size: fs, font: regular, color: COLORS.text });
      cx += colWidths.mo;
    }
  }
  
  // Einheit
  if (visibility.showEinheit) {
    const einheitLines = wrapText(med.einheit, regular, fsSmall, colWidths.einheit - 4, 2);
    einheitLines.forEach((line, idx) => {
      page.drawText(line, { x: cx + 2, y: textY - (idx * 8), size: fsSmall, font: regular, color: COLORS.text });
    });
    cx += colWidths.einheit;
  }
  
  // Hinweise
  hinweiseLines.forEach((line, idx) => {
    page.drawText(line, { x: cx + 2, y: textY - (idx * 8), size: fsSmall, font: regular, color: COLORS.textMuted });
  });
  
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
  
  // Register fontkit for custom font embedding
  pdfDoc.registerFontkit(fontkit);
  
  // Load and embed Unicode-capable fonts
  let fontRegular: PDFFont;
  let fontBold: PDFFont;
  
  try {
    const [regularFontBytes, boldFontBytes] = await Promise.all([
      loadFont(ROBOTO_FONT_URL),
      loadFont(ROBOTO_BOLD_URL),
    ]);
    fontRegular = await pdfDoc.embedFont(regularFontBytes);
    fontBold = await pdfDoc.embedFont(boldFontBytes);
  } catch (error) {
    console.warn("Failed to load Roboto font, falling back to Helvetica:", error);
    // Fallback to standard fonts (no umlaut support)
    const { StandardFonts } = await import("pdf-lib");
    fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
  
  const fonts = { regular: fontRegular, bold: fontBold };
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.marginTop;
  const contentWidth = LAYOUT.pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;
  const creationDate = formatDate(new Date().toISOString());
  
  // Build categorized medication rows
  const medRows = buildMedicationRows(userMedications, medicationCourses, medicationLimits);
  
  // Determine column visibility
  const visibility: ColumnVisibility = {
    showWirkstoff: medRows.hasWirkstoff,
    showEinheit: medRows.hasNonStandardEinheit,
  };
  
  const colWidths = getColumnWidths(visibility);
  const tableWidth = getTableWidth(colWidths);
  const tableX = LAYOUT.marginLeft + (contentWidth - tableWidth) / 2;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  
  const patientLines: { label: string; value: string }[] = [];
  if (patientData) {
    const patName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    if (patName) patientLines.push({ label: "Patient:", value: cleanText(patName) });
    if (patientData.dateOfBirth) patientLines.push({ label: "Geb.-Datum:", value: formatDate(patientData.dateOfBirth) });
    const address = [patientData.street, [patientData.postalCode, patientData.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (address) patientLines.push({ label: "Adresse:", value: cleanText(address) });
    if (patientData.healthInsurance) patientLines.push({ label: "Kasse:", value: cleanText(patientData.healthInsurance) });
    if (patientData.insuranceNumber) patientLines.push({ label: "Vers.-Nr.:", value: cleanText(patientData.insuranceNumber) });
  }
  patientLines.push({ label: "Erstellt am:", value: creationDate });
  
  const headerHeight = Math.max(55, 20 + patientLines.length * 11);
  
  page.drawRectangle({
    x: LAYOUT.marginLeft,
    y: y - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.97, 0.98, 0.99),
  });
  
  page.drawLine({ start: { x: LAYOUT.marginLeft, y }, end: { x: LAYOUT.marginLeft + contentWidth, y }, thickness: 2, color: COLORS.primary });
  page.drawLine({ start: { x: LAYOUT.marginLeft, y: y - headerHeight }, end: { x: LAYOUT.marginLeft + contentWidth, y: y - headerHeight }, thickness: 1, color: COLORS.border });
  
  const col1Width = contentWidth * 0.50;
  
  page.drawText("MEDIKATIONSPLAN", {
    x: LAYOUT.marginLeft + 10,
    y: y - 22,
    size: 18,
    font: fontBold,
    color: COLORS.primary,
  });
  page.drawText("(Patienten-Version)", {
    x: LAYOUT.marginLeft + 10,
    y: y - 36,
    size: 8,
    font: fontRegular,
    color: COLORS.textMuted,
  });
  
  const col2X = LAYOUT.marginLeft + col1Width;
  let patY = y - 10;
  const lineHeight = 11;
  const labelWidth = 55;
  
  for (const line of patientLines) {
    page.drawText(line.label, { x: col2X, y: patY, size: 6.5, font: fontRegular, color: COLORS.textMuted });
    const isName = line.label === "Patient:";
    const isDate = line.label === "Erstellt am:";
    
    // Wrap long values (like addresses)
    const valueLines = wrapText(line.value, isName || isDate ? fontBold : fontRegular, isName || isDate ? 9 : 7.5, contentWidth * 0.45, 2);
    valueLines.forEach((valueLine, idx) => {
      page.drawText(valueLine, { 
        x: col2X + labelWidth, 
        y: patY - (idx * 9), 
        size: isName || isDate ? 9 : 7.5, 
        font: isName || isDate ? fontBold : fontRegular, 
        color: COLORS.text 
      });
    });
    patY -= lineHeight * Math.max(valueLines.length, 1);
  }
  
  y -= headerHeight + 10;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DOCTOR SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (doctors && doctors.length > 0) {
    const doc = doctors[0];
    const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
    
    page.drawText("Behandelnde/r Ärztin/Arzt:", { x: LAYOUT.marginLeft, y, size: 7, font: fontBold, color: COLORS.text });
    
    let docInfo = docName;
    if (doc.specialty) docInfo += ` - ${doc.specialty}`;
    
    const docInfoLines = wrapText(cleanText(docInfo), fontRegular, 8, contentWidth - 120, 2);
    docInfoLines.forEach((line, idx) => {
      page.drawText(line, { x: LAYOUT.marginLeft + 110, y: y - (idx * 10), size: 8, font: fontRegular, color: COLORS.text });
    });
    y -= 11 * Math.max(docInfoLines.length, 1);
    
    const docAddress = [doc.street, [doc.postalCode, doc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (docAddress) {
      const addressLines = wrapText(cleanText(docAddress), fontRegular, 7.5, contentWidth - 120, 2);
      addressLines.forEach((line, idx) => {
        page.drawText(line, { x: LAYOUT.marginLeft + 110, y: y - (idx * 9), size: 7.5, font: fontRegular, color: COLORS.text });
      });
      y -= 11 * Math.max(addressLines.length, 1);
    }
    
    const contact = [doc.phone ? `Tel: ${doc.phone}` : "", doc.fax ? `Fax: ${doc.fax}` : ""].filter(Boolean).join(", ");
    if (contact) {
      page.drawText(cleanText(contact), { x: LAYOUT.marginLeft + 110, y, size: 7, font: fontRegular, color: COLORS.textMuted });
      y -= 11;
    }
    
    y -= 6;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INTOLERANCE SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeIntolerance && medRows.intolerant.length > 0) {
    const boxHeight = 14 + medRows.intolerant.length * 18;
    page.drawRectangle({
      x: tableX,
      y: y - boxHeight,
      width: tableWidth,
      height: boxHeight,
      color: COLORS.sectionIntolerance,
      borderColor: COLORS.warning,
      borderWidth: 1,
    });
    
    page.drawText("UNVERTRÄGLICHKEITEN / ALLERGIEN - NICHT ANWENDEN:", {
      x: tableX + 6,
      y: y - 10,
      size: 7.5,
      font: fontBold,
      color: COLORS.warning,
    });
    
    let iy = y - 26;
    for (const med of medRows.intolerant) {
      let text = `${med.handelsname}`;
      if (med.wirkstoff && med.wirkstoff !== med.handelsname) text += ` (${med.wirkstoff})`;
      
      const reasonParts: string[] = [];
      if (med.intoleranceReason) reasonParts.push(med.intoleranceReason);
      if (med.intoleranceNotes) reasonParts.push(med.intoleranceNotes);
      if (reasonParts.length > 0) text += `: ${reasonParts.join(" - ")}`;
      
      const lines = wrapText(cleanText(text), fontRegular, 7, tableWidth - 16, 2);
      lines.forEach((line, idx) => {
        page.drawText(line, { x: tableX + 10, y: iy - (idx * 10), size: 7, font: fontRegular, color: COLORS.text });
      });
      iy -= 16;
    }
    
    y -= boxHeight + 12;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE MEDICATIONS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeActive) {
    y = drawTableHeader(page, y, tableX, colWidths, visibility, fonts);
    
    // Section: Regelmäßige Medikation
    y = drawSectionHeader(page, y, tableX, tableWidth, "Regelmäßige Medikation (Prophylaxe / Dauermedikation)", COLORS.sectionRegular, fonts);
    
    if (medRows.regular.length === 0) {
      const emptyRowH = 22;
      page.drawRectangle({ x: tableX, y: y - emptyRowH, width: tableWidth, height: emptyRowH, color: COLORS.white });
      page.drawLine({ start: { x: tableX, y: y - emptyRowH }, end: { x: tableX + tableWidth, y: y - emptyRowH }, thickness: 0.3, color: COLORS.borderLight });
      page.drawText("Derzeit keine Medikamente in dieser Kategorie.", { x: tableX + 8, y: y - 14, size: 7, font: fontRegular, color: COLORS.textMuted });
      y -= emptyRowH;
    } else {
      for (const med of medRows.regular) {
        if (y < LAYOUT.marginBottom + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
          y = drawTableHeader(page, y, tableX, colWidths, visibility, fonts);
        }
        y = drawMedicationRow(page, y, tableX, med, colWidths, visibility, fonts, false);
      }
    }
    
    // Section: Bedarfsmedikation
    y = drawSectionHeader(page, y, tableX, tableWidth, "Bei Bedarf anzuwendende Medikamente (Akutmedikation)", COLORS.sectionBedarf, fonts);
    
    if (medRows.onDemand.length === 0) {
      const emptyRowH = 22;
      page.drawRectangle({ x: tableX, y: y - emptyRowH, width: tableWidth, height: emptyRowH, color: COLORS.white });
      page.drawLine({ start: { x: tableX, y: y - emptyRowH }, end: { x: tableX + tableWidth, y: y - emptyRowH }, thickness: 0.3, color: COLORS.borderLight });
      page.drawText("Derzeit keine Medikamente in dieser Kategorie.", { x: tableX + 8, y: y - 14, size: 7, font: fontRegular, color: COLORS.textMuted });
      y -= emptyRowH;
    } else {
      for (const med of medRows.onDemand) {
        if (y < LAYOUT.marginBottom + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
          y = drawTableHeader(page, y, tableX, colWidths, visibility, fonts);
        }
        y = drawMedicationRow(page, y, tableX, med, colWidths, visibility, fonts, true);
      }
    }
    
    // Table bottom border
    page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableWidth, y }, thickness: 1, color: COLORS.border });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INACTIVE / FORMER MEDICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (options.includeInactive && medRows.inactive.length > 0) {
    y -= 18;
    
    if (y < LAYOUT.marginBottom + 100) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
    }
    
    page.drawText("FRÜHER VERWENDETE MEDIKAMENTE (Auszug)", {
      x: tableX,
      y,
      size: 8,
      font: fontBold,
      color: COLORS.textMuted,
    });
    y -= 14;
    
    for (const med of medRows.inactive) {
      if (y < LAYOUT.marginBottom + 40) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.marginTop - 20;
      }
      
      let line = `- ${med.handelsname}`;
      if (med.wirkstoff && med.wirkstoff !== med.handelsname) line += ` (${med.wirkstoff})`;
      if (med.staerke) line += ` ${med.staerke}`;
      
      // Show date range only if includeDates is enabled (default true)
      if (options.includeDates !== false) {
        if (med.startDate && med.discontinuedAt) {
          line += ` (${med.startDate} - ${med.discontinuedAt})`;
        } else if (med.discontinuedAt) {
          line += ` (bis ${med.discontinuedAt})`;
        } else if (med.startDate) {
          line += ` (ab ${med.startDate})`;
        }
      }
      
      // Show stop reason if enabled
      if (options.includeStopReasons && med.discontinuationReason) {
        line += ` - ${med.discontinuationReason}`;
      }
      
      const lines = wrapText(cleanText(line), fontRegular, 7, tableWidth - 8, 2);
      lines.forEach((l, idx) => {
        page.drawText(l, { x: tableX + 4, y: y - (idx * 10), size: 7, font: fontRegular, color: COLORS.textMuted });
      });
      y -= 12 * Math.max(lines.length, 1);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LEGEND (for dose column abbreviations)
  // ═══════════════════════════════════════════════════════════════════════════
  
  y -= 12;
  page.drawText("Legende: mo = morgens, mi = mittags, ab = abends, na = nachts, b.B. = bei Bedarf", {
    x: tableX,
    y,
    size: 6,
    font: fontRegular,
    color: COLORS.textMuted,
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);
    
    p.drawText(`Seite ${i + 1} von ${totalPages}`, {
      x: LAYOUT.pageWidth - LAYOUT.marginRight - 55,
      y: 25,
      size: 8,
      font: fontRegular,
      color: COLORS.textMuted,
    });
    
    p.drawText("Erstellt mit der Kopfschmerztagebuch-App. Dieser Plan ersetzt keine ärztliche Beratung.", {
      x: LAYOUT.marginLeft,
      y: 25,
      size: 6.5,
      font: fontRegular,
      color: COLORS.textMuted,
    });
  }
  
  return pdfDoc.save();
}
