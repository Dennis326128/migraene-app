/**
 * Konsistente Farben für das Kopfschmerztagebuch Pie-Chart.
 * Verwendet in: React SVG-Komponente + pdf-lib PDF-Rendering.
 */

/** CSS-Farben für React SVG */
export const PIE_COLORS_CSS = {
  painFree: '#16a34a',       // Grün – schmerzfrei
  painNoTriptan: '#f59e0b',  // Orange – Schmerz ohne Triptan
  triptan: '#ef4444',        // Rot – Triptan genommen
} as const;

/** Labels auf Deutsch */
export const PIE_LABELS = {
  painFree: 'Schmerzfrei',
  painNoTriptan: 'Schmerz ohne Triptan',
  triptan: 'Tage mit Triptan',
} as const;
