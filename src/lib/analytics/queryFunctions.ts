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
 * Zählt TAGE mit einem bestimmten Medikament (Fuzzy-Match auf Namen)
 */
export async function countMedDaysByName(
  userId: string,
  medName: string,
  timeRange: TimeRange
): Promise<AnalyticsQueryResult> {
  try {
    const startStr = format(timeRange.start, 'yyyy-MM-dd');
    const endStr = format(timeRange.end, 'yyyy-MM-dd');
    const searchLower = medName.toLowerCase();
    
    const { data: entries, error } = await supabase
      .from('pain_entries')
      .select('id, selected_date, medications')
      .eq('user_id', userId)
      .gte('selected_date', startStr)
      .lte('selected_date', endStr)
      .not('medications', 'is', null);
    
    if (error) throw error;
    
    const daysWithMed = new Set<string>();
    
    for (const entry of entries || []) {
      const meds = entry.medications as string[] | null;
      if (!meds) continue;
      
      for (const med of meds) {
        // Fuzzy match: enthält oder beginnt mit
        if (med.toLowerCase().includes(searchLower) || 
            searchLower.includes(med.toLowerCase().substring(0, 4))) {
          if (entry.selected_date) {
            daysWithMed.add(entry.selected_date);
          }
        }
      }
    }
    
    return {
      success: true,
      queryType: 'count_med_days_by_name',
      value: daysWithMed.size,
      unit: 'Tage',
      details: `Suche: "${medName}"`
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
    
    // pain_level ist string ("1"-"10")
    const levels = entries
      .map(e => parseInt(e.pain_level, 10))
      .filter(n => !isNaN(n));
    
    if (levels.length === 0) {
      return {
        success: true,
        queryType: 'avg_pain_level',
        value: 0,
        unit: '',
        details: 'Keine gültigen Schmerzwerte'
      };
    }
    
    const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
    
    return {
      success: true,
      queryType: 'avg_pain_level',
      value: Math.round(avg * 10) / 10,
      unit: '/ 10',
      details: `Basierend auf ${levels.length} Einträgen`
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
  queryType: 'triptan_days' | 'med_days' | 'migraine_days' | 'avg_pain' | 'unknown';
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
  
  // Migräne-Tage
  if (/migräne.?tag|kopfschmerz.?tag|wie\s*(?:viele?|oft)\s*(?:migräne|kopfschmerz)/.test(lower)) {
    return {
      queryType: 'migraine_days',
      timeRange,
      confidence: 0.9
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
      return countMigraineDays(userId, query.timeRange);
    
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
      return {
        headline: 'Kopfschmerztage',
        answer: `${result.value} Kopfschmerztage in den ${periodText}`,
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
