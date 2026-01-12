import { useState, useCallback } from "react";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { 
  getDiaryPromptPreferences, 
  updateDiaryPromptPreference,
  updatePersonalFieldSkip 
} from "./api";
import type { MissingItem, DiaryCreationPromptPreferences, PreflightResult } from "./types";

interface PreflightState {
  isChecking: boolean;
  missingItems: MissingItem[];
  currentItemIndex: number;
  showWizard: boolean;
}

export function useDiaryPreflight(onProceed: () => void) {
  const { data: patientData, isLoading: patientLoading } = usePatientData();
  const { data: doctors = [], isLoading: doctorsLoading } = useDoctors();
  
  const [state, setState] = useState<PreflightState>({
    isChecking: false,
    missingItems: [],
    currentItemIndex: 0,
    showWizard: false,
  });

  /**
   * Run the preflight check
   */
  const runPreflight = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isChecking: true }));
    
    try {
      const preferences = await getDiaryPromptPreferences();
      const missingItems: MissingItem[] = [];

      // Check if personal data is completely missing
      const hasAnyPersonalData = patientData && (
        patientData.first_name || 
        patientData.last_name || 
        patientData.date_of_birth ||
        patientData.street ||
        patientData.city
      );

      if (!hasAnyPersonalData && !preferences.skipPersonalData) {
        missingItems.push({
          type: 'personalDataComplete',
          label: 'Persönliche Daten',
          description: 'Persönliche Daten (Name, Adresse) helfen beim Export und Teilen des Tagebuchs.',
        });
      } else if (hasAnyPersonalData) {
        // Check for specific missing fields only if some personal data exists
        
        // Insurance number
        if (!patientData?.insurance_number && !preferences.skipPersonalFields?.insuranceNumber) {
          missingItems.push({
            type: 'personalFieldInsuranceNumber',
            label: 'Versichertennummer',
            description: 'Deine Versichertennummer hilft bei der Zuordnung des Berichts.',
          });
        }

        // Date of birth
        if (!patientData?.date_of_birth && !preferences.skipPersonalFields?.dateOfBirth) {
          missingItems.push({
            type: 'personalFieldDateOfBirth',
            label: 'Geburtsdatum',
            description: 'Dein Geburtsdatum ist wichtig für medizinische Berichte.',
          });
        }
      }

      // Check for doctors
      if (doctors.length === 0 && !preferences.skipDoctors) {
        missingItems.push({
          type: 'doctors',
          label: 'Behandelnder Arzt',
          description: 'Ein behandelnder Arzt kann im Bericht angezeigt werden.',
        });
      }

      if (missingItems.length === 0) {
        // All data present or skipped - proceed directly
        onProceed();
        setState(prev => ({ ...prev, isChecking: false }));
      } else {
        // Show wizard
        setState({
          isChecking: false,
          missingItems,
          currentItemIndex: 0,
          showWizard: true,
        });
      }
    } catch (error) {
      console.error("Preflight check failed:", error);
      // On error, just proceed
      onProceed();
      setState(prev => ({ ...prev, isChecking: false }));
    }
  }, [patientData, doctors, onProceed]);

  /**
   * Get current missing item
   */
  const currentItem = state.missingItems[state.currentItemIndex] ?? null;

  /**
   * Handle "Later" - skip this item and move to next (or complete)
   */
  const handleLater = useCallback(() => {
    const nextIndex = state.currentItemIndex + 1;
    if (nextIndex >= state.missingItems.length) {
      // All items handled, proceed
      setState(prev => ({ ...prev, showWizard: false }));
      onProceed();
    } else {
      setState(prev => ({ ...prev, currentItemIndex: nextIndex }));
    }
  }, [state.currentItemIndex, state.missingItems.length, onProceed]);

  /**
   * Handle "Never ask again" - save preference and move to next
   */
  const handleNeverAsk = useCallback(async () => {
    if (!currentItem) return;
    
    // Save the preference
    switch (currentItem.type) {
      case 'personalDataComplete':
        await updateDiaryPromptPreference('skipPersonalData', true);
        break;
      case 'personalFieldInsuranceNumber':
        await updatePersonalFieldSkip('insuranceNumber', true);
        break;
      case 'personalFieldDateOfBirth':
        await updatePersonalFieldSkip('dateOfBirth', true);
        break;
      case 'doctors':
        await updateDiaryPromptPreference('skipDoctors', true);
        break;
    }
    
    handleLater();
  }, [currentItem, handleLater]);

  /**
   * Handle successful data entry - move to next or complete
   */
  const handleDataSaved = useCallback(() => {
    handleLater();
  }, [handleLater]);

  /**
   * Close wizard and cancel
   */
  const handleCancel = useCallback(() => {
    setState(prev => ({ ...prev, showWizard: false }));
  }, []);

  /**
   * Close wizard without proceeding (for navigation)
   */
  const closeWizard = useCallback(() => {
    setState(prev => ({ ...prev, showWizard: false }));
  }, []);

  return {
    isLoading: patientLoading || doctorsLoading,
    isChecking: state.isChecking,
    showWizard: state.showWizard,
    currentItem,
    currentIndex: state.currentItemIndex,
    totalItems: state.missingItems.length,
    runPreflight,
    handleLater,
    handleNeverAsk,
    handleDataSaved,
    handleCancel,
    closeWizard,
    patientData,
    doctors,
  };
}
