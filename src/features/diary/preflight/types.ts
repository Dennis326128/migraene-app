// Types for diary creation preflight check

export type MissingItemType = 
  | 'personalDataComplete'      // Personal data completely missing
  | 'personalFieldInsuranceNumber'  // Just insurance number missing
  | 'personalFieldDateOfBirth'      // Just date of birth missing
  | 'doctors';                  // No doctors configured

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
