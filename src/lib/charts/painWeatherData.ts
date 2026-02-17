/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH: Pain & Weather Chart Data Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Used by:
 * - App TimeSeriesChart (React/Recharts)
 * - PDF report (pdf-lib with Bézier curves)
 * - Future: Website share (readonly)
 * 
 * This module handles:
 * - Pain level normalization
 * - Daily aggregation (MAX pain per day)
 * - Weather data merging
 * - Chart config (colors, labels, axis settings)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { format, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PainWeatherDataPoint {
  /** Date string in format 'yyyy-MM-dd' */
  dateKey: string;
  /** Display label e.g. '01.03' */
  dateLabel: string;
  /** Timestamp for X-axis numeric scale */
  ts: number;
  /** Max pain level for the day (0-10), null if no data */
  pain: number | null;
  /** Temperature in °C, null if unavailable */
  temperature: number | null;
  /** Pressure in hPa, null if unavailable */
  pressure: number | null;
  /** Whether there was an entry on this day */
  hasEntry: boolean;
}

export interface PainWeatherSeriesInput {
  entries: Array<{
    selected_date?: string;
    timestamp_created?: string;
    pain_level: string | number;
  }>;
  weatherByDate: Map<string, { temp: number | null; pressure: number | null }>;
  from: Date;
  to: Date;
  /** Date of earliest entry - pain is null before this */
  earliestEntryDate?: Date | null;
}

export interface PainWeatherChartConfig {
  pain: { label: string; color: string; pdfColor: { r: number; g: number; b: number } };
  temperature: { label: string; color: string; pdfColor: { r: number; g: number; b: number } };
  pressure: { label: string; color: string; pdfColor: { r: number; g: number; b: number } };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unified chart configuration — colors, labels, PDF equivalents.
 * CSS variables are resolved at render time in the App.
 * PDF uses explicit RGB values matching the dark theme.
 */
export const PAIN_WEATHER_CHART_CONFIG: PainWeatherChartConfig = {
  pain: {
    label: 'Schmerz',
    color: 'hsl(var(--chart-1))',
    pdfColor: { r: 0.93, g: 0.27, b: 0.27 },
  },
  temperature: {
    label: 'Temperatur',
    color: 'hsl(var(--chart-2))',
    pdfColor: { r: 0.3, g: 0.6, b: 0.9 },
  },
  pressure: {
    label: 'Luftdruck',
    color: 'hsl(var(--chart-3))',
    pdfColor: { r: 0.2, g: 0.7, b: 0.4 },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PAIN LEVEL NORMALIZATION (single source of truth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize pain level from various formats to 0-10 scale.
 * Handles: numeric, German descriptors, string numbers.
 */
export function normalizePainLevel(level: string | number | undefined | null): number | null {
  if (level === null || level === undefined) return null;

  if (typeof level === 'number') {
    return Math.max(0, Math.min(10, level));
  }

  const levelStr = String(level).toLowerCase().trim().replace(/_/g, ' ');

  const mapping: Record<string, number> = {
    'keine': 0,
    'leicht': 2,
    'schwach': 2,
    'gering': 2,
    'mittel': 5,
    'moderat': 5,
    'mäßig': 5,
    'stark': 7,
    'heftig': 8,
    'sehr stark': 9,
    'extrem': 10,
    'unerträglich': 10,
  };

  // Try mapping with includes for fuzzy matching (e.g. "sehr_stark")
  if (levelStr.includes('sehr') && levelStr.includes('stark')) return 9;
  if (mapping[levelStr] !== undefined) return mapping[levelStr];

  // Partial matches for PDF report compatibility
  if (levelStr.includes('stark')) return 7;
  if (levelStr.includes('mittel')) return 5;
  if (levelStr.includes('leicht')) return 2;

  const parsed = parseInt(levelStr);
  if (!isNaN(parsed)) return Math.max(0, Math.min(10, parsed));

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the daily data series for the Pain & Weather chart.
 * This is the SINGLE SOURCE OF TRUTH used by App, PDF, and future Website.
 */
export function buildPainWeatherSeries(input: PainWeatherSeriesInput): PainWeatherDataPoint[] {
  const { entries, weatherByDate, from, to, earliestEntryDate } = input;

  const days = eachDayOfInterval({ start: startOfDay(from), end: endOfDay(to) });

  // Group entries by date
  const entriesByDate = new Map<string, Array<{ pain_level: string | number }>>();
  entries.forEach(entry => {
    const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
    if (entryDate) {
      const dateKey = format(new Date(entryDate), 'yyyy-MM-dd');
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, []);
      }
      entriesByDate.get(dateKey)!.push(entry);
    }
  });

  return days.map(day => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayEntries = entriesByDate.get(dateKey) || [];
    const weather = weatherByDate.get(dateKey);

    // Calculate max pain level for the day
    let maxPain: number | null = null;

    if (earliestEntryDate && day >= earliestEntryDate) {
      if (dayEntries.length > 0) {
        const painLevels = dayEntries
          .map(entry => normalizePainLevel(entry.pain_level))
          .filter((p): p is number => p !== null);
        maxPain = painLevels.length > 0 ? Math.max(...painLevels) : 0;
      } else {
        maxPain = 0; // No entries after earliest → pain-free day
      }
    }
    // Before earliest entry: pain stays null (no data)

    return {
      dateKey,
      dateLabel: format(day, 'dd.MM'),
      ts: day.getTime(),
      pain: maxPain,
      temperature: weather?.temp ?? null,
      pressure: weather?.pressure ?? null,
      hasEntry: dayEntries.length > 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute dynamic temperature axis range with padding.
 */
export function computeTempRange(data: PainWeatherDataPoint[]): { min: number; max: number } {
  const temps = data.map(d => d.temperature).filter((t): t is number => t !== null);
  if (temps.length === 0) return { min: -10, max: 35 };
  return {
    min: Math.floor(Math.min(...temps) - 5),
    max: Math.ceil(Math.max(...temps) + 5),
  };
}

/**
 * Compute dynamic pressure axis range with padding.
 */
export function computePressureRange(data: PainWeatherDataPoint[]): { min: number; max: number } {
  const pressures = data.map(d => d.pressure).filter((p): p is number => p !== null && p > 0);
  if (pressures.length === 0) return { min: 990, max: 1030 };
  return {
    min: Math.floor(Math.min(...pressures) - 5),
    max: Math.ceil(Math.max(...pressures) + 5),
  };
}

/**
 * Generate evenly-spaced X-axis tick timestamps.
 */
export function computeXAxisTicks(data: PainWeatherDataPoint[], maxTicks: number): number[] {
  if (data.length === 0) return [];

  const step = Math.max(1, Math.floor(data.length / maxTicks));
  const ticks: number[] = [];

  for (let i = 0; i < data.length; i += step) {
    ticks.push(data[i].ts);
  }

  // Always include the last day
  const lastTs = data[data.length - 1]?.ts;
  if (lastTs && !ticks.includes(lastTs)) {
    ticks.push(lastTs);
  }

  return ticks;
}
