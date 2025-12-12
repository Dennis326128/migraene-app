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
import { useMeds } from '@/features/meds/hooks/useMeds';

interface UseDraftComposerReturn {
  // Draft state
  draft: DraftResult | null;
  isProcessing: boolean;
  
  // Input
  inputText: string;
  setInputText: (text: string) => void;
  processDraft: () => void;
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
}

const ALL_SECTIONS: DraftSectionType[] = [
  'attack', 'medication', 'effect', 'symptoms', 'triggers', 'notes', 'other'
];

export function useDraftComposer(): UseDraftComposerReturn {
  const { data: userMeds = [] } = useMeds();
  
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSections, setActiveSections] = useState<DraftSectionType[]>([]);
  
  // Process text to draft
  const processDraft = useCallback(() => {
    if (!inputText.trim()) return;
    
    setIsProcessing(true);
    
    try {
      const { draft: newDraft } = parseTextToDraft(
        inputText, 
        userMeds.map(m => ({ id: m.id, name: m.name, wirkstoff: m.wirkstoff }))
      );
      
      setDraft(newDraft);
      setActiveSections(newDraft.activeSections);
    } catch (error) {
      console.error('Failed to parse draft:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, userMeds]);
  
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
  };
}
