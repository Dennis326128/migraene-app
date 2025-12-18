/**
 * Pain Color Scale - Clean Orange→Red Heatmap
 * 
 * Design goals:
 * - Low pain (0-3): Neutral/dark (no orange tint)
 * - Medium pain (4-7): Amber/orange gradient
 * - High pain (8-10): Red, with 10 being bright alarm red
 * - Good contrast for text readability
 */

// Direct hex colors for predictable results
const PAIN_COLORS_HEX: Record<number, string> = {
  0: 'rgba(255, 255, 255, 0.03)',  // Nearly transparent
  1: '#2a2f36',  // Neutral dark, minimal warm
  2: '#333842',  // Neutral dark
  3: '#3d4350',  // Neutral dark, slightly lighter
  4: '#fbbf24',  // amber-400
  5: '#f59e0b',  // amber-500
  6: '#f97316',  // orange-500
  7: '#fb5a3c',  // orange-red transition
  8: '#ef4444',  // red-500
  9: '#dc2626',  // red-600
  10: '#ff2d2d', // Bright alarm red
};

// Generate 11 colors for pain levels 0-10
let cachedColorScale: string[] | null = null;

export function generateColorScale(): string[] {
  if (cachedColorScale) return cachedColorScale;
  
  const colors: string[] = [];
  
  for (let level = 0; level <= 10; level++) {
    colors.push(PAIN_COLORS_HEX[level]);
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

// Get text color for contrast on pain backgrounds
export function getTextColorForPain(painLevel: number | null): string {
  if (painLevel === null || painLevel === undefined) return '#fff';
  
  // 0-3: Light gray text on dark neutral backgrounds
  // 4+: White text on colored backgrounds
  return painLevel <= 3 ? '#cbd5e1' : '#ffffff';
}

// Determine if dark text should be used (kept for backwards compat, but now unused)
export function shouldUseDarkText(painLevel: number | null): boolean {
  // All backgrounds now use light text
  return false;
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
