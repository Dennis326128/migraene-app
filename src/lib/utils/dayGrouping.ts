/**
 * Pure, testable helpers for grouping pain entries by day.
 * SSOT for day-grouping logic used by EntriesList and tests.
 */
import { normalizePainLevel } from './pain';

export interface EntryLike {
  id: string | number;
  selected_date?: string | null;
  selected_time?: string | null;
  timestamp_created?: string | null;
  pain_level: string | number;
  medications?: string[] | null;
  notes?: string | null;
}

export interface DayGroupResult<T extends EntryLike> {
  date: string;           // YYYY-MM-DD
  maxPain: number;
  entryCount: number;
  hasMedication: boolean;
  entries: T[];
}

/**
 * Determine the calendar date for an entry.
 * Priority: selected_date > timestamp_created date part.
 * Returns null if neither is available.
 */
export function getEntryDate(entry: EntryLike): string | null {
  if (entry.selected_date) return entry.selected_date;
  if (entry.timestamp_created) return entry.timestamp_created.split('T')[0];
  return null;
}

/**
 * Group entries by calendar date, compute maxPain per day.
 * Returns groups sorted descending by date.
 * Entries within each day are sorted ascending by time.
 */
export function groupEntriesByDay<T extends EntryLike>(entries: T[]): DayGroupResult<T>[] {
  const grouped = new Map<string, T[]>();

  for (const entry of entries) {
    const date = getEntryDate(entry);
    if (!date) continue;

    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(entry);
  }

  const groups: DayGroupResult<T>[] = [];

  for (const [date, dayEntries] of grouped) {
    // Sort entries within day by time ascending
    dayEntries.sort((a, b) => {
      const timeA = a.selected_time || '';
      const timeB = b.selected_time || '';
      return timeA.localeCompare(timeB);
    });

    const { maxPain, hasMedication } = computeDayStats(dayEntries);

    groups.push({
      date,
      maxPain,
      entryCount: dayEntries.length,
      hasMedication,
      entries: dayEntries,
    });
  }

  // Sort days descending
  groups.sort((a, b) => b.date.localeCompare(a.date));
  return groups;
}

/**
 * Compute maxPain and hasMedication for a set of entries (single day).
 * Uses the shared SSOT normalizePainLevel.
 */
export function computeDayStats(entries: EntryLike[]): { maxPain: number; hasMedication: boolean } {
  let maxPain = 0;
  let hasMedication = false;

  for (const entry of entries) {
    const pain = normalizePainLevel(entry.pain_level);
    if (pain > maxPain) maxPain = pain;
    if (entry.medications && entry.medications.length > 0) hasMedication = true;
  }

  return { maxPain, hasMedication };
}
