/**
 * Single Source of Truth für die Tages-Klassifikation im Kopfschmerztagebuch.
 * 
 * Jeder Tag im Zeitraum wird genau EINMAL klassifiziert:
 *   ROT   = Triptan genommen (höchste Priorität)
 *   ORANGE = Schmerz dokumentiert, aber OHNE Triptan
 *   GRÜN  = kein dokumentierter Schmerz
 * 
 * Summe: grün + orange + rot === totalDays (immer!)
 */

import { isTriptan } from '@/lib/medications/isTriptan';

export type DayClassification = 'painFree' | 'painNoTriptan' | 'triptan';

export interface DayBucketsResult {
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
}

interface EntryForBuckets {
  selected_date?: string | null;
  timestamp_created?: string | null;
  pain_level?: string | null;
  medications?: string[] | null;
}

/**
 * Erzeugt ein Array aller Datumsstrings (YYYY-MM-DD) im Bereich [start, end] inklusiv.
 */
export function enumerateDatesInclusive(startDate: string, endDate: string): string[] {
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

/**
 * Bestimmt die Klassifikation eines Tages anhand seiner Einträge.
 */
export function classifyDay(entriesForDay: EntryForBuckets[]): DayClassification {
  let hasPain = false;
  let hasTriptan = false;

  for (const entry of entriesForDay) {
    // Schmerztag: pain_level existiert UND ist nicht "-"
    if (entry.pain_level && entry.pain_level !== '-') {
      hasPain = true;
    }
    // Triptan-Tag: mindestens ein Medikament ist ein Triptan
    if (entry.medications && entry.medications.length > 0) {
      for (const med of entry.medications) {
        if (isTriptan(med)) {
          hasTriptan = true;
          break;
        }
      }
    }
    // Beide gefunden? Priorität ist klar → ROT
    if (hasTriptan) break;
  }

  if (hasTriptan) return 'triptan';
  if (hasPain) return 'painNoTriptan';
  return 'painFree';
}

/**
 * Berechnet die Tages-Buckets für einen Zeitraum.
 * 
 * @param startDate YYYY-MM-DD (inklusiv)
 * @param endDate   YYYY-MM-DD (inklusiv)
 * @param entries   Alle Einträge im Zeitraum
 */
export function computeDiaryDayBuckets(args: {
  startDate: string;
  endDate: string;
  entries: EntryForBuckets[];
}): DayBucketsResult {
  const { startDate, endDate, entries } = args;
  
  // 1. Alle Tage im Zeitraum aufzählen
  const allDates = enumerateDatesInclusive(startDate, endDate);
  const totalDays = allDates.length;
  
  // 2. Entries nach Datum gruppieren
  const entriesByDate = new Map<string, EntryForBuckets[]>();
  for (const entry of entries) {
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0] || '';
    if (!date) continue;
    const existing = entriesByDate.get(date);
    if (existing) {
      existing.push(entry);
    } else {
      entriesByDate.set(date, [entry]);
    }
  }
  
  // 3. Jeden Tag klassifizieren
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
  
  // 4. Prozente (sicher gegen totalDays === 0)
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
  };
}
