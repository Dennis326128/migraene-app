/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZENTRALES PDF-TEMPLATE FÜR KOPFSCHMERZTAGEBUCH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * NEUE STRUKTUR (ärztlich optimiert):
 * ─────────────────────────────────────
 * 1. Titelseite / Kopfdaten (Patient, Arzt)
 * 2. ÄRZTLICHE KERNÜBERSICHT (Schmerztage/Monat, Triptane/Monat, Intensität)
 * 3. AKUTMEDIKATION & WIRKUNG (direkt danach!)
 * 4. BERICHT/ANALYSE (Premium-KI ODER statisch - NIE beides!)
 * 5. DIAGRAMM: "Schmerz- & Wetterverlauf" (ein einziges kombiniertes Chart)
 * 6. DETAILLIERTE EINTRÄGE (ganz am Ende)
 * 
 * ENTFERNT:
 * - "ZUSAMMENFASSUNG" Kacheln (redundant)
 * - Separater "INTENSITÄTSVERLAUF" Chart (redundant)
 * - Separate "Tageszeit-Verteilung" Chart
 * - Doppelte Analyseabschnitte bei Premium-KI
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import type { PainEntry, MedicationIntakeInfo } from "@/types/painApp";
import { formatDoseFromQuarters, DEFAULT_DOSE_QUARTERS } from "@/lib/utils/doseFormatter";
import { formatPainLocation } from "@/lib/utils/pain";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.15, 0.35, 0.65),      // Medizinisches Blau
  primaryLight: rgb(0.2, 0.4, 0.8),    // Helleres Blau für Überschriften
  text: rgb(0.1, 0.1, 0.1),            // Haupttext
  textLight: rgb(0.4, 0.4, 0.4),       // Sekundärtext
  border: rgb(0.7, 0.7, 0.7),          // Rahmenlinien
  // Chart colors matching the app
  chartPain: rgb(0.93, 0.27, 0.27),    // Rot für Schmerz
  chartTemp: rgb(0.3, 0.6, 0.9),       // Blau für Temperatur
  chartPressure: rgb(0.2, 0.7, 0.4),   // Grün für Luftdruck
  gridLine: rgb(0.9, 0.9, 0.9),        // Gitternetzlinien
};

const LAYOUT = {
  pageWidth: 595.28,    // A4
  pageHeight: 841.89,   // A4
  margin: 40,           // Seitenrand
  lineHeight: 14,       // Standard-Zeilenabstand
  sectionGap: 20,       // Abstand zwischen Abschnitten
};

type MedicationCourseForPdf = {
  medication_name: string;
  type: string;
  dose_text?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  subjective_effectiveness?: number;
  had_side_effects?: boolean;
  side_effects_text?: string;
  discontinuation_reason?: string;
  discontinuation_details?: string;
  baseline_migraine_days?: string;
  baseline_impairment_level?: string;
  note_for_physician?: string;
};

type FreeTextExportMode = 'none' | 'short_notes' | 'notes_and_context';

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
  includePatientData?: boolean;
  includeDoctorData?: boolean;
  includePatientNotes?: boolean;
  includeMedicationCourses?: boolean;
  freeTextExportMode?: FreeTextExportMode;
  
  analysisReport?: string;
  patientNotes?: string;
  medicationStats?: Array<{
    name: string;
    count: number;
    avgEffect: number | null;
    ratedCount: number;
    totalUnitsInRange?: number;
    avgPerMonth?: number;
    last30Units?: number;
  }>;
  medicationCourses?: MedicationCourseForPdf[];
  patientData?: {
    firstName?: string;
    lastName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
    fax?: string;
    email?: string;
    dateOfBirth?: string;
    healthInsurance?: string;
    insuranceNumber?: string;
  };
  doctors?: Array<{
    firstName?: string;
    lastName?: string;
    specialty?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
    fax?: string;
    email?: string;
  }>;
  // Premium KI-Analysebericht (optional)
  premiumAIReport?: {
    schemaVersion?: number;
    timeRange?: { from: string; to: string };
    dataCoverage?: {
      entries: number;
      notes: number;
      weatherDays: number;
      medDays: number;
    };
    headline: string;
    disclaimer: string;
    keyFindings: Array<{
      title: string;
      finding: string;
      evidence: string;
    }>;
    sections: Array<{
      title: string;
      bullets: string[];
    }>;
    createdAt: string;
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - TEXT SANITIZATION & FORMATTING
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
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMedicationsWithDose(
  medications: string[] | undefined,
  intakes: MedicationIntakeInfo[] | undefined
): string {
  if (!medications || medications.length === 0) return '-';
  
  const intakeMap = new Map(
    (intakes || []).map(i => [i.medication_name, i.dose_quarters])
  );
  
  return medications.map(med => {
    const quarters = intakeMap.get(med) ?? DEFAULT_DOSE_QUARTERS;
    const doseStr = formatDoseFromQuarters(quarters);
    return `${med} ${doseStr}`;
  }).join("; ");
}

function formatDateGerman(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    return date.toLocaleDateString("de-DE", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric" 
    });
  } catch {
    return dateStr;
  }
}

/**
 * Formatiert Datum für Charts: nur Tag.Monat. (deutsches Format)
 */
function formatDateShort(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.`;
  }
  return dateStr;
}

function formatDateTimeGerman(dateStr: string, timeStr?: string): string {
  const dateFormatted = formatDateGerman(dateStr);
  
  if (timeStr) {
    const timeParts = timeStr.split(':');
    const timeWithoutSeconds = timeParts.slice(0, 2).join(':');
    return `${dateFormatted}, ${timeWithoutSeconds} Uhr`;
  }
  
  const date = new Date(dateStr);
  const time = date.toLocaleTimeString("de-DE", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  return `${dateFormatted}, ${time} Uhr`;
}

function painLevelToNumericValue(painLevel: string): number {
  const level = (painLevel || "").toLowerCase().replace(/_/g, " ");
  if (level.includes("sehr") && level.includes("stark")) return 9;
  if (level.includes("stark")) return 7;
  if (level.includes("mittel")) return 5;
  if (level.includes("leicht")) return 2;
  const num = parseInt(painLevel);
  return isNaN(num) ? 0 : num;
}

function formatPainLevel(painLevel: string): string {
  const numeric = painLevelToNumericValue(painLevel);
  return numeric > 0 ? `${numeric}/10` : painLevel;
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  if (!text) return [];
  
  const words = text.split(/\s+/);
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
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

function calculateDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function formatGermanDecimal(value: number, decimals: number = 1): string {
  return value.toFixed(decimals).replace('.', ',');
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function ensureSpace(
  pdfDoc: any,
  currentPage: PDFPage,
  yPos: number,
  requiredSpace: number
): { page: PDFPage; yPos: number } {
  if (yPos - requiredSpace < LAYOUT.margin + 30) {
    const newPage = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    return { page: newPage, yPos: LAYOUT.pageHeight - LAYOUT.margin };
  }
  return { page: currentPage, yPos };
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAWING FUNCTIONS - HEADER & SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

function drawSectionHeader(
  page: PDFPage,
  title: string,
  yPos: number,
  font: PDFFont,
  fontSize: number = 13
): number {
  page.drawText(title, {
    x: LAYOUT.margin,
    y: yPos,
    size: fontSize,
    font,
    color: COLORS.primaryLight,
  });
  
  page.drawLine({
    start: { x: LAYOUT.margin, y: yPos - 3 },
    end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos - 3 },
    thickness: 1.5,
    color: COLORS.primaryLight,
  });
  
  return yPos - fontSize - 10;
}

function drawKeyValue(
  page: PDFPage,
  key: string,
  value: string,
  yPos: number,
  font: PDFFont,
  fontBold: PDFFont
): number {
  page.drawText(`${key}:`, {
    x: LAYOUT.margin,
    y: yPos,
    size: 10,
    font: fontBold,
    color: COLORS.text,
  });
  
  page.drawText(sanitizeForPDF(value), {
    x: LAYOUT.margin + 120,
    y: yPos,
    size: 10,
    font,
    color: COLORS.text,
  });
  
  return yPos - LAYOUT.lineHeight;
}

function drawStructuredText(
  page: PDFPage,
  text: string,
  startY: number,
  minY: number,
  font: PDFFont,
  fontBold: PDFFont,
  maxWidth: number,
  padding: number,
  pdfDoc: any
): { yPos: number; page: PDFPage } {
  let yPos = startY;
  let currentPage = page;
  const paragraphs = text.split('\n').filter(p => p.trim());
  
  for (const para of paragraphs) {
    if (yPos < minY) {
      currentPage = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin - padding;
    }
    
    const colonIndex = para.indexOf(':');
    if (colonIndex > 0 && colonIndex < 60) {
      const heading = para.substring(0, colonIndex + 1);
      const content = para.substring(colonIndex + 1).trim();
      
      currentPage.drawText(sanitizeForPDF(heading), {
        x: LAYOUT.margin + padding,
        y: yPos,
        size: 9,
        font: fontBold,
        color: COLORS.text,
      });
      
      if (content) {
        const headingWidth = fontBold.widthOfTextAtSize(sanitizeForPDF(heading), 9);
        const remainingWidth = maxWidth - headingWidth - 5;
        
        if (font.widthOfTextAtSize(sanitizeForPDF(content), 9) <= remainingWidth) {
          currentPage.drawText(sanitizeForPDF(content), {
            x: LAYOUT.margin + padding + headingWidth + 5,
            y: yPos,
            size: 9,
            font,
            color: COLORS.text,
          });
          yPos -= 14;
        } else {
          yPos -= 12;
          const wrappedLines = wrapText(content, maxWidth, 9, font);
          for (const line of wrappedLines) {
            if (yPos < minY) break;
            currentPage.drawText(sanitizeForPDF(line), {
              x: LAYOUT.margin + padding,
              y: yPos,
              size: 9,
              font,
              color: COLORS.text,
            });
            yPos -= 12;
          }
        }
      } else {
        yPos -= 14;
      }
    } else {
      const wrappedLines = wrapText(para, maxWidth, 9, font);
      for (const line of wrappedLines) {
        if (yPos < minY) break;
        currentPage.drawText(sanitizeForPDF(line), {
          x: LAYOUT.margin + padding,
          y: yPos,
          size: 9,
          font,
          color: COLORS.text,
        });
        yPos -= 12;
      }
    }
    
    yPos -= 4;
  }
  
  return { yPos, page: currentPage };
}

// ═══════════════════════════════════════════════════════════════════════════
// NEUES KOMBINIERTES DIAGRAMM: Schmerz + Temperatur + Luftdruck
// Entspricht dem App-Diagramm, wird dynamisch für Zeitraum berechnet
// ═══════════════════════════════════════════════════════════════════════════

function drawCombinedWeatherPainChart(
  page: PDFPage,
  entries: PainEntry[],
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont,
  fontBold: PDFFont
) {
  // Rahmen
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  // Gruppiere nach Datum
  const dataByDate = new Map<string, { 
    pain: number; 
    temperature: number | null; 
    pressure: number | null;
  }>();
  
  entries.forEach(entry => {
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
    const pain = painLevelToNumericValue(entry.pain_level);
    const weather = entry.weather;
    const temperature = weather?.temperature_c ?? null;
    const pressure = weather?.pressure_mb ?? null;
    
    const existing = dataByDate.get(date);
    if (!existing || pain > existing.pain) {
      dataByDate.set(date, { 
        pain, 
        temperature: temperature ?? existing?.temperature ?? null,
        pressure: pressure ?? existing?.pressure ?? null
      });
    }
  });

  const sortedDates = Array.from(dataByDate.keys()).sort();
  if (sortedDates.length === 0) {
    page.drawText("Keine Daten verfugbar", {
      x: x + width / 2 - 50,
      y: y - height / 2,
      size: 10,
      font,
      color: COLORS.textLight,
    });
    return;
  }

  const chartMargin = 50;
  const chartRightMargin = 60; // Mehr Platz für rechte Y-Achsen
  const chartWidth = width - chartMargin - chartRightMargin;
  const chartHeight = height - 2 * chartMargin;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin;

  // Legende oben zeichnen
  const legendY = y - 15;
  page.drawCircle({ x: chartX, y: legendY, size: 4, color: COLORS.chartPain });
  page.drawText("Schmerzintensitat (0-10)", { x: chartX + 10, y: legendY - 3, size: 8, font, color: COLORS.chartPain });
  
  page.drawCircle({ x: chartX + 150, y: legendY, size: 4, color: COLORS.chartTemp });
  page.drawText("Temperatur (°C)", { x: chartX + 160, y: legendY - 3, size: 8, font, color: COLORS.chartTemp });
  
  page.drawCircle({ x: chartX + 280, y: legendY, size: 4, color: COLORS.chartPressure });
  page.drawText("Luftdruck (hPa)", { x: chartX + 290, y: legendY - 3, size: 8, font, color: COLORS.chartPressure });

  // LINKE Y-Achse: Schmerz (0-10)
  for (let i = 0; i <= 10; i += 2) {
    const yAxisPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX - 5, y: yAxisPos },
      end: { x: chartX, y: yAxisPos },
      thickness: 0.5,
      color: COLORS.chartPain,
    });
    page.drawText(i.toString(), {
      x: chartX - 18,
      y: yAxisPos - 4,
      size: 7,
      font,
      color: COLORS.chartPain,
    });
    
    // Gitternetz
    page.drawLine({
      start: { x: chartX, y: yAxisPos },
      end: { x: chartX + chartWidth, y: yAxisPos },
      thickness: 0.3,
      color: COLORS.gridLine,
    });
  }

  // Wetterdaten sammeln für Achsen-Bereiche
  const temperatures = sortedDates
    .map(d => dataByDate.get(d)?.temperature)
    .filter((t): t is number => t !== null);
  const pressures = sortedDates
    .map(d => dataByDate.get(d)?.pressure)
    .filter((p): p is number => p !== null && p > 0);
  
  const hasTemperature = temperatures.length > 0;
  const hasPressure = pressures.length > 0;
  
  let minTemp = -10, maxTemp = 35;
  let minPressure = 990, maxPressure = 1030;
  
  if (hasTemperature) {
    minTemp = Math.floor(Math.min(...temperatures) - 5);
    maxTemp = Math.ceil(Math.max(...temperatures) + 5);
  }
  
  if (hasPressure) {
    minPressure = Math.floor(Math.min(...pressures) - 5);
    maxPressure = Math.ceil(Math.max(...pressures) + 5);
  }

  // RECHTE Y-Achse 1: Temperatur (wenn Daten vorhanden)
  if (hasTemperature) {
    const tempRange = maxTemp - minTemp || 20;
    for (let i = 0; i <= 5; i++) {
      const temp = Math.round(minTemp + (tempRange / 5) * i);
      const yAxisPos = chartY + (i / 5) * chartHeight;
      
      page.drawLine({
        start: { x: chartX + chartWidth, y: yAxisPos },
        end: { x: chartX + chartWidth + 5, y: yAxisPos },
        thickness: 0.5,
        color: COLORS.chartTemp,
      });
      
      page.drawText(`${temp}`, {
        x: chartX + chartWidth + 8,
        y: yAxisPos - 4,
        size: 7,
        font,
        color: COLORS.chartTemp,
      });
    }
  }

  // RECHTE Y-Achse 2: Luftdruck (wenn Daten vorhanden)
  if (hasPressure) {
    const pressureRange = maxPressure - minPressure || 20;
    for (let i = 0; i <= 5; i++) {
      const pressure = Math.round(minPressure + (pressureRange / 5) * i);
      const yAxisPos = chartY + (i / 5) * chartHeight;
      
      page.drawText(`${pressure}`, {
        x: chartX + chartWidth + 35,
        y: yAxisPos - 4,
        size: 7,
        font,
        color: COLORS.chartPressure,
      });
    }
  }

  // Datenpunkte & Linien zeichnen
  const maxPoints = Math.min(sortedDates.length, 40);
  const step = Math.ceil(sortedDates.length / maxPoints);
  const displayDates = sortedDates.filter((_, i) => i % step === 0);
  const pointSpacing = chartWidth / (displayDates.length - 1 || 1);

  let prevPainX: number | null = null;
  let prevPainY: number | null = null;
  let prevTempX: number | null = null;
  let prevTempY: number | null = null;
  let prevPressureX: number | null = null;
  let prevPressureY: number | null = null;

  displayDates.forEach((date, i) => {
    const data = dataByDate.get(date)!;
    const pointX = chartX + i * pointSpacing;
    
    // 1. Schmerz-Linie (rot, durchgezogen)
    const painY = chartY + (data.pain / 10) * chartHeight;
    if (prevPainX !== null && prevPainY !== null) {
      page.drawLine({
        start: { x: prevPainX, y: prevPainY },
        end: { x: pointX, y: painY },
        thickness: 2,
        color: COLORS.chartPain,
      });
    }
    page.drawCircle({
      x: pointX,
      y: painY,
      size: 3,
      color: COLORS.chartPain,
    });
    prevPainX = pointX;
    prevPainY = painY;

    // 2. Temperatur-Linie (blau, gestrichelt)
    if (hasTemperature && data.temperature !== null) {
      const tempRange = maxTemp - minTemp || 20;
      const tempNorm = (data.temperature - minTemp) / tempRange;
      const tempY = chartY + tempNorm * chartHeight;
      
      if (prevTempX !== null && prevTempY !== null) {
        page.drawLine({
          start: { x: prevTempX, y: prevTempY },
          end: { x: pointX, y: tempY },
          thickness: 1.5,
          color: COLORS.chartTemp,
          dashArray: [4, 2],
        });
      }
      page.drawCircle({
        x: pointX,
        y: tempY,
        size: 2,
        color: COLORS.chartTemp,
      });
      prevTempX = pointX;
      prevTempY = tempY;
    }

    // 3. Luftdruck-Linie (grün, gestrichelt)
    if (hasPressure && data.pressure !== null) {
      const pressureRange = maxPressure - minPressure || 20;
      const pressureNorm = (data.pressure - minPressure) / pressureRange;
      const pressureY = chartY + pressureNorm * chartHeight;
      
      if (prevPressureX !== null && prevPressureY !== null) {
        page.drawLine({
          start: { x: prevPressureX, y: prevPressureY },
          end: { x: pointX, y: pressureY },
          thickness: 1.5,
          color: COLORS.chartPressure,
          dashArray: [6, 3],
        });
      }
      page.drawCircle({
        x: pointX,
        y: pressureY,
        size: 2,
        color: COLORS.chartPressure,
      });
      prevPressureX = pointX;
      prevPressureY = pressureY;
    }

    // X-Achsen Labels (deutsches Format: Tag.Monat.)
    if (i % Math.ceil(displayDates.length / 8) === 0) {
      page.drawText(formatDateShort(date), {
        x: pointX - 12,
        y: chartY - 15,
        size: 7,
        font,
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE DRAWING WITH PAGEBREAK LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function drawTableHeader(page: PDFPage, yPos: number, font: PDFFont, includeNotes: boolean = true): number {
  const cols = includeNotes ? {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 120,
    meds: LAYOUT.margin + 175,
    special: LAYOUT.margin + 350,
  } : {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 140,
    meds: LAYOUT.margin + 200,
    special: LAYOUT.margin + 380,
  };
  
  page.drawRectangle({
    x: LAYOUT.margin,
    y: yPos - 18,
    width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
    height: 18,
    color: rgb(0.95, 0.97, 1.0),
  });
  
  page.drawText("Datum/Zeit", { x: cols.date, y: yPos - 12, size: 9, font, color: COLORS.text });
  page.drawText("Schmerz", { x: cols.pain, y: yPos - 12, size: 9, font, color: COLORS.text });
  page.drawText("Medikation", { x: cols.meds, y: yPos - 12, size: 9, font, color: COLORS.text });
  page.drawText("Besonderheiten", { x: cols.special, y: yPos - 12, size: 9, font, color: COLORS.text });
  
  return yPos - 25;
}

function generateSpecialNotesText(entry: PainEntry): string {
  const parts: string[] = [];
  
  if (entry.aura_type && entry.aura_type !== 'keine' && entry.aura_type !== '-') {
    parts.push(`Aura: ${entry.aura_type}`);
  }
  
  if (entry.pain_locations && entry.pain_locations.length > 0) {
    const formattedLocations = entry.pain_locations.map(formatPainLocation).join(', ');
    parts.push(formattedLocations);
  }
  
  if (entry.notes) {
    const shortNote = entry.notes.length > 50 
      ? entry.notes.substring(0, 47) + '...'
      : entry.notes;
    parts.push(shortNote);
  }
  
  return parts.length > 0 ? parts.join('; ') : '-';
}

function drawTableRow(
  page: PDFPage,
  entry: PainEntry,
  yPos: number,
  font: PDFFont,
  pdfDoc: any,
  includeNotes: boolean = true
): { yPos: number; page: PDFPage; rowHeight: number } {
  const cols = includeNotes ? {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 120,
    meds: LAYOUT.margin + 175,
    special: LAYOUT.margin + 350,
  } : {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 140,
    meds: LAYOUT.margin + 200,
    special: LAYOUT.margin + 380,
  };
  
  const colWidths = includeNotes ? {
    date: 115,
    pain: 50,
    meds: 170,
    special: 160,
  } : {
    date: 135,
    pain: 55,
    meds: 175,
    special: 130,
  };
  
  const dateTime = entry.selected_date && entry.selected_time
    ? formatDateTimeGerman(entry.selected_date, entry.selected_time)
    : formatDateTimeGerman(entry.timestamp_created || '');
  
  const painText = formatPainLevel(entry.pain_level);
  const medsText = formatMedicationsWithDose(entry.medications, entry.medication_intakes);
  const medsLines = wrapText(medsText, colWidths.meds, 8, font);
  const specialText = generateSpecialNotesText(entry);
  const specialLines = wrapText(specialText, colWidths.special, 8, font);
  
  const maxLines = Math.max(medsLines.length, specialLines.length, 1);
  const rowHeight = maxLines * 11 + 12;
  
  if (yPos - rowHeight < LAYOUT.margin + 30) {
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    yPos = drawTableHeader(page, yPos, font, includeNotes);
  }
  
  const fontSize = 8;
  const lineSpacing = 11;
  const textVisualOffset = fontSize * 0.35;
  
  const contentBlockHeight = (maxLines - 1) * lineSpacing;
  const rowCenter = rowHeight / 2;
  const firstLineFromTop = rowCenter - (contentBlockHeight / 2) + textVisualOffset;
  const rowTop = yPos - firstLineFromTop;
  
  page.drawText(sanitizeForPDF(dateTime), { x: cols.date, y: rowTop, size: 8, font });
  page.drawText(sanitizeForPDF(painText), { x: cols.pain, y: rowTop, size: 8, font });
  
  medsLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.meds, 
      y: rowTop - (i * 11), 
      size: 8, 
      font 
    });
  });
  
  specialLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.special, 
      y: rowTop - (i * 11), 
      size: 8, 
      font 
    });
  });
  
  yPos -= rowHeight;
  page.drawLine({
    start: { x: LAYOUT.margin, y: yPos },
    end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos },
    thickness: 0.3,
    color: COLORS.border,
  });
  
  return { yPos: yPos - 3, page, rowHeight };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIPTAN DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function isTriptan(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes('triptan')) return true;
  const triptanBrands = ['imigran', 'maxalt', 'ascotop', 'naramig', 'almogran', 'relpax', 'allegro'];
  return triptanBrands.some(brand => lower.includes(brand));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PDF BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function buildDiaryPdf(params: BuildReportParams): Promise<Uint8Array> {
  const { 
    title = "Kopfschmerztagebuch",
    from,
    to,
    entries,
    includeChart = true,
    includeAnalysis = false,
    includeEntriesList = true,
    includePatientData = false,
    includeDoctorData = false,
    includePatientNotes = true,
    includeMedicationCourses = false,
    freeTextExportMode = 'none',
    analysisReport = "",
    patientNotes = "",
    medicationStats = [],
    medicationCourses = [],
    patientData,
    doctors = [],
    premiumAIReport,
  } = params;

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let yPos = LAYOUT.pageHeight - LAYOUT.margin;
  const daysCount = calculateDays(from, to);
  
  // Prüfe ob Premium-KI aktiviert ist
  const hasPremiumAI = premiumAIReport && premiumAIReport.keyFindings && premiumAIReport.keyFindings.length > 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. KOPFBEREICH (Titel, Zeitraum, Erstellungsdatum)
  // ═══════════════════════════════════════════════════════════════════════════
  
  page.drawText(title, { 
    x: LAYOUT.margin, 
    y: yPos, 
    size: 20, 
    font: fontBold, 
    color: COLORS.primary 
  });
  yPos -= 18;
  
  page.drawLine({
    start: { x: LAYOUT.margin, y: yPos },
    end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos },
    thickness: 2,
    color: COLORS.primary,
  });
  yPos -= 20;

  page.drawText(`Berichtszeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)}`, 
    { x: LAYOUT.margin, y: yPos, size: 11, font: fontBold, color: COLORS.text });
  yPos -= 12;
  
  page.drawText(`Erstellt am: ${formatDateGerman(new Date().toISOString())}`, 
    { x: LAYOUT.margin, y: yPos, size: 9, font, color: COLORS.textLight });
  yPos -= LAYOUT.sectionGap + 5;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATIENTENDATEN (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includePatientData && patientData && (patientData.firstName || patientData.lastName)) {
    yPos = drawSectionHeader(page, "PATIENT", yPos, fontBold, 12);
    
    if (patientData.firstName || patientData.lastName) {
      const name = [patientData.firstName, patientData.lastName].filter(Boolean).join(" ");
      yPos = drawKeyValue(page, "Name", name, yPos, font, fontBold);
    }
    
    if (patientData.dateOfBirth) {
      yPos = drawKeyValue(page, "Geburtsdatum", formatDateGerman(patientData.dateOfBirth), yPos, font, fontBold);
    }
    
    if (patientData.street || patientData.postalCode || patientData.city) {
      const address = [patientData.street, `${patientData.postalCode || ''} ${patientData.city || ''}`.trim()]
        .filter(Boolean).join(", ");
      yPos = drawKeyValue(page, "Adresse", address, yPos, font, fontBold);
    }
    
    if (patientData.phone) {
      yPos = drawKeyValue(page, "Telefon", patientData.phone, yPos, font, fontBold);
    }
    
    if (patientData.email) {
      yPos = drawKeyValue(page, "E-Mail", patientData.email, yPos, font, fontBold);
    }
    
    if (patientData.healthInsurance) {
      yPos = drawKeyValue(page, "Krankenkasse", patientData.healthInsurance, yPos, font, fontBold);
    }
    
    if (patientData.insuranceNumber) {
      yPos = drawKeyValue(page, "Versicherungsnr.", patientData.insuranceNumber, yPos, font, fontBold);
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARZTKONTAKTE (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeDoctorData && doctors && doctors.length > 0) {
    const doctorLabel = doctors.length === 1 ? "BEHANDELNDER ARZT" : "BEHANDELNDE ARZTE";
    yPos = drawSectionHeader(page, doctorLabel, yPos, fontBold, 12);
    
    for (const doctor of doctors) {
      if (doctor.firstName || doctor.lastName) {
        const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(" ");
        const nameWithSpecialty = doctor.specialty 
          ? `${name} (${doctor.specialty})` 
          : name;
        yPos = drawKeyValue(page, "Name", nameWithSpecialty, yPos, font, fontBold);
      }
      
      if (doctor.street || doctor.postalCode || doctor.city) {
        const address = [doctor.street, `${doctor.postalCode || ''} ${doctor.city || ''}`.trim()]
          .filter(Boolean).join(", ");
        yPos = drawKeyValue(page, "Praxisadresse", address, yPos, font, fontBold);
      }
      
      if (doctor.phone) {
        yPos = drawKeyValue(page, "Telefon", doctor.phone, yPos, font, fontBold);
      }
      
      if (doctor.email) {
        yPos = drawKeyValue(page, "E-Mail", doctor.email, yPos, font, fontBold);
      }
      
      yPos -= 10;
    }
    
    yPos -= LAYOUT.sectionGap - 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ÄRZTLICHE KERNÜBERSICHT (höchste Priorität - IMMER ganz oben)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    const painDaysSet = new Set<string>();
    let triptanIntakesTotal = 0;
    
    entries.forEach(entry => {
      const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
      if (date) {
        painDaysSet.add(date);
      }
      
      if (entry.medications && entry.medications.length > 0) {
        entry.medications.forEach(med => {
          if (isTriptan(med)) {
            triptanIntakesTotal++;
          }
        });
      }
    });
    
    const painDays = painDaysSet.size;
    
    const painDaysPerMonth = daysCount > 0 
      ? Math.round((painDays / daysCount) * 30 * 10) / 10
      : 0;
    const triptanPerMonth = daysCount > 0 
      ? Math.round((triptanIntakesTotal / daysCount) * 30 * 10) / 10
      : 0;
    
    const validPainLevels = entries
      .map(e => painLevelToNumericValue(e.pain_level))
      .filter(l => l > 0);
    const avgIntensity = validPainLevels.length > 0
      ? Math.round(validPainLevels.reduce((a, b) => a + b, 0) / validPainLevels.length * 10) / 10
      : 0;
    
    yPos = drawSectionHeader(page, "ARZTLICHE KERNUBERSICHT", yPos, fontBold, 13);
    
    page.drawText(`Berechnet aus ${daysCount} dokumentierten Tagen, normiert auf 30 Tage/Monat`, {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 18;
    
    const kpiBoxHeight = 70;
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - kpiBoxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: kpiBoxHeight,
      color: rgb(0.96, 0.98, 1.0),
      borderColor: COLORS.primary,
      borderWidth: 1.5,
    });
    
    const boxPadding = 15;
    const kpiY = yPos - boxPadding;
    const colWidth = (LAYOUT.pageWidth - 2 * LAYOUT.margin - 2 * boxPadding) / 3;
    
    // KPI 1: Schmerztage pro Monat
    page.drawText("Ø Schmerztage / Monat", {
      x: LAYOUT.margin + boxPadding,
      y: kpiY,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });
    page.drawText(formatGermanDecimal(painDaysPerMonth, 1), {
      x: LAYOUT.margin + boxPadding,
      y: kpiY - 25,
      size: 22,
      font: fontBold,
      color: COLORS.primary,
    });
    page.drawText(`(${painDays} Tage in ${daysCount} Tagen)`, {
      x: LAYOUT.margin + boxPadding,
      y: kpiY - 42,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    // KPI 2: Triptan-EINNAHMEN pro Monat
    page.drawText("Ø Triptane / Monat", {
      x: LAYOUT.margin + boxPadding + colWidth,
      y: kpiY,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });
    page.drawText(formatGermanDecimal(triptanPerMonth, 1), {
      x: LAYOUT.margin + boxPadding + colWidth,
      y: kpiY - 25,
      size: 22,
      font: fontBold,
      color: COLORS.primary,
    });
    page.drawText(`(${triptanIntakesTotal} Einnahmen gesamt)`, {
      x: LAYOUT.margin + boxPadding + colWidth,
      y: kpiY - 42,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    // KPI 3: Durchschnittliche Intensität
    page.drawText("Ø Schmerzintensitat", {
      x: LAYOUT.margin + boxPadding + 2 * colWidth,
      y: kpiY,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });
    page.drawText(`${formatGermanDecimal(avgIntensity, 1)} / 10`, {
      x: LAYOUT.margin + boxPadding + 2 * colWidth,
      y: kpiY - 25,
      size: 22,
      font: fontBold,
      color: COLORS.primary,
    });
    page.drawText("(NRS-Skala)", {
      x: LAYOUT.margin + boxPadding + 2 * colWidth,
      y: kpiY - 42,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    yPos -= kpiBoxHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AKUTMEDIKATION & WIRKUNG (DIREKT NACH KERNÜBERSICHT!)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (medicationStats && medicationStats.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "AKUTMEDIKATION & WIRKUNG", yPos, fontBold, 12);
    
    const hasExtendedStats = medicationStats[0]?.totalUnitsInRange !== undefined;
    
    const cols = hasExtendedStats ? {
      name: LAYOUT.margin,
      totalRange: LAYOUT.margin + 140,
      avgMonth: LAYOUT.margin + 220,
      last30: LAYOUT.margin + 300,
      effectiveness: LAYOUT.margin + 380,
    } : {
      name: LAYOUT.margin,
      count: LAYOUT.margin + 220,
      effectiveness: LAYOUT.margin + 320,
      note: LAYOUT.margin + 420,
    };
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - 18,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: 18,
      color: rgb(0.95, 0.97, 1.0),
    });
    
    if (hasExtendedStats) {
      page.drawText("Medikament", { x: cols.name, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("Einnahmen", { x: cols.totalRange, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("Ø / Monat", { x: cols.avgMonth, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("Letzte 30T", { x: cols.last30, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("Ø Wirkung", { x: cols.effectiveness, y: yPos - 12, size: 8, font: fontBold });
    } else {
      page.drawText("Medikament", { x: cols.name, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("Einnahmen", { x: cols.count!, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("Ø Wirksamkeit", { x: cols.effectiveness, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("Bemerkung", { x: cols.note!, y: yPos - 12, size: 9, font: fontBold });
    }
    yPos -= 30;
    
    // Triptane zusammenfassen + andere separat
    const triptans = medicationStats.filter(s => isTriptan(s.name));
    const others = medicationStats.filter(s => !isTriptan(s.name));
    
    // Triptan-Zusammenfassung wenn > 1
    if (triptans.length > 1) {
      const totalTriptanUnits = triptans.reduce((sum, t) => sum + (t.totalUnitsInRange ?? t.count), 0);
      const totalTriptanPerMonth = triptans.reduce((sum, t) => sum + (t.avgPerMonth ?? 0), 0);
      const totalTriptanLast30 = triptans.reduce((sum, t) => sum + (t.last30Units ?? 0), 0);
      
      page.drawText("Triptane (gesamt)", { x: cols.name, y: yPos, size: 9, font: fontBold, color: COLORS.primaryLight });
      if (hasExtendedStats) {
        page.drawText(formatGermanDecimal(totalTriptanUnits, 1), { x: cols.totalRange, y: yPos, size: 9, font: fontBold });
        page.drawText(formatGermanDecimal(totalTriptanPerMonth, 1), { x: cols.avgMonth, y: yPos, size: 9, font: fontBold });
        page.drawText(formatGermanDecimal(totalTriptanLast30, 1), { x: cols.last30, y: yPos, size: 9, font: fontBold });
      } else {
        page.drawText(totalTriptanUnits.toString(), { x: cols.count!, y: yPos, size: 9, font: fontBold });
      }
      yPos -= 15;
    }
    
    // Alle Medikamente auflisten
    const allMeds = [...triptans, ...others].slice(0, 8);
    for (const stat of allMeds) {
      if (yPos < LAYOUT.margin + 50) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        yPos = LAYOUT.pageHeight - LAYOUT.margin;
      }
      
      const medName = isTriptan(stat.name) && triptans.length > 1 
        ? `  ${stat.name}` // Eingerückt wenn Teil der Triptan-Gruppe
        : stat.name;
      
      page.drawText(sanitizeForPDF(medName), { x: cols.name, y: yPos, size: 9, font });
      
      if (hasExtendedStats) {
        page.drawText(formatGermanDecimal(stat.totalUnitsInRange ?? stat.count, 1), { 
          x: cols.totalRange, y: yPos, size: 9, font 
        });
        page.drawText(formatGermanDecimal(stat.avgPerMonth ?? 0, 1), { 
          x: cols.avgMonth, y: yPos, size: 9, font 
        });
        page.drawText(formatGermanDecimal(stat.last30Units ?? 0, 1), { 
          x: cols.last30, y: yPos, size: 9, font 
        });
        
        if (stat.ratedCount > 0 && stat.avgEffect !== null) {
          const effectPercent = Math.round((stat.avgEffect / 10) * 100);
          page.drawText(`${effectPercent}%`, { x: cols.effectiveness, y: yPos, size: 9, font });
        } else {
          page.drawText("-", { x: cols.effectiveness, y: yPos, size: 9, font });
        }
      } else {
        page.drawText(stat.count.toString(), { x: cols.count!, y: yPos, size: 9, font });
        
        if (stat.ratedCount > 0 && stat.avgEffect !== null) {
          const effectPercent = Math.round((stat.avgEffect / 10) * 100);
          page.drawText(`${effectPercent}%`, { x: cols.effectiveness, y: yPos, size: 9, font });
        } else {
          page.drawText("-", { x: cols.effectiveness, y: yPos, size: 9, font });
        }
      }
      
      yPos -= 15;
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. BERICHT / ANALYSE
  // WICHTIG: Premium-KI ERSETZT statische Analyse vollständig!
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (hasPremiumAI) {
    // ─────────────────────────────────────────────────────────────────────────
    // 4B) PREMIUM-KI: "Medizinische Gesamtanalyse (KI-gestützt)"
    // Dieser Block ersetzt ALLE anderen Analysen vollständig!
    // ─────────────────────────────────────────────────────────────────────────
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 200);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "MEDIZINISCHE GESAMTANALYSE (KI-GESTUTZT)", yPos, fontBold, 12);
    
    // Headline
    if (premiumAIReport!.headline) {
      const headlineLines = wrapText(premiumAIReport!.headline, LAYOUT.pageWidth - 2 * LAYOUT.margin, 10, fontBold);
      for (const line of headlineLines) {
        page.drawText(sanitizeForPDF(line), {
          x: LAYOUT.margin,
          y: yPos,
          size: 10,
          font: fontBold,
          color: COLORS.text,
        });
        yPos -= 14;
      }
      yPos -= 4;
    }
    
    // Erstellt am
    if (premiumAIReport!.createdAt) {
      const createdDate = new Date(premiumAIReport!.createdAt);
      page.drawText(`Erstellt am: ${formatDateGerman(createdDate.toISOString())}`, {
        x: LAYOUT.margin,
        y: yPos,
        size: 8,
        font,
        color: COLORS.textLight,
      });
      yPos -= 16;
    }
    
    // Key Findings
    if (premiumAIReport!.keyFindings.length > 0) {
      page.drawText("Wichtigste Erkenntnisse:", {
        x: LAYOUT.margin,
        y: yPos,
        size: 9,
        font: fontBold,
        color: COLORS.primaryLight,
      });
      yPos -= 14;
      
      for (const finding of premiumAIReport!.keyFindings.slice(0, 5)) {
        const bulletText = `- ${finding.title}: ${finding.finding}`;
        const lines = wrapText(bulletText, LAYOUT.pageWidth - 2 * LAYOUT.margin - 10, 8, font);
        for (const line of lines) {
          if (yPos < LAYOUT.margin + 50) {
            page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
            yPos = LAYOUT.pageHeight - LAYOUT.margin;
          }
          page.drawText(sanitizeForPDF(line), {
            x: LAYOUT.margin + 5,
            y: yPos,
            size: 8,
            font,
            color: COLORS.text,
          });
          yPos -= 11;
        }
        yPos -= 3;
      }
    }
    
    // Sections
    if (premiumAIReport!.sections && premiumAIReport!.sections.length > 0) {
      yPos -= 8;
      for (const section of premiumAIReport!.sections.slice(0, 4)) {
        if (yPos < LAYOUT.margin + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          yPos = LAYOUT.pageHeight - LAYOUT.margin;
        }
        
        page.drawText(sanitizeForPDF(section.title + ":"), {
          x: LAYOUT.margin,
          y: yPos,
          size: 9,
          font: fontBold,
          color: COLORS.text,
        });
        yPos -= 12;
        
        for (const bullet of (section.bullets || []).slice(0, 4)) {
          const lines = wrapText(`- ${bullet}`, LAYOUT.pageWidth - 2 * LAYOUT.margin - 15, 8, font);
          for (const line of lines) {
            page.drawText(sanitizeForPDF(line), {
              x: LAYOUT.margin + 8,
              y: yPos,
              size: 8,
              font,
              color: COLORS.text,
            });
            yPos -= 10;
          }
        }
        yPos -= 6;
      }
    }
    
    // Disclaimer
    page.drawText(sanitizeForPDF(premiumAIReport!.disclaimer || "Keine medizinische Beratung."), {
      x: LAYOUT.margin,
      y: yPos,
      size: 7,
      font,
      color: COLORS.textLight,
    });
    yPos -= LAYOUT.sectionGap;
    
  } else if (includeAnalysis && analysisReport) {
    // ─────────────────────────────────────────────────────────────────────────
    // 4A) STATISCH: "Sachliche Auswertung der dokumentierten Daten"
    // ─────────────────────────────────────────────────────────────────────────
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "SACHLICHE AUSWERTUNG DER DOKUMENTIERTEN DATEN", yPos, fontBold, 12);
    
    page.drawText("Faktenbasierte Zusammenfassung ohne KI-Analyse", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 12;
    
    const periodText = `Auswertungszeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)} (${daysCount} Tage)`;
    page.drawText(periodText, {
      x: LAYOUT.margin,
      y: yPos,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });
    yPos -= 18;
    
    const estimatedLines = analysisReport.split('\n').length * 2;
    const boxHeight = Math.max(100, estimatedLines * 12 + 40);
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - boxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
      color: rgb(0.98, 0.99, 1.0),
    });
    
    const boxPadding = 10;
    const maxWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin - 2 * boxPadding;
    const boxY = yPos - boxPadding - 4;
    
    const result = drawStructuredText(
      page,
      analysisReport,
      boxY,
      yPos - boxHeight + boxPadding,
      font,
      fontBold,
      maxWidth,
      boxPadding,
      pdfDoc
    );
    page = result.page;
    yPos = result.yPos - 10;
    
    // Hinweis-Box
    const disclaimerContent = "Alle Auswertungen basieren ausschliesslich auf den dokumentierten Daten. Sie stellen keine medizinische Diagnose dar.";
    const disclaimerLines = wrapText(disclaimerContent, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 8, font);
    const disclaimerBoxHeight = disclaimerLines.length * 11 + 20;
    
    if (yPos - disclaimerBoxHeight < LAYOUT.margin + 50) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
    }
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - disclaimerBoxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: disclaimerBoxHeight,
      color: rgb(0.97, 0.97, 0.95),
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    
    let discY = yPos - 10;
    page.drawText("Hinweis:", { x: LAYOUT.margin + 10, y: discY, size: 8, font: fontBold, color: COLORS.textLight });
    discY -= 11;
    for (const line of disclaimerLines) {
      page.drawText(sanitizeForPDF(line), { x: LAYOUT.margin + 10, y: discY, size: 8, font, color: COLORS.textLight });
      discY -= 11;
    }
    
    yPos -= disclaimerBoxHeight + 15;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATIENTENNOTIZEN (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const trimmedPatientNotes = (patientNotes || "").trim();
  if (includePatientNotes && trimmedPatientNotes) {
    const notesLines = wrapText(trimmedPatientNotes, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 9, font);
    const estimatedHeight = Math.max(60, notesLines.length * 12 + 30);
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, estimatedHeight + 30);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "ANMERKUNGEN DES PATIENTEN", yPos, fontBold, 12);
    
    const boxPadding = 10;
    const boxHeight = Math.min(Math.max(50, notesLines.length * 12 + 20), 300);
    
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - boxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
      color: rgb(0.99, 0.99, 0.97),
    });
    
    let noteY = yPos - boxPadding - 4;
    for (const line of notesLines) {
      if (noteY < yPos - boxHeight + boxPadding) break;
      page.drawText(sanitizeForPDF(line), {
        x: LAYOUT.margin + boxPadding,
        y: noteY,
        size: 9,
        font,
        color: COLORS.text,
      });
      noteY -= 12;
    }
    
    yPos -= boxHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPHYLAXE & THERAPIEVERLAUF (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeMedicationCourses && medicationCourses && medicationCourses.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 150);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "PROPHYLAXE & THERAPIEVERLAUF", yPos, fontBold, 12);
    
    const prophylaxe = medicationCourses.filter(c => c.type === 'prophylaxe');
    const akut = medicationCourses.filter(c => c.type === 'akut');
    const andere = medicationCourses.filter(c => c.type !== 'prophylaxe' && c.type !== 'akut');
    
    const drawCourseGroup = (courses: MedicationCourseForPdf[], label: string) => {
      if (courses.length === 0) return;
      
      page.drawText(label, {
        x: LAYOUT.margin,
        y: yPos,
        size: 10,
        font: fontBold,
        color: COLORS.primaryLight,
      });
      yPos -= 16;
      
      for (const course of courses) {
        if (yPos < LAYOUT.margin + 100) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          yPos = LAYOUT.pageHeight - LAYOUT.margin;
        }
        
        const status = course.is_active ? "(laufend)" : "(abgeschlossen)";
        const statusColor = course.is_active ? rgb(0.2, 0.6, 0.2) : COLORS.textLight;
        
        page.drawText(sanitizeForPDF(course.medication_name), {
          x: LAYOUT.margin,
          y: yPos,
          size: 10,
          font: fontBold,
          color: COLORS.text,
        });
        
        const nameWidth = fontBold.widthOfTextAtSize(sanitizeForPDF(course.medication_name), 10);
        page.drawText(` ${status}`, {
          x: LAYOUT.margin + nameWidth + 5,
          y: yPos,
          size: 9,
          font,
          color: statusColor,
        });
        yPos -= 14;
        
        if (course.dose_text) {
          page.drawText(`Dosierung: ${sanitizeForPDF(course.dose_text)}`, {
            x: LAYOUT.margin + 10,
            y: yPos,
            size: 9,
            font,
            color: COLORS.text,
          });
          yPos -= 12;
        }
        
        const startStr = formatDateGerman(course.start_date);
        const endStr = course.end_date ? formatDateGerman(course.end_date) : "laufend";
        page.drawText(`Zeitraum: ${startStr} - ${endStr}`, {
          x: LAYOUT.margin + 10,
          y: yPos,
          size: 9,
          font,
          color: COLORS.text,
        });
        yPos -= 12;
        
        if (course.subjective_effectiveness !== undefined && course.subjective_effectiveness !== null) {
          page.drawText(`Subjektive Wirksamkeit: ${course.subjective_effectiveness}/10`, {
            x: LAYOUT.margin + 10,
            y: yPos,
            size: 9,
            font,
            color: COLORS.text,
          });
          yPos -= 12;
        }
        
        yPos -= 8;
      }
      
      yPos -= 5;
    };
    
    drawCourseGroup(prophylaxe, "Prophylaktische Behandlungen:");
    drawCourseGroup(akut, "Akutbehandlungen:");
    drawCourseGroup(andere, "Sonstige Behandlungen:");
    
    yPos -= LAYOUT.sectionGap - 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. DIAGRAMM: "Schmerz- & Wetterverlauf" (EINZIGES Diagramm)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeChart && entries.length > 0) {
    // Neue Seite für Diagramm
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    
    yPos = drawSectionHeader(page, "SCHMERZ- & WETTERVERLAUF", yPos, fontBold, 13);
    
    page.drawText(`Kombiniertes Verlaufsdiagramm fur den Berichtszeitraum ${formatDateGerman(from)} - ${formatDateGerman(to)}`, {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 20;
    
    const chartHeight = 280;
    const chartWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
    drawCombinedWeatherPainChart(page, entries, LAYOUT.margin, yPos, chartWidth, chartHeight, font, fontBold);
    yPos -= chartHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DETAILLIERTE KOPFSCHMERZ-EINTRÄGE (GANZ AM ENDE)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeEntriesList && entries.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 100);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "DETAILLIERTE KOPFSCHMERZ-EINTRAGE", yPos, fontBold, 12);
    
    page.drawText(`${entries.length} Eintrage im Zeitraum`, {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 15;
    
    const includeNotesInTable = freeTextExportMode !== 'none';
    yPos = drawTableHeader(page, yPos, fontBold, includeNotesInTable);
    
    const sortedEntries = [...entries].sort((a, b) => {
      const dateA = new Date(a.selected_date || a.timestamp_created || '');
      const dateB = new Date(b.selected_date || b.timestamp_created || '');
      return dateB.getTime() - dateA.getTime();
    });
    
    for (const entry of sortedEntries) {
      const result = drawTableRow(page, entry, yPos, font, pdfDoc, includeNotesInTable);
      page = result.page;
      yPos = result.yPos;
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER (Seitenzahlen)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Seite ${i + 1} von ${pages.length}`, {
      x: LAYOUT.pageWidth - LAYOUT.margin - 60,
      y: LAYOUT.margin - 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    p.drawText("Kopfschmerztagebuch - Vertraulich", {
      x: LAYOUT.margin,
      y: LAYOUT.margin - 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
  });

  return await pdfDoc.save();
}
