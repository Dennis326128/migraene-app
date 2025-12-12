/**
 * LLM Draft Engine
 * Calls the ai-draft-from-text edge function for AI-powered parsing
 */

import { supabase } from "@/lib/supabaseClient";
import { DraftResult, DraftEngineResult, ConfidenceLevel } from "../types/draft.types";
import { parseTextToDraft } from "./heuristicDraftEngine";

interface LLMDraftResponse {
  originalText: string;
  painEntry: {
    selected_date: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    selected_time: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    pain_level: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    pain_location: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    aura_type: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    notes_append: { value: string | null; confidence: ConfidenceLevel; source: string | null };
    medications: {
      names: string[];
      ids: (string | null)[];
      items: Array<{
        med_name: string;
        medication_id: string | null;
        taken_time: { value: string | null; confidence: ConfidenceLevel; source: string | null };
        dose_text: { value: string | null; confidence: ConfidenceLevel; source: string | null };
        effect_rating: { value: string | null; confidence: ConfidenceLevel; source: string | null };
        effect_score: { value: number | null; confidence: ConfidenceLevel; source: string | null };
        side_effects: { value: string[]; confidence: ConfidenceLevel; source: string | null };
        notes: { value: string | null; confidence: ConfidenceLevel; source: string | null };
      }>;
    };
    symptoms: Array<{
      symptom_id: string | null;
      symptom_name: string;
      confidence: ConfidenceLevel;
      source: string | null;
    }>;
    triggers: Array<{
      value: string;
      confidence: ConfidenceLevel;
      source: string | null;
    }>;
  };
  warnings: Array<{ path: string; type: string; message: string }>;
  follow_up: Array<{ id: string; question: string; path: string }>;
  engineUsed: "llm";
}

/**
 * Convert LLM response to internal DraftResult format
 */
function convertLLMResponseToDraft(response: LLMDraftResponse): DraftResult {
  const medications = response.painEntry.medications.items.map((item, index) => ({
    id: `med-${index}`,
    medicationName: {
      value: item.med_name,
      confidence: "high" as ConfidenceLevel,
      source: "parsed" as const
    },
    medicationId: item.medication_id || undefined,
    time: {
      value: item.taken_time.value,
      confidence: item.taken_time.confidence,
      source: "parsed" as const
    },
    dosage: item.dose_text.value ? {
      value: item.dose_text.value,
      confidence: item.dose_text.confidence,
      source: "parsed" as const
    } : undefined,
    effect: item.effect_rating.value ? {
      value: mapEffectRating(item.effect_rating.value),
      confidence: item.effect_rating.confidence,
      source: "parsed" as const
    } : undefined,
    effectScore: item.effect_score.value !== null ? {
      value: item.effect_score.value,
      confidence: item.effect_score.confidence,
      source: "parsed" as const
    } : undefined,
    sideEffects: item.side_effects.value.length > 0 ? {
      value: item.side_effects.value,
      confidence: item.side_effects.confidence,
      source: "parsed" as const
    } : undefined,
    effectNotes: item.notes.value || undefined
  }));

  // Map symptoms
  const symptoms = response.painEntry.symptoms.map(s => s.symptom_name);
  const symptomsMatched = response.painEntry.symptoms.map(s => ({
    name: s.symptom_name,
    symptomId: s.symptom_id,
    confidence: s.confidence
  }));

  // Map triggers
  const triggers = response.painEntry.triggers.map(t => t.value);

  // Build notes with triggers
  let notesValue = response.painEntry.notes_append.value || null;
  
  // Determine active sections
  const activeSections: Array<'attack' | 'medication' | 'symptoms' | 'triggers' | 'notes'> = [];
  if (response.painEntry.selected_date.value || response.painEntry.pain_level.value) {
    activeSections.push('attack');
  }
  if (medications.length > 0) {
    activeSections.push('medication');
  }
  if (symptoms.length > 0) {
    activeSections.push('symptoms');
  }
  if (triggers.length > 0) {
    activeSections.push('triggers');
  }
  if (notesValue) {
    activeSections.push('notes');
  }

  // Check for missing required fields
  const missingRequiredFields: string[] = [];
  if (!response.painEntry.selected_date.value) {
    missingRequiredFields.push('date');
  }

  // Check for uncertain fields
  const hasUncertainFields = 
    response.painEntry.selected_date.confidence === 'low' ||
    response.painEntry.selected_time.confidence === 'low' ||
    response.painEntry.pain_level.confidence === 'low' ||
    medications.some(m => m.effect?.confidence === 'low') ||
    response.warnings.length > 0;

  return {
    originalText: response.originalText,
    parsedAt: new Date().toISOString(),
    attack: {
      date: {
        value: response.painEntry.selected_date.value,
        confidence: response.painEntry.selected_date.confidence,
        source: "parsed"
      },
      time: {
        value: response.painEntry.selected_time.value,
        confidence: response.painEntry.selected_time.confidence,
        source: "parsed"
      },
      painLevel: {
        value: parsePainLevel(response.painEntry.pain_level.value),
        confidence: response.painEntry.pain_level.confidence,
        source: "parsed"
      },
      painLocation: response.painEntry.pain_location.value ? {
        value: response.painEntry.pain_location.value,
        confidence: response.painEntry.pain_location.confidence,
        source: "parsed"
      } : undefined
    },
    medications,
    symptoms: {
      value: symptoms,
      confidence: symptoms.length > 0 ? "high" : "low",
      source: "parsed"
    },
    triggers: {
      value: triggers,
      confidence: triggers.length > 0 ? "medium" : "low",
      source: "parsed"
    },
    notes: {
      value: notesValue,
      confidence: notesValue ? "high" : "low",
      source: "parsed"
    },
    hasUncertainFields,
    missingRequiredFields,
    activeSections,
    // Extended fields for LLM
    symptomsMatched,
    engineUsed: "llm",
    warnings: response.warnings
  } as DraftResult & { 
    symptomsMatched: typeof symptomsMatched;
    engineUsed: "llm";
    warnings: typeof response.warnings;
  };
}

function mapEffectRating(rating: string): 'none' | 'low' | 'medium' | 'good' | 'excellent' {
  const map: Record<string, 'none' | 'low' | 'medium' | 'good' | 'excellent'> = {
    'none': 'none',
    'poor': 'low',
    'moderate': 'medium',
    'good': 'good',
    'very_good': 'excellent'
  };
  return map[rating] || 'medium';
}

function parsePainLevel(value: string | null): number | null {
  if (!value) return null;
  
  // Try numeric first
  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= 0 && num <= 10) {
    return num;
  }
  
  // Map text to number
  const textMap: Record<string, number> = {
    'keine': 0,
    'leicht': 3,
    'mittel': 5,
    'stark': 7,
    'sehr_stark': 9,
    'sehr stark': 9
  };
  
  return textMap[value.toLowerCase()] ?? null;
}

/**
 * LLM Draft Engine - calls edge function with fallback to heuristic
 */
export async function generateLLMDraft(
  text: string,
  userMedications?: Array<{ id: string; name: string }>,
  timezone: string = "Europe/Berlin"
): Promise<DraftEngineResult & { fallbackUsed?: boolean; engineUsed: 'llm' | 'heuristic' }> {
  try {
    console.log("[LLMDraftEngine] Calling ai-draft-from-text...");
    
    const { data, error } = await supabase.functions.invoke("ai-draft-from-text", {
      body: { text, timezone }
    });

    if (error) {
      console.warn("[LLMDraftEngine] Edge function error, falling back to heuristic:", error);
      const heuristicResult = parseTextToDraft(text, userMedications);
      return {
        ...heuristicResult,
        fallbackUsed: true,
        engineUsed: 'heuristic'
      };
    }

    // Handle quota exceeded or rate limit
    if (data?.error === "quota_exceeded" || data?.error === "ai_rate_limit") {
      console.warn("[LLMDraftEngine] Quota/rate limit, falling back to heuristic");
      const heuristicResult = parseTextToDraft(text, userMedications);
      return {
        ...heuristicResult,
        fallbackUsed: true,
        engineUsed: 'heuristic',
        warnings: [`KI-Limit erreicht: ${data.message || 'Heuristik wird verwendet'}`]
      };
    }

    const draft = convertLLMResponseToDraft(data as LLMDraftResponse);
    
    return {
      draft,
      errors: [],
      warnings: data.warnings?.map((w: { message: string }) => w.message) || [],
      fallbackUsed: false,
      engineUsed: 'llm'
    };

  } catch (err) {
    console.error("[LLMDraftEngine] Unexpected error, falling back to heuristic:", err);
    const heuristicResult = parseTextToDraft(text, userMedications);
    return {
      ...heuristicResult,
      fallbackUsed: true,
      engineUsed: 'heuristic'
    };
  }
}
