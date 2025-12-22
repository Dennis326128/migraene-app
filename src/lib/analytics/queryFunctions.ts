/**
 * Analytics Query Functions
 * Sichere, definierte Query-Funktionen für Voice-Analytics
 * KEIN freies SQL - nur strukturierte Abfragen
 */

import { supabase } from '@/integrations/supabase/client';
import { deriveEffectCategory, type EffectCategory } from '@/lib/medicationLookup';
import { startOfDay, subDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ============================================
// Types
// ============================================

export interface AnalyticsQueryResult {
  success: boolean;
  queryType: string;
  value: number | string;
  unit: string;
  details?: string;
  error?: string;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// ============================================
// Time Range Helpers
// ============================================

/**
 * Berechnet Zeitraum basierend auf User-Timezone (Europe/Berlin)
 * "Letzte 30 Tage" = heute inkl. bis vor 30 Tagen
 */
export function getTimeRange(days: number, timezone = 'Europe/Berlin'): TimeRange {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const end = startOfDay(zonedNow);
  end.setHours(23, 59, 59, 999); // End of today
  
  const start = subDays(startOfDay(zonedNow), days - 1);
  
  return { start, end };
}

/**
 * Parse Zeitraum aus Text (z.B. "letzte 30 Tage", "letzter Monat")
 */
export function parseTimeRangeFromText(text: string): TimeRange {
  const lower = text.toLowerCase();
  
  // "letzte X Tage"
  const daysMatch = lower.match(/letzt(?:e|en)?\s*(\d+)\s*tag/);
  if (daysMatch) {
    return getTimeRange(parseInt(daysMatch[1], 10));
  }
  
  // "letzter Monat" / "letzte 4 Wochen"
  if (/letzt(?:e|er)?\s*monat|4\s*wochen/.test(lower)) {
    return getTimeRange(30);
  }
  
  // "letzte Woche"
  if (/letzt(?:e|er)?\s*woche/.test(lower)) {
    return getTimeRange(7);
  }
  
  // "diesen Monat"
  if (/dies(?:en|er)?\s*monat/.test(lower)) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  
  // Default: 30 Tage
  return getTimeRange(30);
}

// ============================================
// Core Query Functions
// ============================================

/**
 * Zählt TAGE mit Medikament einer bestimmten Kategorie
 * Hauptfunktion für "Wie viele Triptantage"
 */
export async function countMedDaysByCategory(
  userId: string,
  category: EffectCategory,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    // Hole alle pain_entries im Zeitraum
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, selected_date, medications')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr)
      .not('medications', 'is', null);
    
    if (error) throw error;
    
    // Sammle unique Tage mit Medikament der Kategorie
    const daysWithCategory = new Set<string>();
    const matchedMeds = new Map<string, number>(); // Medikamentenname -> Anzahl Tage
    
    for (const entry of entries || []) {
      const meds = entry.medications as string[] | null;
      if (!meds || meds.length === 0) continue;
      
      for (const medName of meds) {
        const derivedCategory = deriveEffectCategory(medName, null, null);
        if (derivedCategory === category) {
          if (entry.selected_date) {
            daysWithCategory.add(entry.selected_date);
            matchedMeds.set(medName, (matchedMeds.get(medName) || 0) + 1);
          }
        }
      }
    }
    
    const count = daysWithCategory.size;
    
    // Details: welche Medikamente gefunden
    let details = '';
    if (matchedMeds.size > 0) {
      const medList = Array.from(matchedMeds.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, days]) => `${name} (${days}×)`)
        .join(', ');
      details = `Gefunden: ${medList}`;
    }
    
    return {
      success: true,
      queryType: 'count_med_days_by_category',
      value: count,
      unit: 'Tage',
      details
    };
  } catch (error) {
    console.error('countMedDaysByCategory error:', error);
    return {
      success: false,
      queryType: 'count_med_days_by_category',
      value: 0,
      unit: 'Tage',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Normalisiert Medikamentennamen für Vergleiche
 * Entfernt Dosierung, Sonderzeichen, extra Leerzeichen
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
    // Erlaube ~20% Unterschied
    if (distance <= Math.ceil(maxLen * 0.2)) return true;
  }
  
  return false;
}

/**
 * Einfache Levenshtein-Distanz für Fuzzy-Matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Zählt TAGE mit einem bestimmten Medikament (robustes Fuzzy-Match)
 */
export async function countMedDaysByName(
  userId: string,
  medName: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, selected_date, medications')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr)
      .not('medications', 'is', null);
    
    if (error) throw error;
    
    const daysWithMed = new Set<string>();
    const matchedMeds = new Map<string, number>();
    
    for (const entry of entries || []) {
      const meds = entry.medications as string[] | null;
      if (!meds) continue;
      
      for (const med of meds) {
        if (matchesMedName(med, medName)) {
          if (entry.selected_date) {
            daysWithMed.add(entry.selected_date);
            matchedMeds.set(med, (matchedMeds.get(med) || 0) + 1);
          }
        }
      }
    }
    
    // Details: welche Varianten gefunden
    let details = `Suche: "${medName}"`;
    if (matchedMeds.size > 0) {
      const variants = Array.from(matchedMeds.keys()).slice(0, 3).join(', ');
      details += ` (gefunden: ${variants})`;
    }
    
    return {
      success: true,
      queryType: 'count_med_days_by_name',
      value: daysWithMed.size,
      unit: 'Tage',
      details
    };
  } catch (error) {
    console.error('countMedDaysByName error:', error);
    return {
      success: false,
      queryType: 'count_med_days_by_name',
      value: 0,
      unit: 'Tage',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Zählt Migräne-/Kopfschmerztage
 */
export async function countMigraineDays(
  userId: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('selected_date')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr);
    
    if (error) throw error;
    
    // Unique Tage
    const uniqueDays = new Set(
      (entries || [])
        .map(e => e.selected_date)
        .filter(Boolean)
    );
    
    return {
      success: true,
      queryType: 'count_migraine_days',
      value: uniqueDays.size,
      unit: 'Tage'
    };
  } catch (error) {
    console.error('countMigraineDays error:', error);
    return {
      success: false,
      queryType: 'count_migraine_days',
      value: 0,
      unit: 'Tage',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Zählt schmerzfreie Tage im Zeitraum
 * Ein Tag gilt als schmerzfrei, wenn:
 * - Kein Eintrag an diesem Tag existiert ODER
 * - Alle Einträge an diesem Tag pain_level = 'keine' oder '-' haben
 */
export async function countPainFreeDays(
  userId: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    // Hole alle Einträge im Zeitraum
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('selected_date, pain_level')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr);
    
    if (error) throw error;
    
    // Berechne Gesamttage im Zeitraum
    const totalDays = Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Finde Tage MIT Schmerz (pain_level != 'keine' und != '-')
    const daysWithPain = new Set<string>();
    for (const entry of entries || []) {
      if (!entry.selected_date) continue;
      const level = (entry.pain_level || '').toLowerCase().trim();
      // 'keine' und '-' gelten als schmerzfrei
      if (level !== 'keine' && level !== '-' && level !== '') {
        daysWithPain.add(entry.selected_date);
      }
    }
    
    const painFreeDays = totalDays - daysWithPain.size;
    
    return {
      success: true,
      queryType: 'pain_free_days',
      value: painFreeDays,
      unit: 'Tage',
      details: `${daysWithPain.size} Tage mit Schmerzen, ${painFreeDays} schmerzfreie Tage`
    };
  } catch (error) {
    console.error('countPainFreeDays error:', error);
    return {
      success: false,
      queryType: 'pain_free_days',
      value: 0,
      unit: 'Tage',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Zählt die Anzahl der Einträge im Zeitraum
 */
export async function countEntries(
  userId: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    const { count, error } = await supabase
      .from('pain_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr);
    
    if (error) throw error;
    
    return {
      success: true,
      queryType: 'entries_count',
      value: count || 0,
      unit: 'Einträge'
    };
  } catch (error) {
    console.error('countEntries error:', error);
    return {
      success: false,
      queryType: 'entries_count',
      value: 0,
      unit: 'Einträge',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Konvertiert pain_level String zu numerischem Wert
 * pain_level kann sein: 'keine', 'leicht', 'mittel', 'stark', 'sehr stark', '-'
 * oder in manchen Fällen numerische Strings
 */
function painLevelToNumber(painLevel: string): number | null {
  const lower = painLevel.toLowerCase().trim();
  
  // Textuelle Werte (Hauptformat in der App)
  const textMap: Record<string, number> = {
    'keine': 0,
    '-': 0,
    'leicht': 2,
    'mittel': 5,
    'stark': 7,
    'sehr stark': 9,
    'sehr_stark': 9,
  };
  
  if (textMap[lower] !== undefined) {
    return textMap[lower];
  }
  
  // Numerische Strings als Fallback
  const num = parseInt(painLevel, 10);
  if (!isNaN(num) && num >= 0 && num <= 10) {
    return num;
  }
  
  return null;
}

/**
 * Durchschnittlicher Schmerzlevel
 */
export async function avgPainLevel(
  userId: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('pain_level')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr);
    
    if (error) throw error;
    
    if (!entries || entries.length === 0) {
      return {
        success: true,
        queryType: 'avg_pain_level',
        value: 0,
        unit: '',
        details: 'Keine Einträge im Zeitraum'
      };
    }
    
    // pain_level ist String ('keine', 'leicht', 'mittel', 'stark', 'sehr stark')
    const levels = entries
      .map(e => painLevelToNumber(e.pain_level))
      .filter((n): n is number => n !== null && n > 0); // Nur Einträge mit Schmerz
    
    if (levels.length === 0) {
      return {
        success: true,
        queryType: 'avg_pain_level',
        value: 0,
        unit: '',
        details: 'Keine Einträge mit Schmerz im Zeitraum'
      };
    }
    
    const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
    
    // Konvertiere zurück zu verständlichem Text
    let levelText = '';
    if (avg <= 1) levelText = 'keine';
    else if (avg <= 3) levelText = 'leicht';
    else if (avg <= 5) levelText = 'mittel';
    else if (avg <= 7) levelText = 'stark';
    else levelText = 'sehr stark';
    
    return {
      success: true,
      queryType: 'avg_pain_level',
      value: Math.round(avg * 10) / 10,
      unit: `/ 10 (${levelText})`,
      details: `Basierend auf ${levels.length} Einträgen mit Schmerz`
    };
  } catch (error) {
    console.error('avgPainLevel error:', error);
    return {
      success: false,
      queryType: 'avg_pain_level',
      value: 0,
      unit: '',
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

// ============================================
// Query Parser
// ============================================

export type ParsedAnalyticsQuery = {
  queryType: 'triptan_days' | 'med_days' | 'migraine_days' | 'headache_days' | 'pain_free_days' | 'entries_count' | 'avg_pain' | 'unknown';
  medName?: string;
  medCategory?: EffectCategory;
  timeRange: TimeRange;
  confidence: number;
};

/**
 * Parst eine Analytics-Frage aus natürlicher Sprache
 */
export function parseAnalyticsQuery(text: string): ParsedAnalyticsQuery {
  const lower = text.toLowerCase();
  const timeRange = parseTimeRangeFromText(text);
  
  // Triptan-Fragen
  if (/triptan|sumatriptan|rizatriptan|zolmitriptan|maxalt|imigran/.test(lower)) {
    // Spezifisches Triptan?
    const specificTriptans = [
      'sumatriptan', 'rizatriptan', 'zolmitriptan', 'eletriptan', 
      'naratriptan', 'almotriptan', 'frovatriptan', 'maxalt', 'imigran'
    ];
    
    for (const triptan of specificTriptans) {
      if (lower.includes(triptan)) {
        return {
          queryType: 'med_days',
          medName: triptan,
          timeRange,
          confidence: 0.9
        };
      }
    }
    
    // Generisch "Triptane"
    return {
      queryType: 'triptan_days',
      medCategory: 'migraene_triptan',
      timeRange,
      confidence: 0.9
    };
  }
  
  // Schmerzmittel / NSAR
  if (/schmerzmittel|nsar|ibuprofen|paracetamol|aspirin|diclofenac/.test(lower)) {
    const nsarMeds = ['ibuprofen', 'paracetamol', 'aspirin', 'diclofenac', 'naproxen'];
    for (const med of nsarMeds) {
      if (lower.includes(med)) {
        return {
          queryType: 'med_days',
          medName: med,
          timeRange,
          confidence: 0.85
        };
      }
    }
    
    return {
      queryType: 'med_days',
      medCategory: 'schmerzmittel_nsar',
      timeRange,
      confidence: 0.8
    };
  }
  
  // Migräne-Tage / Kopfschmerztage
  if (/migräne.?tag|kopfschmerz.?tag|wie\s*(?:viele?|oft)\s*(?:migräne|kopfschmerz)/.test(lower)) {
    return {
      queryType: 'headache_days',
      timeRange,
      confidence: 0.9
    };
  }
  
  // Schmerzfreie Tage
  if (/schmerzfrei|ohne\s*(?:kopf)?schmerz|schmerz.?los|keine\s*(?:kopf)?schmerzen/.test(lower) && /tag/.test(lower)) {
    return {
      queryType: 'pain_free_days',
      timeRange,
      confidence: 0.95
    };
  }
  
  // Einträge / Attacken zählen
  if (/wie\s*(?:viele?|oft)|anzahl|zähl/.test(lower) && /eintrag|einträge|attacke|anfall|anfälle/.test(lower)) {
    return {
      queryType: 'entries_count',
      timeRange,
      confidence: 0.85
    };
  }
  
  // Durchschnitt Schmerz
  if (/durchschnitt|mittel|average|ø/.test(lower) && /schmerz|stärke|level|intensität/.test(lower)) {
    return {
      queryType: 'avg_pain',
      timeRange,
      confidence: 0.85
    };
  }
  
  return {
    queryType: 'unknown',
    timeRange,
    confidence: 0.3
  };
}

// ============================================
// Main Executor
// ============================================

/**
 * Führt eine geparste Analytics-Query aus
 */
export async function executeAnalyticsQuery(
  userId: string,
  query: ParsedAnalyticsQuery
): Promise<AnalyticsQueryResult> {
  switch (query.queryType) {
    case 'triptan_days':
      return countMedDaysByCategory(userId, 'migraene_triptan', query.timeRange);
    
    case 'med_days':
      if (query.medName) {
        return countMedDaysByName(userId, query.medName, query.timeRange);
      }
      if (query.medCategory) {
        return countMedDaysByCategory(userId, query.medCategory, query.timeRange);
      }
      return {
        success: false,
        queryType: 'med_days',
        value: 0,
        unit: '',
        error: 'Kein Medikament angegeben'
      };
    
    case 'migraine_days':
    case 'headache_days':
      return countMigraineDays(userId, query.timeRange);
    
    case 'pain_free_days':
      return countPainFreeDays(userId, query.timeRange);
    
    case 'entries_count':
      return countEntries(userId, query.timeRange);
    
    case 'avg_pain':
      return avgPainLevel(userId, query.timeRange);
    
    default:
      return {
        success: false,
        queryType: 'unknown',
        value: 0,
        unit: '',
        error: 'Frage nicht verstanden'
      };
  }
}

/**
 * Formatiert das Ergebnis als benutzerfreundlichen Text
 */
export function formatAnalyticsResult(
  query: ParsedAnalyticsQuery,
  result: AnalyticsQueryResult
): { headline: string; answer: string; details?: string } {
  if (!result.success) {
    return {
      headline: 'Auswertung',
      answer: result.error || 'Fehler bei der Auswertung',
      details: undefined
    };
  }
  
  const days = Math.ceil((query.timeRange.end.getTime() - query.timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
  const periodText = days === 30 ? 'letzten 30 Tagen' : days === 7 ? 'letzter Woche' : `letzten ${days} Tagen`;
  
  switch (query.queryType) {
    case 'triptan_days':
      return {
        headline: 'Triptantage',
        answer: `${result.value} ${result.unit} mit Triptan in den ${periodText}`,
        details: result.details
      };
    
    case 'med_days':
      return {
        headline: 'Medikamententage',
        answer: `${result.value} ${result.unit} mit ${query.medName || 'Medikament'} in den ${periodText}`,
        details: result.details
      };
    
    case 'migraine_days':
    case 'headache_days':
      return {
        headline: 'Kopfschmerztage',
        answer: `${result.value} Kopfschmerztage in den ${periodText}`,
        details: result.details
      };
    
    case 'pain_free_days':
      return {
        headline: 'Schmerzfreie Tage',
        answer: `In den ${periodText} hattest du ${result.value} schmerzfreie Tage.`,
        details: result.details
      };
    
    case 'entries_count':
      return {
        headline: 'Einträge',
        answer: `${result.value} Einträge in den ${periodText}`,
        details: result.details
      };
    
    case 'avg_pain':
      return {
        headline: 'Durchschnittliche Schmerzstärke',
        answer: `${result.value} ${result.unit}`,
        details: result.details
      };
    
    default:
      return {
        headline: 'Auswertung',
        answer: `${result.value} ${result.unit}`,
        details: result.details
      };
  }
}
