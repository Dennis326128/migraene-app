/**
 * Pain Color Scale - Migraine-friendly palette
 * 
 * Design goals:
 * - Low pain (0-3): Cool, calming colors (blue-gray)
 * - Medium pain (4-6): Neutral transition (sand/beige, NOT orange)
 * - High pain (7-8): Warm but dark (dark red/reddish brown)
 * - Severe pain (9-10): Clear warning (bright red)
 * - Good contrast for dark mode text readability
 */

// Direct color definitions - no CSS variable dependency for predictable results
// All colors in HSL format: { h: hue (0-360), s: saturation (0-100), l: lightness (0-100) }

const PAIN_COLORS: Record<number, { h: number; s: number; l: number }> = {
  // 0: Almost invisible / very subtle neutral
  0: { h: 220, s: 10, l: 25 },  // Very dark blue-gray, barely visible
  
  // 1-3: Cool, desaturated blue-gray (calming)
  1: { h: 210, s: 15, l: 35 },  // Dark cool gray
  2: { h: 205, s: 18, l: 42 },  // Cool gray
  3: { h: 200, s: 20, l: 48 },  // Light cool gray
  
  // 4-6: Neutral transition (sand/beige/warm gray - NOT orange)
  4: { h: 45, s: 15, l: 50 },   // Muted sand
  5: { h: 40, s: 22, l: 52 },   // Warm sand
  6: { h: 35, s: 28, l: 48 },   // Deeper sand/tan
  
  // 7-8: Warm but dark (reddish brown)
  7: { h: 15, s: 45, l: 40 },   // Dark reddish brown
  8: { h: 8, s: 55, l: 38 },    // Deep red-brown
  
  // 9-10: Clear warning red
  9: { h: 0, s: 70, l: 45 },    // Strong red
  10: { h: 0, s: 85, l: 50 },   // Bright signal red
};

// Generate 11 colors for pain levels 0-10
let cachedColorScale: string[] | null = null;

export function generateColorScale(): string[] {
  if (cachedColorScale) return cachedColorScale;
  
  const colors: string[] = [];
  
  for (let level = 0; level <= 10; level++) {
    const color = PAIN_COLORS[level];
    colors.push(`hsl(${color.h} ${color.s}% ${color.l}%)`);
  }
  
  cachedColorScale = colors;
  return colors;
}

// Get color for a specific pain level
export function getColorForPain(painLevel: number | null): string {
  if (painLevel === null || painLevel === undefined || isNaN(painLevel)) {
    return 'hsl(var(--muted) / 0.4)'; // Unknown/neutral
  }
  
  const level = Math.max(0, Math.min(10, Math.round(painLevel)));
  const colors = generateColorScale();
  return colors[level];
}

// Determine if dark text should be used on a pain color background
// Based on lightness and saturation of the color
export function shouldUseDarkText(painLevel: number | null): boolean {
  if (painLevel === null || painLevel === undefined) return false;
  
  // With our new palette:
  // 0-3: Dark backgrounds (blue-gray) -> light text
  // 4-6: Medium backgrounds (sand) -> dark text works
  // 7-10: Dark backgrounds (red tones) -> light text
  return painLevel >= 4 && painLevel <= 6;
}

// Check if this is a severe pain level (for visual emphasis)
export function isSeverePain(painLevel: number | null): boolean {
  if (painLevel === null || painLevel === undefined) return false;
  return painLevel >= 9;
}

// Get legend data for UI
export interface LegendItem {
  level: number;
  color: string;
  label: string;
}

export function getPainLegend(): LegendItem[] {
  const colors = generateColorScale();
  
  return [
    { level: 0, color: colors[0], label: '0' },
    { level: 1, color: colors[1], label: '' },
    { level: 2, color: colors[2], label: '' },
    { level: 3, color: colors[3], label: '' },
    { level: 4, color: colors[4], label: '' },
    { level: 5, color: colors[5], label: '5' },
    { level: 6, color: colors[6], label: '' },
    { level: 7, color: colors[7], label: '' },
    { level: 8, color: colors[8], label: '' },
    { level: 9, color: colors[9], label: '' },
    { level: 10, color: colors[10], label: '10' },
  ];
}

// Normalize pain_level string to 0-10 number
export function normalizePainLevel(painLevel: string | null | undefined): number | null {
  if (!painLevel) return null;
  
  const level = painLevel.toLowerCase().trim();
  
  // Numeric values
  const numericValue = parseInt(level, 10);
  if (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 10) {
    return numericValue;
  }
  
  // Text values
  const textMapping: Record<string, number> = {
    'keine': 0,
    'leicht': 2,
    'mittel': 5,
    'stark': 8,
    'sehr_stark': 10,
    'sehr stark': 10
  };
  
  if (level in textMapping) {
    return textMapping[level];
  }
  
  return null;
}

// Clear cache (useful for theme changes)
export function clearColorCache(): void {
  cachedColorScale = null;
}
