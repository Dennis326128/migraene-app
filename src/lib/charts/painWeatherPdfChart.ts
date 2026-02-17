/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOOTH BÉZIER CHART FOR PDF (pdf-lib)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Renders the Pain & Weather chart with monotone cubic interpolation
 * (Bézier curves) matching the App's Recharts "type=monotone" look.
 * 
 * Uses the shared data builder from painWeatherData.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PDFPage, PDFFont, rgb, type Color } from 'pdf-lib';
import {
  type PainWeatherDataPoint,
  PAIN_WEATHER_CHART_CONFIG,
  computeTempRange,
  computePressureRange,
} from '@/lib/charts/painWeatherData';

// ═══════════════════════════════════════════════════════════════════════════
// MONOTONE CUBIC INTERPOLATION (Fritsch-Carlson method)
// ═══════════════════════════════════════════════════════════════════════════

interface Point { x: number; y: number; }

/**
 * Compute control points for monotone cubic Hermite interpolation.
 * This matches Recharts' "monotone" / d3's curveMonotoneX behavior.
 */
function computeMonotoneControlPoints(points: Point[]): Array<{ cp1: Point; cp2: Point }> {
  const n = points.length;
  if (n < 2) return [];

  // 1. Compute slopes between successive points
  const deltas: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    deltas.push(dx);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  // 2. Compute tangent slopes using Fritsch-Carlson
  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }

  // 3. Enforce monotonicity (Fritsch-Carlson condition)
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / slopes[i];
      const beta = tangents[i + 1] / slopes[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * slopes[i];
        tangents[i + 1] = tau * beta * slopes[i];
      }
    }
  }

  // 4. Compute Bézier control points
  const controls: Array<{ cp1: Point; cp2: Point }> = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = deltas[i] / 3;
    controls.push({
      cp1: { x: points[i].x + dx, y: points[i].y + tangents[i] * dx },
      cp2: { x: points[i + 1].x - dx, y: points[i + 1].y - tangents[i + 1] * dx },
    });
  }

  return controls;
}

/**
 * Draw a smooth monotone cubic Bézier curve through points on a PDF page.
 */
function drawSmoothLine(
  page: PDFPage,
  points: Point[],
  color: Color,
  strokeWidth: number = 1.8,
  dashArray?: number[]
) {
  if (points.length < 2) return;

  const controls = computeMonotoneControlPoints(points);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const { cp1, cp2 } = controls[i];

    // Approximate Bézier with line segments (pdf-lib doesn't have native Bézier path drawing)
    // Use 12 segments per curve for smooth appearance at PDF zoom levels
    const segments = 12;
    let prevX = p0.x;
    let prevY = p0.y;

    for (let t = 1; t <= segments; t++) {
      const u = t / segments;
      const u2 = u * u;
      const u3 = u2 * u;
      const inv = 1 - u;
      const inv2 = inv * inv;
      const inv3 = inv2 * inv;

      const x = inv3 * p0.x + 3 * inv2 * u * cp1.x + 3 * inv * u2 * cp2.x + u3 * p1.x;
      const y = inv3 * p0.y + 3 * inv2 * u * cp1.y + 3 * inv * u2 * cp2.y + u3 * p1.y;

      page.drawLine({
        start: { x: prevX, y: prevY },
        end: { x, y },
        thickness: strokeWidth,
        color,
        dashArray,
      });

      prevX = x;
      prevY = y;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHART DRAWING
// ═══════════════════════════════════════════════════════════════════════════

const CHART_COLORS = {
  pain: rgb(PAIN_WEATHER_CHART_CONFIG.pain.pdfColor.r, PAIN_WEATHER_CHART_CONFIG.pain.pdfColor.g, PAIN_WEATHER_CHART_CONFIG.pain.pdfColor.b),
  temp: rgb(PAIN_WEATHER_CHART_CONFIG.temperature.pdfColor.r, PAIN_WEATHER_CHART_CONFIG.temperature.pdfColor.g, PAIN_WEATHER_CHART_CONFIG.temperature.pdfColor.b),
  pressure: rgb(PAIN_WEATHER_CHART_CONFIG.pressure.pdfColor.r, PAIN_WEATHER_CHART_CONFIG.pressure.pdfColor.g, PAIN_WEATHER_CHART_CONFIG.pressure.pdfColor.b),
  grid: rgb(0.9, 0.9, 0.9),
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  border: rgb(0.7, 0.7, 0.7),
};

/**
 * Format date for X-axis label in PDF (German format: TT.MM.)
 */
function formatDateShort(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.`;
  }
  return dateKey;
}

/**
 * Draw the complete Pain & Weather chart on a PDF page using smooth Bézier curves.
 * This replaces the old drawCombinedWeatherPainChart with straight lines.
 */
export function drawSmoothPainWeatherChart(
  page: PDFPage,
  data: PainWeatherDataPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont,
  fontBold: PDFFont
) {
  if (data.length === 0) {
    page.drawText('Keine Daten verfügbar', {
      x: x + width / 2 - 50,
      y: y - height / 2,
      size: 10,
      font,
      color: CHART_COLORS.textLight,
    });
    return;
  }

  // Outer frame
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: CHART_COLORS.border,
    borderWidth: 0.5,
  });

  const chartMargin = 50;
  const chartRightMargin = 60;
  const chartWidth = width - chartMargin - chartRightMargin;
  const chartHeight = height - 2 * chartMargin;
  const chartX = x + chartMargin;
  const chartY = y - height + chartMargin;

  // Check for weather data
  const hasTemperature = data.some(d => d.temperature !== null);
  const hasPressure = data.some(d => d.pressure !== null);

  // ─── Legend ───
  const legendY = y - 15;
  const legendItems = [
    { color: CHART_COLORS.pain, label: `${PAIN_WEATHER_CHART_CONFIG.pain.label} (0-10)` },
    ...(hasTemperature ? [{ color: CHART_COLORS.temp, label: `${PAIN_WEATHER_CHART_CONFIG.temperature.label} (°C)` }] : []),
    ...(hasPressure ? [{ color: CHART_COLORS.pressure, label: `${PAIN_WEATHER_CHART_CONFIG.pressure.label} (hPa)` }] : []),
  ];

  let legendX = chartX;
  legendItems.forEach(item => {
    page.drawCircle({ x: legendX, y: legendY, size: 4, color: item.color });
    page.drawText(item.label, { x: legendX + 10, y: legendY - 3, size: 8, font, color: item.color });
    legendX += 10 + item.label.length * 5 + 20;
  });

  // ─── Left Y-Axis: Pain (0-10, fixed) ───
  for (let i = 0; i <= 10; i += 2) {
    const yAxisPos = chartY + (i / 10) * chartHeight;
    page.drawLine({
      start: { x: chartX - 5, y: yAxisPos },
      end: { x: chartX, y: yAxisPos },
      thickness: 0.5,
      color: CHART_COLORS.pain,
    });
    page.drawText(i.toString(), {
      x: chartX - 18,
      y: yAxisPos - 4,
      size: 7,
      font,
      color: CHART_COLORS.pain,
    });
    // Grid lines
    page.drawLine({
      start: { x: chartX, y: yAxisPos },
      end: { x: chartX + chartWidth, y: yAxisPos },
      thickness: 0.3,
      color: CHART_COLORS.grid,
    });
  }

  // ─── Right Y-Axes ───
  const tempRange = computeTempRange(data);
  const pressureRange = computePressureRange(data);

  if (hasTemperature) {
    const range = tempRange.max - tempRange.min || 20;
    for (let i = 0; i <= 5; i++) {
      const val = Math.round(tempRange.min + (range / 5) * i);
      const yAxisPos = chartY + (i / 5) * chartHeight;
      page.drawLine({
        start: { x: chartX + chartWidth, y: yAxisPos },
        end: { x: chartX + chartWidth + 5, y: yAxisPos },
        thickness: 0.5,
        color: CHART_COLORS.temp,
      });
      page.drawText(`${val}`, {
        x: chartX + chartWidth + 8,
        y: yAxisPos - 4,
        size: 7,
        font,
        color: CHART_COLORS.temp,
      });
    }
  }

  if (hasPressure) {
    const range = pressureRange.max - pressureRange.min || 20;
    for (let i = 0; i <= 5; i++) {
      const val = Math.round(pressureRange.min + (range / 5) * i);
      const yAxisPos = chartY + (i / 5) * chartHeight;
      page.drawText(`${val}`, {
        x: chartX + chartWidth + 35,
        y: yAxisPos - 4,
        size: 7,
        font,
        color: CHART_COLORS.pressure,
      });
    }
  }

  // ─── Data point mapping ───
  // Use ALL data points (no subsampling) for smooth curves
  const pointSpacing = chartWidth / (data.length - 1 || 1);

  const painPoints: Point[] = [];
  const tempPoints: Point[] = [];
  const pressurePoints: Point[] = [];

  data.forEach((d, i) => {
    const px = chartX + i * pointSpacing;

    if (d.pain !== null) {
      painPoints.push({ x: px, y: chartY + (d.pain / 10) * chartHeight });
    }

    if (hasTemperature && d.temperature !== null) {
      const range = tempRange.max - tempRange.min || 20;
      const norm = (d.temperature - tempRange.min) / range;
      tempPoints.push({ x: px, y: chartY + norm * chartHeight });
    }

    if (hasPressure && d.pressure !== null) {
      const range = pressureRange.max - pressureRange.min || 20;
      const norm = (d.pressure - pressureRange.min) / range;
      pressurePoints.push({ x: px, y: chartY + norm * chartHeight });
    }
  });

  // ─── Draw smooth curves ───
  drawSmoothLine(page, painPoints, CHART_COLORS.pain, 1.8);
  if (tempPoints.length >= 2) {
    drawSmoothLine(page, tempPoints, CHART_COLORS.temp, 1.3, [4, 2]);
  }
  if (pressurePoints.length >= 2) {
    drawSmoothLine(page, pressurePoints, CHART_COLORS.pressure, 1.3, [6, 3]);
  }

  // ─── Subtle dot markers (matching App's r:1 dots) ───
  painPoints.forEach(p => {
    page.drawCircle({ x: p.x, y: p.y, size: 1.5, color: CHART_COLORS.pain });
  });
  // No dots for weather lines (matching App behavior — dots are very small r:1)

  // ─── X-Axis labels ───
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  data.forEach((d, i) => {
    if (i % labelStep === 0 || i === data.length - 1) {
      const px = chartX + i * pointSpacing;
      page.drawText(formatDateShort(d.dateKey), {
        x: px - 12,
        y: chartY - 15,
        size: 7,
        font,
        color: CHART_COLORS.text,
      });
    }
  });

  // ─── Axis lines ───
  page.drawLine({
    start: { x: chartX, y: chartY },
    end: { x: chartX + chartWidth, y: chartY },
    thickness: 0.5,
    color: CHART_COLORS.border,
  });
  page.drawLine({
    start: { x: chartX, y: chartY },
    end: { x: chartX, y: chartY + chartHeight },
    thickness: 0.5,
    color: CHART_COLORS.border,
  });
}
