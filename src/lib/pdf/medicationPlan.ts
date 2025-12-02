/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIKATIONSPLAN-PDF - PATIENTEN-VERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professionelles PDF im Stil des deutschen Medikationsplans.
 * WICHTIG: Dieser Plan wird vom PATIENTEN aus der App generiert,
 * nicht von einer Arztpraxis.
 * 
 * SPALTEN:
 * - Wirkstoff
 * - Handelsname
 * - Stärke
 * - Form
 * - Dosis (Mo | Mi | Ab | Na) oder Intervall
 * - Einheit
 * 
 * KEINE Hinweise-Spalte, KEINE Legende
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { lookupMedicationMetadata, guessMedicationType, suggestAnwendungsgebiet } from "@/lib/medicationLookup";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.15, 0.35, 0.55),         // Professionelles Blau
  headerBg: rgb(0.92, 0.94, 0.96),        // Dezenter Header
  sectionProphylaxe: rgb(0.90, 0.95, 0.92), // Leichtes Grün für Prophylaxe
  sectionAkut: rgb(0.98, 0.94, 0.90),     // Leichtes Orange für Akut
  sectionBedarf: rgb(0.95, 0.95, 0.98),   // Leichtes Blau für Bedarf
  text: rgb(0.1, 0.1, 0.1),
  textMuted: rgb(0.45, 0.45, 0.45),
  border: rgb(0.7, 0.7, 0.7),
  borderLight: rgb(0.85, 0.85, 0.85),
  white: rgb(1, 1, 1),
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,
  marginLeft: 40,
  marginRight: 40,
  marginTop: 45,
  marginBottom: 55,
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
  hinweis_ki?: string | null;      // KI-Notizen - wird NICHT im PDF angezeigt!
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
  fax?: string;
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
  fax?: string;
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
  showGrund?: boolean;
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

/**
 * Normalisiert Intervallangaben zu lesbarem Klartext
 * "1x/Mon" → "1x monatlich"
 * "1x/Monat" → "1x monatlich"
 */
function normalizeInterval(text: string | null | undefined): string {
  if (!text) return "";
  let result = text
    .replace(/1x\/Mon\.?/gi, "1x monatlich")
    .replace(/1x\/Monat/gi, "1x monatlich")
    .replace(/1x monat/gi, "1x monatlich")
    .replace(/1x\/Woche/gi, "1x woechentlich")
    .replace(/alle\s*3\s*Mon/gi, "alle 3 Monate")
    .replace(/quartal/gi, "alle 3 Monate")
    .replace(/taegl\.?/gi, "taeglich")
    .replace(/woech\.?/gi, "woechentlich")
    .replace(/Mon\./gi, "Monat");
  return result;
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
// TABLE DRAWING HELPERS - NO HINWEISE COLUMN
// ═══════════════════════════════════════════════════════════════════════════

const COL_WIDTHS = {
  wirkstoff: 95,
  handelsname: 95,
  staerke: 55,
  form: 60,
  mo: 30,
  mi: 30,
  ab: 30,
  na: 30,
  einheit: 50,
};

const TABLE_WIDTH = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

function drawTableHeader(
  page: PDFPage,
  y: number,
  tableX: number,
  helvetica: PDFFont,
  helveticaBold: PDFFont
): number {
  const headerHeight = 18;
  const subHeaderHeight = 14;
  
  // Main header background
  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: TABLE_WIDTH,
    height: headerHeight,
    color: COLORS.headerBg,
  });
  
  // Main header border (top and bottom only for cleaner look)
  page.drawLine({
    start: { x: tableX, y },
    end: { x: tableX + TABLE_WIDTH, y },
    thickness: 1.2,
    color: COLORS.border,
  });
  page.drawLine({
    start: { x: tableX, y: y - headerHeight },
    end: { x: tableX + TABLE_WIDTH, y: y - headerHeight },
    thickness: 0.5,
    color: COLORS.border,
  });
  
  // Column headers
  const headerFontSize = 7.5;
  let hx = tableX + 3;
  const headerY = y - 12;
  
  page.drawText("Wirkstoff", { x: hx, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.wirkstoff;
  page.drawText("Handelsname", { x: hx, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.handelsname;
  page.drawText("Staerke", { x: hx, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.staerke;
  page.drawText("Form", { x: hx, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += COL_WIDTHS.form;
  
  // "Dosierung" spanning the dose columns
  const doseWidth = COL_WIDTHS.mo + COL_WIDTHS.mi + COL_WIDTHS.ab + COL_WIDTHS.na;
  page.drawText("Dosierung", { x: hx + doseWidth / 2 - 18, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  hx += doseWidth;
  
  page.drawText("Einheit", { x: hx, y: headerY, size: headerFontSize, font: helveticaBold, color: COLORS.text });
  
  // Sub-header for dose columns
  const subY = y - headerHeight;
  page.drawRectangle({
    x: tableX,
    y: subY - subHeaderHeight,
    width: TABLE_WIDTH,
    height: subHeaderHeight,
    color: rgb(0.96, 0.96, 0.96),
  });
  page.drawLine({
    start: { x: tableX, y: subY - subHeaderHeight },
    end: { x: tableX + TABLE_WIDTH, y: subY - subHeaderHeight },
    thickness: 0.8,
    color: COLORS.border,
  });
  
  // Dose sub-headers (Mo, Mi, Ab, Na)
  const doseStartX = tableX + COL_WIDTHS.wirkstoff + COL_WIDTHS.handelsname + COL_WIDTHS.staerke + COL_WIDTHS.form;
  const doseLabels = ["Mo", "Mi", "Ab", "Na"];
  let dx = doseStartX;
  for (let i = 0; i < 4; i++) {
    page.drawText(doseLabels[i], { 
      x: dx + (COL_WIDTHS.mo - 8) / 2, 
      y: subY - 10, 
      size: 6.5, 
      font: helvetica, 
      color: COLORS.textMuted 
    });
    // Vertical separators for dose columns
    if (i > 0) {
      page.drawLine({
        start: { x: dx, y: subY },
        end: { x: dx, y: subY - subHeaderHeight },
        thickness: 0.3,
        color: COLORS.borderLight,
      });
    }
    dx += COL_WIDTHS.mo;
  }
  
  return y - headerHeight - subHeaderHeight;
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
  } = params;
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  let y = LAYOUT.pageHeight - LAYOUT.marginTop;
  const contentWidth = LAYOUT.pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;
  const tableX = LAYOUT.marginLeft + (contentWidth - TABLE_WIDTH) / 2;
  const creationDate = formatDate(new Date().toISOString());
  
  // Build limits map
  const limitsMap = new Map<string, { limit: number; period: string }>();
  for (const l of medicationLimits) {
    limitsMap.set(l.medication_name.toLowerCase(), { limit: l.limit_count, period: l.period_type });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - CLEAN PATIENT VERSION (keine "ausgedruckt von", kein QR)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const headerHeight = 70;
  
  // Light header background
  page.drawRectangle({
    x: LAYOUT.marginLeft,
    y: y - headerHeight,
    width: contentWidth,
    height: headerHeight,
    color: rgb(0.98, 0.98, 0.99),
  });
  
  // Header border
  page.drawLine({
    start: { x: LAYOUT.marginLeft, y },
    end: { x: LAYOUT.marginLeft + contentWidth, y },
    thickness: 1.5,
    color: COLORS.primary,
  });
  page.drawLine({
    start: { x: LAYOUT.marginLeft, y: y - headerHeight },
    end: { x: LAYOUT.marginLeft + contentWidth, y: y - headerHeight },
    thickness: 1,
    color: COLORS.border,
  });
  
  // LEFT: Title
  page.drawText("Medikationsplan", {
    x: LAYOUT.marginLeft + 12,
    y: y - 28,
    size: 18,
    font: helveticaBold,
    color: COLORS.primary,
  });
  
  // Small subtitle
  page.drawText("Kopfschmerztagebuch-App", {
    x: LAYOUT.marginLeft + 12,
    y: y - 42,
    size: 7,
    font: helvetica,
    color: COLORS.textMuted,
  });
  
  // CENTER: Patient data - only show fields that are filled
  const col2X = LAYOUT.marginLeft + 180;
  let patY = y - 15;
  
  if (patientData) {
    const patName = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
    if (patName) {
      page.drawText("Name:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patName), { x: col2X + 30, y: patY, size: 9, font: helveticaBold, color: COLORS.text });
      patY -= 13;
    }
    if (patientData.dateOfBirth) {
      page.drawText("geb. am:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(formatDate(patientData.dateOfBirth), { x: col2X + 35, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 13;
    }
    // Address - only if any part is filled
    const addressParts = [patientData.street, [patientData.postalCode, patientData.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (addressParts) {
      page.drawText("Adresse:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(addressParts), { x: col2X + 35, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 13;
    }
    if (patientData.phone) {
      page.drawText("Telefon:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.phone), { x: col2X + 35, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 13;
    }
    if (patientData.fax) {
      page.drawText("Fax:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.fax), { x: col2X + 35, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 13;
    }
    if (patientData.healthInsurance) {
      page.drawText("Kasse:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.healthInsurance), { x: col2X + 30, y: patY, size: 8, font: helvetica, color: COLORS.text });
      patY -= 13;
    }
    if (patientData.insuranceNumber) {
      page.drawText("Vers.-Nr.:", { x: col2X, y: patY, size: 7, font: helvetica, color: COLORS.textMuted });
      page.drawText(sanitize(patientData.insuranceNumber), { x: col2X + 38, y: patY, size: 8, font: helvetica, color: COLORS.text });
    }
  }
  
  // RIGHT: Creation date
  const col3X = LAYOUT.marginLeft + contentWidth - 100;
  page.drawText("Erstellt am:", { x: col3X, y: y - 15, size: 7, font: helvetica, color: COLORS.textMuted });
  page.drawText(creationDate, { x: col3X, y: y - 28, size: 10, font: helveticaBold, color: COLORS.text });
  
  y -= headerHeight + 18;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BEHANDELNDER ARZT - VOLLSTÄNDIGE ADRESSE
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (doctors && doctors.length > 0) {
    const doc = doctors[0];
    const docName = [doc.title, doc.firstName, doc.lastName].filter(Boolean).join(" ");
    
    page.drawText("Behandelnde/r Aerztin/Arzt:", { 
      x: LAYOUT.marginLeft, 
      y, 
      size: 7, 
      font: helveticaBold, 
      color: COLORS.text 
    });
    
    // Build full address line
    const addressParts: string[] = [];
    if (docName) addressParts.push(docName);
    if (doc.specialty) addressParts.push(doc.specialty);
    
    const addressLine1 = sanitize(addressParts.join(" - "));
    
    // Street, postal code, city
    const locationParts: string[] = [];
    if (doc.street) locationParts.push(doc.street);
    if (doc.postalCode || doc.city) {
      locationParts.push([doc.postalCode, doc.city].filter(Boolean).join(" "));
    }
    const addressLine2 = sanitize(locationParts.join(", "));
    
    // Phone, fax and email
    const contactParts: string[] = [];
    if (doc.phone) contactParts.push(`Tel: ${doc.phone}`);
    if (doc.fax) contactParts.push(`Fax: ${doc.fax}`);
    if (doc.email) contactParts.push(`E-Mail: ${doc.email}`);
    const contactLine = sanitize(contactParts.join(", "));
    
    let docY = y;
    if (addressLine1) {
      page.drawText(addressLine1, { 
        x: LAYOUT.marginLeft + 115, 
        y: docY, 
        size: 8, 
        font: helvetica, 
        color: COLORS.text 
      });
      docY -= 11;
    }
    if (addressLine2) {
      page.drawText(addressLine2, { 
        x: LAYOUT.marginLeft + 115, 
        y: docY, 
        size: 7.5, 
        font: helvetica, 
        color: COLORS.text 
      });
      docY -= 11;
    }
    if (contactLine) {
      page.drawText(contactLine, { 
        x: LAYOUT.marginLeft + 115, 
        y: docY, 
        size: 7, 
        font: helvetica, 
        color: COLORS.textMuted 
      });
      docY -= 11;
    }
    
    y = docY - 8;
  }
  
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
    intervall: string; // e.g., "1x monatlich" for interval therapies
    einheit: string;
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
    let intervall = "";
    const doseText = (course.dose_text || "").toLowerCase();
    
    // Check for interval-based dosing
    if (doseText.includes("monat") || doseText.includes("/m") || 
        lookup?.hinweise?.toLowerCase().includes("monatlich")) {
      intervall = "1x monatlich";
    } else if (doseText.includes("woche")) {
      intervall = "1x woechentlich";
    } else if (doseText.includes("quartal") || doseText.includes("3 mon")) {
      intervall = "alle 3 Monate";
    } else if (doseText.includes("2x") || doseText.includes("zweimal")) {
      morgens = "1"; abends = "1";
    } else if (doseText.includes("3x")) {
      morgens = "1"; mittags = "1"; abends = "1";
    } else if (doseText.includes("abend")) {
      abends = "1";
    } else if (doseText.includes("morgen")) {
      morgens = "1";
    } else if (isProphylaxe && !intervall) {
      // Default for prophylaxis without specific dose
      morgens = "1";
    }
    
    // For injection-based prophylaxis (CGRP), default to monthly
    if (isProphylaxe && lookup?.darreichungsform?.toLowerCase().includes("injektion")) {
      intervall = intervall || "1x monatlich";
      morgens = ""; mittags = ""; abends = ""; nachts = "";
    }
    
    allMeds.push({
      wirkstoff: sanitize(lookup?.wirkstoff || course.medication_name),
      handelsname: sanitize(course.medication_name),
      staerke: sanitize(lookup?.staerke || ""),
      form: sanitize(lookup?.darreichungsform || "Tbl."),
      morgens,
      mittags,
      abends,
      nachts,
      intervall: normalizeInterval(intervall),
      einheit: sanitize(lookup?.einheit || "Stueck"),
      category: isProphylaxe ? "prophylaxe" : "akut",
    });
  }
  
  // Get "Bei Bedarf" medications from user_medications (not in active courses)
  // ONLY include medications where is_active is explicitly true
  const courseNames = new Set([...activeProphylaxe, ...activeOther].map(c => c.medication_name.toLowerCase()));
  const bedarfMeds = userMedications.filter(m => 
    !courseNames.has(m.name.toLowerCase()) && 
    m.is_active === true
  );
  
  for (const med of bedarfMeds) {
    const lookup = lookupMedicationMetadata(med.name);
    
    const art = (med.art || lookup?.art || guessMedicationType(med.name)) as MedRow["category"];
    
    // Determine if this should be "Bei Bedarf"
    const hasDailyDose = med.dosis_morgens || med.dosis_mittags || med.dosis_abends || med.dosis_nacht;
    const isBeiBedarf = !hasDailyDose;
    
    allMeds.push({
      wirkstoff: sanitize(med.wirkstoff || lookup?.wirkstoff || med.name),
      handelsname: sanitize(med.name),
      staerke: sanitize(med.staerke || lookup?.staerke || ""),
      form: sanitize(med.darreichungsform || lookup?.darreichungsform || "Tbl."),
      morgens: med.dosis_morgens || "",
      mittags: med.dosis_mittags || "",
      abends: med.dosis_abends || "",
      nachts: med.dosis_nacht || "",
      intervall: isBeiBedarf ? "bei Bedarf" : "",
      einheit: sanitize(med.einheit || lookup?.einheit || "Stueck"),
      category: art === "prophylaxe" ? "bedarf" : (art || "bedarf"),
    });
  }
  
  // Sort by category
  const categoryOrder = { prophylaxe: 0, akut: 1, bedarf: 2, notfall: 3, selbstmedikation: 4 };
  allMeds.sort((a, b) => (categoryOrder[a.category] || 9) - (categoryOrder[b.category] || 9));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW MEDICATION TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Draw header
  y = drawTableHeader(page, y, tableX, helvetica, helveticaBold);
  
  // Check for empty list
  if (allMeds.length === 0) {
    const emptyRowH = 28;
    page.drawRectangle({
      x: tableX,
      y: y - emptyRowH,
      width: TABLE_WIDTH,
      height: emptyRowH,
      borderColor: COLORS.borderLight,
      borderWidth: 0.5,
    });
    page.drawText("Keine aktiven Medikamente erfasst", {
      x: tableX + 15,
      y: y - 18,
      size: 9,
      font: helvetica,
      color: COLORS.textMuted,
    });
    y -= emptyRowH;
  } else {
    // Group and draw medications
    let currentCategory = "";
    
    for (const med of allMeds) {
      // Check page break
      if (y < LAYOUT.marginBottom + 90) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        y = LAYOUT.pageHeight - LAYOUT.marginTop;
        
        // Repeat header on new page
        const patName = patientData ? [patientData.firstName, patientData.lastName].filter(Boolean).join(" ") : "";
        page.drawText(`Medikationsplan - ${sanitize(patName)} (Fortsetzung)`, {
          x: LAYOUT.marginLeft,
          y: y - 15,
          size: 11,
          font: helveticaBold,
          color: COLORS.primary,
        });
        y -= 30;
        y = drawTableHeader(page, y, tableX, helvetica, helveticaBold);
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
        
        const sectionRowH = 16;
        const sectionColor = currentCategory === "prophylaxe" ? COLORS.sectionProphylaxe : 
                            currentCategory === "akut" ? COLORS.sectionAkut : COLORS.sectionBedarf;
        
        page.drawRectangle({
          x: tableX,
          y: y - sectionRowH,
          width: TABLE_WIDTH,
          height: sectionRowH,
          color: sectionColor,
        });
        page.drawLine({
          start: { x: tableX, y: y - sectionRowH },
          end: { x: tableX + TABLE_WIDTH, y: y - sectionRowH },
          thickness: 0.5,
          color: COLORS.border,
        });
        page.drawText(sectionLabels[currentCategory] || "Sonstige", {
          x: tableX + 8,
          y: y - 11,
          size: 7.5,
          font: helveticaBold,
          color: COLORS.text,
        });
        y -= sectionRowH;
      }
      
      // Fixed row height (no hinweise column anymore)
      const rowHeight = 24;
      
      // Draw row background
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight,
        width: TABLE_WIDTH,
        height: rowHeight,
        color: COLORS.white,
      });
      page.drawLine({
        start: { x: tableX, y: y - rowHeight },
        end: { x: tableX + TABLE_WIDTH, y: y - rowHeight },
        thickness: 0.3,
        color: COLORS.borderLight,
      });
      
      // Draw cell contents
      let cx = tableX + 4;
      const textY = y - 14;
      const fontSize = 7.5;
      
      // Wirkstoff
      page.drawText(med.wirkstoff.substring(0, 18), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += COL_WIDTHS.wirkstoff;
      
      // Handelsname (bold)
      page.drawText(med.handelsname.substring(0, 18), { x: cx, y: textY, size: fontSize, font: helveticaBold, color: COLORS.text });
      cx += COL_WIDTHS.handelsname;
      
      // Stärke
      page.drawText(med.staerke.substring(0, 12), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += COL_WIDTHS.staerke;
      
      // Form
      page.drawText(med.form.substring(0, 12), { x: cx, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      cx += COL_WIDTHS.form;
      
      // Dose columns
      // If there's an interval (e.g., "1x monatlich"), show it spanning dose columns
      if (med.intervall) {
        // Show interval text in first dose column, spanning
        page.drawText(med.intervall.substring(0, 20), { 
          x: cx + 2, 
          y: textY, 
          size: 7, 
          font: helvetica, 
          color: COLORS.text 
        });
        cx += COL_WIDTHS.mo + COL_WIDTHS.mi + COL_WIDTHS.ab + COL_WIDTHS.na;
      } else {
        // Show individual dose columns
        const doseVals = [med.morgens || "-", med.mittags || "-", med.abends || "-", med.nachts || "-"];
        for (let i = 0; i < 4; i++) {
          // Light vertical separators
          if (i > 0) {
            page.drawLine({
              start: { x: cx, y },
              end: { x: cx, y: y - rowHeight },
              thickness: 0.2,
              color: COLORS.borderLight,
            });
          }
          page.drawText(doseVals[i].substring(0, 5), { 
            x: cx + 5, 
            y: textY, 
            size: fontSize, 
            font: helvetica, 
            color: COLORS.text 
          });
          cx += COL_WIDTHS.mo;
        }
      }
      
      // Einheit
      page.drawText(med.einheit.substring(0, 10), { x: cx + 2, y: textY, size: fontSize, font: helvetica, color: COLORS.text });
      
      y -= rowHeight;
    }
  }
  
  // Table bottom border
  page.drawLine({
    start: { x: tableX, y },
    end: { x: tableX + TABLE_WIDTH, y },
    thickness: 1,
    color: COLORS.border,
  });
  
  // NO LEGEND - removed as requested
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);
    
    // Page number
    p.drawText(`Seite ${i + 1} von ${totalPages}`, {
      x: LAYOUT.pageWidth - LAYOUT.marginRight - 55,
      y: 28,
      size: 8,
      font: helvetica,
      color: COLORS.textMuted,
    });
    
    // Disclaimer
    p.drawText("Erstellt mit der Kopfschmerztagebuch-App. Dieser Plan ersetzt keine aerztliche Beratung.", {
      x: LAYOUT.marginLeft,
      y: 28,
      size: 7,
      font: helvetica,
      color: COLORS.textMuted,
    });
  }
  
  return pdfDoc.save();
}
