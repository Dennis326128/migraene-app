/**
 * Daily Impact Check PDF Generator
 * Erstellt ein PDF für die Alltagsbelastung-Selbsteinschätzung
 */

import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  DailyImpactAnswers,
  DAILY_IMPACT_QUESTIONS,
  DAILY_IMPACT_QUESTION_KEYS,
  DAILY_IMPACT_ANSWER_LABELS,
  getImpactCategory,
  IMPACT_CATEGORY_LABELS,
  DailyImpactAnswer,
} from '@/features/daily-impact';

interface DailyImpactPdfInput {
  answers: DailyImpactAnswers;
  score: number;
  completedDate: Date;
  externalHit6Score?: number | null;
  externalHit6Date?: Date | null;
}

export async function buildDailyImpactPdf(input: DailyImpactPdfInput): Promise<Uint8Array> {
  const { answers, score, completedDate, externalHit6Score, externalHit6Date } = input;
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Alltagsbelastung durch Kopfschmerzen', margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Selbsteinschätzung (Kurzcheck)', margin, y);
  y += 10;

  // Date info
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Erstellt am: ${format(completedDate, 'd. MMMM yyyy', { locale: de })}`, margin, y);
  y += 5;
  doc.text('Bezugszeitraum: Letzte 4 Wochen', margin, y);
  y += 12;

  // Score summary
  const category = getImpactCategory(score);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentWidth, 20, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Kurzcheck-Score:', margin + 5, y + 8);
  doc.text(`${score} von 28 Punkten`, margin + 50, y + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`(${IMPACT_CATEGORY_LABELS[category]})`, margin + 5, y + 15);
  y += 28;

  // Questions and answers
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Deine Antworten:', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  DAILY_IMPACT_QUESTION_KEYS.forEach((key, index) => {
    const question = DAILY_IMPACT_QUESTIONS[key];
    const answer = answers[key];
    const answerLabel = answer !== null ? DAILY_IMPACT_ANSWER_LABELS[answer as DailyImpactAnswer] : '–';
    const answerValue = answer !== null ? `(${answer})` : '';

    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(0);
    doc.text(`${index + 1}. ${question}`, margin, y);
    y += 5;
    
    doc.setTextColor(60);
    doc.text(`   → ${answerLabel} ${answerValue}`, margin, y);
    y += 8;
  });

  // External HIT-6 (if provided)
  if (externalHit6Score) {
    y += 5;
    doc.setFillColor(255, 250, 240);
    doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Externer HIT-6 Gesamtwert (Patientenangabe):', margin + 5, y + 7);
    doc.text(`${externalHit6Score} Punkte`, margin + 95, y + 7);
    
    if (externalHit6Date) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      doc.text(`Erhoben am: ${format(externalHit6Date, 'd. MMMM yyyy', { locale: de })}`, margin + 5, y + 13);
    }
    y += 25;
  }

  // Footer disclaimer
  y = Math.max(y + 10, 260);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'Selbsteinschätzung zur Gesprächsvorbereitung. Diese Dokumentation ersetzt keinen lizenzierten Test.',
    margin,
    y
  );
  y += 4;
  if (externalHit6Score) {
    doc.text('Externer HIT-6 Wert wurde vom Patienten angegeben.', margin, y);
  }

  // Return as Uint8Array
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
