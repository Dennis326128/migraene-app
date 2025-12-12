/**
 * Pain Color Scale - Maps pain levels 0-10 to colors using CSS variables
 * Interpolates between pain-light, pain-medium, pain-strong, pain-severe
 */

// Get HSL values from CSS variables
function getHSLFromCSSVar(varName: string): { h: number; s: number; l: number } | null {
  if (typeof window === 'undefined') return null;
  
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  
  if (!value) return null;
  
  // Parse "142 76% 36%" format
  const parts = value.split(/\s+/);
  if (parts.length >= 3) {
    return {
      h: parseFloat(parts[0]),
      s: parseFloat(parts[1]),
      l: parseFloat(parts[2])
    };
  }
  return null;
}

// Linear interpolation between two HSL colors
function interpolateHSL(
  color1: { h: number; s: number; l: number },
  color2: { h: number; s: number; l: number },
  t: number
): { h: number; s: number; l: number } {
  // For hue, take shortest path
  let hDiff = color2.h - color1.h;
  if (Math.abs(hDiff) > 180) {
    if (hDiff > 0) hDiff -= 360;
    else hDiff += 360;
  }
  
  return {
    h: (color1.h + hDiff * t + 360) % 360,
    s: color1.s + (color2.s - color1.s) * t,
    l: color1.l + (color2.l - color1.l) * t
  };
}

// Default fallback colors if CSS vars are unavailable
const FALLBACK_COLORS: { h: number; s: number; l: number }[] = [
  { h: 142, s: 76, l: 36 },  // pain-light (green)
  { h: 45, s: 93, l: 47 },   // pain-medium (yellow)
  { h: 24, s: 100, l: 50 },  // pain-strong (orange)
  { h: 0, s: 84, l: 60 }     // pain-severe (red)
];

// Get base colors from CSS or fallback
function getBaseColors(): { h: number; s: number; l: number }[] {
  const painLight = getHSLFromCSSVar('--pain-light');
  const painMedium = getHSLFromCSSVar('--pain-medium');
  const painStrong = getHSLFromCSSVar('--pain-strong');
  const painSevere = getHSLFromCSSVar('--pain-severe');
  
  return [
    painLight || FALLBACK_COLORS[0],
    painMedium || FALLBACK_COLORS[1],
    painStrong || FALLBACK_COLORS[2],
    painSevere || FALLBACK_COLORS[3]
  ];
}

// Generate 11 colors for pain levels 0-10
let cachedColorScale: string[] | null = null;

export function generateColorScale(): string[] {
  if (cachedColorScale) return cachedColorScale;
  
  const baseColors = getBaseColors();
  const colors: string[] = [];
  
  for (let level = 0; level <= 10; level++) {
    let color: { h: number; s: number; l: number };
    
    if (level <= 3) {
      // 0-3: interpolate between pain-light and pain-medium
      const t = level / 3;
      color = interpolateHSL(baseColors[0], baseColors[1], t);
    } else if (level <= 6) {
      // 4-6: interpolate between pain-medium and pain-strong
      const t = (level - 3) / 3;
      color = interpolateHSL(baseColors[1], baseColors[2], t);
    } else {
      // 7-10: interpolate between pain-strong and pain-severe
      const t = (level - 6) / 4;
      color = interpolateHSL(baseColors[2], baseColors[3], t);
    }
    
    colors.push(`hsl(${Math.round(color.h)} ${Math.round(color.s)}% ${Math.round(color.l)}%)`);
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
