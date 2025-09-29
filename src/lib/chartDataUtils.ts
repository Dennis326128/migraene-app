import { format, startOfDay, endOfDay, addDays, parseISO } from "date-fns";
import { MigraineEntry, WeatherData } from "@/types/painApp";

export interface DailySeriesPoint {
  ts: number; // milliseconds since epoch
  pain: number | null;
  temp: number | null;
  pressure: number | null;
  date: string; // YYYY-MM-DD format
  entriesCount: number;
  hasWeather: boolean;
  // Additional metadata for tooltip
  painLevel?: string;
  aura?: string;
  location?: string;
  medications?: number;
  notes?: string;
}

// Simplified type for cleaner API
export type DailyPoint = DailySeriesPoint;

export interface WeatherTimelineEntry {
  date: string;
  temperature_c?: number;
  pressure_mb?: number;
  humidity?: number;
}

// Helper function to convert pain level to numeric score
const painLevelToScore = (level: string): number => {
  switch (level) {
    case "leicht": return 2;
    case "mittel": return 5;
    case "stark": return 7;
    case "sehr_stark": return 9;
    default: return 0;
  }
};

/**
 * Returns time domain for chart X-axis: [from, today]
 */
export function timeDomain(from: Date): [number, number] {
  const start = startOfDay(from).getTime();
  const end = endOfDay(new Date()).getTime(); // Always end at today
  return [start, end];
}

/**
 * Builds a daily time series from migraine entries and weather data
 * Ensures continuous time axis from start to TODAY with null for missing values
 * The 'end' parameter is ignored - series always extends to today
 */
export function buildDailySeries(
  entries: MigraineEntry[],
  start: Date,
  end: Date, // IGNORED: always use today instead
  weatherTimeline: WeatherTimelineEntry[] = []
): DailySeriesPoint[] {
  const startDay = startOfDay(start);
  const endDay = endOfDay(new Date()); // Always end at today, ignore 'end' parameter
  
  // Group entries by day
  const entriesByDay = new Map<string, MigraineEntry[]>();
  entries.forEach(entry => {
    const entryDate = entry.selected_date || new Date(entry.timestamp_created).toISOString().split('T')[0];
    if (entryDate >= format(startDay, 'yyyy-MM-dd') && entryDate <= format(endDay, 'yyyy-MM-dd')) {
      if (!entriesByDay.has(entryDate)) {
        entriesByDay.set(entryDate, []);
      }
      entriesByDay.get(entryDate)!.push(entry);
    }
  });

  // Group weather by day
  const weatherByDay = new Map<string, WeatherTimelineEntry>();
  weatherTimeline.forEach(weather => {
    if (weather.date) {
      weatherByDay.set(weather.date, weather);
    }
  });

  // Generate daily series
  const series: DailySeriesPoint[] = [];
  let current = startDay;

  while (current <= endDay) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayEntries = entriesByDay.get(dateStr) || [];
    const weather = weatherByDay.get(dateStr);

    // Aggregate pain for the day (use max if multiple entries)
    let pain: number | null = null;
    let painLevel: string | undefined;
    let aura: string | undefined;
    let location: string | undefined; 
    let medications = 0;
    let notes: string | undefined;

    if (dayEntries.length > 0) {
      // Sort by time and use the most severe pain level
      const sortedEntries = dayEntries.sort((a, b) => {
        const aTime = a.selected_time || new Date(a.timestamp_created).toTimeString().slice(0, 5);
        const bTime = b.selected_time || new Date(b.timestamp_created).toTimeString().slice(0, 5);
        return bTime.localeCompare(aTime); // Latest first
      });
      
      // Find entry with highest pain level
      const maxPainEntry = dayEntries.reduce((max, entry) => {
        const currentPain = painLevelToScore(entry.pain_level);
        const maxPain = painLevelToScore(max.pain_level);
        return currentPain > maxPain ? entry : max;
      });

      pain = painLevelToScore(maxPainEntry.pain_level);
      painLevel = maxPainEntry.pain_level;
      aura = maxPainEntry.aura_type;
      location = maxPainEntry.pain_location;
      medications = dayEntries.reduce((sum, entry) => sum + (entry.medications?.length || 0), 0);
      notes = sortedEntries[0].notes || undefined; // Use notes from latest entry
    }

    // Aggregate weather for the day (average if multiple readings)
    let temp: number | null = null;
    let pressure: number | null = null;

    if (weather) {
      temp = weather.temperature_c || null;
      pressure = weather.pressure_mb || null;
    }

    series.push({
      ts: current.getTime(),
      pain,
      temp,
      pressure,
      date: dateStr,
      entriesCount: dayEntries.length,
      hasWeather: !!weather,
      painLevel,
      aura,
      location,
      medications,
      notes
    });

    current = addDays(current, 1);
  }

  return series;
}

/**
 * Generates appropriate tick marks for time-based X-axis
 */
export function generateTimeTicks(series: DailySeriesPoint[], maxTicks = 8): number[] {
  if (series.length === 0) return [];
  
  const interval = Math.max(1, Math.ceil(series.length / maxTicks));
  const ticks: number[] = [];
  
  for (let i = 0; i < series.length; i += interval) {
    ticks.push(series[i].ts);
  }
  
  // Always include the last point
  if (series.length > 1 && ticks[ticks.length - 1] !== series[series.length - 1].ts) {
    ticks.push(series[series.length - 1].ts);
  }
  
  return ticks;
}

/**
 * Formats timestamp for display on X-axis
 */
export function formatTimeAxisLabel(timestamp: number, daysDiff: number): string {
  const date = new Date(timestamp);
  
  if (daysDiff <= 7) {
    return format(date, 'EEE dd.MM');
  } else if (daysDiff <= 31) {
    return format(date, 'dd.MM');
  } else if (daysDiff <= 90) {
    return format(date, 'dd.MM');
  } else {
    return format(date, 'MM.yy');
  }
}