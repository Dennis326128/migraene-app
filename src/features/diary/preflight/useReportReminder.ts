/**
 * Hook for intelligent, contextual reminders when creating reports
 * 
 * Decision tree:
 * 1. Check what data is missing (personal, doctors, or both)
 * 2. Check if user has permanently disabled reminders
 * 3. Check if user has clicked "Later" today
 * 4. Show appropriate dialog with smart text
 * 5. Navigate to settings if user wants to add data
 */

import { useState, useCallback, useMemo } from "react";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import type { ReminderDialogType, MissingDataAnalysis } from "./types";
import {
  wasPersonalDataDismissedToday,
  wasDoctorsDismissedToday,
  dismissPersonalDataForToday,
  dismissDoctorsForToday,
  neverAskPersonalData,
  neverAskDoctors,
  isPersonalDataNeverAsk,
  isDoctorsNeverAsk,
} from "./reminderStorage";

interface UseReportReminderReturn {
  /** Whether data is still loading */
  isLoading: boolean;
  /** Whether to show the reminder dialog */
  showDialog: boolean;
  /** Type of dialog to show */
  dialogType: ReminderDialogType;
  /** Analysis of what data is missing */
  missingData: MissingDataAnalysis;
  /** Run the reminder check - returns true if should proceed immediately */
  runCheck: () => boolean;
  /** Handle "Later" button click */
  handleLater: () => void;
  /** Handle "Never ask" button click */
  handleNeverAsk: () => void;
  /** Handle navigation to settings */
  handleNavigate: (target: 'personal' | 'doctors') => void;
  /** Close dialog without action */
  closeDialog: () => void;
}

export function useReportReminder(
  onProceed: () => void,
  onNavigateToSettings: (target: 'personal' | 'doctors') => void
): UseReportReminderReturn {
  const { data: patientData, isLoading: patientLoading } = usePatientData();
  const { data: doctors = [], isLoading: doctorsLoading } = useDoctors();
  
  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<ReminderDialogType>(null);

  /**
   * Analyze what data is missing
   * Only checks RELEVANT fields for reports (not phone, email)
   */
  const missingData = useMemo<MissingDataAnalysis>(() => {
    const missingPersonalFields: ('name' | 'birthdate' | 'address' | 'insurance')[] = [];
    
    // Check name (first + last)
    const hasName = patientData?.first_name && patientData?.last_name;
    if (!hasName) missingPersonalFields.push('name');
    
    // Check birthdate
    if (!patientData?.date_of_birth) missingPersonalFields.push('birthdate');
    
    // Check address (need at least street and city)
    const hasAddress = patientData?.street && patientData?.city;
    if (!hasAddress) missingPersonalFields.push('address');
    
    // Check insurance
    const hasInsurance = patientData?.health_insurance || patientData?.insurance_number;
    if (!hasInsurance) missingPersonalFields.push('insurance');

    return {
      hasIncompletePersonalData: missingPersonalFields.length > 0,
      missingPersonalFields,
      hasMissingDoctors: doctors.length === 0,
    };
  }, [patientData, doctors]);

  /**
   * Run the reminder check
   * Returns true if we should proceed immediately (no dialog needed)
   */
  const runCheck = useCallback((): boolean => {
    const { hasIncompletePersonalData, hasMissingDoctors } = missingData;

    // Check permanent "never ask" settings
    const skipPersonal = isPersonalDataNeverAsk();
    const skipDoctors = isDoctorsNeverAsk();

    // Check "later" for today
    const personalDismissedToday = wasPersonalDataDismissedToday();
    const doctorsDismissedToday = wasDoctorsDismissedToday();

    // Determine what to show
    const showPersonalReminder = hasIncompletePersonalData && !skipPersonal && !personalDismissedToday;
    const showDoctorReminder = hasMissingDoctors && !skipDoctors && !doctorsDismissedToday;

    if (!showPersonalReminder && !showDoctorReminder) {
      // No reminder needed - proceed directly
      return true;
    }

    // Determine dialog type
    let type: ReminderDialogType = null;
    if (showPersonalReminder && showDoctorReminder) {
      type = 'both';
    } else if (showPersonalReminder) {
      type = 'personal';
    } else if (showDoctorReminder) {
      type = 'doctors';
    }

    setDialogType(type);
    setShowDialog(true);
    return false;
  }, [missingData]);

  /**
   * Handle "Later" - dismiss for today and proceed
   */
  const handleLater = useCallback(() => {
    // Mark as dismissed for today based on dialog type
    if (dialogType === 'personal' || dialogType === 'both') {
      dismissPersonalDataForToday();
    }
    if (dialogType === 'doctors' || dialogType === 'both') {
      dismissDoctorsForToday();
    }
    
    setShowDialog(false);
    setDialogType(null);
    onProceed();
  }, [dialogType, onProceed]);

  /**
   * Handle "Never ask again" - permanently disable and proceed
   */
  const handleNeverAsk = useCallback(() => {
    // Mark as never ask based on dialog type
    if (dialogType === 'personal' || dialogType === 'both') {
      neverAskPersonalData();
    }
    if (dialogType === 'doctors' || dialogType === 'both') {
      neverAskDoctors();
    }
    
    setShowDialog(false);
    setDialogType(null);
    onProceed();
  }, [dialogType, onProceed]);

  /**
   * Handle navigation to settings
   */
  const handleNavigate = useCallback((target: 'personal' | 'doctors') => {
    setShowDialog(false);
    setDialogType(null);
    onNavigateToSettings(target);
  }, [onNavigateToSettings]);

  /**
   * Close dialog without action (just continue)
   */
  const closeDialog = useCallback(() => {
    setShowDialog(false);
    setDialogType(null);
    onProceed();
  }, [onProceed]);

  return {
    isLoading: patientLoading || doctorsLoading,
    showDialog,
    dialogType,
    missingData,
    runCheck,
    handleLater,
    handleNeverAsk,
    handleNavigate,
    closeDialog,
  };
}
