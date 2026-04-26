/**
 * Konsistente Farben für das Kopfschmerztagebuch Pie-Chart.
 * Verwendet in: React SVG-Komponente + pdf-lib PDF-Rendering.
 */

/** CSS-Farben für React SVG */
export const PIE_COLORS_CSS = {
  painFree: 'hsl(142 76% 36%)',              // Grün – schmerzfrei
  painNoMedication: 'hsl(38 92% 50%)',       // Orange – Schmerz ohne Akutmedikation
  withMedication: 'hsl(0 84% 60%)',          // Rot – Akutmedikation dokumentiert
  undocumented: 'hsl(var(--muted-foreground) / 0.55)', // Grau – nicht dokumentiert
  /** @deprecated */
  painNoTriptan: 'hsl(38 92% 50%)',
  /** @deprecated */
  triptan: 'hsl(0 84% 60%)',
} as const;

/** Labels auf Deutsch */
export const PIE_LABELS = {
  painFree: 'Schmerzfrei',
  painNoMedication: 'Kopfschmerz ohne Akutmedikation',
  withMedication: 'Kopfschmerz mit Akutmedikation',
  undocumented: 'Nicht dokumentiert',
  /** @deprecated */
  painNoTriptan: 'Kopfschmerz ohne Akutmedikation',
  /** @deprecated */
  triptan: 'Kopfschmerz mit Akutmedikation',
} as const;
