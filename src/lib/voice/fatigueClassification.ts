/**
 * fatigueClassification.ts
 * 
 * Derives a cautious ME/CFS relevance classification from
 * fatigue context tags selected in the "Alltag & Auslöser" form.
 * 
 * This is NOT a diagnosis — it's a data signal for later analysis.
 */

import type { MecfsRelevance } from './saveNote';

// ============================================================
// === FATIGUE CONTEXT OPTIONS ===
// ============================================================

export interface FatigueContextOption {
  id: string;
  label: string;
  /** How strongly this tag suggests PEM/ME/CFS vs general tiredness */
  pemWeight: number;
}

/** Available fatigue context chips shown when energy = "Erschöpft" */
export const FATIGUE_CONTEXT_OPTIONS: FatigueContextOption[] = [
  { id: 'post_exertion',      label: 'Nach Belastung schlechter',         pemWeight: 3 },
  { id: 'minimal_activity',   label: 'Schon wenig Aktivität war zu viel', pemWeight: 3 },
  { id: 'sensory_overload',   label: 'Vor allem reizüberflutet',          pemWeight: 2 },
  { id: 'just_tired',         label: 'Eher einfach müde',                 pemWeight: -2 },
  { id: 'had_to_lie_down',    label: 'Musste mich hinlegen',              pemWeight: 2 },
  { id: 'brain_fog',          label: 'Brain Fog / benommen',              pemWeight: 2 },
  { id: 'circulation',        label: 'Kreislauf / Schwäche',              pemWeight: 1 },
  { id: 'dont_know',          label: 'Weiß nicht',                        pemWeight: 0 },
];

// ============================================================
// === CLASSIFICATION LOGIC ===
// ============================================================

/**
 * Derives mecfs_relevance from selected fatigue context tags.
 * 
 * Logic:
 * - No tags or only "Weiß nicht" → "possible" (default for exhaustion)
 * - Only "Eher einfach müde" → "unlikely"
 * - PEM-heavy tags (post_exertion, minimal_activity, brain_fog, etc.) → "probable"
 * - Mixed signals → "possible"
 */
export function deriveMecfsRelevance(tags: string[]): MecfsRelevance {
  if (tags.length === 0) return 'possible'; // exhausted but no detail → default

  const weights = tags.map(tagId => {
    const option = FATIGUE_CONTEXT_OPTIONS.find(o => o.id === tagId);
    return option?.pemWeight ?? 0;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight >= 4) return 'probable';
  if (totalWeight >= 1) return 'possible';
  if (totalWeight <= -1) return 'unlikely';
  return 'possible';
}

// ============================================================
// === DERIVED BOOLEAN HINTS ===
// ============================================================

/** Extract boolean hint flags from fatigue context tags for analysis use */
export function deriveFatigueHints(tags: string[]): {
  pem_hint: boolean;
  sensory_overload_hint: boolean;
  rest_needed_hint: boolean;
  brain_fog_hint: boolean;
} {
  return {
    pem_hint: tags.includes('post_exertion') || tags.includes('minimal_activity'),
    sensory_overload_hint: tags.includes('sensory_overload'),
    rest_needed_hint: tags.includes('had_to_lie_down'),
    brain_fog_hint: tags.includes('brain_fog'),
  };
}

// ============================================================
// === NOTE TEXT ANALYSIS (supportive signals) ===
// ============================================================

const PEM_KEYWORDS = [
  'platt', 'crash', 'matschig', 'benommen', 'reizüberflutet',
  'nach termin schlimmer', 'nach duschen schlimmer', 'musste mich hinlegen',
  'völlig fertig', 'zusammengebrochen', 'konnte nicht mehr',
  'pem', 'belastungsintoleranz',
];

/**
 * Scans free-text notes for supportive PEM/fatigue signals.
 * Returns true if any keyword matches — used as supplementary signal only.
 */
export function noteContainsFatigueSignals(noteText: string): boolean {
  if (!noteText) return false;
  const lower = noteText.toLowerCase();
  return PEM_KEYWORDS.some(kw => lower.includes(kw));
}
