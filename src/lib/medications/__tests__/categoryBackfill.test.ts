import { describe, expect, it } from 'vitest';
import { createMedicationCategoryBackfillPlan, getDetectedEffectCategory } from '../categoryBackfill';

describe('medication category backfill', () => {
  it('classifies existing triptan, gepant, and neutral medication names', () => {
    const triptans = ['Sumatriptan', 'Sumatriptan 100mg', 'Rizatriptan 10mg', 'Naratriptan', 'Eletrip Hormosan 80mg', 'Zomig nasal'];
    const gepants = ['Vydura', 'Vydura 75 mg', 'Nurtec ODT', 'Rimegepant'];
    const neutral = ['Ibuprofen 800 mg', 'Ibuprofen 800mg', 'Paracetamol 500mg', 'Aspirin 1000 mg', 'Naproxen', 'Diazepam 10mg', 'Zopiclon 7,5 mg', 'Metoprolol', 'Eliquis 5 mg', 'Magnesiumcitrat', 'Ajovy 225mg', 'Fremanezumab (Ajovy)', 'Waffel'];

    triptans.forEach(name => expect(getDetectedEffectCategory(name)).toBe('triptan'));
    gepants.forEach(name => expect(getDetectedEffectCategory(name)).toBe('gepant'));
    neutral.forEach(name => expect(getDetectedEffectCategory(name)).toBeNull());
  });

  it('only plans missing categories and reports contradictions without overwriting', () => {
    const plan = createMedicationCategoryBackfillPlan([
      { id: '1', name: 'Sumatriptan 100mg', effect_category: null },
      { id: '2', name: 'Vydura 75 mg', effect_category: '' },
      { id: '3', name: 'Naratriptan', effect_category: 'triptan' },
      { id: '4', name: 'Vydura', effect_category: 'triptan' },
      { id: '5', name: 'Ajovy 225mg', effect_category: null },
    ]);

    expect(plan.updates).toEqual([
      { id: '1', name: 'Sumatriptan 100mg', effect_category: 'triptan' },
      { id: '2', name: 'Vydura 75 mg', effect_category: 'gepant' },
    ]);
    expect(plan.contradictions).toEqual([
      { id: '4', name: 'Vydura', existing_category: 'triptan', detected_category: 'gepant' },
    ]);
  });
});