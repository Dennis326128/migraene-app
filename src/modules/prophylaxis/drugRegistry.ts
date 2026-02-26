/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CGRP Drug Registry — Known drug names and aliases for matching
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ProphylaxisDrug } from './types';

export interface DrugProfile {
  drug: ProphylaxisDrug;
  names: string[];              // all known names (lowercase)
  typicalIntervalDays: number;  // expected dosing interval
  contextKeywords: string[];    // keywords that increase confidence when near drug name
}

export const CGRP_DRUG_REGISTRY: DrugProfile[] = [
  {
    drug: 'ajovy',
    names: ['ajovy', 'fremanezumab'],
    typicalIntervalDays: 28,
    contextKeywords: ['gespritzt', 'injiziert', 'injektion', 'genommen', 'verabreicht', 'gegeben'],
  },
  {
    drug: 'emgality',
    names: ['emgality', 'galcanezumab'],
    typicalIntervalDays: 30,
    contextKeywords: ['gespritzt', 'injiziert', 'injektion', 'genommen', 'verabreicht', 'gegeben'],
  },
  {
    drug: 'aimovig',
    names: ['aimovig', 'erenumab'],
    typicalIntervalDays: 28,
    contextKeywords: ['gespritzt', 'injiziert', 'injektion', 'genommen', 'verabreicht', 'gegeben'],
  },
  {
    drug: 'vyepti',
    names: ['vyepti', 'eptinezumab'],
    typicalIntervalDays: 84, // quarterly
    contextKeywords: ['infusion', 'infundiert', 'verabreicht', 'gegeben', 'bekommen'],
  },
];

/**
 * Find matching drug profile for a given medication name.
 */
export function findDrugProfile(medicationName: string): DrugProfile | null {
  const lower = medicationName.toLowerCase().trim();
  return CGRP_DRUG_REGISTRY.find(p =>
    p.names.some(name => lower.includes(name) || name.includes(lower))
  ) ?? null;
}

/**
 * Check if a text contains any known name for a specific drug.
 */
export function textContainsDrug(text: string, drugNames: string[]): boolean {
  const lower = text.toLowerCase();
  return drugNames.some(name => lower.includes(name));
}

/**
 * Check if text contains context keywords (e.g. "gespritzt", "injiziert").
 */
export function textContainsContext(text: string, contextKeywords: string[]): boolean {
  const lower = text.toLowerCase();
  return contextKeywords.some(kw => lower.includes(kw));
}
