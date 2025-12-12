/**
 * Draft Engine Factory
 * Selects the appropriate engine based on user settings
 */

import { DraftEngineResult } from "../types/draft.types";
import { parseTextToDraft } from "./heuristicDraftEngine";
import { generateLLMDraft } from "./llmDraftEngine";

export type DraftEngineType = 'heuristic' | 'llm';

export interface DraftEngineSettings {
  aiEnabled: boolean;
  aiDraftEngine: DraftEngineType;
}

export interface GenerateDraftParams {
  text: string;
  userMedications?: Array<{ id: string; name: string }>;
  timezone?: string;
}

export interface ExtendedDraftEngineResult extends DraftEngineResult {
  fallbackUsed?: boolean;
  engineUsed: DraftEngineType;
}

/**
 * Generate a draft using the appropriate engine based on settings
 */
export async function generateDraft(
  params: GenerateDraftParams,
  settings: DraftEngineSettings
): Promise<ExtendedDraftEngineResult> {
  const { text, userMedications, timezone = "Europe/Berlin" } = params;
  
  // Use LLM if enabled
  if (settings.aiEnabled && settings.aiDraftEngine === 'llm') {
    console.log("[DraftEngineFactory] Using LLM engine");
    return generateLLMDraft(text, userMedications, timezone);
  }
  
  // Default to heuristic
  console.log("[DraftEngineFactory] Using heuristic engine");
  const result = parseTextToDraft(text, userMedications);
  return {
    ...result,
    fallbackUsed: false,
    engineUsed: 'heuristic'
  };
}

/**
 * Get current engine type based on settings
 */
export function getCurrentEngineType(settings: DraftEngineSettings): DraftEngineType {
  if (settings.aiEnabled && settings.aiDraftEngine === 'llm') {
    return 'llm';
  }
  return 'heuristic';
}
