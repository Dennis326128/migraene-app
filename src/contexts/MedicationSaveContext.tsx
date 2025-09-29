import React, { createContext, useContext, useState, useCallback } from 'react';

interface MedicationSaveContextType {
  pendingSaves: Set<string>;
  addPendingSave: (id: string) => void;
  removePendingSave: (id: string) => void;
  hasPendingSaves: boolean;
  waitForAllSaves: () => Promise<void>;
}

const MedicationSaveContext = createContext<MedicationSaveContextType | undefined>(undefined);

export function MedicationSaveProvider({ children }: { children: React.ReactNode }) {
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set());

  const addPendingSave = useCallback((id: string) => {
    setPendingSaves(prev => new Set([...prev, id]));
  }, []);

  const removePendingSave = useCallback((id: string) => {
    setPendingSaves(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, []);

  const waitForAllSaves = useCallback(async () => {
    // Wait for all pending saves to complete
    return new Promise<void>((resolve) => {
      const checkSaves = () => {
        if (pendingSaves.size === 0) {
          resolve();
        } else {
          setTimeout(checkSaves, 100);
        }
      };
      checkSaves();
    });
  }, [pendingSaves.size]);

  const hasPendingSaves = pendingSaves.size > 0;

  return (
    <MedicationSaveContext.Provider value={{
      pendingSaves,
      addPendingSave,
      removePendingSave,
      hasPendingSaves,
      waitForAllSaves
    }}>
      {children}
    </MedicationSaveContext.Provider>
  );
}

export function useMedicationSave() {
  const context = useContext(MedicationSaveContext);
  if (context === undefined) {
    throw new Error('useMedicationSave must be used within a MedicationSaveProvider');
  }
  return context;
}