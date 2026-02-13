/**
 * Medizinische Gruppierung der Begleitsymptome nach ICHD-3.
 * 
 * Gruppe A: Migränetypisch (diagnostisch relevant)
 * Gruppe B: Häufig migräneassoziiert
 * Gruppe C: Unspezifisch
 */

/** Symptom-Namen, die zur Gruppe A (ICHD-3 migränetypisch) gehören */
export const MIGRAINE_TYPICAL_SYMPTOMS = new Set([
  'Übelkeit',
  'Erbrechen',
  'Lichtempfindlichkeit',
  'Geräuschempfindlichkeit',
  'Aura',
  'Sehstörungen',
  'Sehfeld-Ausfall',
]);

/** Gruppe B: Häufig migräneassoziiert */
export const MIGRAINE_ASSOCIATED_SYMPTOMS = new Set([
  'Geruchsempfindlichkeit',
  'Müdigkeit',
  'Konzentrationsstörung',
  'Nackenschmerz',
  'Schwindel',
  'Appetitlosigkeit',
  'Wortfindungsstörung',
  'Kribbeln/Taubheit',
]);

/** Gruppe C: Unspezifisch */
export const UNSPECIFIC_SYMPTOMS = new Set([
  'Doppelbilder',
  'Gleichgewichtsstörung',
  'Hitzewallungen',
  'Kältegefühl',
  'Spannungskopfschmerz',
]);

export type SymptomGroup = 'typical' | 'associated' | 'unspecific';

/** Bestimmt die medizinische Gruppe eines Symptoms */
export function getSymptomGroup(name: string): SymptomGroup {
  if (MIGRAINE_TYPICAL_SYMPTOMS.has(name)) return 'typical';
  if (MIGRAINE_ASSOCIATED_SYMPTOMS.has(name)) return 'associated';
  return 'unspecific';
}

/** Labels für die Gruppen (Eingabemaske) */
export const SYMPTOM_GROUP_LABELS: Record<SymptomGroup, string> = {
  typical: 'Typische Migränezeichen',
  associated: 'Häufige Begleitsymptome',
  unspecific: 'Weitere mögliche Beschwerden',
};

/** Sortiert Symptome in Gruppen */
export function groupSymptoms<T extends { name: string }>(
  symptoms: T[]
): { group: SymptomGroup; label: string; items: T[] }[] {
  const groups: Record<SymptomGroup, T[]> = {
    typical: [],
    associated: [],
    unspecific: [],
  };

  for (const s of symptoms) {
    groups[getSymptomGroup(s.name)].push(s);
  }

  return (['typical', 'associated', 'unspecific'] as SymptomGroup[])
    .filter(g => groups[g].length > 0)
    .map(g => ({ group: g, label: SYMPTOM_GROUP_LABELS[g], items: groups[g] }));
}
