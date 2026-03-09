/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEGLEITSYMPTOME – KLINISCH GRUPPIERTE ÜBERSICHT FÜR PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Berechnet Symptom-Häufigkeit (objektiv) und Belastungsbewertung (subjektiv)
 * und zeichnet den klinischen Abschnitt im PDF — klinisch gruppiert.
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
  group: SymptomGroup;
}

type SymptomGroup = 'migraine' | 'neurological' | 'other';

// ═══════════════════════════════════════════════════════════════════════════
// CLINICAL GROUPING
// ═══════════════════════════════════════════════════════════════════════════

const MIGRAINE_SYMPTOMS = [
  'lichtempfindlichkeit', 'photophobie',
  'geraeuschempfindlichkeit', 'geräuschempfindlichkeit', 'phonophobie',
  'uebelkeit', 'übelkeit', 'erbrechen',
  'appetitlosigkeit',
  'geruchsempfindlichkeit',
];

const NEUROLOGICAL_SYMPTOMS = [
  'wortfindungsstoerung', 'wortfindungsstörung',
  'konzentrationsstoerung', 'konzentrationsstörung', 'konzentrationsprobleme',
  'sehstoerung', 'sehstörung', 'sehstörungen', 'verschwommensehen',
  'schwindel',
  'taubheitsgefuehl', 'taubheitsgefühl',
  'kribbeln',
  'sprachstoerung', 'sprachstörung',
  'aura',
];

function classifySymptom(name: string): SymptomGroup {
  const lower = name.toLowerCase().trim();
  if (MIGRAINE_SYMPTOMS.some(s => lower.includes(s))) return 'migraine';
  if (NEUROLOGICAL_SYMPTOMS.some(s => lower.includes(s))) return 'neurological';
  return 'other';
}

const GROUP_LABELS: Record<SymptomGroup, string> = {
  migraine: 'Migr\u00E4netypische Begleitsymptome',
  neurological: 'Neurologische / kognitive Symptome',
  other: 'Weitere dokumentierte Symptome',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════


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

  const symptomCounts = new Map<string, number>();

  for (const es of data.entrySymptoms) {
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
      group: classifySymptom(name),
      group: classifySymptom(name),
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
 * Draws the "Begleitsymptome – Klinische Bewertung" section in the PDF,
 * grouped by clinical category (migraine-typical, neurological, other).
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

  if (rows.length === 0 && basisCount === 0) {
    return { page, yPos };
  }

  const topRows = Math.min(rows.length, 12);
  const estimatedSpace = 40 + 15 + 20 + topRows * 15 + 80;
  const spaceCheck = ensureSpace(pdfDoc, page, yPos, estimatedSpace);
  page = spaceCheck.page;
  yPos = spaceCheck.yPos;

  // ── Section Header ──
  page.drawText("BEGLEITSYMPTOME - KLINISCHE BEWERTUNG", {
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

  if (!useCheckedBasis && data.totalEntries > 0) {
    page.drawText(
      "Hinweis: Begleitsymptome wurden selten ge\u00F6ffnet; H\u00E4ufigkeiten k\u00F6nnen \u00FCbersch\u00E4tzt sein.",
      { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
    );
    yPos -= 11;
  }

  if (!hasBurdenData) {
    page.drawText(
      "Belastung: nicht festgelegt",
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

  // ── Group symptoms by clinical category ──
  const groups: SymptomGroup[] = ['migraine', 'neurological', 'other'];
  
  for (const group of groups) {
    const groupRows = rows.filter(r => r.group === group);
    if (groupRows.length === 0) continue;

    if (yPos < LAYOUT.margin + 80) {
      page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      yPos = LAYOUT.pageHeight - LAYOUT.margin;
    }

    // Group sub-header
    page.drawText(GROUP_LABELS[group], {
      x: LAYOUT.margin, y: yPos, size: 9, font: fontBold, color: COLORS.primary,
    });
    yPos -= 14;

    // Table header for group
    const cols = {
      symptom: LAYOUT.margin + 8,
      freq: LAYOUT.margin + 250,
      burden: LAYOUT.margin + 370,
    };

    page.drawRectangle({
      x: LAYOUT.margin, y: yPos - 13,
      width: LAYOUT.pageWidth - 2 * LAYOUT.margin, height: 13,
      color: COLORS.headerBg,
    });
    page.drawText("Symptom", { x: cols.symptom, y: yPos - 10, size: 7, font: fontBold, color: COLORS.text });
    page.drawText("H\u00E4ufigkeit", { x: cols.freq, y: yPos - 10, size: 7, font: fontBold, color: COLORS.text });
    page.drawText("Belastung", { x: cols.burden, y: yPos - 10, size: 7, font: fontBold, color: COLORS.text });
    
    yPos -= 22;

    for (const row of groupRows.slice(0, 6)) {
      if (yPos < LAYOUT.margin + 50) {
        page = pdfDoc.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
        yPos = LAYOUT.pageHeight - LAYOUT.margin;
      }

      page.drawText(sanitize(row.name), { x: cols.symptom, y: yPos, size: 8, font, color: COLORS.text });
      page.drawText(`${row.frequencyPercent} %`, { x: cols.freq, y: yPos, size: 8, font, color: COLORS.text });
      page.drawText(sanitize(row.burdenLabel), { x: cols.burden, y: yPos, size: 8, font, color: COLORS.text });
      
      yPos -= 13;
    }
    yPos -= 6;
  }

  // ── Footer note ──
  yPos -= 2;
  page.drawText(
    "H\u00E4ufigkeit basiert auf dokumentierten Attacken; Belastung entspricht patientenseitiger Priorisierung.",
    { x: LAYOUT.margin, y: yPos, size: 7, font, color: COLORS.textLight }
  );
  yPos -= 10;

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
