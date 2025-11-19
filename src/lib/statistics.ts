import type { MigraineEntry } from "@/types/painApp";
import { normalizePainLevel } from "@/lib/utils/pain";

export interface MedicationEffect {
  id: string;
  entry_id: number;
  med_name: string;
  effect_rating: string;
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
  };
  medicationAndEffect: {
    mostUsed: {
      name: string;
      count: number;
      avgRating: number;
      sideEffectCount: number;
    } | null;
    topMedications: Array<{
      name: string;
      count: number;
      avgRating: number;
      sideEffectCount: number;
      limitInfo?: { used: number; limit: number; period: string };
    }>;
  };
}

export function computeStatistics(
  entries: MigraineEntry[],
  medicationEffects: MedicationEffect[],
  entrySymptoms: EntrySymptom[],
  medicationLimits: MedicationLimit[]
): PatternStatistics {
  const totalEpisodes = entries.length;

  // 1. Schmerzprofil
  const painLevels = entries
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
  entries.forEach(entry => {
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
  entries.forEach(entry => {
    const aura = entry.aura_type || 'keine';
    auraCounts.set(aura, (auraCounts.get(aura) || 0) + 1);
  });

  const noAuraCount = auraCounts.get('keine') || 0;
  const noAuraPercentage = totalEpisodes > 0 ? Math.round((noAuraCount / totalEpisodes) * 100) : 0;

  const auraWithoutNone = Array.from(auraCounts.entries())
    .filter(([type]) => type !== 'keine')
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

  const auraAndSymptoms = {
    noAuraPercentage,
    mostCommonAura,
    topSymptoms,
  };

  // 4. Medikamente & Wirkung
  const medCounts = new Map<string, number>();
  const medRatings = new Map<string, number[]>();
  const medSideEffects = new Map<string, number>();

  entries.forEach(entry => {
    entry.medications?.forEach(med => {
      medCounts.set(med, (medCounts.get(med) || 0) + 1);
    });
  });

  medicationEffects.forEach(effect => {
    const ratings = medRatings.get(effect.med_name) || [];
    const rating = parseFloat(effect.effect_rating);
    if (!isNaN(rating)) {
      ratings.push(rating);
      medRatings.set(effect.med_name, ratings);
    }

    if (effect.side_effects && effect.side_effects.length > 0) {
      medSideEffects.set(effect.med_name, (medSideEffects.get(effect.med_name) || 0) + 1);
    }
  });

  const topMedications = Array.from(medCounts.entries())
    .map(([name, count]) => {
      const ratings = medRatings.get(name) || [];
      const avgRating = ratings.length > 0
        ? ratings.reduce((sum, val) => sum + val, 0) / ratings.length
        : 0;
      const sideEffectCount = medSideEffects.get(name) || 0;

      // Limit info
      const limit = medicationLimits.find(l => l.medication_name === name && l.is_active);
      const limitInfo = limit
        ? { used: count, limit: limit.limit_count, period: limit.period_type }
        : undefined;

      return {
        name,
        count,
        avgRating: Math.round(avgRating * 10) / 10,
        sideEffectCount,
        limitInfo,
      };
    })
    .sort((a, b) => b.count - a.count);

  const medicationAndEffect = {
    mostUsed: topMedications.length > 0 ? topMedications[0] : null,
    topMedications: topMedications.slice(0, 3),
  };

  return {
    painProfile,
    painLocation,
    auraAndSymptoms,
    medicationAndEffect,
  };
}
