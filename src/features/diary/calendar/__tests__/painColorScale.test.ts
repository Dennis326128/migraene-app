import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateColorScale,
  getColorForPain,
  shouldUseDarkText,
  normalizePainLevel,
  clearColorCache,
  getPainLegend
} from '../painColorScale';

// Clear cache before each test
beforeEach(() => {
  clearColorCache();
});

describe('generateColorScale', () => {
  it('generates exactly 11 colors for levels 0-10', () => {
    const colors = generateColorScale();
    expect(colors).toHaveLength(11);
  });

  it('all colors are valid HSL strings', () => {
    const colors = generateColorScale();
    const hslRegex = /^hsl\(\d+ \d+% \d+%\)$/;
    
    colors.forEach((color, i) => {
      expect(color).toMatch(hslRegex);
    });
  });

  it('returns cached result on subsequent calls', () => {
    const colors1 = generateColorScale();
    const colors2 = generateColorScale();
    expect(colors1).toBe(colors2); // Same reference
  });
});

describe('getColorForPain', () => {
  it('returns muted color for null', () => {
    const color = getColorForPain(null);
    expect(color).toContain('muted');
  });

  it('returns muted color for undefined', () => {
    const color = getColorForPain(undefined as any);
    expect(color).toContain('muted');
  });

  it('returns muted color for NaN', () => {
    const color = getColorForPain(NaN);
    expect(color).toContain('muted');
  });

  it('clamps values below 0 to level 0', () => {
    const colorNeg = getColorForPain(-5);
    const color0 = getColorForPain(0);
    expect(colorNeg).toBe(color0);
  });

  it('clamps values above 10 to level 10', () => {
    const color15 = getColorForPain(15);
    const color10 = getColorForPain(10);
    expect(color15).toBe(color10);
  });

  it('rounds fractional values', () => {
    const color24 = getColorForPain(2.4);
    const color2 = getColorForPain(2);
    expect(color24).toBe(color2);

    const color26 = getColorForPain(2.6);
    const color3 = getColorForPain(3);
    expect(color26).toBe(color3);
  });

  it('returns different colors for different pain levels', () => {
    const color0 = getColorForPain(0);
    const color5 = getColorForPain(5);
    const color10 = getColorForPain(10);
    
    expect(color0).not.toBe(color5);
    expect(color5).not.toBe(color10);
    expect(color0).not.toBe(color10);
  });
});

describe('shouldUseDarkText', () => {
  it('returns true for levels 0-4 (light backgrounds)', () => {
    expect(shouldUseDarkText(0)).toBe(true);
    expect(shouldUseDarkText(1)).toBe(true);
    expect(shouldUseDarkText(2)).toBe(true);
    expect(shouldUseDarkText(3)).toBe(true);
    expect(shouldUseDarkText(4)).toBe(true);
  });

  it('returns false for levels 5-10 (dark backgrounds)', () => {
    expect(shouldUseDarkText(5)).toBe(false);
    expect(shouldUseDarkText(6)).toBe(false);
    expect(shouldUseDarkText(7)).toBe(false);
    expect(shouldUseDarkText(8)).toBe(false);
    expect(shouldUseDarkText(9)).toBe(false);
    expect(shouldUseDarkText(10)).toBe(false);
  });

  it('returns false for null', () => {
    expect(shouldUseDarkText(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(shouldUseDarkText(undefined as any)).toBe(false);
  });
});

describe('normalizePainLevel', () => {
  it('returns null for null input', () => {
    expect(normalizePainLevel(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizePainLevel(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizePainLevel('')).toBeNull();
  });

  it('parses numeric strings 0-10', () => {
    expect(normalizePainLevel('0')).toBe(0);
    expect(normalizePainLevel('5')).toBe(5);
    expect(normalizePainLevel('10')).toBe(10);
  });

  it('returns null for out-of-range numbers', () => {
    expect(normalizePainLevel('-1')).toBeNull();
    expect(normalizePainLevel('11')).toBeNull();
    expect(normalizePainLevel('100')).toBeNull();
  });

  it('maps "keine" to 0', () => {
    expect(normalizePainLevel('keine')).toBe(0);
    expect(normalizePainLevel('Keine')).toBe(0);
    expect(normalizePainLevel('KEINE')).toBe(0);
  });

  it('maps "leicht" to 2', () => {
    expect(normalizePainLevel('leicht')).toBe(2);
    expect(normalizePainLevel('Leicht')).toBe(2);
  });

  it('maps "mittel" to 5', () => {
    expect(normalizePainLevel('mittel')).toBe(5);
    expect(normalizePainLevel('Mittel')).toBe(5);
  });

  it('maps "stark" to 8', () => {
    expect(normalizePainLevel('stark')).toBe(8);
    expect(normalizePainLevel('Stark')).toBe(8);
  });

  it('maps "sehr_stark" and "sehr stark" to 10', () => {
    expect(normalizePainLevel('sehr_stark')).toBe(10);
    expect(normalizePainLevel('sehr stark')).toBe(10);
    expect(normalizePainLevel('Sehr Stark')).toBe(10);
  });

  it('handles whitespace', () => {
    expect(normalizePainLevel('  5  ')).toBe(5);
    expect(normalizePainLevel(' mittel ')).toBe(5);
  });

  it('returns null for unknown text values', () => {
    expect(normalizePainLevel('unknown')).toBeNull();
    expect(normalizePainLevel('extreme')).toBeNull();
  });
});

describe('getPainLegend', () => {
  it('returns 11 legend items', () => {
    const legend = getPainLegend();
    expect(legend).toHaveLength(11);
  });

  it('has correct levels 0-10', () => {
    const legend = getPainLegend();
    legend.forEach((item, i) => {
      expect(item.level).toBe(i);
    });
  });

  it('has labels for 0, 5, and 10', () => {
    const legend = getPainLegend();
    expect(legend[0].label).toBe('0');
    expect(legend[5].label).toBe('5');
    expect(legend[10].label).toBe('10');
  });

  it('colors match generateColorScale', () => {
    const legend = getPainLegend();
    const colors = generateColorScale();
    
    legend.forEach((item, i) => {
      expect(item.color).toBe(colors[i]);
    });
  });
});

describe('clearColorCache', () => {
  it('clears the cache so new colors are generated', () => {
    const colors1 = generateColorScale();
    clearColorCache();
    const colors2 = generateColorScale();
    
    // Should still be equal in content but different references
    expect(colors1).not.toBe(colors2);
    expect(colors1).toEqual(colors2);
  });
});
