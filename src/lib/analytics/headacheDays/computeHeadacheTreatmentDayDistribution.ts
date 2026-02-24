/**
 * SSOT: Headache & Treatment Day Distribution
 * 
 * Central computation for the donut chart shown across all screens.
 * No screen may compute this independently.
 */

import { isTriptan } from '@/lib/medications/isTriptan';
import { isPainEntry } from '@/lib/diary/isPainEntry';

export type DayClassification = 'painFree' | 'painNoTriptan' | 'triptan';

export interface HeadacheTreatmentDayResult {
  totalDays: number;
  painFreeDays: number;
  painDaysNoTriptan: number;
  triptanDays: number;
  percentages: {
    painFree: number;
    painNoTriptan: number;
    triptan: number;
  };
  byDate: Record<string, DayClassification>;
  /** Debug info (DEV only) */
  debug: {
    from: string;
    to: string;
    totalDays: number;
    entryCount: number;
    minEntryDate: string | null;
    maxEntryDate: string | null;
  };
}

interface EntryForClassification {
  selected_date?: string | null;
  timestamp_created?: string | null;
  pain_level?: string | null;
  medications?: string[] | null;
  entry_kind?: string | null;
}

/** Enumerate all dates [start, end] inclusive as YYYY-MM-DD. */
function enumerateDatesInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return dates;
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** Classify a single day based on its entries. Priority: triptan > pain > painFree */
function classifyDay(entriesForDay: EntryForClassification[]): DayClassification {
  let hasPain = false;
  let hasTriptan = false;

  for (const entry of entriesForDay) {
    if (isPainEntry(entry)) hasPain = true;
    if (entry.medications?.length) {
      for (const med of entry.medications) {
        if (isTriptan(med)) { hasTriptan = true; break; }
      }
    }
    if (hasTriptan) break;
  }

  if (hasTriptan) return 'triptan';
  if (hasPain) return 'painNoTriptan';
  return 'painFree';
}

/** Extract YYYY-MM-DD from an entry. */
function getEntryDate(entry: EntryForClassification): string {
  return entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
}

/**
 * Compute headache & treatment day distribution for a given range.
 * 
 * @param from  YYYY-MM-DD inclusive start
 * @param to    YYYY-MM-DD inclusive end
 * @param entries All entries (will be filtered to range internally)
 */
export function computeHeadacheTreatmentDayDistribution(
  from: string,
  to: string,
  entries: EntryForClassification[],
): HeadacheTreatmentDayResult {
  // Group entries by date
  const entriesByDate = new Map<string, EntryForClassification[]>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let entryCount = 0;

  for (const entry of entries) {
    const date = getEntryDate(entry);
    if (!date || date < from || date > to) continue;
    entryCount++;
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    const existing = entriesByDate.get(date);
    if (existing) existing.push(entry);
    else entriesByDate.set(date, [entry]);
  }

  // Enumerate all calendar days in range
  const allDates = enumerateDatesInclusive(from, to);
  const totalDays = allDates.length;

  // Classify each day
  const byDate: Record<string, DayClassification> = {};
  let painFreeDays = 0;
  let painDaysNoTriptan = 0;
  let triptanDays = 0;

  for (const date of allDates) {
    const dayEntries = entriesByDate.get(date) || [];
    const classification = classifyDay(dayEntries);
    byDate[date] = classification;
    switch (classification) {
      case 'painFree': painFreeDays++; break;
      case 'painNoTriptan': painDaysNoTriptan++; break;
      case 'triptan': triptanDays++; break;
    }
  }

  const pct = (v: number) => totalDays > 0 ? Math.round((v / totalDays) * 1000) / 10 : 0;

  return {
    totalDays,
    painFreeDays,
    painDaysNoTriptan,
    triptanDays,
    percentages: {
      painFree: pct(painFreeDays),
      painNoTriptan: pct(painDaysNoTriptan),
      triptan: pct(triptanDays),
    },
    byDate,
    debug: {
      from,
      to,
      totalDays,
      entryCount,
      minEntryDate: minDate,
      maxEntryDate: maxDate,
    },
  };
}
