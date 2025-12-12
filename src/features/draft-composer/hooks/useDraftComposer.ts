/**
 * useDraftComposer Hook
 * Manages draft state and section visibility
 */

import { useState, useCallback, useMemo } from 'react';
import type { 
  DraftResult, 
  DraftSectionType, 
  MedicationIntake,
  AttackDraft,
  DraftField 
} from '../types/draft.types';
import { parseTextToDraft } from '../engine/heuristicDraftEngine';
import { generateDraft, type DraftEngineSettings } from '../engine/draftEngineFactory';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { useUserAISettings } from './useUserAISettings';
import { useToast } from '@/hooks/use-toast';

interface UseDraftComposerReturn {
  // Draft state
  draft: DraftResult | null;
  isProcessing: boolean;
  
  // Engine info
  engineUsed: 'heuristic' | 'llm' | null;
  fallbackUsed: boolean;
  
  // Input
  inputText: string;
  setInputText: (text: string) => void;
  processDraft: () => Promise<void>;
  clearDraft: () => void;
  
  // Section management
  activeSections: DraftSectionType[];
  addSection: (section: DraftSectionType) => void;
  removeSection: (section: DraftSectionType) => void;
  isSectionActive: (section: DraftSectionType) => boolean;
  availableSections: DraftSectionType[];
  
  // Draft updates
  updateAttack: (updates: Partial<AttackDraft>) => void;
  updateMedication: (id: string, updates: Partial<MedicationIntake>) => void;
  removeMedication: (id: string) => void;
  addMedication: (intake: MedicationIntake) => void;
  updateSymptoms: (symptoms: string[]) => void;
  updateTriggers: (triggers: string[]) => void;
  updateNotes: (notes: string) => void;
  
  // Validation
  isValid: boolean;
  validationErrors: string[];
  hasUncertainFields: boolean;
  
  // AI Settings
  aiSettings: DraftEngineSettings | null;
}

const ALL_SECTIONS: DraftSectionType[] = [
  'attack', 'medication', 'effect', 'symptoms', 'triggers', 'notes', 'other'
];

export function useDraftComposer(): UseDraftComposerReturn {
  const { data: userMeds = [] } = useMeds();
  const { data: aiSettings } = useUserAISettings();
  const { toast } = useToast();
  
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSections, setActiveSections] = useState<DraftSectionType[]>([]);
  const [engineUsed, setEngineUsed] = useState<'heuristic' | 'llm' | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  
  // Process text to draft (now async for LLM support)
  const processDraft = useCallback(async () => {
    if (!inputText.trim()) return;
    
    setIsProcessing(true);
    setFallbackUsed(false);
    
    try {
      const settings: DraftEngineSettings = {
        aiEnabled: aiSettings?.aiEnabled ?? false,
        aiDraftEngine: aiSettings?.aiDraftEngine ?? 'heuristic'
      };
      
      const result = await generateDraft(
        {
          text: inputText,
          userMedications: userMeds.map(m => ({ id: m.id, name: m.name })),
          timezone: 'Europe/Berlin'
        },
        settings
      );
      
      setDraft(result.draft);
      setActiveSections(result.draft.activeSections);
      setEngineUsed(result.engineUsed);
      setFallbackUsed(result.fallbackUsed ?? false);
      
      if (result.fallbackUsed) {
        toast({
          title: 'Hinweis',
          description: 'KI nicht verfügbar – Heuristik verwendet',
        });
      }
      
      if (result.warnings.length > 0) {
        console.log('[useDraftComposer] Warnings:', result.warnings);
      }
    } catch (error) {
      console.error('Failed to parse draft:', error);
      // Fallback to heuristic on any error
      const { draft: fallbackDraft } = parseTextToDraft(
        inputText, 
        userMeds.map(m => ({ id: m.id, name: m.name, wirkstoff: m.wirkstoff }))
      );
      setDraft(fallbackDraft);
      setActiveSections(fallbackDraft.activeSections);
      setEngineUsed('heuristic');
      setFallbackUsed(true);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, userMeds, aiSettings, toast]);
  
  // Clear draft
  const clearDraft = useCallback(() => {
    setDraft(null);
    setInputText('');
    setActiveSections([]);
  }, []);
  
  // Section management
  const addSection = useCallback((section: DraftSectionType) => {
    setActiveSections(prev => 
      prev.includes(section) ? prev : [...prev, section]
    );
  }, []);
  
  const removeSection = useCallback((section: DraftSectionType) => {
    setActiveSections(prev => prev.filter(s => s !== section));
  }, []);
  
  const isSectionActive = useCallback((section: DraftSectionType) => {
    return activeSections.includes(section);
  }, [activeSections]);
  
  const availableSections = useMemo(() => {
    return ALL_SECTIONS.filter(s => !activeSections.includes(s));
  }, [activeSections]);
  
  // Draft field updates
  const updateAttack = useCallback((updates: Partial<AttackDraft>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        attack: prev.attack ? { ...prev.attack, ...updates } : undefined,
      };
    });
  }, []);
  
  const updateMedication = useCallback((id: string, updates: Partial<MedicationIntake>) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        medications: prev.medications.map(m => 
          m.id === id ? { ...m, ...updates } : m
        ),
      };
    });
  }, []);
  
  const removeMedication = useCallback((id: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        medications: prev.medications.filter(m => m.id !== id),
      };
    });
  }, []);
  
  const addMedication = useCallback((intake: MedicationIntake) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        medications: [...prev.medications, intake],
      };
    });
    addSection('medication');
  }, [addSection]);
  
  const updateSymptoms = useCallback((symptoms: string[]) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        symptoms: { value: symptoms, confidence: 'high', source: 'user' },
      };
    });
  }, []);
  
  const updateTriggers = useCallback((triggers: string[]) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        triggers: { value: triggers, confidence: 'high', source: 'user' },
      };
    });
  }, []);
  
  const updateNotes = useCallback((notes: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        notes: { value: notes, confidence: 'high', source: 'user' },
      };
    });
  }, []);
  
  // Validation
  const validationErrors = useMemo(() => {
    if (!draft) return [];
    
    const errors: string[] = [];
    
    if (activeSections.includes('attack')) {
      if (!draft.attack?.painLevel.value) {
        errors.push('Schmerzstärke ist erforderlich');
      }
      if (!draft.attack?.date.value) {
        errors.push('Datum ist erforderlich');
      }
      if (!draft.attack?.time.value) {
        errors.push('Uhrzeit ist erforderlich');
      }
    }
    
    return errors;
  }, [draft, activeSections]);
  
  const isValid = validationErrors.length === 0;
  
  const hasUncertainFields = draft?.hasUncertainFields ?? false;
  
  return {
    draft,
    isProcessing,
    engineUsed,
    fallbackUsed,
    inputText,
    setInputText,
    processDraft,
    clearDraft,
    activeSections,
    addSection,
    removeSection,
    isSectionActive,
    availableSections,
    updateAttack,
    updateMedication,
    removeMedication,
    addMedication,
    updateSymptoms,
    updateTriggers,
    updateNotes,
    isValid,
    validationErrors,
    hasUncertainFields,
    aiSettings: aiSettings ?? null,
  };
}
