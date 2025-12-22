/**
 * HIT-6™ PDF Generator - Offizielles Format (DE Version 1.1)
 * 
 * Erzeugt ein professionelles PDF im offiziellen HIT-6 Format,
 * geeignet für Arzt/Krankenkasse.
 * 
 * ©2000, 2001 QualityMetric, Inc. and GlaxoSmithKline Group of Companie(s)
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import {
  Hit6Answers,
  Hit6QuestionKey,
  HIT6_QUESTIONS,
  HIT6_QUESTION_KEYS,
  HIT6_ANSWER_OPTIONS,
  HIT6_ANSWER_LABELS,
  HIT6_SCORES,
  HIT6_PDF_TITLE,
  HIT6_PDF_INSTRUCTION,
  HIT6_PDF_SCORING_INSTRUCTION,
  HIT6_PDF_INTERPRETATION,
  HIT6_PDF_COPYRIGHT,
  Hit6Answer,
} from '@/features/hit6/hit6.constants';

// Layout constants
const LAYOUT = {
  pageWidth: 595.28, // A4
  pageHeight: 841.89,
  margin: 40,
  lineHeight: 14,
};

const COLORS = {
  primary: rgb(0.15, 0.35, 0.65),
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  border: rgb(0.6, 0.6, 0.6),
  headerBg: rgb(0.9, 0.93, 0.97),
  checkmark: rgb(0.1, 0.5, 0.2),
};

interface Hit6PdfParams {
  answers: Hit6Answers;
  score: number;
  completedDate?: Date;
  patientName?: string;
}

/**
 * Sanitize text for WinAnsi PDF encoding
 */
function sanitize(text: string): string {
  return text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format date German style: dd.mm.yyyy
 */
function formatDateGerman(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Wrap text to fit within maxWidth
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

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
 * Draw a table cell with optional X mark
 */
function drawCell(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  isSelected: boolean,
  font: PDFFont
) {
  // Cell border
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  // Draw X if selected
  if (isSelected) {
    const centerX = x + width / 2;
    const centerY = y - height / 2;
    page.drawText('X', {
      x: centerX - 4,
      y: centerY - 4,
      size: 12,
      font,
      color: COLORS.checkmark,
    });
  }
}

/**
 * Build official HIT-6™ PDF
 */
export async function buildHit6Pdf(params: Hit6PdfParams): Promise<Uint8Array> {
  const { answers, score, completedDate = new Date(), patientName } = params;

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = LAYOUT.pageHeight - LAYOUT.margin;
  const contentWidth = LAYOUT.pageWidth - 2 * LAYOUT.margin;

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - Title
  // ═══════════════════════════════════════════════════════════════════════════
  page.drawText(sanitize(HIT6_PDF_TITLE), {
    x: LAYOUT.margin,
    y,
    size: 14,
    font: fontBold,
    color: COLORS.primary,
  });
  y -= 25;

  // Meta info line
  const metaText = `Ausgefüllt am: ${formatDateGerman(completedDate)}  |  Bezugszeitraum: letzte 4 Wochen`;
  page.drawText(sanitize(metaText), {
    x: LAYOUT.margin,
    y,
    size: 9,
    font,
    color: COLORS.textLight,
  });
  y -= 12;

  if (patientName) {
    page.drawText(sanitize(`Patient: ${patientName}`), {
      x: LAYOUT.margin,
      y,
      size: 9,
      font,
      color: COLORS.textLight,
    });
    y -= 12;
  }
  y -= 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTRUCTION TEXT
  // ═══════════════════════════════════════════════════════════════════════════
  const instructionLines = wrapText(sanitize(HIT6_PDF_INSTRUCTION), contentWidth, 10, font);
  for (const line of instructionLines) {
    page.drawText(line, {
      x: LAYOUT.margin,
      y,
      size: 10,
      font,
      color: COLORS.text,
    });
    y -= 14;
  }
  y -= 15;

  // ═══════════════════════════════════════════════════════════════════════════
  // QUESTIONS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  const tableX = LAYOUT.margin;
  const questionColWidth = 280;
  const answerColWidth = 50;
  const rowHeight = 50;
  const headerHeight = 35;

  // Table header background
  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: questionColWidth + answerColWidth * 5,
    height: headerHeight,
    color: COLORS.headerBg,
  });

  // Header labels
  page.drawText('Frage', {
    x: tableX + 5,
    y: y - 22,
    size: 9,
    font: fontBold,
    color: COLORS.text,
  });

  // Answer column headers with points
  HIT6_ANSWER_OPTIONS.forEach((option, i) => {
    const colX = tableX + questionColWidth + i * answerColWidth;
    const label = HIT6_ANSWER_LABELS[option];
    const points = HIT6_SCORES[option];

    // Label
    page.drawText(sanitize(label), {
      x: colX + 5,
      y: y - 15,
      size: 8,
      font: fontBold,
      color: COLORS.text,
    });

    // Points below
    page.drawText(`(${points} Pkt.)`, {
      x: colX + 8,
      y: y - 26,
      size: 7,
      font,
      color: COLORS.textLight,
    });

    // Header cell border
    page.drawRectangle({
      x: colX,
      y: y - headerHeight,
      width: answerColWidth,
      height: headerHeight,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
  });

  // Question column header border
  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: questionColWidth,
    height: headerHeight,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  y -= headerHeight;

  // Question rows
  HIT6_QUESTION_KEYS.forEach((qKey, qIndex) => {
    const question = HIT6_QUESTIONS[qKey];
    const selectedAnswer = answers[qKey];

    // Calculate row height based on text wrap
    const wrappedQuestion = wrapText(sanitize(question), questionColWidth - 10, 9, font);
    const actualRowHeight = Math.max(rowHeight, wrappedQuestion.length * 12 + 16);

    // Check if we need a new page
    if (y - actualRowHeight < LAYOUT.margin + 100) {
      page = pdf.addPage([LAYOUT.pageWidth, LAYOUT.pageHeight]);
      y = LAYOUT.pageHeight - LAYOUT.margin;
    }

    // Question cell
    page.drawRectangle({
      x: tableX,
      y: y - actualRowHeight,
      width: questionColWidth,
      height: actualRowHeight,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });

    // Question number
    page.drawText(`${qIndex + 1}.`, {
      x: tableX + 5,
      y: y - 15,
      size: 9,
      font: fontBold,
      color: COLORS.text,
    });

    // Question text (wrapped)
    let textY = y - 15;
    wrappedQuestion.forEach((line) => {
      page.drawText(line, {
        x: tableX + 20,
        y: textY,
        size: 9,
        font,
        color: COLORS.text,
      });
      textY -= 12;
    });

    // Answer cells
    HIT6_ANSWER_OPTIONS.forEach((option, i) => {
      const colX = tableX + questionColWidth + i * answerColWidth;
      const isSelected = selectedAnswer === option;
      drawCell(page, colX, y, answerColWidth, actualRowHeight, isSelected, fontBold);
    });

    y -= actualRowHeight;
  });

  y -= 25;

  // ═══════════════════════════════════════════════════════════════════════════
  // SCORING SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Scoring instruction
  const scoringLines = HIT6_PDF_SCORING_INSTRUCTION.split('\n');
  page.drawText('Auswertung', {
    x: LAYOUT.margin,
    y,
    size: 11,
    font: fontBold,
    color: COLORS.primary,
  });
  y -= 18;

  for (let i = 1; i < scoringLines.length; i++) {
    const line = scoringLines[i];
    if (!line.trim()) continue;
    const wrapped = wrapText(sanitize(line), contentWidth, 9, font);
    for (const wl of wrapped) {
      page.drawText(wl, {
        x: LAYOUT.margin,
        y,
        size: 9,
        font,
        color: COLORS.text,
      });
      y -= 12;
    }
  }
  y -= 10;

  // Total score box
  page.drawRectangle({
    x: LAYOUT.margin,
    y: y - 35,
    width: 200,
    height: 35,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  });

  page.drawText('Gesamtpunktzahl:', {
    x: LAYOUT.margin + 10,
    y: y - 23,
    size: 11,
    font: fontBold,
    color: COLORS.text,
  });

  page.drawText(score.toString(), {
    x: LAYOUT.margin + 130,
    y: y - 25,
    size: 16,
    font: fontBold,
    color: COLORS.primary,
  });

  y -= 50;

  // Interpretation text
  const interpretLines = wrapText(sanitize(HIT6_PDF_INTERPRETATION), contentWidth, 9, font);
  for (const line of interpretLines) {
    page.drawText(line, {
      x: LAYOUT.margin,
      y,
      size: 9,
      font,
      color: COLORS.text,
    });
    y -= 12;
  }

  y -= 10;

  // App note
  page.drawText('Gesamtpunktzahl wurde automatisch berechnet.', {
    x: LAYOUT.margin,
    y,
    size: 8,
    font,
    color: COLORS.textLight,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER - Copyright
  // ═══════════════════════════════════════════════════════════════════════════
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    // Copyright
    const copyrightLines = HIT6_PDF_COPYRIGHT.split('\n');
    copyrightLines.forEach((line, lineIdx) => {
      p.drawText(sanitize(line), {
        x: LAYOUT.margin,
        y: 25 + (copyrightLines.length - 1 - lineIdx) * 10,
        size: 7,
        font,
        color: COLORS.textLight,
      });
    });

    // Page number
    p.drawText(`Seite ${idx + 1} von ${pages.length}`, {
      x: LAYOUT.pageWidth - LAYOUT.margin - 60,
      y: 25,
      size: 8,
      font,
      color: COLORS.textLight,
    });
  });

  return await pdf.save();
}
