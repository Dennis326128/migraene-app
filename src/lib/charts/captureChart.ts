/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HTML2CANVAS CHART CAPTURE UTILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Renders the TimeSeriesChart in a hidden DOM container, captures it
 * as a high-resolution PNG via html2canvas, returns Uint8Array for PDF.
 * 
 * Falls back gracefully — if capture fails, PDF uses Bézier fallback.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import React from 'react';

/**
 * Capture the TimeSeriesChart component as a high-resolution PNG.
 * 
 * @param ChartComponent - The React chart component to render
 * @param props - Props to pass to the chart
 * @param options - Capture options
 * @returns PNG bytes as Uint8Array, or null if capture fails
 */
export async function captureChartAsImage(
  ChartComponent: React.ComponentType<any>,
  props: Record<string, any>,
  options: {
    width?: number;
    height?: number;
    scale?: number;
  } = {}
): Promise<Uint8Array | null> {
  const { width = 800, height = 300, scale = 3 } = options;

  // Create hidden container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: ${width}px;
    height: ${height}px;
    background: white;
    overflow: hidden;
    z-index: -1;
  `;
  document.body.appendChild(container);

  try {
    // Render chart into hidden container
    const root = createRoot(container);
    
    await new Promise<void>((resolve) => {
      root.render(
        React.createElement(
          'div',
          { style: { width: `${width}px`, height: `${height}px` } },
          React.createElement(ChartComponent, props)
        )
      );
      // Wait for render + Recharts animation
      setTimeout(resolve, 500);
    });

    // Capture with html2canvas at high DPI
    const canvas = await html2canvas(container, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width,
      height,
    });

    // Convert to PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });

    root.unmount();

    if (!blob) {
      console.warn('[ChartCapture] Failed to create blob');
      return null;
    }

    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn('[ChartCapture] Capture failed:', error);
    return null;
  } finally {
    // Cleanup
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
}
