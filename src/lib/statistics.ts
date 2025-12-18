import type { MigraineEntry } from "@/types/painApp";
import { normalizePainLevel } from "@/lib/utils/pain";
import { subDays, startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";
import { getEffectiveScore } from "@/lib/utils/medicationEffects";

export interface MedicationEffect {
  id: string;
  entry_id: number;
  med_name: string;
  effect_rating: string;
  effect_score?: number | null;
  side_effects: string[] | null;
  confidence: string | null;
  method: string | null;
}

export interface MedicationLimit {
  id: string;
  medication_name: string;
  limit_count: number;
  period_type: string;
  is_active: boolean;
}

export interface EntrySymptom {
  entry_id: number;
  symptom_id: string;
  symptom_name?: string;
}

// Updated interface with rolling 30-day limit info
export interface MedicationLimitInfo {
  rolling30Count: number;    // Einnahmen in den letzten 30 Tagen (rollierend)
  limit: number;             // Das definierte Limit
  period: string;            // z.B. "month"
  remaining: number;         // Verbleibende Einnahmen
  overBy: number;            // Überschreitung (0 wenn nicht überschritten)
  isOverLimit: boolean;      // true wenn überschritten
}

// NEW: Medication effect statistics for Teil E
export interface MedicationEffectStats {
  name: string;
  rangeCount: number;        // Einnahmen im Zeitraum
  avgEffect: number | null;  // Durchschnitt auf 0-5 Skala (null wenn keine Bewertungen)
  ratedCount: number;        // Anzahl bewerteter Einnahmen
  sideEffectCount: number;
  limitInfo?: MedicationLimitInfo;
}

export interface PatternStatistics {
  painProfile: {
    average: number;
    totalEpisodes: number;
    distribution: {
      leicht: { count: number; percentage: number };
      mittel: { count: number; percentage: number };
      stark: { count: number; percentage: number };
      sehr_stark: { count: number; percentage: number };
    };
  };
  painLocation: {
    mostCommon: { location: string; percentage: number } | null;
    distribution: Array<{ location: string; count: number; percentage: number }>;
  };
  auraAndSymptoms: {
    noAuraPercentage: number;
    mostCommonAura: { type: string; percentage: number } | null;
    topSymptoms: Array<{ name: string; count: number; percentage: number }>;
    hasMeaningfulAura: boolean;       // true wenn echte Aura-Typen (nicht "keine") vorhanden
    hasSymptomDocumentation: boolean; // true wenn Symptome dokumentiert wurden
  };
  medicationAndEffect: {
    mostUsed: MedicationEffectStats | null;
    topMedications: MedicationEffectStats[];
  };
}

/**
 * Berechnet die Anzahl der Medikamenteneinnahmen in den letzten 30 Tagen (rollierend)
 */
function calculateRolling30DayCount(
  medName: string,
  allEntries: MigraineEntry[]
): number {
  const now = new Date();
  const rollingWindowStart = startOfDay(subDays(now, 30));
  const rollingWindowEnd = endOfDay(now);

  let count = 0;
  allEntries.forEach(entry => {
    const entryDateStr = entry.selected_date || entry.timestamp_created?.split('T')[0];
    if (!entryDateStr) return;
    
    try {
      const entryDate = parseISO(entryDateStr);
      if (isWithinInterval(entryDate, { start: rollingWindowStart, end: rollingWindowEnd })) {
        if (entry.medications?.includes(medName)) {
          count++;
        }
      }
    } catch {
      // Skip invalid dates
    }
  });

  return count;
}

export function computeStatistics(
  filteredEntries: MigraineEntry[],
  medicationEffects: MedicationEffect[],
  entrySymptoms: EntrySymptom[],
  medicationLimits: MedicationLimit[],
  allEntries?: MigraineEntry[]  // Optional: alle Einträge für rolling 30-day Berechnung
): PatternStatistics {
  const totalEpisodes = filteredEntries.length;
  // Für rolling 30-day Berechnung: nutze allEntries wenn vorhanden, sonst filteredEntries
  const entriesForRolling = allEntries || filteredEntries;

  // 1. Schmerzprofil
  const painLevels = filteredEntries
    .map(e => normalizePainLevel(e.pain_level))
    .filter(level => level !== null) as number[];

  const average = painLevels.length > 0
    ? painLevels.reduce((sum, val) => sum + val, 0) / painLevels.length
    : 0;

  const painCategories = {
    leicht: 0,
    mittel: 0,
    stark: 0,
    sehr_stark: 0,
  };

  painLevels.forEach(level => {
    if (level >= 0 && level <= 3) painCategories.leicht++;
    else if (level >= 4 && level <= 6) painCategories.mittel++;
    else if (level >= 7 && level <= 8) painCategories.stark++;
    else if (level >= 9 && level <= 10) painCategories.sehr_stark++;
  });

  const painProfile = {
    average: Math.round(average * 10) / 10,
    totalEpisodes,
    distribution: {
      leicht: {
        count: painCategories.leicht,
        percentage: totalEpisodes > 0 ? Math.round((painCategories.leicht / totalEpisodes) * 100) : 0,
      },
      mittel: {
        count: painCategories.mittel,
        percentage: totalEpisodes > 0 ? Math.round((painCategories.mittel / totalEpisodes) * 100) : 0,
      },
      stark: {
        count: painCategories.stark,
        percentage: totalEpisodes > 0 ? Math.round((painCategories.stark / totalEpisodes) * 100) : 0,
      },
      sehr_stark: {
        count: painCategories.sehr_stark,
        percentage: totalEpisodes > 0 ? Math.round((painCategories.sehr_stark / totalEpisodes) * 100) : 0,
      },
    },
  };

  // 2. Schmerzlokalisation
  const locationCounts = new Map<string, number>();
  filteredEntries.forEach(entry => {
    const location = entry.pain_location;
    if (location && location !== 'keine') {
      locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
    }
  });

  const totalWithLocation = Array.from(locationCounts.values()).reduce((sum, count) => sum + count, 0);

  const locationDistribution = Array.from(locationCounts.entries())
    .map(([location, count]) => ({
      location,
      count,
      percentage: totalWithLocation > 0 ? Math.round((count / totalWithLocation) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const painLocation = {
    mostCommon: locationDistribution.length > 0 ? locationDistribution[0] : null,
    distribution: locationDistribution,
  };

  // 3. Aura & Symptome
  const auraCounts = new Map<string, number>();
  filteredEntries.forEach(entry => {
    const aura = entry.aura_type || 'keine';
    auraCounts.set(aura, (auraCounts.get(aura) || 0) + 1);
  });

  const noAuraCount = auraCounts.get('keine') || 0;
  const noAuraPercentage = totalEpisodes > 0 ? Math.round((noAuraCount / totalEpisodes) * 100) : 0;

  // TEIL C: Filter für echte Aura-Typen (nicht 'keine', 'none', null, undefined, '')
  const auraWithoutNone = Array.from(auraCounts.entries())
    .filter(([type]) => type !== 'keine' && type !== 'none' && type !== '' && type !== null)
    .sort((a, b) => b[1] - a[1]);

  const totalWithAura = auraWithoutNone.reduce((sum, [, count]) => sum + count, 0);

  const mostCommonAura = auraWithoutNone.length > 0
    ? {
        type: auraWithoutNone[0][0],
        percentage: totalWithAura > 0 ? Math.round((auraWithoutNone[0][1] / totalWithAura) * 100) : 0,
      }
    : null;

  // Symptome
  const symptomCounts = new Map<string, number>();
  entrySymptoms.forEach(es => {
    const name = es.symptom_name || es.symptom_id;
    symptomCounts.set(name, (symptomCounts.get(name) || 0) + 1);
  });

  const topSymptoms = Array.from(symptomCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalEpisodes > 0 ? Math.round((count / totalEpisodes) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // TEIL C: "Meaningful Aura" = echte Aura-Typen vorhanden (nicht nur "keine/none")
  // hasMeaningfulAura: true wenn mindestens ein Eintrag einen echten Aura-Typ hat
  const hasMeaningfulAura = totalWithAura > 0;

  // Symptom-Dokumentation prüfen
  const hasSymptomDocumentation = entrySymptoms.length > 0;

  const auraAndSymptoms = {
    noAuraPercentage,
    mostCommonAura,
    topSymptoms,
    hasMeaningfulAura,
    hasSymptomDocumentation,
  };

  // 4. Medikamente & Wirkung (TEIL E: Mit echten Wirkungsdaten)
  const medCounts = new Map<string, number>(); // Count im ausgewählten Zeitraum
  // NEW: Track effect scores per medication (0-5 scale)
  const medEffectScores = new Map<string, number[]>();
  const medSideEffects = new Map<string, number>();

  // Count medication usage in filtered entries
  filteredEntries.forEach(entry => {
    entry.medications?.forEach(med => {
      medCounts.set(med, (medCounts.get(med) || 0) + 1);
    });
  });

  // Process medication effects with proper 0-5 scale conversion
  medicationEffects.forEach(effect => {
    const effectScore = getEffectiveScore(effect.effect_score, effect.effect_rating);
    
    // Only count rated effects (not null/undefined)
    // WICHTIG: 0 = "Keine Wirkung" zählt als Bewertung!
    if (effectScore !== null) {
      const scores = medEffectScores.get(effect.med_name) || [];
      scores.push(effectScore);
      medEffectScores.set(effect.med_name, scores);
    }

    if (effect.side_effects && effect.side_effects.length > 0) {
      medSideEffects.set(effect.med_name, (medSideEffects.get(effect.med_name) || 0) + 1);
    }
  });

  const topMedications: MedicationEffectStats[] = Array.from(medCounts.entries())
    .map(([name, rangeCount]) => {
      const scores = medEffectScores.get(name) || [];
      const ratedCount = scores.length;
      
      // Calculate average only from rated effects (0 counts, null/undefined doesn't)
      const avgEffect = ratedCount > 0
        ? Math.round((scores.reduce((sum, val) => sum + val, 0) / ratedCount) * 10) / 10
        : null;
      
      const sideEffectCount = medSideEffects.get(name) || 0;

      // Limit info mit korrekter rolling 30-day Berechnung
      const limit = medicationLimits.find(l => l.medication_name === name && l.is_active);
      let limitInfo: MedicationLimitInfo | undefined;
      
      if (limit && limit.period_type === 'month') {
        // Rolling 30-day Berechnung - UNABHÄNGIG vom gewählten Zeitraum
        const rolling30Count = calculateRolling30DayCount(name, entriesForRolling);
        const limitCount = limit.limit_count;
        const remaining = Math.max(0, limitCount - rolling30Count);
        const overBy = Math.max(0, rolling30Count - limitCount);
        
        limitInfo = {
          rolling30Count,
          limit: limitCount,
          period: limit.period_type,
          remaining,
          overBy,
          isOverLimit: rolling30Count > limitCount,
        };
      }

      return {
        name,
        rangeCount,
        avgEffect,
        ratedCount,
        sideEffectCount,
        limitInfo,
      };
    })
    .sort((a, b) => b.rangeCount - a.rangeCount);

  const medicationAndEffect = {
    mostUsed: topMedications.length > 0 ? topMedications[0] : null,
    topMedications: topMedications.slice(0, 5), // Top 5 für Wirkungsübersicht
  };

  return {
    painProfile,
    painLocation,
    auraAndSymptoms,
    medicationAndEffect,
  };
}
