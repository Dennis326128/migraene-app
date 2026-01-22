// Types for diary creation preflight check

/**
 * Categories of missing data for intelligent reminders
 */
export type MissingDataCategory = 
  | 'personal'  // Name, birthdate, address, insurance
  | 'doctors';  // No doctors configured

/**
 * Result of analyzing what data is missing
 */
export interface MissingDataAnalysis {
  /** Personal data is incomplete (name, birthdate, address, insurance) */
  hasIncompletePersonalData: boolean;
  /** Specific missing personal fields for detailed messaging */
  missingPersonalFields: ('name' | 'birthdate' | 'address' | 'insurance')[];
  /** No doctors configured */
  hasMissingDoctors: boolean;
}

/**
 * User preferences for reminder suppression
 * Stored in localStorage with daily "later" tracking
 */
export interface ReminderPreferences {
  /** Permanently skip personal data reminders */
  neverAskPersonalData?: boolean;
  /** Permanently skip doctor reminders */
  neverAskDoctors?: boolean;
  /** Date string (YYYY-MM-DD) when "Later" was clicked for personal data */
  laterPersonalDataDate?: string;
  /** Date string (YYYY-MM-DD) when "Later" was clicked for doctors */
  laterDoctorsDate?: string;
}

/**
 * Dialog state for the reminder modal
 */
export type ReminderDialogType = 
  | 'personal'      // Only personal data missing
  | 'doctors'       // Only doctors missing
  | 'both'          // Both missing
  | null;           // No dialog needed

// Legacy types for backwards compatibility
export type MissingItemType = 
  | 'personalDataComplete'
  | 'personalFieldInsuranceNumber'
  | 'personalFieldDateOfBirth'
  | 'doctors';

export interface MissingItem {
  type: MissingItemType;
  label: string;
  description: string;
}

export interface DiaryCreationPromptPreferences {
  skipPersonalData?: boolean;
  skipDoctors?: boolean;
  skipPersonalFields?: {
    insuranceNumber?: boolean;
    dateOfBirth?: boolean;
  };
}

export interface PreflightResult {
  canProceed: boolean;
  missingItems: MissingItem[];
}
