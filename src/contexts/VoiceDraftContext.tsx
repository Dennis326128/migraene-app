/**
 * VoiceDraft Context
 * Stores draft text from voice input to pass between components
 * Text is consumed (deleted) after prefill to avoid unexpected reappearance
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

interface VoiceDraftContextValue {
  draft: string | null;
  setVoiceDraft: (text: string) => void;
  consumeVoiceDraft: () => string | null;
  hasDraft: boolean;
}

const VoiceDraftContext = createContext<VoiceDraftContextValue | null>(null);

export function VoiceDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null);

  const setVoiceDraft = useCallback((text: string) => {
    setDraft(text);
  }, []);

  const consumeVoiceDraft = useCallback(() => {
    const currentDraft = draft;
    setDraft(null);
    return currentDraft;
  }, [draft]);

  return (
    <VoiceDraftContext.Provider
      value={{
        draft,
        setVoiceDraft,
        consumeVoiceDraft,
        hasDraft: draft !== null && draft.length > 0,
      }}
    >
      {children}
    </VoiceDraftContext.Provider>
  );
}

export function useVoiceDraft() {
  const context = useContext(VoiceDraftContext);
  if (!context) {
    throw new Error('useVoiceDraft must be used within VoiceDraftProvider');
  }
  return context;
}
