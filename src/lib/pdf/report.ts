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
import { isTriptan } from "@/lib/medications/isTriptan";
import { computeDiaryDayBuckets } from "@/lib/diary/dayBuckets";
import { drawPieChartWithLegend } from "@/lib/pdf/pieChart";
import { drawSymptomSection, type SymptomDataForPdf } from "@/lib/pdf/symptomSection";
import { buildPainWeatherSeries, normalizePainLevel as sharedNormalizePainLevel, type PainWeatherDataPoint } from "@/lib/charts/painWeatherData";
import { drawSmoothPainWeatherChart } from "@/lib/charts/painWeatherPdfChart";

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
  sectionGap: 14,       // Abstand zwischen Abschnitten (kompakt)
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
  includePrivateNotes?: boolean;
  freeTextExportMode?: FreeTextExportMode;
  
  // KRITISCH: Explizites Flag ob User Premium-KI ausgewählt hat
  isPremiumAIRequested?: boolean;
  
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
  symptomData?: SymptomDataForPdf;
  meCfsData?: {
    avgScore: number;
    avgLabel: string;
    peakLabel: string;
    burdenPct: number;
    burdenPer30: number;
    daysWithBurden: number;
    documentedDays: number;
    calendarDays: number;
    iqrLabel: string;
    dataQualityNote?: string;
  };
  chartImageBytes?: Uint8Array;
  /** Weather association from analysisV2.weather (SSOT) */
  weatherAnalysis?: {
    coverage: {
      daysDocumented: number;
      daysWithWeather: number;
      daysWithDelta24h: number;
      ratioWeather: number;
      ratioDelta24h: number;
      daysWithEntryWeather?: number;
      daysWithSnapshotWeather?: number;
      daysWithNoWeather?: number;
    };
    pressureDelta24h: {
      enabled: boolean;
      confidence: string;
      buckets: Array<{
        label: string;
        nDays: number;
        headacheRate: number;
        meanPainMax: number | null;
        acuteMedRate: number;
      }>;
      relativeRisk: {
        referenceLabel: string;
        compareLabel: string;
        rr: number | null;
        absDiff: number | null;
      } | null;
      notes: string[];
    };
    disclaimer: string;
  } | null;
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
  // Remove trailing ,0 for whole numbers
  if (value % 1 === 0) return String(Math.round(value));
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
    page.drawText("Keine Daten verfügbar", {
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
  page.drawText("Schmerzintensität (0-10)", { x: chartX + 10, y: legendY - 3, size: 8, font, color: COLORS.chartPain });
  
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
        thickness: 1.8,
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
          thickness: 1.3,
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
          thickness: 1.3,
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

function generateSpecialNotesText(entry: PainEntry, includePrivateNotes: boolean = false): string {
  const parts: string[] = [];
  
  if (entry.aura_type && entry.aura_type !== 'keine' && entry.aura_type !== '-') {
    parts.push(`Aura: ${entry.aura_type}`);
  }
  
  if (entry.pain_locations && entry.pain_locations.length > 0) {
    const formattedLocations = entry.pain_locations.map(formatPainLocation).join(', ');
    parts.push(formattedLocations);
  }
  
  if (entry.notes && !(entry.entry_note_is_private && !includePrivateNotes)) {
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
  includeNotes: boolean = true,
  includePrivateNotes: boolean = false
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
  const specialText = generateSpecialNotesText(entry, includePrivateNotes);
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

// isTriptan importiert aus @/lib/medications/isTriptan (Single Source of Truth)

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
    includePrivateNotes = false,
    freeTextExportMode = 'none',
    isPremiumAIRequested = false, // KRITISCH: User hat Premium-KI ausgewählt
    analysisReport = "",
    patientNotes = "",
    medicationStats = [],
    medicationCourses = [],
    patientData,
    doctors = [],
    premiumAIReport,
    symptomData,
    meCfsData,
    chartImageBytes,
    weatherAnalysis,
  } = params;

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let yPos = LAYOUT.pageHeight - LAYOUT.margin;
  const daysCount = calculateDays(from, to);
  
  // KRITISCHE LOGIK:
  // - isPremiumAIRequested = User hat Premium ausgewählt (Boolean)
  // - hasPremiumAIData = Tatsächlich KI-Daten erhalten
  // - premiumAIFailed = User wollte Premium, aber keine Daten erhalten
  const hasPremiumAIData = premiumAIReport && premiumAIReport.keyFindings && premiumAIReport.keyFindings.length > 0;
  const premiumAIFailed = isPremiumAIRequested && !hasPremiumAIData;

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
  yPos -= 16;
  
  // Herkunftszeile: professionelle Positionierung
  page.drawText("Erstellt mit Miary \u2013 Digitale Verlaufsdokumentation f\u00FCr Migr\u00E4ne", {
    x: LAYOUT.margin,
    y: yPos,
    size: 9,
    font,
    color: rgb(0.42, 0.45, 0.50),
  });
  yPos -= 14;
  
  page.drawLine({
    start: { x: LAYOUT.margin, y: yPos },
    end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos },
    thickness: 2,
    color: COLORS.primary,
  });
  yPos -= 16;

  page.drawText(`Berichtszeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)}`, 
    { x: LAYOUT.margin, y: yPos, size: 11, font: fontBold, color: COLORS.text });
  yPos -= 12;
  
  page.drawText(`Erstellt am: ${formatDateGerman(new Date().toISOString())}`, 
    { x: LAYOUT.margin, y: yPos, size: 9, font, color: COLORS.textLight });
  yPos -= LAYOUT.sectionGap + 5;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATIENTENDATEN (eigener Block, untereinander)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const hasPatient = includePatientData && patientData && (patientData.firstName || patientData.lastName);
  const hasDoctor = includeDoctorData && doctors && doctors.length > 0;
  
  if (hasPatient && patientData) {
    yPos = drawSectionHeader(page, "PATIENT", yPos, fontBold, 11);
    
    if (patientData.firstName || patientData.lastName) {
      yPos = drawKeyValue(page, "Name", [patientData.firstName, patientData.lastName].filter(Boolean).join(" "), yPos, font, fontBold);
    }
    if (patientData.dateOfBirth) {
      yPos = drawKeyValue(page, "Geburtsdatum", formatDateGerman(patientData.dateOfBirth), yPos, font, fontBold);
    }
    if (patientData.healthInsurance) {
      yPos = drawKeyValue(page, "Krankenkasse", patientData.healthInsurance, yPos, font, fontBold);
    }
    if (patientData.insuranceNumber) {
      yPos = drawKeyValue(page, "Vers.-Nr.", patientData.insuranceNumber, yPos, font, fontBold);
    }
    if (patientData.phone) {
      yPos = drawKeyValue(page, "Telefon", patientData.phone, yPos, font, fontBold);
    }
    if (patientData.street || patientData.postalCode || patientData.city) {
      const address = [patientData.street, `${patientData.postalCode || ''} ${patientData.city || ''}`.trim()].filter(Boolean).join(", ");
      yPos = drawKeyValue(page, "Adresse", address, yPos, font, fontBold);
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHANDELNDER ARZT (eigener Block, untereinander)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (hasDoctor && doctors) {
    yPos = drawSectionHeader(page, "BEHANDELNDER ARZT", yPos, fontBold, 11);
    
    const doctor = doctors[0];
    if (doctor.firstName || doctor.lastName) {
      const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(" ");
      yPos = drawKeyValue(page, "Name", name, yPos, font, fontBold);
    }
    if (doctor.specialty) {
      yPos = drawKeyValue(page, "Fachrichtung", doctor.specialty, yPos, font, fontBold);
    }
    if (doctor.street || doctor.postalCode || doctor.city) {
      const address = [doctor.street, `${doctor.postalCode || ''} ${doctor.city || ''}`.trim()].filter(Boolean).join(", ");
      yPos = drawKeyValue(page, "Praxis", address, yPos, font, fontBold);
    }
    if (doctor.phone) {
      yPos = drawKeyValue(page, "Telefon", doctor.phone, yPos, font, fontBold);
    }
    if (doctor.email) {
      yPos = drawKeyValue(page, "E-Mail", doctor.email, yPos, font, fontBold);
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ÄRZTLICHE KERNÜBERSICHT (kompakter)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    const painDaysSet = new Set<string>();
    let triptanIntakesTotal = 0;
    
    entries.forEach(entry => {
      const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
      if (date) painDaysSet.add(date);
      if (entry.medications && entry.medications.length > 0) {
        entry.medications.forEach(med => { if (isTriptan(med)) triptanIntakesTotal++; });
      }
    });
    
    const painDays = painDaysSet.size;
    const painDaysPerMonth = daysCount > 0 ? Math.round((painDays / daysCount) * 30 * 10) / 10 : 0;
    const triptanPerMonth = daysCount > 0 ? Math.round((triptanIntakesTotal / daysCount) * 30 * 10) / 10 : 0;
    
    const validPainLevels = entries.map(e => painLevelToNumericValue(e.pain_level)).filter(l => l > 0);
    const avgIntensity = validPainLevels.length > 0
      ? Math.round(validPainLevels.reduce((a, b) => a + b, 0) / validPainLevels.length * 10) / 10
      : 0;
    
    yPos = drawSectionHeader(page, "ÄRZTLICHE KERNÜBERSICHT", yPos, fontBold, 11);
    
    page.drawText(`Berechnet aus ${daysCount} dokumentierten Tagen, normiert auf 30 Tage/Monat`, {
      x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight,
    });
    yPos -= 14;
    
    const kpiBoxHeight = 55;
    page.drawRectangle({
      x: LAYOUT.margin, y: yPos - kpiBoxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin, height: kpiBoxHeight,
      color: rgb(0.96, 0.98, 1.0), borderColor: COLORS.primary, borderWidth: 1.5,
    });
    
    const boxPadding = 10;
    const kpiY = yPos - boxPadding;
    const colWidth = (LAYOUT.pageWidth - 2 * LAYOUT.margin - 2 * boxPadding) / 3;
    
    // KPI 1
    page.drawText("Ø Schmerztage / Monat", { x: LAYOUT.margin + boxPadding, y: kpiY, size: 8, font: fontBold, color: COLORS.text });
    page.drawText(formatGermanDecimal(painDaysPerMonth, 1), { x: LAYOUT.margin + boxPadding, y: kpiY - 20, size: 18, font: fontBold, color: COLORS.primary });
    page.drawText(`(${painDays} Tage in ${daysCount} Tagen)`, { x: LAYOUT.margin + boxPadding, y: kpiY - 34, size: 7, font, color: COLORS.textLight });
    
    // KPI 2
    page.drawText("Ø Triptane / Monat", { x: LAYOUT.margin + boxPadding + colWidth, y: kpiY, size: 8, font: fontBold, color: COLORS.text });
    page.drawText(formatGermanDecimal(triptanPerMonth, 1), { x: LAYOUT.margin + boxPadding + colWidth, y: kpiY - 20, size: 18, font: fontBold, color: COLORS.primary });
    page.drawText(`(${triptanIntakesTotal} Einnahmen gesamt)`, { x: LAYOUT.margin + boxPadding + colWidth, y: kpiY - 34, size: 7, font, color: COLORS.textLight });
    
    // KPI 3
    page.drawText("Ø Schmerzintensität", { x: LAYOUT.margin + boxPadding + 2 * colWidth, y: kpiY, size: 8, font: fontBold, color: COLORS.text });
    page.drawText(`${formatGermanDecimal(avgIntensity, 1)} / 10`, { x: LAYOUT.margin + boxPadding + 2 * colWidth, y: kpiY - 20, size: 18, font: fontBold, color: COLORS.primary });
    page.drawText("(NRS-Skala)", { x: LAYOUT.margin + boxPadding + 2 * colWidth, y: kpiY - 34, size: 7, font, color: COLORS.textLight });
    
    yPos -= kpiBoxHeight + 8;

    // ═══════════════════════════════════════════════════════════════════════
    // PIE CHART: Tagesverteilung (kompakter)
    // ═══════════════════════════════════════════════════════════════════════
    {
      const buckets = computeDiaryDayBuckets({
        startDate: from,
        endDate: to,
        entries: entries.map(e => ({
          selected_date: e.selected_date,
          timestamp_created: e.timestamp_created,
          pain_level: e.pain_level,
          medications: e.medications,
        })),
        documentedDaysOnly: false,
      });

      const pieSpaceCheck = ensureSpace(pdfDoc, page, yPos, 110);
      page = pieSpaceCheck.page;
      yPos = pieSpaceCheck.yPos;

      yPos = drawPieChartWithLegend(page, {
        x: LAYOUT.margin,
        y: yPos,
        radius: 40,
        totalDays: buckets.totalDays,
        painFreeDays: buckets.painFreeDays,
        painDaysNoTriptan: buckets.painDaysNoTriptan,
        triptanDays: buckets.triptanDays,
        font,
        fontBold,
      });

      yPos -= LAYOUT.sectionGap;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AKUTMEDIKATION & WIRKUNG (DIREKT NACH KERNÜBERSICHT!)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (medicationStats && medicationStats.length > 0) {
    // Estimate required space: header (30) + table header (25) + rows (15 each) + triptan summary (15) + padding (20)
    const hasTriptanSummary = medicationStats.filter(s => isTriptan(s.name)).length > 1;
    const medRowCount = Math.min(medicationStats.length, 8);
    const estimatedMedSpace = 30 + 25 + medRowCount * 15 + (hasTriptanSummary ? 15 : 0) + 20;
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, estimatedMedSpace);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "AKUTMEDIKATION & WIRKUNG", yPos, fontBold, 12);
    
    const hasExtendedStats = medicationStats[0]?.totalUnitsInRange !== undefined;
    
    // ── Relevance-based sorting: total intakes DESC → last30 DESC → alpha ASC ──
    const sortedMedStats = [...medicationStats].sort((a, b) => {
      const totalA = a.totalUnitsInRange ?? a.count;
      const totalB = b.totalUnitsInRange ?? b.count;
      if (totalB !== totalA) return totalB - totalA;
      const last30A = a.last30Units ?? 0;
      const last30B = b.last30Units ?? 0;
      if (last30B !== last30A) return last30B - last30A;
      return a.name.localeCompare(b.name, 'de');
    });
    
    // Filter out meds with 0 intakes
    const filteredMedStats = sortedMedStats.filter(s => (s.totalUnitsInRange ?? s.count) > 0);
    
    const cols = hasExtendedStats ? {
      name: LAYOUT.margin,
      totalRange: LAYOUT.margin + 140,
      avgMonth: LAYOUT.margin + 210,
      last30: LAYOUT.margin + 280,
      effectiveness: LAYOUT.margin + 350,
    } : {
      name: LAYOUT.margin,
      count: LAYOUT.margin + 200,
      effectiveness: LAYOUT.margin + 290,
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
      page.drawText("\u00D8 / Monat", { x: cols.avgMonth, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("Letzte 30T", { x: cols.last30, y: yPos - 12, size: 8, font: fontBold });
      page.drawText("\u00D8 Wirkung (%)", { x: cols.effectiveness, y: yPos - 12, size: 8, font: fontBold });
    } else {
      page.drawText("Medikament", { x: cols.name, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("Einnahmen", { x: cols.count!, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("\u00D8 Wirkung (%)", { x: cols.effectiveness, y: yPos - 12, size: 9, font: fontBold });
      page.drawText("Bemerkung", { x: cols.note!, y: yPos - 12, size: 9, font: fontBold });
    }
    yPos -= 30;
    
    // Triptane zusammenfassen + andere separat (preserving grouping, but within sorted order)
    const triptans = filteredMedStats.filter(s => isTriptan(s.name));
    const others = filteredMedStats.filter(s => !isTriptan(s.name));
    
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
    
    // Helper: format effectiveness with rating base
    const formatEffectiveness = (stat: typeof filteredMedStats[0]): string => {
      const totalIntakes = stat.totalUnitsInRange ?? stat.count;
      if (stat.ratedCount > 0 && stat.avgEffect !== null) {
        const effectPercent = Math.round((stat.avgEffect / 10) * 100);
        return `${effectPercent} % (${stat.ratedCount}/${totalIntakes})`;
      }
      return "keine Bewertung";
    };
    
    // Alle Medikamente auflisten (sorted by relevance)
    const allMeds = [...triptans, ...others].slice(0, 8);
    for (const stat of allMeds) {
      if (yPos < LAYOUT.margin + 50) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        yPos = LAYOUT.pageHeight - LAYOUT.margin;
      }
      
      const medName = isTriptan(stat.name) && triptans.length > 1 
        ? `  ${stat.name}`
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
        page.drawText(formatEffectiveness(stat), { x: cols.effectiveness, y: yPos, size: 9, font });
      } else {
        page.drawText(stat.count.toString(), { x: cols.count!, y: yPos, size: 9, font });
        page.drawText(formatEffectiveness(stat), { x: cols.effectiveness, y: yPos, size: 9, font });
      }
      
      yPos -= 15;
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3b. PROPHYLAXE & THERAPIEVERLAUF (nach Akutmedikation)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeMedicationCourses && medicationCourses && medicationCourses.length > 0) {
    const estimatedProphylaxeHeight = 30 + Math.min(medicationCourses.length, 2) * 70;
    const spaceCheckP = ensureSpace(pdfDoc, page, yPos, Math.min(estimatedProphylaxeHeight, 150));
    page = spaceCheckP.page;
    yPos = spaceCheckP.yPos;
    
    yPos = drawSectionHeader(page, "PROPHYLAXE & THERAPIEVERLAUF", yPos, fontBold, 12);
    
    const prophylaxeCourses = medicationCourses.filter(c => c.type === 'prophylaxe');
    const akutCourses = medicationCourses.filter(c => c.type === 'akut');
    const andereCourses = medicationCourses.filter(c => c.type !== 'prophylaxe' && c.type !== 'akut');
    
    const drawCourseGroupInline = (courses: MedicationCourseForPdf[], label: string) => {
      if (courses.length === 0) return;
      page.drawText(label, { x: LAYOUT.margin, y: yPos, size: 10, font: fontBold, color: COLORS.primary });
      yPos -= 18;
      for (const course of courses) {
        if (yPos < LAYOUT.margin + 120) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          yPos = LAYOUT.pageHeight - LAYOUT.margin;
        }
        page.drawLine({ start: { x: LAYOUT.margin, y: yPos + 5 }, end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos + 5 }, thickness: 0.3, color: COLORS.border });
        yPos -= 5;
        const status = course.is_active ? "(laufend)" : "(abgeschlossen)";
        const statusColor = course.is_active ? rgb(0.2, 0.6, 0.2) : COLORS.textLight;
        page.drawText(sanitizeForPDF(course.medication_name), { x: LAYOUT.margin, y: yPos, size: 11, font: fontBold, color: COLORS.text });
        const nameW = fontBold.widthOfTextAtSize(sanitizeForPDF(course.medication_name), 11);
        page.drawText(` ${status}`, { x: LAYOUT.margin + nameW + 8, y: yPos, size: 9, font, color: statusColor });
        yPos -= 18;
        if (course.dose_text) {
          page.drawText("Dosierung:", { x: LAYOUT.margin + 15, y: yPos, size: 9, font: fontBold, color: COLORS.textLight });
          page.drawText(sanitizeForPDF(course.dose_text), { x: LAYOUT.margin + 80, y: yPos, size: 9, font, color: COLORS.text });
          yPos -= 14;
        }
        const endStr = course.end_date ? formatDateGerman(course.end_date) : "laufend";
        const zeitraumText = course.start_date ? `${formatDateGerman(course.start_date)} - ${endStr}` : "laufend";
        page.drawText("Zeitraum:", { x: LAYOUT.margin + 15, y: yPos, size: 9, font: fontBold, color: COLORS.textLight });
        page.drawText(zeitraumText, { x: LAYOUT.margin + 80, y: yPos, size: 9, font, color: COLORS.text });
        yPos -= 14;
        if (course.subjective_effectiveness !== undefined && course.subjective_effectiveness !== null) {
          page.drawText("Wirksamkeit:", { x: LAYOUT.margin + 15, y: yPos, size: 9, font: fontBold, color: COLORS.textLight });
          page.drawText(`${course.subjective_effectiveness}/10`, { x: LAYOUT.margin + 80, y: yPos, size: 9, font, color: COLORS.text });
          yPos -= 14;
        }
        if (course.note_for_physician) {
          page.drawText("Notiz:", { x: LAYOUT.margin + 15, y: yPos, size: 9, font: fontBold, color: COLORS.textLight });
          const noteLines = wrapText(course.note_for_physician, LAYOUT.pageWidth - LAYOUT.margin - 100, 9, font);
          for (let i = 0; i < Math.min(noteLines.length, 2); i++) {
            page.drawText(sanitizeForPDF(noteLines[i]), { x: LAYOUT.margin + 80, y: yPos - (i * 12), size: 9, font, color: COLORS.text });
          }
          yPos -= Math.min(noteLines.length, 2) * 12 + 2;
        }
        yPos -= 6;
      }
      yPos -= 4;
    };
    drawCourseGroupInline(prophylaxeCourses, "Prophylaktische Behandlungen");
    drawCourseGroupInline(akutCourses, "Akutbehandlungen");
    drawCourseGroupInline(andereCourses, "Sonstige Behandlungen");
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3c. BEGLEITSYMPTOME – KLINISCHE BEWERTUNG (nach Medikation)
  // ═══════════════════════════════════════════════════════════════════════════

  if (symptomData) {
    const symptomResult = drawSymptomSection(
      pdfDoc, page, yPos, font, fontBold, symptomData,
      formatDateGerman(from), formatDateGerman(to),
    );
    page = symptomResult.page;
    yPos = symptomResult.yPos;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3d. ME/CFS-SYMPTOMATIK (kompakter Block)
  // ═══════════════════════════════════════════════════════════════════════════

  if (meCfsData) {
    const docQuote = meCfsData.calendarDays > 0 ? Math.round((meCfsData.documentedDays / meCfsData.calendarDays) * 100) : 0;
    const meCfsLines = [
      `Belastete Tage (dokumentiert): ${meCfsData.daysWithBurden} / ${meCfsData.documentedDays}`,
      `Dokumentiert: ${meCfsData.documentedDays} / ${meCfsData.calendarDays} Tage`,
      `Ø Belastung (0–10): ${meCfsData.avgScore}`,
      `Höchste Belastung: ${sanitizeForPDF(meCfsData.peakLabel)}`,
      `Üblicher Bereich: ${meCfsData.iqrLabel !== '0/10' ? sanitizeForPDF(meCfsData.iqrLabel) : 'noch nicht ausreichend Daten'}`,
      `Dokumentationsquote: ${docQuote} %`,
    ];
    // Add projection line only for 14–29 calendar days
    if (meCfsData.calendarDays >= 14 && meCfsData.calendarDays < 30) {
      meCfsLines.splice(2, 0, `Schätzung pro 30 Tage: ${meCfsData.burdenPer30} belastete Tage`);
    }
    const hasNote = !!meCfsData.dataQualityNote;
    const blockHeight = LAYOUT.lineHeight * 2 + meCfsLines.length * LAYOUT.lineHeight + (hasNote ? LAYOUT.lineHeight + 2 : 0) + LAYOUT.sectionGap;

    const meCfsCheck = ensureSpace(pdfDoc, page, yPos, blockHeight);
    page = meCfsCheck.page;
    yPos = meCfsCheck.yPos;

    yPos = drawSectionHeader(page, "ME/CFS-SYMPTOMATIK", yPos, fontBold, 10);

    for (const line of meCfsLines) {
      page.drawText(line, {
        x: LAYOUT.margin + 8,
        y: yPos,
        size: 9,
        font,
        color: COLORS.text,
      });
      yPos -= LAYOUT.lineHeight;
    }

    if (meCfsData.dataQualityNote) {
      yPos -= 2;
      page.drawText(sanitizeForPDF(meCfsData.dataQualityNote), {
        x: LAYOUT.margin + 8,
        y: yPos,
        size: 7,
        font,
        color: COLORS.textLight,
      });
      yPos -= LAYOUT.lineHeight;
    }

    yPos -= LAYOUT.sectionGap;
  }

  // 4. BERICHT / ANALYSE
  // KRITISCHE LOGIK:
  // - Wenn isPremiumAIRequested = true UND hasPremiumAIData = true → KI-Bericht
  // - Wenn isPremiumAIRequested = true UND hasPremiumAIData = false → Fallback-Hinweis (KEIN statischer Bericht!)
  // - Wenn isPremiumAIRequested = false → statischer Bericht
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (isPremiumAIRequested) {
    // User hat Premium-KI ausgewählt
    
    if (hasPremiumAIData) {
      // ─────────────────────────────────────────────────────────────────────────
      // 4A) PREMIUM-KI ERFOLGREICH: "Ärztlicher Analysebericht (KI-gestützt)"
      // ─────────────────────────────────────────────────────────────────────────
      
      const spaceCheck = ensureSpace(pdfDoc, page, yPos, 200);
      page = spaceCheck.page;
      yPos = spaceCheck.yPos;
      
      yPos = drawSectionHeader(page, "ÄRZTLICHER ANALYSEBERICHT (KI-GESTÜTZT)", yPos, fontBold, 12);
      
      // Unterzeile + Marker dass KI aktiv ist
      page.drawText("KI-Analyse aktiviert · Zusammenfassung und Mustererkennung auf Basis der dokumentierten Daten", {
        x: LAYOUT.margin,
        y: yPos,
        size: 8,
        font,
        color: COLORS.textLight,
      });
      yPos -= 18;
      
      // Headline als Einleitungstext (kein Kasten!)
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
        yPos -= 10;
      }
      
      // Key Findings - strukturiert ohne Kasten
      if (premiumAIReport!.keyFindings.length > 0) {
        // Teilüberschrift: Wichtigste Erkenntnisse
        page.drawText("Wichtigste Erkenntnisse", {
          x: LAYOUT.margin,
          y: yPos,
          size: 10,
          font: fontBold,
          color: COLORS.primary,
        });
        yPos -= 16;
        
        for (const finding of premiumAIReport!.keyFindings.slice(0, 5)) {
          if (yPos < LAYOUT.margin + 60) {
            page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
            yPos = LAYOUT.pageHeight - LAYOUT.margin;
          }
          
          // Titel der Erkenntnis
          page.drawText(sanitizeForPDF(`• ${finding.title}`), {
            x: LAYOUT.margin,
            y: yPos,
            size: 9,
            font: fontBold,
            color: COLORS.text,
          });
          yPos -= 12;
          
          // Erkenntnis-Text
          const findingLines = wrapText(finding.finding, LAYOUT.pageWidth - 2 * LAYOUT.margin - 15, 9, font);
          for (const line of findingLines) {
            page.drawText(sanitizeForPDF(line), {
              x: LAYOUT.margin + 10,
              y: yPos,
              size: 9,
              font,
              color: COLORS.text,
            });
            yPos -= 12;
          }
          yPos -= 6;
        }
      }
      
      // Sections - strukturierte Unterabschnitte ohne Rahmen
      if (premiumAIReport!.sections && premiumAIReport!.sections.length > 0) {
        yPos -= 10;
        for (const section of premiumAIReport!.sections.slice(0, 4)) {
          if (yPos < LAYOUT.margin + 80) {
            page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
            yPos = LAYOUT.pageHeight - LAYOUT.margin;
          }
          
          // Teilüberschrift (gleicher Stil wie "Wichtigste Erkenntnisse")
          page.drawText(sanitizeForPDF(section.title), {
            x: LAYOUT.margin,
            y: yPos,
            size: 10,
            font: fontBold,
            color: COLORS.primary,
          });
          yPos -= 14;
          
          for (const bullet of (section.bullets || []).slice(0, 5)) {
            const lines = wrapText(`• ${bullet}`, LAYOUT.pageWidth - 2 * LAYOUT.margin - 10, 9, font);
            for (const line of lines) {
              if (yPos < LAYOUT.margin + 40) {
                page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
                yPos = LAYOUT.pageHeight - LAYOUT.margin;
              }
              page.drawText(sanitizeForPDF(line), {
                x: LAYOUT.margin + 5,
                y: yPos,
                size: 9,
                font,
                color: COLORS.text,
              });
              yPos -= 12;
            }
          }
          yPos -= 10;
        }
      }
      
      // Erstellt am & Disclaimer kombiniert
      yPos -= 5;
      if (premiumAIReport!.createdAt) {
        const createdDate = new Date(premiumAIReport!.createdAt);
        page.drawText(`Erstellt am: ${formatDateGerman(createdDate.toISOString())}`, {
          x: LAYOUT.margin,
          y: yPos,
          size: 7,
          font,
          color: COLORS.textLight,
        });
        yPos -= 10;
      }
      
      page.drawText(sanitizeForPDF(premiumAIReport!.disclaimer || "Diese Analyse ersetzt keine ärztliche Beratung."), {
        x: LAYOUT.margin,
        y: yPos,
        size: 7,
        font,
        color: COLORS.textLight,
      });
      yPos -= LAYOUT.sectionGap;
      
    } else {
      // ─────────────────────────────────────────────────────────────────────────
      // 4B) PREMIUM-KI FEHLGESCHLAGEN: Fallback-Hinweis (KEINE statische Analyse!)
      // ─────────────────────────────────────────────────────────────────────────
      
      const spaceCheck = ensureSpace(pdfDoc, page, yPos, 100);
      page = spaceCheck.page;
      yPos = spaceCheck.yPos;
      
      yPos = drawSectionHeader(page, "ÄRZTLICHER ANALYSEBERICHT", yPos, fontBold, 12);
      
      // Fallback-Hinweis
      page.drawText("Die KI-Analyse konnte für diesen Bericht nicht erstellt werden.", {
        x: LAYOUT.margin,
        y: yPos,
        size: 10,
        font: fontBold,
        color: COLORS.textLight,
      });
      yPos -= 16;
      
      page.drawText("Mögliche Gründe: Monatliches Limit erreicht, Netzwerkfehler oder zu wenig Daten im Zeitraum.", {
        x: LAYOUT.margin,
        y: yPos,
        size: 9,
        font,
        color: COLORS.textLight,
      });
      yPos -= 12;
      
      page.drawText("Du findest gespeicherte KI-Berichte unter 'KI-Analyse' in der App.", {
        x: LAYOUT.margin,
        y: yPos,
        size: 9,
        font,
        color: COLORS.textLight,
      });
      yPos -= LAYOUT.sectionGap;
    }
    
  } else if (includeAnalysis && analysisReport) {
    // ─────────────────────────────────────────────────────────────────────────
    // 4C) STATISCH: "Ärztliche Auswertung der dokumentierten Daten"
    // NUR wenn User NICHT Premium ausgewählt hat
    // ─────────────────────────────────────────────────────────────────────────
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "ÄRZTLICHE AUSWERTUNG DER DOKUMENTIERTEN DATEN", yPos, fontBold, 12);
    
    // Unterzeile
    page.drawText("Faktenbasierte Zusammenfassung ohne KI-Analyse", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 14;
    
    const periodText = `Auswertungszeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)} (${daysCount} Tage)`;
    page.drawText(periodText, {
      x: LAYOUT.margin,
      y: yPos,
      size: 9,
      font,
      color: COLORS.textLight,
    });
    yPos -= 20;
    
    // Strukturierter Text OHNE Rahmenkasten
    const maxWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
    
    const result = drawStructuredText(
      page,
      analysisReport,
      yPos,
      LAYOUT.margin + 60,
      font,
      fontBold,
      maxWidth,
      0, // Kein Padding da kein Kasten
      pdfDoc
    );
    page = result.page;
    yPos = result.yPos - 15;
    
    // Disclaimer-Hinweis (dezent, ohne Kasten)
    const disclaimerContent = "Alle Auswertungen basieren ausschließlich auf den dokumentierten Daten und stellen keine medizinische Diagnose dar.";
    const disclaimerLines = wrapText(disclaimerContent, LAYOUT.pageWidth - 2 * LAYOUT.margin, 7, font);
    
    if (yPos - (disclaimerLines.length * 10 + 10) < LAYOUT.margin + 30) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
    }
    
    // Trennlinie vor Disclaimer
    page.drawLine({
      start: { x: LAYOUT.margin, y: yPos },
      end: { x: LAYOUT.margin + 100, y: yPos },
      thickness: 0.5,
      color: COLORS.border,
    });
    yPos -= 10;
    
    for (const line of disclaimerLines) {
      page.drawText(sanitizeForPDF(line), {
        x: LAYOUT.margin,
        y: yPos,
        size: 7,
        font,
        color: COLORS.textLight,
      });
      yPos -= 10;
    }
    
    yPos -= LAYOUT.sectionGap;
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
  // 4.5 WETTER & KOPFSCHMERZ (from analysisV2.weather SSOT)
  // ═══════════════════════════════════════════════════════════════════════════

  if (weatherAnalysis) {
    const wa = weatherAnalysis;
    const isInsufficient = wa.pressureDelta24h.confidence === 'insufficient';

    const spaceNeeded = isInsufficient ? 80 : 200;
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, spaceNeeded);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;

    yPos = drawSectionHeader(page, "WETTER & KOPFSCHMERZ", yPos, fontBold, 13);

    // Coverage line
    const covParts: string[] = [
      `Dokumentiert: ${wa.coverage.daysDocumented} Tage`,
      `Wetter: ${wa.coverage.daysWithWeather} (${Math.round(wa.coverage.ratioWeather * 100)}%)`,
    ];
    if (wa.coverage.daysWithEntryWeather != null) covParts.push(`Entry: ${wa.coverage.daysWithEntryWeather}`);
    if (wa.coverage.daysWithSnapshotWeather != null) covParts.push(`Snapshot: ${wa.coverage.daysWithSnapshotWeather}`);
    if (wa.coverage.daysWithNoWeather != null && wa.coverage.daysWithNoWeather > 0) covParts.push(`Keine Daten: ${wa.coverage.daysWithNoWeather}`);

    page.drawText(sanitizeForPDF(covParts.join('  |  ')), {
      x: LAYOUT.margin, y: yPos, size: 8, font, color: COLORS.textLight,
    });
    yPos -= 16;

    if (isInsufficient) {
      page.drawText(sanitizeForPDF('Noch nicht ausreichend Daten fuer eine Wetter-Kopfschmerz-Analyse.'), {
        x: LAYOUT.margin, y: yPos, size: 9, font, color: COLORS.text,
      });
      if (wa.pressureDelta24h.notes.length > 0) {
        yPos -= 12;
        page.drawText(sanitizeForPDF(wa.pressureDelta24h.notes[0]), {
          x: LAYOUT.margin, y: yPos, size: 8, font, color: COLORS.textLight,
        });
      }
      yPos -= LAYOUT.sectionGap;
    } else {
      // Bucket table
      if (wa.pressureDelta24h.buckets.length > 0) {
        // Header
        const colX = [LAYOUT.margin, LAYOUT.margin + 230, LAYOUT.margin + 300, LAYOUT.margin + 370];
        page.drawText('Druckaenderung', { x: colX[0], y: yPos, size: 8, font: fontBold, color: COLORS.text });
        page.drawText('Tage', { x: colX[1], y: yPos, size: 8, font: fontBold, color: COLORS.text });
        page.drawText('KS-Rate', { x: colX[2], y: yPos, size: 8, font: fontBold, color: COLORS.text });
        page.drawText('Ø Intensitaet', { x: colX[3], y: yPos, size: 8, font: fontBold, color: COLORS.text });
        yPos -= 4;
        page.drawLine({
          start: { x: LAYOUT.margin, y: yPos },
          end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos },
          thickness: 0.5, color: COLORS.border,
        });
        yPos -= 12;

        for (const b of wa.pressureDelta24h.buckets) {
          page.drawText(sanitizeForPDF(b.label), { x: colX[0], y: yPos, size: 8, font, color: COLORS.text });
          page.drawText(String(b.nDays), { x: colX[1], y: yPos, size: 8, font, color: COLORS.text });
          page.drawText(`${Math.round(b.headacheRate * 100)}%`, { x: colX[2], y: yPos, size: 8, font, color: COLORS.text });
          page.drawText(b.meanPainMax != null ? b.meanPainMax.toFixed(1) : '-', { x: colX[3], y: yPos, size: 8, font, color: COLORS.text });
          yPos -= 14;
        }
      }

      // Relative Risk
      if (wa.pressureDelta24h.relativeRisk && wa.pressureDelta24h.relativeRisk.rr != null) {
        yPos -= 4;
        const rr = wa.pressureDelta24h.relativeRisk;
        page.drawText(sanitizeForPDF(`Relatives Risiko: ${rr.rr}x (${rr.compareLabel} vs. ${rr.referenceLabel})`), {
          x: LAYOUT.margin, y: yPos, size: 9, font: fontBold, color: COLORS.text,
        });
        yPos -= 14;
      }

      // Notes (max 2)
      const notesToShow = wa.pressureDelta24h.notes.slice(0, 2);
      for (const note of notesToShow) {
        page.drawText(sanitizeForPDF(`- ${note}`), {
          x: LAYOUT.margin, y: yPos, size: 8, font, color: COLORS.textLight,
        });
        yPos -= 12;
      }

      yPos -= LAYOUT.sectionGap;
    }

    // Disclaimer
    page.drawText(sanitizeForPDF(wa.disclaimer), {
      x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight,
    });
    yPos -= LAYOUT.sectionGap;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. DIAGRAMM: "Schmerz- & Wetterverlauf" (EINZIGES Diagramm)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeChart && entries.length > 0) {
    // Build chart data using shared data builder (SINGLE SOURCE OF TRUTH)
    const weatherByDate = new Map<string, { temp: number | null; pressure: number | null }>();
    entries.forEach(entry => {
      const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
      if (entry.weather && date) {
        const existing = weatherByDate.get(date);
        if (!existing) {
          weatherByDate.set(date, {
            temp: entry.weather.temperature_c ?? null,
            pressure: entry.weather.pressure_mb ?? null,
          });
        }
      }
    });

    // Find earliest entry date
    const entryDates = entries
      .map(e => e.selected_date || e.timestamp_created?.split('T')[0])
      .filter((d): d is string => !!d)
      .map(d => new Date(d));
    const earliestEntryDate = entryDates.length > 0
      ? new Date(Math.min(...entryDates.map(d => d.getTime())))
      : null;

    const chartData = buildPainWeatherSeries({
      entries: entries.map(e => ({
        selected_date: e.selected_date,
        timestamp_created: e.timestamp_created,
        pain_level: e.pain_level,
      })),
      weatherByDate,
      from: new Date(from),
      to: new Date(to),
      earliestEntryDate,
    });

    const hasWeatherData = chartData.some(d => d.temperature !== null || d.pressure !== null);
    
    const defaultChartHeight = 224;
    const chartHeaderSpace = 50;
    const minChartHeight = 176;
    const totalNeeded = chartHeaderSpace + defaultChartHeight;
    
    const availableSpace = yPos - LAYOUT.margin - 30;
    let chartHeight: number;
    
    if (availableSpace >= chartHeaderSpace + minChartHeight) {
      chartHeight = Math.min(defaultChartHeight, availableSpace - chartHeaderSpace);
    } else {
      const spaceCheck = ensureSpace(pdfDoc, page, yPos, totalNeeded);
      page = spaceCheck.page;
      yPos = spaceCheck.yPos;
      chartHeight = defaultChartHeight;
    }
    
    yPos = drawSectionHeader(page, hasWeatherData ? "SCHMERZ- & WETTERVERLAUF" : "SCHMERZVERLAUF", yPos, fontBold, 13);
    
    page.drawText(`Kombiniertes Verlaufsdiagramm für den Berichtszeitraum ${formatDateGerman(from)} - ${formatDateGerman(to)}`, {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 20;
    
    const chartWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
    
    // Use chart image if provided (html2canvas capture), otherwise Bézier fallback
    if (chartImageBytes) {
      try {
        const chartImage = await pdfDoc.embedPng(chartImageBytes);
        const scaledDims = chartImage.scaleToFit(chartWidth, chartHeight);
        const imgX = LAYOUT.margin + (chartWidth - scaledDims.width) / 2;
        page.drawImage(chartImage, {
          x: imgX,
          y: yPos - scaledDims.height,
          width: scaledDims.width,
          height: scaledDims.height,
        });
      } catch (imgError) {
        console.warn('[PDF] Chart image embedding failed, using Bézier fallback:', imgError);
        drawSmoothPainWeatherChart(page, chartData, LAYOUT.margin, yPos, chartWidth, chartHeight, font, fontBold);
      }
    } else {
      // Bézier vector fallback — smooth curves matching App look
      drawSmoothPainWeatherChart(page, chartData, LAYOUT.margin, yPos, chartWidth, chartHeight, font, fontBold);
    }
    
    yPos -= chartHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DETAILLIERTE KOPFSCHMERZ-EINTRÄGE (GANZ AM ENDE)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeEntriesList && entries.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 100);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "DETAILLIERTE KOPFSCHMERZ-EINTRÄGE", yPos, fontBold, 12);
    
    page.drawText(`${entries.length} Einträge im Zeitraum`, {
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
      const result = drawTableRow(page, entry, yPos, font, pdfDoc, includeNotesInTable, includePrivateNotes);
      page = result.page;
      yPos = result.yPos;
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. SCHMERZVERTEILUNG NACH UHRZEIT (neue Seite am Ende)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    // Aggregate pain entries by hour of day
    const hourCounts = new Array(24).fill(0);
    let hasTimeData = false;
    
    entries.forEach(entry => {
      if (!entry.pain_level || entry.pain_level === 'keine') return;
      const time = entry.selected_time || (entry.timestamp_created ? new Date(entry.timestamp_created).toTimeString().slice(0, 5) : null);
      if (time) {
        const hour = parseInt(time.split(':')[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hourCounts[hour]++;
          hasTimeData = true;
        }
      }
    });
    
    if (hasTimeData) {
      const defaultTimeChartHeight = 160;  // 200 * 0.8 = -20%
      const timeChartHeaderSpace = 50;
      const minTimeChartHeight = 128;     // 160 * 0.8 = -20%
      const totalTimeNeeded = timeChartHeaderSpace + defaultTimeChartHeight + 30; // +30 for note
      
      const availableTimeSpace = yPos - LAYOUT.margin - 30;
      let timeChartHeight: number;
      
      if (availableTimeSpace >= timeChartHeaderSpace + minTimeChartHeight + 30) {
        timeChartHeight = Math.min(defaultTimeChartHeight, availableTimeSpace - timeChartHeaderSpace - 30);
      } else {
        const spaceCheck = ensureSpace(pdfDoc, page, yPos, totalTimeNeeded);
        page = spaceCheck.page;
        yPos = spaceCheck.yPos;
        timeChartHeight = defaultTimeChartHeight;
      }
      
      yPos = drawSectionHeader(page, "SCHMERZVERTEILUNG NACH UHRZEIT", yPos, fontBold, 13);
      
      page.drawText(`Zeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)}`, {
        x: LAYOUT.margin, y: yPos, size: 9, font, color: COLORS.textLight,
      });
      yPos -= 30;
      
      // Bar chart dimensions
      const chartX = LAYOUT.margin + 40;
      const chartWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin - 50;
      const chartHeight = timeChartHeight;
      const chartBottom = yPos - chartHeight;
      const maxCount = Math.max(...hourCounts, 1);
      const barWidth = chartWidth / 24 - 2;
      
      // Y-axis grid lines and labels
      const ySteps = Math.min(maxCount, 5);
      for (let i = 0; i <= ySteps; i++) {
        const val = Math.round((maxCount / ySteps) * i);
        const lineY = chartBottom + (i / ySteps) * chartHeight;
        
        page.drawLine({
          start: { x: chartX, y: lineY },
          end: { x: chartX + chartWidth, y: lineY },
          thickness: 0.3,
          color: COLORS.gridLine,
        });
        
        page.drawText(String(val), {
          x: chartX - 20, y: lineY - 3, size: 7, font, color: COLORS.textLight,
        });
      }
      
      // Y-axis label
      page.drawText("Episoden", {
        x: LAYOUT.margin, y: chartBottom + chartHeight / 2, size: 8, font, color: COLORS.textLight,
      });
      
      // Bars
      for (let h = 0; h < 24; h++) {
        const barX = chartX + h * (chartWidth / 24) + 1;
        const barHeight = maxCount > 0 ? (hourCounts[h] / maxCount) * chartHeight : 0;
        
        if (barHeight > 0) {
          page.drawRectangle({
            x: barX,
            y: chartBottom,
            width: barWidth,
            height: barHeight,
            color: COLORS.primary,
          });
        }
        
        // X-axis label (every 2 hours for readability, always show 0, 6, 12, 18)
        if (h % 2 === 0) {
          page.drawText(`${h.toString().padStart(2, '0')}h`, {
            x: barX + barWidth / 2 - 8,
            y: chartBottom - 14,
            size: 7,
            font,
            color: COLORS.text,
          });
        }
      }
      
      // Bottom axis line
      page.drawLine({
        start: { x: chartX, y: chartBottom },
        end: { x: chartX + chartWidth, y: chartBottom },
        thickness: 1,
        color: COLORS.border,
      });
      
      // Left axis line
      page.drawLine({
        start: { x: chartX, y: chartBottom },
        end: { x: chartX, y: chartBottom + chartHeight },
        thickness: 1,
        color: COLORS.border,
      });
      
      yPos = chartBottom - 30;
      
      // Note
      page.drawText("Hinweis: Darstellung basiert auf dokumentierten Schmerzeinträgen mit Uhrzeitangabe.", {
        x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight,
      });
    }
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
    
    p.drawText("Erstellt mit Miary \u2013 Digitale Verlaufsdokumentation f\u00FCr Migr\u00E4ne", {
      x: LAYOUT.margin,
      y: LAYOUT.margin - 20,
      size: 8,
      font,
      color: COLORS.textLight,
    });
  });

  return await pdfDoc.save();
}
