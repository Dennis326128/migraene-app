/**
 * Medication Reminder Heuristic
 * 
 * Determines if a medication should trigger a "Create reminder?" prompt
 * after saving. PRN/as-needed medications skip the prompt to reduce friction.
 * 
 * Based on common migraine acute/PRN medications:
 * - Triptans (American Migraine Foundation)
 * - NSAIDs/Analgesics (IHS/DMKG Guidelines)
 * - Antiemetics (acute attack use)
 * - Gepants/Ditans (acute options)
 * - Ergot derivatives
 */

// ═══════════════════════════════════════════════════════════════════════════
// PRN SKIP LIST - Medications that should NOT trigger reminder prompt
// ═══════════════════════════════════════════════════════════════════════════

const PRN_SKIP_KEYWORDS = new Set([
  // Triptans (all are acute/PRN)
  'sumatriptan',
  'zolmitriptan',
  'rizatriptan',
  'eletriptan',
  'almotriptan',
  'naratriptan',
  'frovatriptan',
  'triptan', // Catch-all for triptan variants
  
  // NSAIDs / Analgesics
  'ibuprofen',
  'ibu', // Common abbreviation
  'naproxen',
  'diclofenac',
  'acetylsalicylsaeure',
  'acetylsalicylsäure',
  'ass', // Aspirin abbreviation
  'aspirin',
  'paracetamol',
  'acetaminophen',
  'metamizol',
  'novalgin',
  'novaminsulfon',
  
  // Antiemetics (acute use)
  'metoclopramid',
  'metoclopramide',
  'mcp', // Common abbreviation
  'domperidon',
  'domperidone',
  'prochlorperazin',
  'prochlorperazine',
  'vomex',
  'dimenhydrinat',
  
  // Gepants / Ditans (acute)
  'ubrogepant',
  'rimegepant',
  'zavegepant',
  'lasmiditan',
  
  // Ergot derivatives
  'dihydroergotamin',
  'dihydroergotamine',
  'dhe',
  'ergotamin',
  'ergotamine',
  
  // Opioid-containing (PRN, sensitive but UX-wise skip)
  'codein',
  'codeine',
  'tramadol',
  'tilidin',
]);

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalizes medication name for matching:
 * - Lowercase
 * - Remove special characters
 * - Normalize umlauts
 * - Trim whitespace
 */
export function normalizeMedicationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ');    // Collapse multiple spaces
}

// ═══════════════════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checks if a medication name matches PRN/as-needed patterns.
 * Returns true if the medication is typically used as-needed (skip reminder prompt).
 */
export function isPrnMedication(name: string): boolean {
  const normalized = normalizeMedicationName(name);
  
  // Check exact match or contains any PRN keyword
  for (const keyword of PRN_SKIP_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Medication intake type from database
 */
export type MedicationIntakeType = 'as_needed' | 'regular' | undefined | null;

/**
 * Determines if we should offer a reminder prompt after saving a medication.
 * 
 * Priority:
 * 1. If intake_type is explicitly set, use that
 * 2. Otherwise, check against PRN skip list
 * 3. Default: offer reminder (err on side of helpfulness)
 */
export function shouldOfferReminderPrompt(
  medicationName: string,
  intakeType?: MedicationIntakeType
): boolean {
  // Priority 1: Explicit intake type
  if (intakeType === 'as_needed') {
    return false; // PRN - skip prompt
  }
  if (intakeType === 'regular') {
    return true; // Scheduled - always offer
  }
  
  // Priority 2: Heuristic based on medication name
  if (isPrnMedication(medicationName)) {
    return false; // Detected as PRN - skip prompt
  }
  
  // Priority 3: Default - offer reminder for unknown medications
  // (Could be prophylaxis like Topiramat, Amitriptylin, CGRP-mAbs)
  return true;
}

/**
 * Get display label for intake type
 */
export function getIntakeTypeLabel(intakeType?: MedicationIntakeType): string {
  switch (intakeType) {
    case 'as_needed':
      return 'Bei Bedarf';
    case 'regular':
      return 'Regelmäßig';
    default:
      return 'Unbekannt';
  }
}

/**
 * Suggests a default intake type based on medication name
 */
export function suggestIntakeType(medicationName: string): MedicationIntakeType {
  return isPrnMedication(medicationName) ? 'as_needed' : 'regular';
}
