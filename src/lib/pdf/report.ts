/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZENTRALES PDF-TEMPLATE FÜR KOPFSCHMERZTAGEBUCH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Dieses Template wird für ALLE Nutzer:innen verwendet, wenn ein Kopfschmerztagebuch
 * als PDF exportiert wird. Es erzeugt ein professionelles, medizinisch brauchbares
 * Dokument für Ärzt:innen und Krankenkassen.
 * 
 * Aufgerufen von: src/components/PainApp/DiaryReport.tsx → savePDF()
 * 
 * STRUKTUR:
 * ─────────
 * Seite 1:
 *   - Kopfbereich (Titel, Berichtszeitraum, Erstellungsdatum)
 *   - Patient:innen-Daten (wenn aktiviert)
 *   - Behandelnde:r Arzt/Ärztin (wenn aktiviert)
 *   - Anmerkungen des Patienten (wenn Text vorhanden)
 *   - Auswertung für die ärztliche Beurteilung (KI-Analyse, wenn aktiviert)
 *   - Zusammenfassung (KPIs)
 * 
 * Seite 2+:
 *   - Medikamenten-Statistik
 *   - Intensitätsverlauf (Chart)
 *   - Detaillierte Attacken-Liste (mit automatischem Pagebreak)
 *   - Diagramme (Tageszeit-Verteilung, Schmerz- & Wetterverlauf)
 * 
 * FEATURES:
 * ─────────
 * ✓ Deutsche Datumsformate (dd.mm.yyyy, dd.mm.yyyy HH:mm)
 * ✓ Professionelles Layout mit Farbleitsystem
 * ✓ Checkbox-gesteuerte Abschnitte
 * ✓ Robuste Pagebreak-Logik für lange Tabellen
 * ✓ Wiederholter Tabellenkopf auf jeder neuen Seite
 * ✓ Text-Sanitization für WinAnsi-Encoding
 * ✓ Footer mit Seitenzahlen
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
  chartLine: rgb(0.93, 0.27, 0.27),    // Rot für Schmerzlinie
  chartBlue: rgb(0.3, 0.6, 0.9),       // Blau für Wetterlinie
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
    // Neue Felder für erweiterte Statistik
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
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - TEXT SANITIZATION & FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bereinigt Text für WinAnsi-kompatibles PDF-Encoding
 * Entfernt/ersetzt problematische Unicode-Zeichen
 */
function sanitizeForPDF(text: string | undefined | null): string {
  if (!text) return "";
  
  const original = text;
  const sanitized = text
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
  
  if (original !== sanitized && original.length > 10) {
    console.warn("PDF Text sanitized:", { 
      original: original.substring(0, 50), 
      sanitized: sanitized.substring(0, 50) 
    });
  }
  
  return sanitized;
}

/**
 * Formatiert Medikamente mit Dosis für PDF-Anzeige
 * z.B. "Sumatriptan 1/2; Ibuprofen 1"
 */
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
    // Always show dose for clarity in PDF
    return `${med} ${doseStr}`;
  }).join("; ");
}

/**
 * Formatiert Datum nach deutschem Standard: dd.mm.yyyy
 */
function formatDateGerman(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`Ungültiges Datum "${dateStr}"`);
      return dateStr;
    }
    return date.toLocaleDateString("de-DE", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric" 
    });
  } catch (error) {
    console.error(`Fehler beim Formatieren von "${dateStr}":`, error);
    return dateStr;
  }
}

/**
 * Formatiert Datum + Uhrzeit: dd.mm.yyyy, HH:MM Uhr (ohne Sekunden)
 */
function formatDateTimeGerman(dateStr: string, timeStr?: string): string {
  const dateFormatted = formatDateGerman(dateStr);
  
  if (timeStr) {
    // Entferne Sekunden falls vorhanden (z.B. "12:05:30" → "12:05")
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

/**
 * Konvertiert Schmerz-Level in numerischen Wert (0-10)
 */
function painLevelToNumericValue(painLevel: string): number {
  const level = (painLevel || "").toLowerCase().replace(/_/g, " ");
  if (level.includes("sehr") && level.includes("stark")) return 9;
  if (level.includes("stark")) return 7;
  if (level.includes("mittel")) return 5;
  if (level.includes("leicht")) return 2;
  const num = parseInt(painLevel);
  return isNaN(num) ? 0 : num;
}

/**
 * Konvertiert Schmerz-Level für Anzeige: "5/10"
 */
function formatPainLevel(painLevel: string): string {
  const numeric = painLevelToNumericValue(painLevel);
  return numeric > 0 ? `${numeric}/10` : painLevel;
}

/**
 * Bricht Text in Zeilen um, die in die angegebene Breite passen
 */
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

/**
 * Berechnet Anzahl Tage zwischen zwei Daten
 */
function calculateDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Formatiert Dezimalzahl nach deutschem Standard: Komma statt Punkt
 * Beispiel: 6.5 → "6,5"
 */
function formatGermanDecimal(value: number, decimals: number = 1): string {
  return value.toFixed(decimals).replace('.', ',');
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prüft ob genug Platz auf der Seite ist, sonst neue Seite
 */
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

/**
 * Zeichnet Sektions-Überschrift mit Unterstreichung
 */
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

/**
 * Zeichnet Key-Value-Paar (z.B. "Name: Max Mustermann")
 */
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

/**
 * Zeichnet strukturierten Text mit fett hervorgehobenen Überschriften
 * Format erwartet: "Überschrift: Text" pro Absatz
 */
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
    
    // Check if paragraph starts with bold heading (ends with :)
    const colonIndex = para.indexOf(':');
    if (colonIndex > 0 && colonIndex < 60) {
      const heading = para.substring(0, colonIndex + 1);
      const content = para.substring(colonIndex + 1).trim();
      
      // Draw bold heading
      currentPage.drawText(sanitizeForPDF(heading), {
        x: LAYOUT.margin + padding,
        y: yPos,
        size: 9,
        font: fontBold,
        color: COLORS.text,
      });
      
      // Draw content after heading on same line if short enough
      if (content) {
        const headingWidth = fontBold.widthOfTextAtSize(sanitizeForPDF(heading), 9);
        const remainingWidth = maxWidth - headingWidth - 5;
        
        if (font.widthOfTextAtSize(sanitizeForPDF(content), 9) <= remainingWidth) {
          // Fits on same line
          currentPage.drawText(sanitizeForPDF(content), {
            x: LAYOUT.margin + padding + headingWidth + 5,
            y: yPos,
            size: 9,
            font,
            color: COLORS.text,
          });
          yPos -= 14;
        } else {
          // Wrap content to multiple lines
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
      // Normal paragraph without heading
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
    
    yPos -= 4; // Gap between paragraphs
  }
  
  return { yPos, page: currentPage };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART DRAWING
// ═══════════════════════════════════════════════════════════════════════════

function drawIntensityChart(
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
  
  // Gruppiere nach Datum, nehme Max-Schmerz pro Tag
  const painByDate = new Map<string, number>();
  entries.forEach(entry => {
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
    const pain = painLevelToNumericValue(entry.pain_level);
    const existing = painByDate.get(date);
    if (existing === undefined || pain > existing) {
      painByDate.set(date, pain);
    }
  });
  
  const sortedDates = Array.from(painByDate.keys()).sort();
  if (sortedDates.length === 0) return;
  
  const chartMargin = 35;
  const chartWidth = width - 2 * chartMargin;
  const chartHeight = height - 2 * chartMargin;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin;
  
  // Y-Achse (0-10)
  for (let i = 0; i <= 10; i += 2) {
    const yAxisPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX - 5, y: yAxisPos },
      end: { x: chartX, y: yAxisPos },
      thickness: 0.5,
      color: COLORS.textLight,
    });
    page.drawText(i.toString(), {
      x: chartX - 20,
      y: yAxisPos - 4,
      size: 8,
      font,
    });
    // Gitternetz
    page.drawLine({
      start: { x: chartX, y: yAxisPos },
      end: { x: chartX + chartWidth, y: yAxisPos },
      thickness: 0.3,
      color: COLORS.gridLine,
    });
  }
  
  // Y-Achsen-Label
  page.drawText("Schmerzstarke", {
    x: chartX - 30,
    y: chartY + chartHeight + 5,
    size: 9,
    font: fontBold,
    color: COLORS.text,
  });
  
  // Datenpunkte & Linien
  const maxPoints = Math.min(sortedDates.length, 30);
  const step = Math.ceil(sortedDates.length / maxPoints);
  const displayDates = sortedDates.filter((_, i) => i % step === 0);
  const pointSpacing = chartWidth / (displayDates.length - 1 || 1);
  
  let prevX: number | null = null;
  let prevY: number | null = null;
  
  displayDates.forEach((date, i) => {
    const pain = painByDate.get(date) || 0;
    const pointX = chartX + i * pointSpacing;
    const pointY = chartY + (pain / 10) * chartHeight;
    
    if (prevX !== null && prevY !== null) {
      page.drawLine({
        start: { x: prevX, y: prevY },
        end: { x: pointX, y: pointY },
        thickness: 2,
        color: COLORS.chartLine,
      });
    }
    
    page.drawCircle({
      x: pointX,
      y: pointY,
      size: 3,
      color: COLORS.chartLine,
    });
    
    // Datum-Labels (nur alle paar Punkte) - Deutsches Format: Tag.Monat.
    if (i % Math.ceil(displayDates.length / 8) === 0) {
      const parts = date.split('-'); // ["2024", "10", "02"]
      const shortDate = `${parts[2]}.${parts[1]}.`; // "02.10." (DD.MM.)
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
}

/**
 * Zeichnet Tageszeit-Verteilungs-Balkendiagramm
 */
function drawTimeDistributionChart(
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

  // Gruppiere nach Stunde
  const hourCounts = new Map<number, number>();
  entries.forEach(entry => {
    const time = entry.selected_time || entry.timestamp_created?.split('T')[1] || '';
    const hour = parseInt(time.split(':')[0] || '0');
    if (!isNaN(hour) && hour >= 0 && hour < 24) {
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  });

  if (hourCounts.size === 0) {
    page.drawText("Keine Zeitdaten verfugbar", {
      x: x + width / 2 - 60,
      y: y - height / 2,
      size: 10,
      font,
      color: COLORS.textLight,
    });
    return;
  }

  const chartMargin = 40;
  const chartWidth = width - 2 * chartMargin;
  const chartHeight = height - 2 * chartMargin - 10;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin + 10;

  const maxCount = Math.max(...Array.from(hourCounts.values()), 1);
  const barWidth = chartWidth / 24;

  // Y-Achse
  const ySteps = Math.min(5, maxCount);
  for (let i = 0; i <= ySteps; i++) {
    const yVal = Math.round((maxCount / ySteps) * i);
    const yAxisPos = chartY + (i / ySteps) * chartHeight;
    
    page.drawLine({
      start: { x: chartX - 5, y: yAxisPos },
      end: { x: chartX, y: yAxisPos },
      thickness: 0.5,
      color: COLORS.textLight,
    });
    
    page.drawText(yVal.toString(), {
      x: chartX - 25,
      y: yAxisPos - 4,
      size: 7,
      font,
    });
    
    // Gitternetz
    page.drawLine({
      start: { x: chartX, y: yAxisPos },
      end: { x: chartX + chartWidth, y: yAxisPos },
      thickness: 0.3,
      color: COLORS.gridLine,
    });
  }

  // Balken zeichnen
  for (let hour = 0; hour < 24; hour++) {
    const count = hourCounts.get(hour) || 0;
    const barX = chartX + hour * barWidth;

    if (count > 0) {
      const barHeight = (count / maxCount) * chartHeight;
      page.drawRectangle({
        x: barX + 1,
        y: chartY,
        width: barWidth - 2,
        height: barHeight,
        color: COLORS.primaryLight,
      });
    }

    // X-Achsen-Labels (nur jede 3. Stunde)
    if (hour % 3 === 0) {
      page.drawText(`${hour}`, {
        x: barX + barWidth / 2 - 4,
        y: chartY - 12,
        size: 7,
        font,
      });
    }
  }

  // Achsen-Labels
  page.drawText("Attacken", {
    x: chartX - 35,
    y: chartY + chartHeight + 8,
    size: 8,
    font: fontBold,
    color: COLORS.text,
  });

  page.drawText("Uhrzeit", {
    x: chartX + chartWidth / 2 - 15,
    y: chartY - 25,
    size: 8,
    font: fontBold,
    color: COLORS.text,
  });
}

/**
 * Zeichnet kombiniertes Schmerz- & Wetterdiagramm
 */
function drawWeatherTimeSeriesChart(
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
  const dataByDate = new Map<string, { pain: number; pressure: number | null }>();
  entries.forEach(entry => {
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
    const pain = painLevelToNumericValue(entry.pain_level);
    const weather = entry.weather;
    const pressure = weather?.pressure_mb || null;
    
    const existing = dataByDate.get(date);
    if (!existing || pain > existing.pain) {
      dataByDate.set(date, { pain, pressure: pressure || existing?.pressure || null });
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

  const chartMargin = 45;
  const chartWidth = width - 2 * chartMargin - 40; // Extra Platz für rechte Y-Achse
  const chartHeight = height - 2 * chartMargin;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin;

  // Linke Y-Achse (Schmerz 0-10)
  for (let i = 0; i <= 10; i += 2) {
    const yAxisPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX - 5, y: yAxisPos },
      end: { x: chartX, y: yAxisPos },
      thickness: 0.5,
      color: COLORS.textLight,
    });
    page.drawText(i.toString(), {
      x: chartX - 20,
      y: yAxisPos - 4,
      size: 7,
      font,
      color: COLORS.chartLine,
    });
    
    // Gitternetz
    page.drawLine({
      start: { x: chartX, y: yAxisPos },
      end: { x: chartX + chartWidth, y: yAxisPos },
      thickness: 0.3,
      color: COLORS.gridLine,
    });
  }

  // Rechte Y-Achse (Luftdruck)
  const pressureValues = sortedDates
    .map(d => dataByDate.get(d)?.pressure)
    .filter((p): p is number => p !== null && p > 0);
  
  const hasPressureData = pressureValues.length > 0;
  let minPressure = 990;
  let maxPressure = 1030;
  
  if (hasPressureData) {
    minPressure = Math.min(...pressureValues) - 5;
    maxPressure = Math.max(...pressureValues) + 5;
    const pressureRange = maxPressure - minPressure || 20;
    
    for (let i = 0; i <= 5; i++) {
      const pressure = Math.round(minPressure + (pressureRange / 5) * i);
      const yAxisPos = chartY + (i / 5) * chartHeight;
      
      page.drawLine({
        start: { x: chartX + chartWidth, y: yAxisPos },
        end: { x: chartX + chartWidth + 5, y: yAxisPos },
        thickness: 0.5,
        color: COLORS.textLight,
      });
      
      page.drawText(pressure.toString(), {
        x: chartX + chartWidth + 10,
        y: yAxisPos - 4,
        size: 7,
        font,
        color: COLORS.chartBlue,
      });
    }
  }

  // Datenpunkte & Linien
  const maxPoints = Math.min(sortedDates.length, 30);
  const step = Math.ceil(sortedDates.length / maxPoints);
  const displayDates = sortedDates.filter((_, i) => i % step === 0);
  const pointSpacing = chartWidth / (displayDates.length - 1 || 1);

  let prevPainX: number | null = null;
  let prevPainY: number | null = null;
  let prevPressureX: number | null = null;
  let prevPressureY: number | null = null;

  displayDates.forEach((date, i) => {
    const data = dataByDate.get(date)!;
    const pointX = chartX + i * pointSpacing;
    
    // Schmerz-Linie (rot)
    const painY = chartY + (data.pain / 10) * chartHeight;
    if (prevPainX !== null && prevPainY !== null) {
      page.drawLine({
        start: { x: prevPainX, y: prevPainY },
        end: { x: pointX, y: painY },
        thickness: 2,
        color: COLORS.chartLine,
      });
    }
    page.drawCircle({
      x: pointX,
      y: painY,
      size: 3,
      color: COLORS.chartLine,
    });
    prevPainX = pointX;
    prevPainY = painY;

    // Luftdruck-Linie (blau)
    if (hasPressureData && data.pressure !== null) {
      const pressureRange = maxPressure - minPressure || 20;
      const pressureNorm = (data.pressure - minPressure) / pressureRange;
      const pressureY = chartY + pressureNorm * chartHeight;
      
      if (prevPressureX !== null && prevPressureY !== null) {
        page.drawLine({
          start: { x: prevPressureX, y: prevPressureY },
          end: { x: pointX, y: pressureY },
          thickness: 1.5,
          color: COLORS.chartBlue,
          dashArray: [4, 2],
        });
      }
      page.drawCircle({
        x: pointX,
        y: pressureY,
        size: 2,
        color: COLORS.chartBlue,
      });
      prevPressureX = pointX;
      prevPressureY = pressureY;
    }

    // Datum-Labels - Deutsches Format: Tag.Monat.
    if (i % Math.ceil(displayDates.length / 8) === 0) {
      const parts = date.split('-'); // ["2024", "10", "02"]
      const shortDate = `${parts[2]}.${parts[1]}.`; // "02.10." (DD.MM.)
      page.drawText(shortDate, {
        x: pointX - 12,
        y: chartY - 15,
        size: 7,
        font,
      });
    }
  });

  // Legenden
  page.drawText("Schmerzintensitat (0-10)", {
    x: chartX,
    y: chartY + chartHeight + 10,
    size: 8,
    font: fontBold,
    color: COLORS.chartLine,
  });

  if (hasPressureData) {
    page.drawText("Luftdruck (hPa)", {
      x: chartX + chartWidth - 80,
      y: chartY + chartHeight + 10,
      size: 8,
      font: fontBold,
      color: COLORS.chartBlue,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE DRAWING WITH PAGEBREAK LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Zeichnet Tabellenkopf für Kopfschmerz-Einträge
 * Spalten: Datum/Zeit | Schmerz | Medikation | Besonderheiten
 */
function drawTableHeader(page: PDFPage, yPos: number, font: PDFFont, includeNotes: boolean = true): number {
  // Neue Spaltenstruktur: Datum/Zeit | Schmerz | Medikation | Besonderheiten
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
  
  // Hintergrund
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

/**
 * Generiert Besonderheiten-Text aus Entry-Daten
 * Kombiniert Aura, Notizen und andere Flags
 */
function generateSpecialNotesText(entry: PainEntry): string {
  const parts: string[] = [];
  
  // Aura als Besonderheit
  if (entry.aura_type && entry.aura_type !== 'keine' && entry.aura_type !== '-') {
    parts.push(`Aura: ${entry.aura_type}`);
  }
  
  // Schmerzlokalisation
  if (entry.pain_locations && entry.pain_locations.length > 0) {
    const formattedLocations = entry.pain_locations.map(formatPainLocation).join(', ');
    parts.push(formattedLocations);
  }
  
  // Kurze Notizen hinzufügen (max 50 Zeichen für Tabelle)
  if (entry.notes) {
    const shortNote = entry.notes.length > 50 
      ? entry.notes.substring(0, 47) + '...'
      : entry.notes;
    parts.push(shortNote);
  }
  
  return parts.length > 0 ? parts.join('; ') : '-';
}

/**
 * Zeichnet Tabellen-Zeile mit automatischem Textumbruch
 * Neue Spalten: Datum/Zeit | Schmerz | Medikation | Besonderheiten
 */
function drawTableRow(
  page: PDFPage,
  entry: PainEntry,
  yPos: number,
  font: PDFFont,
  pdfDoc: any,
  includeNotes: boolean = true
): { yPos: number; page: PDFPage; rowHeight: number } {
  // Neue Spaltenstruktur
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
  
  // Datum/Zeit (ohne Sekunden, mit "Uhr")
  const dateTime = entry.selected_date && entry.selected_time
    ? formatDateTimeGerman(entry.selected_date, entry.selected_time)
    : formatDateTimeGerman(entry.timestamp_created || '');
  
  // Schmerz
  const painText = formatPainLevel(entry.pain_level);
  
  // Medikamente (mit Umbruch + Dosis)
  const medsText = formatMedicationsWithDose(entry.medications, entry.medication_intakes);
  const medsLines = wrapText(medsText, colWidths.meds, 8, font);
  
  // Besonderheiten (kombiniert Aura, Lokalisation, Notizen)
  const specialText = generateSpecialNotesText(entry);
  const specialLines = wrapText(specialText, colWidths.special, 8, font);
  
  // Berechne Zeilenhöhe (höchste Spalte bestimmt) - mit mehr Padding für Zentrierung
  const maxLines = Math.max(medsLines.length, specialLines.length, 1);
  const rowHeight = maxLines * 11 + 12;
  
  // Prüfe ob Platz für Zeile, sonst neue Seite
  if (yPos - rowHeight < LAYOUT.margin + 30) {
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    yPos = drawTableHeader(page, yPos, font, includeNotes);
  }
  
  // Zeichne Zeile - Text exakt vertikal zentriert zwischen den Trennlinien
  const fontSize = 8;
  const lineSpacing = 11;
  const textVisualOffset = fontSize * 0.35;
  
  const contentBlockHeight = (maxLines - 1) * lineSpacing;
  const rowCenter = rowHeight / 2;
  const firstLineFromTop = rowCenter - (contentBlockHeight / 2) + textVisualOffset;
  const rowTop = yPos - firstLineFromTop;
  
  page.drawText(sanitizeForPDF(dateTime), { x: cols.date, y: rowTop, size: 8, font });
  page.drawText(sanitizeForPDF(painText), { x: cols.pain, y: rowTop, size: 8, font });
  
  // Medikamente (mehrzeilig)
  medsLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.meds, 
      y: rowTop - (i * 11), 
      size: 8, 
      font 
    });
  });
  
  // Besonderheiten (mehrzeilig)
  specialLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.special, 
      y: rowTop - (i * 11), 
      size: 8, 
      font 
    });
  });
  
  // Trennlinie
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
// MAIN PDF BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ✅ AKTIVE PDF-FUNKTION für Kopfschmerztagebuch
 * 
 * Erzeugt professionelles PDF nach medizinischen Standards
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
  } = params;

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let yPos = LAYOUT.pageHeight - LAYOUT.margin;
  const daysCount = calculateDays(from, to);

  // ═══════════════════════════════════════════════════════════════════════════
  // SEITE 1: KOPFBEREICH
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
  // ANMERKUNGEN DES PATIENTEN (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const trimmedPatientNotes = (patientNotes || "").trim();
  if (includePatientNotes && trimmedPatientNotes) {
    // Berechne benötigten Platz basierend auf Textlänge
    const notesLines = wrapText(trimmedPatientNotes, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 9, font);
    const estimatedHeight = Math.max(60, notesLines.length * 12 + 30);
    
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, estimatedHeight + 30);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "ANMERKUNGEN DES PATIENTEN", yPos, fontBold, 12);
    
    // Box-Höhe berechnen
    const boxPadding = 10;
    const boxHeight = Math.min(Math.max(50, notesLines.length * 12 + 20), 300);
    
    // Box-Hintergrund
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - boxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.96), // Leicht cremefarbener Hintergrund
    });
    
    // Text rendern mit Zeilenumbruch
    let textY = yPos - boxPadding - 4;
    for (const line of notesLines) {
      if (textY < yPos - boxHeight + boxPadding) {
        // Bei sehr langem Text: neue Seite beginnen
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        textY = LAYOUT.pageHeight - LAYOUT.margin - 20;
      }
      page.drawText(sanitizeForPDF(line), {
        x: LAYOUT.margin + boxPadding,
        y: textY,
        size: 9,
        font,
        color: COLORS.text,
      });
      textY -= 12;
    }
    
    yPos -= boxHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUSWERTUNG FÜR DIE ÄRZTLICHE BEURTEILUNG (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeAnalysis && analysisReport) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "AUSWERTUNG FUR DIE ARZTLICHE BEURTEILUNG", yPos, fontBold, 12);
    
    page.drawText("KI-gestutzte Mustererkennung zur diagnostischen Unterstutzung", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 12;
    
    // Zeitraum-Zeile
    const periodText = `Auswertungszeitraum: ${formatDateGerman(from)} - ${formatDateGerman(to)} (${daysCount} Tage)`;
    page.drawText(periodText, {
      x: LAYOUT.margin,
      y: yPos,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });
    yPos -= 18;
    
    // Berechne Box-Höhe basierend auf Text-Länge - dynamisch ohne feste Obergrenze
    const estimatedLines = analysisReport.split('\n').length * 2;
    const boxHeight = Math.max(100, estimatedLines * 12 + 40);
    
    // Box-Hintergrund
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - boxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: boxHeight,
      borderColor: COLORS.border,
      borderWidth: 1,
      color: rgb(0.98, 0.99, 1.0),
    });
    
    // Strukturierten Text rendern
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
    
    // Hinweis-Box direkt am Ende der KI-Analyse (kompakt, ohne Seitenumbruch)
    // Text OHNE "Hinweis:" am Anfang - das Label wird separat gerendert
    const disclaimerContent = "Alle Auswertungen und Hinweise basieren ausschliesslich auf den dokumentierten Daten. Sie stellen keine medizinische Diagnose oder Therapieempfehlung dar und ersetzen nicht die Beratung durch eine Arztin oder einen Arzt.";
    
    // Berechne Breite für Text (abzüglich Padding und "Hinweis:" Label)
    const boxPaddingDisclaimer = 10;
    const hinweisLabelWidth = fontBold.widthOfTextAtSize("Hinweis: ", 8);
    const firstLineMaxWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin - 2 * boxPaddingDisclaimer - hinweisLabelWidth;
    const restLinesMaxWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin - 2 * boxPaddingDisclaimer;
    
    // Erste Zeile separat umbrechen (weniger Platz wegen Label)
    const firstLineWrapped = wrapText(disclaimerContent, firstLineMaxWidth, 8, font);
    const firstLine = firstLineWrapped[0] || '';
    
    // Rest des Textes (nach erster Zeile)
    const remainingText = disclaimerContent.substring(firstLine.length).trim();
    const restLines = remainingText ? wrapText(remainingText, restLinesMaxWidth, 8, font) : [];
    
    // Gesamthöhe berechnen: Label-Zeile + restliche Zeilen + Padding
    const lineHeight = 11;
    const totalLines = 1 + restLines.length;
    const disclaimerBoxHeight = totalLines * lineHeight + 2 * boxPaddingDisclaimer;
    
    // Prüfe ob Platz für Hinweis
    if (yPos - disclaimerBoxHeight < LAYOUT.margin + 50) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
    }
    
    // Hinweis-Box Hintergrund (exakt passend)
    page.drawRectangle({
      x: LAYOUT.margin,
      y: yPos - disclaimerBoxHeight,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin,
      height: disclaimerBoxHeight,
      color: rgb(0.97, 0.97, 0.95),
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    
    // "Hinweis:" Label (fett) + erste Zeile auf gleicher Y-Position
    const textStartY = yPos - boxPaddingDisclaimer - 8;
    
    page.drawText("Hinweis:", {
      x: LAYOUT.margin + boxPaddingDisclaimer,
      y: textStartY,
      size: 8,
      font: fontBold,
      color: COLORS.textLight,
    });
    
    page.drawText(sanitizeForPDF(firstLine), {
      x: LAYOUT.margin + boxPaddingDisclaimer + hinweisLabelWidth,
      y: textStartY,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    
    // Restliche Zeilen (linksbündig unter Label)
    let currentY = textStartY - lineHeight;
    for (const line of restLines) {
      page.drawText(sanitizeForPDF(line), {
        x: LAYOUT.margin + boxPaddingDisclaimer,
        y: currentY,
        size: 8,
        font,
        color: COLORS.textLight,
      });
      currentY -= lineHeight;
    }
    
    yPos -= disclaimerBoxHeight + 15;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZUSAMMENFASSUNG (KPIs)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeStats) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 100);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "ZUSAMMENFASSUNG", yPos, fontBold, 12);
    
    // Berechne Statistiken
    const totalEntries = entries.length;
    const validIntensityEntries = entries.filter(e => {
      const pain = painLevelToNumericValue(e.pain_level);
      return pain > 0;
    });
    const avgIntensity = validIntensityEntries.length > 0
      ? validIntensityEntries.reduce((sum, e) => sum + painLevelToNumericValue(e.pain_level), 0) / validIntensityEntries.length
      : 0;
    const daysWithPain = new Set(entries.map(e => e.selected_date || e.timestamp_created?.split('T')[0])).size;
    const medEntries = entries.filter(e => e.medications && e.medications.length > 0);
    const daysWithMedication = new Set(
      medEntries.map(e => e.selected_date || e.timestamp_created?.split('T')[0])
    ).size;
    
    // Berechne Gesamttage im Zeitraum
    const fromParsed = new Date(from);
    const toParsed = new Date(to);
    const daysCount = Math.max(1, Math.round((toParsed.getTime() - fromParsed.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    // KPI-Boxen - jetzt 5 Boxen
    const boxWidth = (LAYOUT.pageWidth - 2 * LAYOUT.margin - 40) / 5;
    const boxHeight = 70;
    const boxY = yPos - 10;
    
    const kpis = [
      { label: "Zeitraum gesamt", value: `${daysCount} Tage` },
      { label: "Attacken im Zeitraum", value: totalEntries.toString() },
      { label: "Ø Schmerzintensitat (0-10)", value: avgIntensity > 0 ? formatGermanDecimal(avgIntensity, 1) : "N/A" },
      { label: "Tage mit Schmerzen", value: daysWithPain.toString() },
      { label: "Tage mit Medikation", value: daysWithMedication.toString() },
    ];
    
    kpis.forEach((kpi, i) => {
      const x = LAYOUT.margin + i * (boxWidth + 10);
      
      page.drawRectangle({
        x,
        y: boxY - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: COLORS.border,
        borderWidth: 1,
        color: rgb(0.97, 0.98, 1.0),
      });
      
      // Wert (groß)
      const valueWidth = fontBold.widthOfTextAtSize(kpi.value, 16);
      page.drawText(kpi.value, {
        x: x + boxWidth / 2 - valueWidth / 2,
        y: boxY - 30,
        size: 16,
        font: fontBold,
        color: COLORS.primaryLight,
      });
      
      // Label (klein, zentriert)
      const labelLines = wrapText(kpi.label, boxWidth - 8, 7, font);
      labelLines.forEach((line, li) => {
        const labelWidth = font.widthOfTextAtSize(line, 7);
        page.drawText(line, {
          x: x + boxWidth / 2 - labelWidth / 2,
          y: boxY - 48 - li * 9,
          size: 7,
          font,
          color: COLORS.textLight,
        });
      });
    });
    
    yPos -= boxHeight + LAYOUT.sectionGap + 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEITE 2+: AKUTMEDIKATION - KURZSTATISTIK
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (medicationStats && medicationStats.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "AKUTMEDIKATION - KURZSTATISTIK", yPos, fontBold, 12);
    
    // Prüfe ob erweiterte Statistik vorhanden
    const hasExtendedStats = medicationStats[0]?.totalUnitsInRange !== undefined;
    
    // Tabellen-Header (angepasst für neue Spalten)
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
    
    // Medikamente (Top 5)
    const topMeds = medicationStats.slice(0, 5);
    for (const stat of topMeds) {
      if (yPos < LAYOUT.margin + 50) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        yPos = LAYOUT.pageHeight - LAYOUT.margin;
      }
      
      page.drawText(sanitizeForPDF(stat.name), { x: cols.name, y: yPos, size: 9, font });
      
      if (hasExtendedStats) {
        // Erweiterte Statistik
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
        // Alte Statistik (Fallback)
        page.drawText(stat.count.toString(), { x: cols.count!, y: yPos, size: 9, font });
        
        if (stat.ratedCount > 0 && stat.avgEffect !== null) {
          const effectPercent = Math.round((stat.avgEffect / 10) * 100);
          page.drawText(`${effectPercent}%`, { x: cols.effectiveness, y: yPos, size: 9, font });
          page.drawText(`(Ø aus ${stat.ratedCount} Bewertungen)`, {
            x: cols.note!, 
            y: yPos, 
            size: 8, 
            font, 
            color: COLORS.textLight 
          });
        } else {
          page.drawText("-", { x: cols.effectiveness, y: yPos, size: 9, font });
          page.drawText("Keine Wirksamkeitsbewertung", { 
            x: cols.note!, 
            y: yPos, 
            size: 8, 
            font, 
            color: COLORS.textLight 
          });
        }
      }
      
      yPos -= 15;
    }
    
    // Kurze Auffälligkeiten (1-2 Sätze)
    if (hasExtendedStats && topMeds.length > 0) {
      yPos -= 10;
      
      const topMed = topMeds[0];
      const insightText = `${topMed.name} wurde in den letzten 30 Tagen ${formatGermanDecimal(topMed.last30Units ?? 0, 1)}-mal dokumentiert (Ø ${formatGermanDecimal(topMed.avgPerMonth ?? 0, 1)}/Monat im Zeitraum).`;
      
      const insightLines = wrapText(insightText, LAYOUT.pageWidth - 2 * LAYOUT.margin, 8, font);
      for (const line of insightLines) {
        page.drawText(sanitizeForPDF(line), {
          x: LAYOUT.margin,
          y: yPos,
          size: 8,
          font,
          color: COLORS.textLight,
        });
        yPos -= 10;
      }
    }
    
    yPos -= LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIKAMENTENVERLÄUFE (Prophylaxe/Akuttherapie)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeMedicationCourses && medicationCourses && medicationCourses.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 150);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "THERAPIEVERLAUF", yPos, fontBold, 12);
    
    // Trennung nach Typ
    const prophylaxe = medicationCourses.filter(c => c.type === 'prophylaxe');
    const akut = medicationCourses.filter(c => c.type === 'akut');
    const andere = medicationCourses.filter(c => c.type !== 'prophylaxe' && c.type !== 'akut');
    
    const drawCourseGroup = (courses: typeof medicationCourses, groupTitle: string) => {
      if (courses.length === 0) return;
      
      // Gruppen-Überschrift
      page.drawText(groupTitle, {
        x: LAYOUT.margin,
        y: yPos,
        size: 10,
        font: fontBold,
        color: COLORS.text,
      });
      yPos -= 18;
      
      for (const course of courses) {
        if (yPos < LAYOUT.margin + 80) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          yPos = LAYOUT.pageHeight - LAYOUT.margin;
        }
        
        // Medikamentenname + Status
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
        
        // Dosierung
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
        
        // Zeitraum
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
        
        // Wirksamkeit
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
        
        // Nebenwirkungen
        if (course.had_side_effects) {
          const sideEffectsText = course.side_effects_text 
            ? `Nebenwirkungen: ${sanitizeForPDF(course.side_effects_text)}`
            : "Nebenwirkungen: Ja (keine Details)";
          const sideEffectsLines = wrapText(sideEffectsText, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 9, font);
          for (const line of sideEffectsLines) {
            page.drawText(line, {
              x: LAYOUT.margin + 10,
              y: yPos,
              size: 9,
              font,
              color: COLORS.text,
            });
            yPos -= 12;
          }
        }
        
        // Abbruchgrund (nur bei beendeten)
        if (!course.is_active && course.discontinuation_reason) {
          const discText = `Abbruchgrund: ${sanitizeForPDF(course.discontinuation_reason)}${course.discontinuation_details ? ` (${sanitizeForPDF(course.discontinuation_details)})` : ''}`;
          const discLines = wrapText(discText, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 9, font);
          for (const line of discLines) {
            page.drawText(line, {
              x: LAYOUT.margin + 10,
              y: yPos,
              size: 9,
              font,
              color: COLORS.text,
            });
            yPos -= 12;
          }
        }
        
        // Baseline-Daten (wenn vorhanden)
        if (course.baseline_migraine_days || course.baseline_impairment_level) {
          let baselineText = "Baseline: ";
          if (course.baseline_migraine_days) {
            baselineText += `${course.baseline_migraine_days} Migränetage/Monat`;
          }
          if (course.baseline_impairment_level) {
            baselineText += course.baseline_migraine_days ? `, ` : '';
            baselineText += `Beeinträchtigung: ${sanitizeForPDF(course.baseline_impairment_level)}`;
          }
          page.drawText(baselineText, {
            x: LAYOUT.margin + 10,
            y: yPos,
            size: 8,
            font,
            color: COLORS.textLight,
          });
          yPos -= 12;
        }
        
        // Arzt-Notiz (wenn vorhanden)
        if (course.note_for_physician) {
          const noteLines = wrapText(`Notiz: ${sanitizeForPDF(course.note_for_physician)}`, LAYOUT.pageWidth - 2 * LAYOUT.margin - 20, 8, font);
          for (const line of noteLines) {
            page.drawText(line, {
              x: LAYOUT.margin + 10,
              y: yPos,
              size: 8,
              font,
              color: COLORS.textLight,
            });
            yPos -= 10;
          }
        }
        
        yPos -= 8; // Abstand zwischen Einträgen
      }
      
      yPos -= 5;
    };
    
    drawCourseGroup(prophylaxe, "Prophylaktische Behandlungen:");
    drawCourseGroup(akut, "Akutbehandlungen:");
    drawCourseGroup(andere, "Sonstige Behandlungen:");
    
    yPos -= LAYOUT.sectionGap - 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTENSITÄTSVERLAUF (Chart)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeChart && entries.length > 0) {
    const chartHeight = 180;
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, chartHeight + 50);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "INTENSITATSVERLAUF", yPos, fontBold, 12);
    
    page.drawText("Verlauf der Schmerzintensitat uber den Berichtszeitraum", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 15;
    
    const chartWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
    drawIntensityChart(page, entries, LAYOUT.margin, yPos, chartWidth, chartHeight, font, fontBold);
    
    yPos -= chartHeight + LAYOUT.sectionGap;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAILLIERTE KOPFSCHMERZ-EINTRÄGE (mit Pagebreak)
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
    
    // Notizen nur anzeigen wenn freeTextExportMode !== 'none'
    const includeNotesInTable = freeTextExportMode !== 'none';
    yPos = drawTableHeader(page, yPos, fontBold, includeNotesInTable);
    
    // Sortiere Einträge nach Datum (neueste zuerst)
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
  // KONTEXT-ANHANG (nur wenn freeTextExportMode === 'notes_and_context')
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (freeTextExportMode === 'notes_and_context' && entries.length > 0) {
    // Finde Einträge mit langem Kontext (über 100 Zeichen = wahrscheinlich ausführlicher Kontext)
    const entriesWithContext = entries.filter(e => {
      return e.notes && e.notes.length > 100;
    });
    
    if (entriesWithContext.length > 0) {
      // Neue Seite für Kontext-Anhang
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
      
      yPos = drawSectionHeader(page, "AUSFUHRLICHE KONTEXTNOTIZEN", yPos, fontBold, 13);
      
      page.drawText("Detaillierte Freitext-Notizen zu den Eintragen", {
        x: LAYOUT.margin,
        y: yPos,
        size: 9,
        font,
        color: COLORS.textLight,
      });
      yPos -= 20;
      
      const sortedContextEntries = [...entriesWithContext].sort((a, b) => {
        const dateA = new Date(a.selected_date || a.timestamp_created || '');
        const dateB = new Date(b.selected_date || b.timestamp_created || '');
        return dateB.getTime() - dateA.getTime();
      });
      
      for (const entry of sortedContextEntries) {
        // Platzcheck
        if (yPos < LAYOUT.margin + 120) {
          page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
          yPos = LAYOUT.pageHeight - LAYOUT.margin;
        }
        
        // Datum + Schmerzlevel
        const dateTime = entry.selected_date && entry.selected_time
          ? formatDateTimeGerman(entry.selected_date, entry.selected_time)
          : formatDateTimeGerman(entry.timestamp_created || '');
        const painText = formatPainLevel(entry.pain_level);
        const medsText = formatMedicationsWithDose(entry.medications, entry.medication_intakes);
        
        // Überschrift für diesen Eintrag
        page.drawText(`${dateTime} - Intensitat: ${painText}`, {
          x: LAYOUT.margin,
          y: yPos,
          size: 10,
          font: fontBold,
          color: COLORS.primary,
        });
        yPos -= 14;
        
        // Medikamente
        page.drawText(`Medikamente: ${sanitizeForPDF(medsText)}`, {
          x: LAYOUT.margin,
          y: yPos,
          size: 9,
          font,
          color: COLORS.text,
        });
        yPos -= 16;
        
        // Kontext-Text
        if (entry.notes) {
          const contextLines = wrapText(entry.notes, LAYOUT.pageWidth - 2 * LAYOUT.margin - 10, 9, font);
          for (const line of contextLines) {
            if (yPos < LAYOUT.margin + 30) {
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
        
        // Trennlinie
        yPos -= 5;
        page.drawLine({
          start: { x: LAYOUT.margin, y: yPos },
          end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos },
          thickness: 0.5,
          color: COLORS.border,
        });
        yPos -= 15;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGRAMME (Tageszeit-Verteilung & Schmerz-/Wetterverlauf)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeChart && entries.length > 0) {
    // Neue Seite für Diagramme
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    
    yPos = drawSectionHeader(page, "DIAGRAMME", yPos, fontBold, 13);
    yPos -= 15; // Mehr Abstand nach Hauptüberschrift (von 10 auf 15)

    // 1. Tageszeit-Verteilung
    page.drawText("Tageszeit-Verteilung", {
      x: LAYOUT.margin,
      y: yPos,
      size: 11,
      font: fontBold,
      color: COLORS.text,
    });
    yPos -= 12; // Erhöht von 5 auf 12

    page.drawText("Verteilung der Attacken uber den Tag", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 18; // Erhöht von 15 auf 18

    const chart1Height = 160;
    const chartWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;
    drawTimeDistributionChart(page, entries, LAYOUT.margin, yPos, chartWidth, chart1Height, font, fontBold);
    yPos -= chart1Height + 40; // Erhöht von 35 auf 40

    // 2. Schmerz- & Wetterverlauf
    page.drawText("Schmerz- & Wetterverlauf", {
      x: LAYOUT.margin,
      y: yPos,
      size: 11,
      font: fontBold,
      color: COLORS.text,
    });
    yPos -= 12; // Erhöht von 5 auf 12

    page.drawText("Zeitreihen-Diagramm mit Schmerzintensitat und Luftdruck", {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 18; // Erhöht von 15 auf 18

    const chart2Height = 200;
    drawWeatherTimeSeriesChart(page, entries, LAYOUT.margin, yPos, chartWidth, chart2Height, font, fontBold);
    yPos -= chart2Height;
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
