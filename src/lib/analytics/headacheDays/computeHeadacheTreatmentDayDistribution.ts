/**
 * SSOT: Headache & Treatment Day Distribution
 * 
 * Central computation for the donut chart shown across all screens.
 * No screen may compute this independently.
 */

import { isGepant, isTriptan } from '@/lib/medications/classifyMedication';

export type DayClassification = 'painFree' | 'painNoMedication' | 'withMedication' | 'undocumented';

export interface HeadacheTreatmentDayResult {
  totalDays: number;
  documentedDays: number;
  painFreeDays: number;
  painDaysNoMedication: number;
  painDaysWithMedication: number;
  undocumentedDays: number;
  /** @deprecated Use painDaysNoMedication. Kept for older call sites. */
  painDaysNoTriptan: number;
  /** True calendar days with at least one real triptan. Do not use for the acute-medication donut. */
  triptanDays: number;
  /** True calendar days with at least one gepant. Do not use for triptan KPIs. */
  gepantDays: number;
  percentages: {
    painFree: number;
    painNoMedication: number;
    withMedication: number;
    undocumented: number;
    /** @deprecated */
    painNoTriptan: number;
    /** True triptan-day percentage on all calendar days. Do not use for the acute-medication donut. */
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

function hasPainLevelAtLeastOne(painLevel: string | number | null | undefined): boolean {
  if (painLevel === null || painLevel === undefined) return false;
  if (typeof painLevel === 'number') return painLevel >= 1;
  const normalized = painLevel.trim().toLowerCase();
  if (!normalized || normalized === '-' || normalized === '0' || normalized === 'keine' || normalized === 'none') return false;
  if (['leicht', 'mittel', 'stark', 'sehr_stark'].includes(normalized)) return true;
  const numeric = Number(normalized.replace(',', '.'));
  return Number.isFinite(numeric) && numeric >= 1;
}

/** Classify a single day based on its entries. Priority: headache with medication > headache without medication > documented pain-free > undocumented */
function classifyDay(entriesForDay: EntryForClassification[]): DayClassification {
  if (entriesForDay.length === 0) return 'undocumented';

  let hasPain = false;
  let hasMedication = false;

  for (const entry of entriesForDay) {
    if (hasPainLevelAtLeastOne(entry.pain_level)) hasPain = true;
    if (entry.medications?.some(med => med.trim().length > 0)) hasMedication = true;
  }

  if (hasPain && hasMedication) return 'withMedication';
  if (hasPain) return 'painNoMedication';
  return 'painFree';
}

function hasTriptan(entriesForDay: EntryForClassification[]): boolean {
  return entriesForDay.some(entry => entry.medications?.some(med => isTriptan(med)) ?? false);
}

function hasGepant(entriesForDay: EntryForClassification[]): boolean {
  return entriesForDay.some(entry => entry.medications?.some(med => isGepant(med)) ?? false);
}

function hasHeadache(entriesForDay: EntryForClassification[]): boolean {
  return entriesForDay.some(entry => hasPainLevelAtLeastOne(entry.pain_level));
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
  let painDaysNoMedication = 0;
  let painDaysWithMedication = 0;
  let undocumentedDays = 0;
  let triptanDays = 0;
  let gepantDays = 0;
  let painDaysNoTriptan = 0;

  for (const date of allDates) {
    const dayEntries = entriesByDate.get(date) || [];
    const classification = classifyDay(dayEntries);
    byDate[date] = classification;
    const dayHasTriptan = hasTriptan(dayEntries);
    const dayHasGepant = hasGepant(dayEntries);
    if (dayHasTriptan) triptanDays++;
    if (dayHasGepant) gepantDays++;
    if (hasHeadache(dayEntries) && !dayHasTriptan) painDaysNoTriptan++;
    switch (classification) {
      case 'painFree': painFreeDays++; break;
      case 'painNoMedication': painDaysNoMedication++; break;
      case 'withMedication': painDaysWithMedication++; break;
      case 'undocumented': undocumentedDays++; break;
    }
  }

  const pct = (v: number) => totalDays > 0 ? Math.round((v / totalDays) * 1000) / 10 : 0;

  return {
    totalDays,
    documentedDays: totalDays - undocumentedDays,
    painFreeDays,
    painDaysNoMedication,
    painDaysWithMedication,
    undocumentedDays,
    painDaysNoTriptan,
    triptanDays,
    gepantDays,
    percentages: {
      painFree: pct(painFreeDays),
      painNoMedication: pct(painDaysNoMedication),
      withMedication: pct(painDaysWithMedication),
      undocumented: pct(undocumentedDays),
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
