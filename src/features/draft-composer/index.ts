/**
 * Draft Composer Feature
 * Export all public APIs
 */

// Components
export { DraftComposerPage } from './components/DraftComposerPage';
export { DraftInput } from './components/DraftInput';
export { DraftSection, UncertainField } from './components/DraftSection';

// Hooks
export { useDraftComposer } from './hooks/useDraftComposer';
export { useSpeechInput } from './hooks/useSpeechInput';
export { useUserAISettings, useUpdateUserAISettings } from './hooks/useUserAISettings';

// Engine
export { parseTextToDraft } from './engine/heuristicDraftEngine';
export { generateLLMDraft } from './engine/llmDraftEngine';
export { generateDraft, getCurrentEngineType } from './engine/draftEngineFactory';
export { 
  createSpeechProvider, 
  isWebSpeechSupported,
  getCurrentProviderType 
} from './engine/speechProvider';

// API
export { saveDraft } from './api/draftSave.api';

// Types
export type {
  DraftResult,
  DraftEngineResult,
  DraftSectionType,
  MedicationIntake,
  AttackDraft,
  DraftField,
  ConfidenceLevel,
  SpeechProviderType,
  SpeechProviderConfig,
  SpeechResult,
  SpeechProviderInterface,
} from './types/draft.types';

export type { DraftEngineType, DraftEngineSettings } from './engine/draftEngineFactory';
