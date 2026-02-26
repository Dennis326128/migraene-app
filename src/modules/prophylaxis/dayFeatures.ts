/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Prophylaxis Day Features Builder
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Builds a Map<dateKeyBerlin, ProphylaxisDayFeature> from diary entries.
 *
 * IMPORTANT: "documented" is true for ANY day with a diary entry,
 * including "no symptoms" entries (pain_level = 'none' / '0').
 * This matches the app's existing documentation coverage logic.
 */

import type { ProphylaxisDayFeature } from './types';
import type { RawPainEntry } from './dataSourceMapper';
import { berlinDateKeyFromUtc } from './dateKeyHelpers';
import { isTriptan } from '@/lib/medications/isTriptan';

/** Pain level text → numeric score (0–10) */
function painLevelToScore(painLevel: string): number {
  const map: Record<string, number> = {
    'none': 0, '0': 0,
    'very_light': 1, '1': 1,
    'light': 2, '2': 2,
    '3': 3,
    'moderate': 4, '4': 4,
    '5': 5,
    'strong': 6, '6': 6,
    '7': 7,
    'very_strong': 8, '8': 8,
    '9': 9,
    'extreme': 10, '10': 10,
  };
  return map[painLevel.toLowerCase()] ?? 0;
}

/**
 * Check if a medication is an acute medication (not prophylaxis).
 * Prophylaxis meds (CGRP, topiramat, etc.) are excluded from acute med counting.
 */
function isAcuteMedication(medName: string): boolean {
  const lower = medName.toLowerCase();
  // Exclude known prophylaxis drugs
  const prophylaxisKeywords = [
    'ajovy', 'fremanezumab',
    'emgality', 'galcanezumab',
    'aimovig', 'erenumab',
    'vyepti', 'eptinezumab',
    'topiramat', 'topamax',
    'amitriptylin',
    'propranolol', 'metoprolol',
    'flunarizin',
    'valproat', 'valproinsäure',
    'botox', 'botulinumtoxin',
    'candesartan',
  ];
  if (prophylaxisKeywords.some(kw => lower.includes(kw))) return false;
  return true;
}

export interface BuildDayFeaturesInput {
  painEntries: RawPainEntry[];
  rangeStartBerlin: string;
  rangeEndBerlin: string;
}

/**
 * Build day features map from diary entries.
 * Every entry day is "documented", even if pain_level is 'none'.
 */
export function buildProphylaxisDayFeatures(
  input: BuildDayFeaturesInput
): Map<string, ProphylaxisDayFeature> {
  const map = new Map<string, ProphylaxisDayFeature>();

  for (const entry of input.painEntries) {
    // SSOT: selected_date is authoritative calendar day
    const dateKey = entry.selected_date
      || (entry.timestamp_created ? berlinDateKeyFromUtc(entry.timestamp_created) : '');
    if (!dateKey) continue;
    if (dateKey < input.rangeStartBerlin || dateKey > input.rangeEndBerlin) continue;

    const painScore = painLevelToScore(entry.pain_level);
    const hadHeadache = painScore > 0;
    const meds = entry.medications || [];
    const acuteMeds = meds.filter(isAcuteMedication);

    const existing = map.get(dateKey);
    if (existing) {
      // Merge: take max pain, accumulate meds
      existing.hadHeadache = existing.hadHeadache || hadHeadache;
      existing.painMax = Math.max(existing.painMax ?? 0, painScore) || existing.painMax;
      existing.acuteMedTaken = existing.acuteMedTaken || acuteMeds.length > 0;
      existing.acuteMedCount += acuteMeds.length;
      // documented stays true
    } else {
      map.set(dateKey, {
        dateKeyBerlin: dateKey,
        documented: true, // ANY entry counts as documented
        hadHeadache,
        painMax: painScore > 0 ? painScore : null,
        acuteMedTaken: acuteMeds.length > 0,
        acuteMedCount: acuteMeds.length,
      });
    }
  }

  return map;
}
