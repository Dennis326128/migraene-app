/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEGLEITSYMPTOME – KLINISCHE ÜBERSICHT FÜR PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Berechnet Symptom-Häufigkeit (objektiv) und Belastungsbewertung (subjektiv)
 * und zeichnet den klinischen Abschnitt im PDF.
 */

import { PDFPage, PDFFont, rgb } from "pdf-lib";
import { BURDEN_LABELS, getBurdenWeight } from "@/features/symptoms/hooks/useSymptomBurden";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SymptomDataForPdf {
  /** Map: symptom_id → symptom name (from catalog) */
  catalog: Map<string, string>;
  /** Array of { entry_id, symptom_id } for entries in range */
  entrySymptoms: Array<{ entry_id: number; symptom_id: string }>;
  /** Map: symptom_key (= symptom name) → burden_level (1-4, or null) */
  burdenMap: Map<string, number>;
  /** Total entries in range */
  totalEntries: number;
  /** Entries with symptoms_state 'viewed' or 'edited' */
  checkedEntries: number;
  /** Set of entry IDs that are "checked" (viewed/edited) */
  checkedEntryIds: Set<number>;
}

interface SymptomRow {
  name: string;
  frequencyCount: number;
  frequencyPercent: number;
  burdenLevel: number | null;
  burdenLabel: string;
  relevanceScore: number;
  clinicalNote: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function computeClinicalNote(freqPct: number, burdenLevel: number | null): string {
  const isHigh = freqPct >= 70;
  const isMedium = freqPct >= 40;
  const burdenHigh = burdenLevel !== null && burdenLevel >= 3;
  const burdenSet = burdenLevel !== null && burdenLevel > 0;

  if (isHigh && burdenHigh) return "h\u00E4ufig mit ausgepr\u00E4gter Beeintr\u00E4chtigung";
  if (isHigh && burdenSet) return "h\u00E4ufig, klinisch relevant";
  if (isHigh && !burdenSet) return "H\u00E4ufigkeit dokumentiert, Beeintr\u00E4chtigung nicht bewertet";
  if (isMedium && burdenHigh) return "regelm\u00E4\u00DFig, klinisch bedeutsam";
  if (!isMedium && burdenHigh) return "selten, jedoch klinisch bedeutsam";
  if (isMedium && burdenSet) return "regelm\u00E4\u00DFig, klinisch relevant";
  if (isMedium) return "H\u00E4ufigkeit dokumentiert, Beeintr\u00E4chtigung nicht bewertet";
  if (burdenSet) return "gelegentlich";
  return "H\u00E4ufigkeit dokumentiert, Beeintr\u00E4chtigung nicht bewertet";
}

export function computeSymptomRows(data: SymptomDataForPdf): {
  rows: SymptomRow[];
  useCheckedBasis: boolean;
  basisCount: number;
  hasBurdenData: boolean;
} {
  const useCheckedBasis = data.checkedEntries > 0;
  const basisCount = useCheckedBasis ? data.checkedEntries : data.totalEntries;

  if (basisCount === 0) {
    return { rows: [], useCheckedBasis, basisCount, hasBurdenData: false };
  }

  // Count symptoms per basis
  const symptomCounts = new Map<string, number>();

  for (const es of data.entrySymptoms) {
    // If using checked basis, only count symptoms from checked entries
    if (useCheckedBasis && !data.checkedEntryIds.has(es.entry_id)) continue;

    const name = data.catalog.get(es.symptom_id);
    if (!name) continue;
    symptomCounts.set(name, (symptomCounts.get(name) || 0) + 1);
  }

  const hasBurdenData = data.burdenMap.size > 0 && Array.from(data.burdenMap.values()).some(v => v > 0);

  const rows: SymptomRow[] = [];
  for (const [name, count] of symptomCounts) {
    const freqPct = Math.round((count / basisCount) * 100);
    const burdenLevel = data.burdenMap.get(name) ?? null;
    const burdenWeight = getBurdenWeight(burdenLevel);
    const relevanceScore = (count / basisCount) * burdenWeight;
    const burdenLabel = burdenLevel !== null && burdenLevel > 0
      ? (BURDEN_LABELS[burdenLevel] || "nicht festgelegt")
      : "nicht festgelegt";

    rows.push({
      name,
      frequencyCount: count,
      frequencyPercent: freqPct,
      burdenLevel,
      burdenLabel,
      relevanceScore,
      clinicalNote: computeClinicalNote(freqPct, burdenLevel),
    });
  }

  rows.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return { rows, useCheckedBasis, basisCount, hasBurdenData };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF DRAWING
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: rgb(0.15, 0.35, 0.65),
  primaryLight: rgb(0.2, 0.4, 0.8),
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  headerBg: rgb(0.95, 0.97, 1.0),
};

const LAYOUT = {
  margin: 40,
  pageWidth: 595.28,
  pageHeight: 841.89,
  lineHeight: 14,
  sectionGap: 14,
};

function sanitize(text: string): string {
  return text
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "")
    .trim();
}

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

/**
 * Draws the "Begleitsymptome (klinische Übersicht)" section in the PDF.
 * Returns updated { page, yPos }.
 */
export function drawSymptomSection(
  pdfDoc: any,
  page: PDFPage,
  yPos: number,
  font: PDFFont,
  fontBold: PDFFont,
  data: SymptomDataForPdf,
  fromFormatted: string,
  toFormatted: string,
): { page: PDFPage; yPos: number } {
  const { rows, useCheckedBasis, basisCount, hasBurdenData } = computeSymptomRows(data);

  // Skip section if no symptoms at all
  if (rows.length === 0 && basisCount === 0) {
    return { page, yPos };
  }

  // Estimate space: header (40) + basis line (15) + table header (20) + rows (15 each) + footer (30)
  const topRows = Math.min(rows.length, 6);
  const estimatedSpace = 40 + 15 + 20 + topRows * 15 + 40;
  const spaceCheck = ensureSpace(pdfDoc, page, yPos, estimatedSpace);
  page = spaceCheck.page;
  yPos = spaceCheck.yPos;

  // ── Section Header ──
  page.drawText("BEGLEITSYMPTOME \u2013 KLINISCHE EINORDNUNG", {
    x: LAYOUT.margin, y: yPos, size: 11, font: fontBold, color: COLORS.primaryLight,
  });
  page.drawLine({
    start: { x: LAYOUT.margin, y: yPos - 3 },
    end: { x: LAYOUT.pageWidth - LAYOUT.margin, y: yPos - 3 },
    thickness: 1.5, color: COLORS.primaryLight,
  });
  yPos -= 22;

  // ── Basis line ──
  const basisLabel = useCheckedBasis
    ? `Zeitraum: ${fromFormatted} - ${toFormatted}  |  Basis: ${basisCount} von ${data.totalEntries} Attacken (gepr\u00FCft)`
    : `Zeitraum: ${fromFormatted} - ${toFormatted}  |  Basis: ${data.totalEntries} Attacken (alle)`;
  
  page.drawText(basisLabel, {
    x: LAYOUT.margin, y: yPos, size: 7.5, font, color: COLORS.textLight,
  });
  yPos -= 11;

  // Fallback warning if using all entries
  if (!useCheckedBasis && data.totalEntries > 0) {
    page.drawText(
      "Hinweis: Begleitsymptome wurden selten ge\u00F6ffnet; H\u00E4ufigkeiten k\u00F6nnen \u00FCbersch\u00E4tzt sein.",
      { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
    );
    yPos -= 11;
  }

  // Burden not set hint
  if (!hasBurdenData) {
    page.drawText(
      "Beeintr\u00E4chtigung: nicht festgelegt",
      { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
    );
    yPos -= 11;
  }

  if (rows.length === 0) {
    page.drawText("Keine Begleitsymptome im Zeitraum dokumentiert.", {
      x: LAYOUT.margin, y: yPos, size: 9, font, color: COLORS.textLight,
    });
    yPos -= LAYOUT.sectionGap;
    return { page, yPos };
  }

  // ── Table header ──
  const cols = {
    symptom: LAYOUT.margin,
    freq: LAYOUT.margin + 170,
    burden: LAYOUT.margin + 240,
    note: LAYOUT.margin + 360,
  };

  page.drawRectangle({
    x: LAYOUT.margin, y: yPos - 15,
    width: LAYOUT.pageWidth - 2 * LAYOUT.margin, height: 15,
    color: COLORS.headerBg,
  });

  page.drawText("Symptom", { x: cols.symptom, y: yPos - 11, size: 8, font: fontBold, color: COLORS.text });
  page.drawText("H\u00E4ufigkeit", { x: cols.freq, y: yPos - 11, size: 8, font: fontBold, color: COLORS.text });
  page.drawText("Beeintr\u00E4chtigung", { x: cols.burden, y: yPos - 11, size: 8, font: fontBold, color: COLORS.text });
  page.drawText("Einordnung", { x: cols.note, y: yPos - 11, size: 8, font: fontBold, color: COLORS.text });
  yPos -= 26;

  // ── Top 6 rows ──
  const topSymptoms = rows.slice(0, 6);
  for (const row of topSymptoms) {
    if (yPos < LAYOUT.margin + 50) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
    }

    page.drawText(sanitize(row.name), {
      x: cols.symptom, y: yPos, size: 8.5, font: fontBold, color: COLORS.text,
    });
    // Right-align frequency percentage
    const freqText = `${row.frequencyPercent} %`;
    const freqWidth = font.widthOfTextAtSize(freqText, 8.5);
    page.drawText(freqText, {
      x: cols.burden - 10 - freqWidth, y: yPos, size: 8.5, font, color: COLORS.text,
    });
    page.drawText(sanitize(row.burdenLabel), {
      x: cols.burden, y: yPos, size: 8.5, font, color: COLORS.text,
    });
    page.drawText(sanitize(row.clinicalNote), {
      x: cols.note, y: yPos, size: 8, font, color: COLORS.textLight,
    });
    yPos -= 14;
  }

  // ── Remaining symptoms (compact list if > 6) ──
  if (rows.length > 6) {
    const remaining = rows.slice(6, 12);
    const remainingNames = remaining.map(r => sanitize(r.name)).join(", ");
    
    yPos -= 4;
    page.drawText(`Weitere Symptome: ${remainingNames}`, {
      x: LAYOUT.margin, y: yPos, size: 7.5, font, color: COLORS.textLight,
    });
    yPos -= 12;

    if (rows.length > 12) {
      const moreCount = rows.length - 12;
      page.drawText(`... und ${moreCount} weitere`, {
        x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight,
      });
      yPos -= 10;
    }
  }

  // ── Footer note ──
  yPos -= 4;
  page.drawText(
    "H\u00E4ufigkeit basiert auf dokumentierten Attacken; Beeintr\u00E4chtigung entspricht patientenseitiger Priorisierung.",
    { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
  );
  yPos -= 10;

  // Burden hint if no data
  if (!hasBurdenData) {
    page.drawText(
      "Tipp: Patient kann in Miary die Beeintr\u00E4chtigung pro Symptom festlegen.",
      { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
    );
    yPos -= 10;
  }

  yPos -= LAYOUT.sectionGap;
  return { page, yPos };
}
