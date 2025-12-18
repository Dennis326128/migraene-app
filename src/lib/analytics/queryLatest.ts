/**
 * Query Latest Functions
 * Für "Wann zuletzt...?" Voice-Queries
 * 
 * Beispiele:
 * - "Wann habe ich zuletzt ein Triptan genommen?" -> getLatestMedicationIntake
 * - "Zeig mir meinen letzten Eintrag" -> getLatestEntry
 * - "Öffne den letzten Eintrag mit Sumatriptan" -> getLatestEntryWithMedication
 */

import { supabase } from '@/integrations/supabase/client';
import { deriveEffectCategory, type EffectCategory } from '@/lib/medicationLookup';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ============================================
// Types
// ============================================

export interface LatestEntryResult {
  success: boolean;
  entry?: {
    id: number;
    occurredAt: Date;
    occurredAtFormatted: string;
    painLevel: string;
    painLocation: string | null;
    medications: string[];
    notes: string | null;
    auraType: string;
  };
  error?: string;
}

export interface LatestMedicationIntakeResult {
  success: boolean;
  intake?: {
    entryId: number;
    occurredAt: Date;
    occurredAtFormatted: string;
    medicationMatched: string;
    allMedications: string[];
    painLevel: string;
  };
  matchInfo?: {
    searchTerm: string;
    matchType: 'exact' | 'fuzzy' | 'category';
    category?: EffectCategory;
  };
  error?: string;
}

export interface EntryFilter {
  medicationName?: string;
  medicationCategory?: EffectCategory;
  minPainLevel?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================
// Helpers
// ============================================

const TIMEZONE = 'Europe/Berlin';

/**
 * Normalisiert Medikamentennamen für Vergleiche
 */
function normalizeMedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+\s*(mg|ml|g|µg|mcg|tabletten?|kapseln?|stück|st\.?|tab\.?)/gi, '')
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prüft ob zwei Medikamentennamen matchen (robust)
 */
function matchesMedName(entryMed: string, searchMed: string): boolean {
  const entryNorm = normalizeMedName(entryMed);
  const searchNorm = normalizeMedName(searchMed);
  
  // Exakter Match
  if (entryNorm === searchNorm) return true;
  
  // Enthält den Suchbegriff
  if (entryNorm.includes(searchNorm)) return true;
  
  // Suchbegriff enthält den Eintrag (für Kurzformen)
  if (searchNorm.includes(entryNorm) && entryNorm.length >= 4) return true;
  
  // Levenshtein für Tippfehler (nur bei kurzen Namen)
  if (searchNorm.length <= 12 && entryNorm.length <= 12) {
    const distance = levenshteinDistance(entryNorm, searchNorm);
    const maxLen = Math.max(entryNorm.length, searchNorm.length);
    if (distance <= Math.ceil(maxLen * 0.2)) return true;
  }
  
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Bestimmt den Zeitpunkt eines Eintrags
 * Priorität: selected_date + selected_time, dann timestamp_created
 */
function getEntryOccurredAt(entry: {
  selected_date?: string | null;
  selected_time?: string | null;
  timestamp_created?: string | null;
}): Date {
  if (entry.selected_date && entry.selected_time) {
    return new Date(`${entry.selected_date}T${entry.selected_time}`);
  }
  if (entry.selected_date) {
    return new Date(`${entry.selected_date}T12:00:00`);
  }
  if (entry.timestamp_created) {
    return parseISO(entry.timestamp_created);
  }
  return new Date();
}

/**
 * Formatiert Datum/Zeit für die Anzeige
 */
function formatOccurredAt(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  const today = toZonedTime(new Date(), TIMEZONE);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dateStr = format(zoned, 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
  
  let dayLabel: string;
  if (dateStr === todayStr) {
    dayLabel = 'Heute';
  } else if (dateStr === yesterdayStr) {
    dayLabel = 'Gestern';
  } else {
    dayLabel = format(zoned, 'dd.MM.yyyy');
  }
  
  const timeStr = format(zoned, 'HH:mm');
  return `${dayLabel} um ${timeStr} Uhr`;
}

// Category mapping using valid EffectCategory values
const CATEGORY_MAP: Record<string, EffectCategory> = {
  'triptan': 'migraene_triptan',
  'triptane': 'migraene_triptan',
  'schmerzmittel': 'schmerzmittel_nsar',
  'nsar': 'schmerzmittel_nsar',
  'prophylaxe': 'migraene_prophylaxe',
  'anti-cgrp': 'migraene_prophylaxe',
  'cgrp': 'migraene_prophylaxe',
  'tablette': 'schmerzmittel_sonstige',
  'tabletten': 'schmerzmittel_sonstige',
};

// ============================================
// Core Query Functions
// ============================================

/**
 * Holt den letzten Eintrag (optional mit Filter)
 */
export async function getLatestEntry(
  userId: string,
  filter?: EntryFilter
): Promise<LatestEntryResult> {
  try {
    let query = supabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, pain_level, pain_location, medications, notes, aura_type')
      .eq('user_id', userId)
      .order('timestamp_created', { ascending: false })
      .limit(50); // Mehr laden für Filter

    if (filter?.dateFrom) {
      query = query.gte('selected_date', filter.dateFrom);
    }
    if (filter?.dateTo) {
      query = query.lte('selected_date', filter.dateTo);
    }

    const { data: entries, error } = await query;

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return { success: true, entry: undefined };
    }

    // Wenn ein Medikamentenfilter gesetzt ist, durchsuchen
    let targetEntry = entries[0];
    
    if (filter?.medicationName || filter?.medicationCategory) {
      for (const entry of entries) {
        const meds = (entry.medications as string[]) || [];
        if (meds.length === 0) continue;
        
        if (filter.medicationName) {
          if (meds.some(m => matchesMedName(m, filter.medicationName!))) {
            targetEntry = entry;
            break;
          }
        } else if (filter.medicationCategory) {
          if (meds.some(m => deriveEffectCategory(m, null, null) === filter.medicationCategory)) {
            targetEntry = entry;
            break;
          }
        }
      }
    }

    const occurredAt = getEntryOccurredAt(targetEntry);

    return {
      success: true,
      entry: {
        id: targetEntry.id,
        occurredAt,
        occurredAtFormatted: formatOccurredAt(occurredAt),
        painLevel: targetEntry.pain_level,
        painLocation: targetEntry.pain_location,
        medications: (targetEntry.medications as string[]) || [],
        notes: targetEntry.notes,
        auraType: targetEntry.aura_type || 'keine',
      },
    };
  } catch (error) {
    console.error('getLatestEntry error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Holt den letzten Eintrag MIT einem bestimmten Medikament
 */
export async function getLatestEntryWithMedication(
  userId: string,
  medicationNameOrCategory: string
): Promise<LatestEntryResult> {
  try {
    const normalizedSearch = medicationNameOrCategory.toLowerCase().trim();
    const isCategory = CATEGORY_MAP[normalizedSearch];
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, pain_level, pain_location, medications, notes, aura_type')
      .eq('user_id', userId)
      .not('medications', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return { success: true, entry: undefined };
    }

    // Suche nach Match
    for (const entry of entries) {
      const meds = (entry.medications as string[]) || [];
      if (meds.length === 0) continue;

      let found = false;
      
      if (isCategory) {
        found = meds.some(m => deriveEffectCategory(m, null, null) === isCategory);
      } else {
        found = meds.some(m => matchesMedName(m, medicationNameOrCategory));
      }

      if (found) {
        const occurredAt = getEntryOccurredAt(entry);
        return {
          success: true,
          entry: {
            id: entry.id,
            occurredAt,
            occurredAtFormatted: formatOccurredAt(occurredAt),
            painLevel: entry.pain_level,
            painLocation: entry.pain_location,
            medications: meds,
            notes: entry.notes,
            auraType: entry.aura_type || 'keine',
          },
        };
      }
    }

    return { success: true, entry: undefined };
  } catch (error) {
    console.error('getLatestEntryWithMedication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Holt die letzte Medikamenteneinnahme
 * Optimiert für "Wann habe ich zuletzt X genommen?"
 */
export async function getLatestMedicationIntake(
  userId: string,
  medicationNameOrCategory: string
): Promise<LatestMedicationIntakeResult> {
  try {
    const normalizedSearch = medicationNameOrCategory.toLowerCase().trim();
    const isCategory = CATEGORY_MAP[normalizedSearch];
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, pain_level, medications')
      .eq('user_id', userId)
      .not('medications', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(200);

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return { 
        success: true, 
        matchInfo: { 
          searchTerm: medicationNameOrCategory, 
          matchType: isCategory ? 'category' : 'fuzzy',
          category: isCategory || undefined,
        } 
      };
    }

    // Suche nach Match
    for (const entry of entries) {
      const meds = (entry.medications as string[]) || [];
      if (meds.length === 0) continue;

      let matchedMed: string | null = null;
      let matchType: 'exact' | 'fuzzy' | 'category' = 'fuzzy';
      
      if (isCategory) {
        matchedMed = meds.find(m => deriveEffectCategory(m, null, null) === isCategory) || null;
        matchType = 'category';
      } else {
        // Exakter Match zuerst
        matchedMed = meds.find(m => normalizeMedName(m) === normalizedSearch) || null;
        if (matchedMed) {
          matchType = 'exact';
        } else {
          // Fuzzy Match
          matchedMed = meds.find(m => matchesMedName(m, medicationNameOrCategory)) || null;
          matchType = 'fuzzy';
        }
      }

      if (matchedMed) {
        const occurredAt = getEntryOccurredAt(entry);
        return {
          success: true,
          intake: {
            entryId: entry.id,
            occurredAt,
            occurredAtFormatted: formatOccurredAt(occurredAt),
            medicationMatched: matchedMed,
            allMedications: meds,
            painLevel: entry.pain_level,
          },
          matchInfo: {
            searchTerm: medicationNameOrCategory,
            matchType,
            category: isCategory || undefined,
          },
        };
      }
    }

    return { 
      success: true, 
      matchInfo: { 
        searchTerm: medicationNameOrCategory, 
        matchType: isCategory ? 'category' : 'fuzzy',
        category: isCategory || undefined,
      } 
    };
  } catch (error) {
    console.error('getLatestMedicationIntake error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Holt mehrere Einträge mit einem Medikament (für Liste)
 */
export async function getEntriesWithMedication(
  userId: string,
  medicationNameOrCategory: string,
  limit = 10
): Promise<{
  success: boolean;
  entries: LatestEntryResult['entry'][];
  matchInfo?: LatestMedicationIntakeResult['matchInfo'];
  error?: string;
}> {
  try {
    const normalizedSearch = medicationNameOrCategory.toLowerCase().trim();
    const isCategory = CATEGORY_MAP[normalizedSearch];
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, timestamp_created, selected_date, selected_time, pain_level, pain_location, medications, notes, aura_type')
      .eq('user_id', userId)
      .not('medications', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(200);

    if (error) throw error;

    const matchingEntries: LatestEntryResult['entry'][] = [];
    
    for (const entry of entries || []) {
      if (matchingEntries.length >= limit) break;
      
      const meds = (entry.medications as string[]) || [];
      if (meds.length === 0) continue;

      let found = false;
      if (isCategory) {
        found = meds.some(m => deriveEffectCategory(m, null, null) === isCategory);
      } else {
        found = meds.some(m => matchesMedName(m, medicationNameOrCategory));
      }

      if (found) {
        const occurredAt = getEntryOccurredAt(entry);
        matchingEntries.push({
          id: entry.id,
          occurredAt,
          occurredAtFormatted: formatOccurredAt(occurredAt),
          painLevel: entry.pain_level,
          painLocation: entry.pain_location,
          medications: meds,
          notes: entry.notes,
          auraType: entry.aura_type || 'keine',
        });
      }
    }

    return {
      success: true,
      entries: matchingEntries,
      matchInfo: {
        searchTerm: medicationNameOrCategory,
        matchType: isCategory ? 'category' : 'fuzzy',
        category: isCategory || undefined,
      },
    };
  } catch (error) {
    console.error('getEntriesWithMedication error:', error);
    return {
      success: false,
      entries: [],
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Zählt Einnahmetage für ein Medikament im Zeitraum
 * Wrapper für Voice-Query mit formatiertem Output
 */
export async function countMedicationDays(
  userId: string,
  medicationNameOrCategory: string,
  days: number = 30
): Promise<{
  success: boolean;
  count: number;
  formattedResult: string;
  details?: string;
  error?: string;
}> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    const normalizedSearch = medicationNameOrCategory.toLowerCase().trim();
    const isCategory = CATEGORY_MAP[normalizedSearch];
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('selected_date, medications')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr)
      .not('medications', 'is', null);

    if (error) throw error;

    const daysWithMed = new Set<string>();
    const matchedMeds = new Map<string, number>();
    
    for (const entry of entries || []) {
      const meds = (entry.medications as string[]) || [];
      if (!entry.selected_date) continue;
      
      for (const med of meds) {
        let matches = false;
        if (isCategory) {
          matches = deriveEffectCategory(med, null, null) === isCategory;
        } else {
          matches = matchesMedName(med, medicationNameOrCategory);
        }
        
        if (matches) {
          daysWithMed.add(entry.selected_date);
          matchedMeds.set(med, (matchedMeds.get(med) || 0) + 1);
        }
      }
    }

    const count = daysWithMed.size;
    const searchLabel = isCategory 
      ? (normalizedSearch === 'triptan' || normalizedSearch === 'triptane' ? 'Triptane' : normalizedSearch)
      : medicationNameOrCategory;
    
    let details = '';
    if (matchedMeds.size > 0) {
      const medList = Array.from(matchedMeds.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, times]) => `${name} (${times}×)`)
        .join(', ');
      details = `Gefunden: ${medList}`;
    }

    return {
      success: true,
      count,
      formattedResult: `${count} ${count === 1 ? 'Tag' : 'Tage'} mit ${searchLabel} in den letzten ${days} Tagen`,
      details,
    };
  } catch (error) {
    console.error('countMedicationDays error:', error);
    return {
      success: false,
      count: 0,
      formattedResult: 'Fehler bei der Abfrage',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}
