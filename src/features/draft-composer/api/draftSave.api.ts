/**
 * Draft Save API
 * Handles saving draft results to the database
 */

import { supabase } from "@/lib/supabaseClient";
import { DraftResult, MedicationIntake } from "../types/draft.types";

interface SaveDraftParams {
  draft: DraftResult;
  userId: string;
  symptomCatalog?: Array<{ id: string; name: string }>;
}

interface SaveDraftResult {
  success: boolean;
  entryId?: number;
  error?: string;
}

/**
 * Map effect value to effect_rating string
 */
function mapEffectToRating(effect: string | null): string {
  if (!effect) return 'moderate';
  const map: Record<string, string> = {
    'none': 'none',
    'low': 'poor',
    'medium': 'moderate',
    'good': 'good',
    'excellent': 'very_good'
  };
  return map[effect] || 'moderate';
}

/**
 * Map effect value to numeric score (0-10)
 */
function mapEffectToScore(effect: string | null): number | null {
  if (!effect) return null;
  const map: Record<string, number> = {
    'none': 0,
    'low': 2,
    'medium': 5,
    'good': 7,
    'excellent': 9
  };
  return map[effect] ?? null;
}

/**
 * Build notes string with original text and triggers
 */
function buildNotesWithContext(draft: DraftResult): string {
  const parts: string[] = [];
  
  // Add user notes
  if (draft.notes?.value) {
    parts.push(draft.notes.value);
  }
  
  // Add triggers (since no dedicated table)
  if (draft.triggers?.value && draft.triggers.value.length > 0) {
    parts.push(`Trigger: ${draft.triggers.value.join('; ')}`);
  }
  
  // Always append original text for traceability
  parts.push(`\n---\nOriginaltext: ${draft.originalText}`);
  
  return parts.join('\n');
}

/**
 * Save a draft to the database
 * Creates pain_entries, medication_effects, and entry_symptoms
 */
export async function saveDraft(params: SaveDraftParams): Promise<SaveDraftResult> {
  const { draft, userId, symptomCatalog = [] } = params;

  try {
    // 1. Create pain_entries
    const medicationNames = draft.medications.map(m => m.medicationName.value).filter(Boolean) as string[];
    const medicationIds = draft.medications
      .map(m => m.medicationId)
      .filter(Boolean) as string[];

    const painEntryData = {
      user_id: userId,
      selected_date: draft.attack?.date?.value || new Date().toISOString().split('T')[0],
      selected_time: draft.attack?.time?.value || null,
      pain_level: draft.attack?.painLevel?.value !== null 
        ? mapPainLevelToText(draft.attack.painLevel.value)
        : 'mittel',
      pain_locations: draft.attack?.painLocation?.value ? [draft.attack.painLocation.value] : [],
      aura_type: 'keine',
      medications: medicationNames.length > 0 ? medicationNames : null,
      medication_ids: medicationIds.length > 0 ? medicationIds : null,
      notes: buildNotesWithContext(draft)
    };

    const { data: entry, error: entryError } = await supabase
      .from('pain_entries')
      .insert(painEntryData)
      .select('id')
      .single();

    if (entryError) {
      console.error('[saveDraft] Failed to create pain_entry:', entryError);
      return { success: false, error: entryError.message };
    }

    const entryId = entry.id;
    console.log('[saveDraft] Created pain_entry:', entryId);

    // 2. Create medication_effects for each medication with effect
    for (const med of draft.medications) {
      if (med.effect?.value || med.effectScore?.value !== undefined) {
        const effectData = {
          entry_id: entryId,
          med_name: med.medicationName.value || 'Unbekannt',
          medication_id: med.medicationId || null,
          effect_rating: mapEffectToRating(med.effect?.value || null),
          effect_score: med.effectScore?.value ?? mapEffectToScore(med.effect?.value || null),
          side_effects: med.sideEffects?.value || [],
          notes: med.effectNotes || null,
          method: 'ui',
          confidence: med.effect?.confidence || 'medium'
        };

        const { error: effectError } = await supabase
          .from('medication_effects')
          .insert(effectData);

        if (effectError) {
          console.warn('[saveDraft] Failed to create medication_effect:', effectError);
          // Continue - don't fail the whole save
        }
      }
    }

    // 3. Create entry_symptoms for matched symptoms
    if (draft.symptoms?.value && draft.symptoms.value.length > 0) {
      for (const symptomName of draft.symptoms.value) {
        // Find matching symptom in catalog
        const matchedSymptom = symptomCatalog.find(
          s => s.name.toLowerCase() === symptomName.toLowerCase()
        );

        if (matchedSymptom) {
          const { error: symptomError } = await supabase
            .from('entry_symptoms')
            .insert({
              entry_id: entryId,
              symptom_id: matchedSymptom.id
            });

          if (symptomError) {
            console.warn('[saveDraft] Failed to create entry_symptom:', symptomError);
            // Continue - don't fail the whole save
          }
        } else {
          console.log('[saveDraft] Symptom not in catalog, skipping:', symptomName);
        }
      }
    }

    return { success: true, entryId };

  } catch (error) {
    console.error('[saveDraft] Unexpected error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    };
  }
}

/**
 * Map numeric pain level to text
 */
function mapPainLevelToText(level: number | null): string {
  if (level === null || level === undefined) return 'mittel';
  if (level === 0) return 'keine';
  if (level <= 3) return 'leicht';
  if (level <= 5) return 'mittel';
  if (level <= 7) return 'stark';
  return 'sehr_stark';
}

// Re-export MedicationIntake type with extended fields
export type { MedicationIntake };
