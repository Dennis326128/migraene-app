/**
 * Pie Chart Rendering für pdf-lib
 * 
 * Zeichnet ein Donut-Kuchendiagramm + Legend programmatisch auf eine PDF-Seite.
 * Nutzt drawSvgPath() von pdf-lib für die Kreissegmente.
 */

import { PDFPage, PDFFont, rgb } from 'pdf-lib';

type PdfColor = ReturnType<typeof rgb>;

interface PieSlice {
  value: number;
  color: PdfColor;
  label: string;
}

/** Farben passend zu PIE_COLORS_CSS */
export const PDF_PIE_COLORS = {
  painFree: rgb(0.086, 0.639, 0.290),       // #16a34a
  painNoTriptan: rgb(0.961, 0.620, 0.043),   // #f59e0b
  triptan: rgb(0.937, 0.267, 0.267),          // #ef4444
};

/**
 * Zeichnet ein Kuchendiagramm mit Legend auf eine PDF-Seite.
 * 
 * @param page   - Die PDF-Seite
 * @param opts   - Konfiguration
 * @returns Die neue Y-Position nach dem Chart + Legend
 */
export function drawPieChartWithLegend(
  page: PDFPage,
  opts: {
    x: number;           // Linke Kante für das Gesamtlayout
    y: number;           // Obere Kante (pdf-lib: bottom-up, also y ist oben)
    radius?: number;     // Standard: 45
    totalDays: number;
    painFreeDays: number;
    painDaysNoTriptan: number;
    triptanDays: number;
    font: PDFFont;
    fontBold: PDFFont;
  }
): number {
  const {
    x, y, 
    radius = 45,
    totalDays, painFreeDays, painDaysNoTriptan, triptanDays,
    font, fontBold,
  } = opts;

  if (totalDays === 0) return y;

  const slices: PieSlice[] = [
    { value: painFreeDays, color: PDF_PIE_COLORS.painFree, label: 'Schmerzfrei' },
    { value: painDaysNoTriptan, color: PDF_PIE_COLORS.painNoTriptan, label: 'Schmerz ohne Triptan' },
    { value: triptanDays, color: PDF_PIE_COLORS.triptan, label: 'Tage mit Triptan' },
  ];

  const activeSlices = slices.filter(s => s.value > 0);
  const cx = x + radius + 10;
  const cy = y - radius - 10;

  // Draw pie segments using drawRectangle approximation via small triangles
  // pdf-lib doesn't have arc drawing, so we approximate with many thin triangles
  let currentAngle = -Math.PI / 2;

  for (const slice of activeSlices) {
    const sweepAngle = (slice.value / totalDays) * Math.PI * 2;
    const steps = Math.max(Math.ceil(sweepAngle / 0.05), 2); // ~3° per step
    const stepAngle = sweepAngle / steps;

    for (let i = 0; i < steps; i++) {
      const a1 = currentAngle + i * stepAngle;
      const a2 = currentAngle + (i + 1) * stepAngle;
      const x1 = cx + radius * Math.cos(a1);
      const y1 = cy + radius * Math.sin(a1);
      const x2 = cx + radius * Math.cos(a2);
      const y2 = cy + radius * Math.sin(a2);

      // Draw triangle from center to arc edge
      // Use drawLine with thickness to simulate a filled triangle
      // Actually: we'll draw a very small filled polygon using multiple thick lines
      // Better approach: draw thick lines from center radiating outward
      
      const midA = (a1 + a2) / 2;
      const xMid = cx + radius * Math.cos(midA);
      const yMid = cy + radius * Math.sin(midA);

      // Fill by drawing radial line from center to edge
      for (let r2 = 1; r2 <= radius; r2 += 1.2) {
        const px = cx + r2 * Math.cos(midA);
        const py = cy + r2 * Math.sin(midA);
        page.drawCircle({
          x: px,
          y: py,
          size: 1.5,
          color: slice.color,
          borderWidth: 0,
        });
      }
    }

    currentAngle += sweepAngle;
  }

  // Draw white center circle for donut effect
  page.drawCircle({
    x: cx,
    y: cy,
    size: radius * 0.55,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  // Center text: totalDays
  const totalStr = String(totalDays);
  const totalWidth = fontBold.widthOfTextAtSize(totalStr, 16);
  page.drawText(totalStr, {
    x: cx - totalWidth / 2,
    y: cy + 2,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  const tageWidth = font.widthOfTextAtSize('Tage', 8);
  page.drawText('Tage', {
    x: cx - tageWidth / 2,
    y: cy - 10,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Legend - right of pie
  const legendX = x + (radius * 2) + 30;
  let legendY = y - 10;
  const legendLineHeight = 16;
  const squareSize = 9;

  for (const slice of slices) {
    // Color square
    page.drawRectangle({
      x: legendX,
      y: legendY - squareSize + 2,
      width: squareSize,
      height: squareSize,
      color: slice.color,
    });

    // Label
    const pct = totalDays > 0 ? Math.round((slice.value / totalDays) * 1000) / 10 : 0;
    const legendText = `${slice.label}: ${slice.value} Tage (${pct}%)`;
    
    page.drawText(legendText, {
      x: legendX + squareSize + 6,
      y: legendY - squareSize + 4,
      size: 9,
      font: slice.value > 0 ? font : font,
      color: slice.value > 0 ? rgb(0.1, 0.1, 0.1) : rgb(0.6, 0.6, 0.6),
    });

    legendY -= legendLineHeight;
  }

  // Return the lowest y position used
  return Math.min(cy - radius - 15, legendY - 5);
}
