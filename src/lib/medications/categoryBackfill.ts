import { classifyMedication } from './classifyMedication';

export type MedicationEffectCategory = 'triptan' | 'gepant';

export interface MedicationForCategoryBackfill {
  id: string;
  name: string;
  effect_category?: string | null;
}

export interface MedicationCategoryBackfillPlan {
  updates: Array<{ id: string; name: string; effect_category: MedicationEffectCategory }>;
  contradictions: Array<{
    id: string;
    name: string;
    existing_category: MedicationEffectCategory;
    detected_category: MedicationEffectCategory;
  }>;
}

export function getDetectedEffectCategory(name: string | null | undefined): MedicationEffectCategory | null {
  const classification = classifyMedication(name);
  if (classification.isGepant) return 'gepant';
  if (classification.isTriptan) return 'triptan';
  return null;
}

function normalizeStoredCategory(category: string | null | undefined): MedicationEffectCategory | null {
  const normalized = category?.trim().toLowerCase();
  return normalized === 'triptan' || normalized === 'gepant' ? normalized : null;
}

export function createMedicationCategoryBackfillPlan(
  medications: MedicationForCategoryBackfill[],
): MedicationCategoryBackfillPlan {
  const updates: MedicationCategoryBackfillPlan['updates'] = [];
  const contradictions: MedicationCategoryBackfillPlan['contradictions'] = [];

  for (const medication of medications) {
    const detectedCategory = getDetectedEffectCategory(medication.name);
    const existingCategory = normalizeStoredCategory(medication.effect_category);

    if (!detectedCategory) continue;

    if (!existingCategory) {
      updates.push({
        id: medication.id,
        name: medication.name,
        effect_category: detectedCategory,
      });
      continue;
    }

    if (existingCategory !== detectedCategory) {
      contradictions.push({
        id: medication.id,
        name: medication.name,
        existing_category: existingCategory,
        detected_category: detectedCategory,
      });
    }
  }

  return { updates, contradictions };
}