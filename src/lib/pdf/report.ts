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
 *   - Ärztliche KI-Kurzauswertung (wenn aktiviert)
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
import type { PainEntry } from "@/types/painApp";

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
  
  analysisReport?: string;
  medicationStats?: Array<{
    name: string;
    count: number;
    avgEffect: number;
    ratedCount: number;
  }>;
  patientData?: {
    firstName?: string;
    lastName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
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
 * Formatiert Datum + Uhrzeit: dd.mm.yyyy, HH:mm
 */
function formatDateTimeGerman(dateStr: string, timeStr?: string): string {
  const dateFormatted = formatDateGerman(dateStr);
  
  if (timeStr) {
    return `${dateFormatted}, ${timeStr}`;
  }
  
  const date = new Date(dateStr);
  const time = date.toLocaleTimeString("de-DE", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  return `${dateFormatted}, ${time}`;
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
 * Zeichnet Tabellenkopf für Attacken-Liste
 */
function drawTableHeader(page: PDFPage, yPos: number, font: PDFFont): number {
  const cols = {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 110,
    aura: LAYOUT.margin + 160,
    meds: LAYOUT.margin + 230,
    notes: LAYOUT.margin + 350,
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
  page.drawText("Aura", { x: cols.aura, y: yPos - 12, size: 9, font, color: COLORS.text });
  page.drawText("Medikamente", { x: cols.meds, y: yPos - 12, size: 9, font, color: COLORS.text });
  page.drawText("Notizen", { x: cols.notes, y: yPos - 12, size: 9, font, color: COLORS.text });
  
  return yPos - 25;
}

/**
 * Zeichnet Tabellen-Zeile mit automatischem Textumbruch
 */
function drawTableRow(
  page: PDFPage,
  entry: PainEntry,
  yPos: number,
  font: PDFFont,
  pdfDoc: any
): { yPos: number; page: PDFPage; rowHeight: number } {
  const cols = {
    date: LAYOUT.margin,
    pain: LAYOUT.margin + 110,
    aura: LAYOUT.margin + 160,
    meds: LAYOUT.margin + 230,
    notes: LAYOUT.margin + 350,
  };
  
  const colWidths = {
    date: 105,
    pain: 45,
    aura: 65,
    meds: 115,
    notes: 145,
  };
  
  // Datum/Zeit
  const dateTime = entry.selected_date && entry.selected_time
    ? formatDateTimeGerman(entry.selected_date, entry.selected_time)
    : formatDateTimeGerman(entry.timestamp_created || '');
  
  // Schmerz
  const painText = formatPainLevel(entry.pain_level);
  
  // Aura
  const auraText = entry.aura_type && entry.aura_type !== 'keine' ? entry.aura_type : '-';
  
  // Medikamente (mit Umbruch)
  const medsText = entry.medications && entry.medications.length > 0 
    ? entry.medications.join(", ") 
    : '-';
  const medsLines = wrapText(medsText, colWidths.meds, 8, font);
  
  // Notizen (mit Umbruch)
  const notesText = entry.notes || '-';
  const notesLines = wrapText(notesText, colWidths.notes, 8, font);
  
  // Berechne Zeilenhöhe (höchste Spalte bestimmt) - mit mehr Padding für Zentrierung
  const maxLines = Math.max(medsLines.length, notesLines.length, 1);
  const rowHeight = maxLines * 11 + 12; // Erhöht von +8 auf +12 für bessere Zentrierung
  
  // Prüfe ob Platz für Zeile, sonst neue Seite
  if (yPos - rowHeight < LAYOUT.margin + 30) {
    page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
    yPos = LAYOUT.pageHeight - LAYOUT.margin;
    yPos = drawTableHeader(page, yPos, font);
  }
  
  // Zeichne Zeile - Text vertikal zentriert zwischen den Trennlinien
  const verticalPadding = 4; // Padding von oben für vertikale Zentrierung
  const rowTop = yPos - verticalPadding;
  
  page.drawText(sanitizeForPDF(dateTime), { x: cols.date, y: rowTop, size: 8, font });
  page.drawText(sanitizeForPDF(painText), { x: cols.pain, y: rowTop, size: 8, font });
  page.drawText(sanitizeForPDF(auraText), { x: cols.aura, y: rowTop, size: 8, font });
  
  // Medikamente (mehrzeilig)
  medsLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.meds, 
      y: rowTop - (i * 11), 
      size: 8, 
      font 
    });
  });
  
  // Notizen (mehrzeilig)
  notesLines.forEach((line, i) => {
    page.drawText(sanitizeForPDF(line), { 
      x: cols.notes, 
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
    analysisReport = "",
    medicationStats = [],
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
  // ÄRZTLICHE KI-KURZAUSWERTUNG (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeAnalysis && analysisReport) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 180);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "ARZTLICHE AUSWERTUNG", yPos, fontBold, 12);
    
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
    
    // Berechne Box-Höhe basierend auf Text-Länge
    const estimatedLines = analysisReport.split('\n').length * 2;
    const boxHeight = Math.min(Math.max(100, estimatedLines * 12 + 20), 250);
    
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
    
    yPos -= boxHeight + LAYOUT.sectionGap;
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
    
    // KPI-Boxen
    const boxWidth = (LAYOUT.pageWidth - 2 * LAYOUT.margin - 30) / 4;
    const boxHeight = 70;
    const boxY = yPos - 10;
    
    const kpis = [
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
      const valueWidth = fontBold.widthOfTextAtSize(kpi.value, 18);
      page.drawText(kpi.value, {
        x: x + boxWidth / 2 - valueWidth / 2,
        y: boxY - 30,
        size: 18,
        font: fontBold,
        color: COLORS.primaryLight,
      });
      
      // Label (klein, zentriert)
      const labelLines = wrapText(kpi.label, boxWidth - 10, 7, font);
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
  // SEITE 2+: MEDIKAMENTEN-STATISTIK
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (medicationStats && medicationStats.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 150);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "MEDIKAMENTEN-STATISTIK", yPos, fontBold, 12);
    
    // Tabellen-Header
    const cols = {
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
    
    page.drawText("Medikament", { x: cols.name, y: yPos - 12, size: 9, font: fontBold });
    page.drawText("Einnahmen", { x: cols.count, y: yPos - 12, size: 9, font: fontBold });
    page.drawText("Ø Wirksamkeit", { x: cols.effectiveness, y: yPos - 12, size: 9, font: fontBold });
    page.drawText("Bemerkung", { x: cols.note, y: yPos - 12, size: 9, font: fontBold });
    yPos -= 30; // Erhöht von 25 auf 30 für mehr Abstand nach Header
    
    // Medikamente
    for (const stat of medicationStats) {
      if (yPos < LAYOUT.margin + 50) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        yPos = LAYOUT.pageHeight - LAYOUT.margin;
      }
      
      page.drawText(sanitizeForPDF(stat.name), { x: cols.name, y: yPos, size: 9, font });
      page.drawText(stat.count.toString(), { x: cols.count, y: yPos, size: 9, font });
      
      if (stat.ratedCount > 0) {
        const effectPercent = Math.round((stat.avgEffect / 10) * 100);
        page.drawText(`${effectPercent}%`, { x: cols.effectiveness, y: yPos, size: 9, font });
        page.drawText(`(Ø aus ${stat.ratedCount} Bewertungen)`, {
          x: cols.note, 
          y: yPos, 
          size: 8, 
          font, 
          color: COLORS.textLight 
        });
      } else {
        page.drawText("-", { x: cols.effectiveness, y: yPos, size: 9, font });
        page.drawText("Keine Wirksamkeitsbewertung", { 
          x: cols.note, 
          y: yPos, 
          size: 8, 
          font, 
          color: COLORS.textLight 
        });
      }
      
      yPos -= 15;
    }
    
    yPos -= LAYOUT.sectionGap;
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
  // DETAILLIERTE ATTACKEN-LISTE (mit Pagebreak)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (includeEntriesList && entries.length > 0) {
    const spaceCheck = ensureSpace(pdfDoc, page, yPos, 100);
    page = spaceCheck.page;
    yPos = spaceCheck.yPos;
    
    yPos = drawSectionHeader(page, "DETAILLIERTE ATTACKEN-LISTE", yPos, fontBold, 12);
    
    page.drawText(`${entries.length} Attacken im Zeitraum`, {
      x: LAYOUT.margin,
      y: yPos,
      size: 8,
      font,
      color: COLORS.textLight,
    });
    yPos -= 15;
    
    yPos = drawTableHeader(page, yPos, fontBold);
    
    // Sortiere Einträge nach Datum (neueste zuerst)
    const sortedEntries = [...entries].sort((a, b) => {
      const dateA = new Date(a.selected_date || a.timestamp_created || '');
      const dateB = new Date(b.selected_date || b.timestamp_created || '');
      return dateB.getTime() - dateA.getTime();
    });
    
    for (const entry of sortedEntries) {
      const result = drawTableRow(page, entry, yPos, font, pdfDoc);
      page = result.page;
      yPos = result.yPos;
    }
    
    yPos -= LAYOUT.sectionGap;
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
