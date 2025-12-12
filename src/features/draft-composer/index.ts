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

// Engine
export { parseTextToDraft } from './engine/heuristicDraftEngine';
export { 
  createSpeechProvider, 
  isWebSpeechSupported,
  getCurrentProviderType 
} from './engine/speechProvider';

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
