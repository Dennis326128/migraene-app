/**
 * Central medication input parser
 * Extracts structured medication info from free-text input (typed or spoken)
 * 
 * Example inputs:
 * - "Sumatriptan 100 mg bei Bedarf"
 * - "Ich nehme Sumatriptan 100 mg bei Bedarf"
 * - "Amitriptylin 10 mg, eine morgens und eine abends"
 */

export interface ParsedMedicationInfo {
  /** Clean display name: only medication name + strength, e.g. "Sumatriptan 100 mg" */
  displayName: string;
  /** Original text as entered by user */
  rawInput: string;
  /** Extracted numeric dose value, e.g. 100 */
  doseValue?: number;
  /** Extracted dose unit, e.g. "mg" */
  doseUnit?: string;
  /** True if "bei Bedarf" / "as needed" detected */
  isPrn?: boolean;
  /** Detected times of day */
  timesOfDay?: {
    morning?: boolean;
    noon?: boolean;
    evening?: boolean;
    night?: boolean;
  };
  /** Derived frequency per day based on times */
  frequencyPerDay?: number;
  /** Confidence score 0-1 */
  confidence: number;
  /** Any additional notes extracted */
  notes?: string;
}

// Common German filler words to remove
const FILLER_WORDS = [
  'ich', 'nehme', 'nimm', 'benutze', 'verwende', 'habe', 'hab',
  'das', 'die', 'der', 'den', 'dem', 'ein', 'eine', 'einen', 'einer',
  'medikament', 'tablette', 'tabletten', 'pille', 'pillen', 'kapsel', 'kapseln',
  'seit', 'schon', 'immer', 'täglich', 'regelmäßig',
  'und', 'oder', 'auch', 'noch', 'aber', 'dann', 'jetzt', 'gerade',
  'bitte', 'danke', 'okay', 'ok',
];

// Time-of-day patterns (German)
const TIME_PATTERNS = {
  morning: /\b(morgens?|früh|morgen|zum\s*frühstück)\b/i,
  noon: /\b(mittags?|zum\s*mittag(essen)?)\b/i,
  evening: /\b(abends?|zum\s*abend(essen)?)\b/i,
  night: /\b(nachts?|zur\s*nacht|vor\s*(dem\s*)?schlaf(en)?|schlafenszeit)\b/i,
};

// PRN (as-needed) patterns
const PRN_PATTERNS = [
  /\bbei\s*bedarf\b/i,
  /\bbedarfs?(weise)?\b/i,
  /\bwenn\s*(ich)?\s*(es)?\s*brauch(e)?\b/i,
  /\bbei\s*(kopf)?schmerz(en)?\b/i,
  /\bbei\s*migräne\b/i,
  /\bbei\s*anfall\b/i,
  /\bbei\s*attacke\b/i,
  /\bakut\b/i,
];

// Dose extraction patterns
const DOSE_PATTERNS = [
  // "100 mg", "100mg", "100 Milligramm"
  /(\d+(?:[.,]\d+)?)\s*(mg|milligramm|g|gramm|ml|milliliter|µg|mikrogramm|mcg)/i,
  // "100er" (German colloquial for mg)
  /(\d+)er\b/i,
];

// Known medication names for better parsing
const KNOWN_MEDICATIONS = [
  // Triptane
  'Sumatriptan', 'Rizatriptan', 'Maxalt', 'Zolmitriptan', 'Eletriptan', 
  'Relpax', 'Naratriptan', 'Almotriptan', 'Frovatriptan',
  // Schmerzmittel
  'Ibuprofen', 'Paracetamol', 'Aspirin', 'ASS', 'Novaminsulfon', 
  'Metamizol', 'Novalgin', 'Diclofenac', 'Naproxen', 'Thomapyrin',
  // Prophylaxe
  'Amitriptylin', 'Topiramat', 'Topamax', 'Propranolol', 'Metoprolol',
  'Flunarizin', 'Magnesium', 'Venlafaxin', 'Valproat',
  // CGRP
  'Ajovy', 'Fremanezumab', 'Aimovig', 'Erenumab', 'Emgality', 
  'Galcanezumab', 'Vyepti', 'Eptinezumab',
  // Antiemetika
  'MCP', 'Metoclopramid', 'Domperidon', 'Vomex',
];

/**
 * Main parsing function
 */
export function parseMedicationInput(input: string): ParsedMedicationInfo {
  const rawInput = input.trim();
  
  if (!rawInput) {
    return {
      displayName: '',
      rawInput: '',
      confidence: 0,
    };
  }

  let workingText = rawInput;
  let confidence = 0.8;

  // Extract dose information first (before cleaning)
  const doseInfo = extractDose(workingText);
  
  // Detect PRN status
  const isPrn = detectPrn(workingText);
  
  // Detect times of day
  const timesOfDay = detectTimesOfDay(workingText);
  const frequencyPerDay = calculateFrequency(timesOfDay);

  // Clean and extract medication name
  const cleanedName = extractMedicationName(workingText, doseInfo);
  
  // Build display name
  const displayName = buildDisplayName(cleanedName, doseInfo);
  
  // Adjust confidence based on what we found
  if (cleanedName) {
    confidence = isKnownMedication(cleanedName) ? 0.95 : 0.75;
  } else {
    confidence = 0.4;
  }

  return {
    displayName,
    rawInput,
    doseValue: doseInfo?.value,
    doseUnit: doseInfo?.unit,
    isPrn,
    timesOfDay: Object.keys(timesOfDay).length > 0 ? timesOfDay : undefined,
    frequencyPerDay: frequencyPerDay > 0 ? frequencyPerDay : undefined,
    confidence,
  };
}

/**
 * Extract dose value and unit from text
 */
function extractDose(text: string): { value: number; unit: string; raw: string } | null {
  for (const pattern of DOSE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      let unit = match[2] || 'mg';
      
      // Normalize unit
      unit = normalizeUnit(unit);
      
      return { value, unit, raw: match[0] };
    }
  }
  return null;
}

/**
 * Normalize dose unit to standard form
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase();
  if (normalized === 'milligramm') return 'mg';
  if (normalized === 'gramm') return 'g';
  if (normalized === 'milliliter') return 'ml';
  if (normalized === 'mikrogramm' || normalized === 'mcg') return 'µg';
  return normalized;
}

/**
 * Detect if medication is PRN (as-needed)
 */
function detectPrn(text: string): boolean {
  return PRN_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Detect times of day mentioned
 */
function detectTimesOfDay(text: string): ParsedMedicationInfo['timesOfDay'] {
  const result: ParsedMedicationInfo['timesOfDay'] = {};
  
  if (TIME_PATTERNS.morning.test(text)) result.morning = true;
  if (TIME_PATTERNS.noon.test(text)) result.noon = true;
  if (TIME_PATTERNS.evening.test(text)) result.evening = true;
  if (TIME_PATTERNS.night.test(text)) result.night = true;
  
  return result;
}

/**
 * Calculate frequency per day from times
 */
function calculateFrequency(timesOfDay: ParsedMedicationInfo['timesOfDay']): number {
  if (!timesOfDay) return 0;
  let count = 0;
  if (timesOfDay.morning) count++;
  if (timesOfDay.noon) count++;
  if (timesOfDay.evening) count++;
  if (timesOfDay.night) count++;
  return count;
}

/**
 * Extract the actual medication name from text
 */
function extractMedicationName(
  text: string, 
  doseInfo: { value: number; unit: string; raw: string } | null
): string {
  let workingText = text.toLowerCase();
  
  // Remove dose information
  if (doseInfo?.raw) {
    workingText = workingText.replace(doseInfo.raw.toLowerCase(), ' ');
  }
  
  // Remove PRN phrases
  for (const pattern of PRN_PATTERNS) {
    workingText = workingText.replace(pattern, ' ');
  }
  
  // Remove time-of-day phrases
  for (const pattern of Object.values(TIME_PATTERNS)) {
    workingText = workingText.replace(pattern, ' ');
  }
  
  // Remove common fillers and connectors
  const words = workingText.split(/[\s,;.]+/).filter(w => w.length > 0);
  const cleanedWords = words.filter(w => !FILLER_WORDS.includes(w.toLowerCase()));
  
  // Try to find a known medication name first
  for (const known of KNOWN_MEDICATIONS) {
    const knownLower = known.toLowerCase();
    const foundIndex = cleanedWords.findIndex(w => 
      w === knownLower || 
      levenshteinDistance(w, knownLower) <= Math.floor(knownLower.length * 0.25)
    );
    if (foundIndex !== -1) {
      return known; // Return the correctly capitalized version
    }
  }
  
  // If no known medication, take the first remaining word that looks like a name
  // (starts with capital letter in original, or is the longest word)
  if (cleanedWords.length > 0) {
    // Find the word in original text to preserve capitalization
    const originalWords = text.split(/[\s,;.]+/).filter(w => w.length > 0);
    
    for (const cleanWord of cleanedWords) {
      const originalWord = originalWords.find(w => 
        w.toLowerCase() === cleanWord.toLowerCase() ||
        w.toLowerCase().startsWith(cleanWord.toLowerCase())
      );
      if (originalWord && /^[A-ZÄÖÜ]/.test(originalWord)) {
        return originalWord;
      }
    }
    
    // Fallback: capitalize first cleaned word
    if (cleanedWords[0]) {
      return cleanedWords[0].charAt(0).toUpperCase() + cleanedWords[0].slice(1);
    }
  }
  
  return '';
}

/**
 * Build the display name from medication name and dose
 */
function buildDisplayName(
  medicationName: string, 
  doseInfo: { value: number; unit: string; raw: string } | null
): string {
  if (!medicationName) return '';
  
  if (doseInfo) {
    // Format dose nicely: "100 mg" (with space)
    const formattedDose = `${doseInfo.value} ${doseInfo.unit}`;
    return `${medicationName} ${formattedDose}`;
  }
  
  return medicationName;
}

/**
 * Check if medication name is known
 */
function isKnownMedication(name: string): boolean {
  const nameLower = name.toLowerCase();
  return KNOWN_MEDICATIONS.some(known => 
    known.toLowerCase() === nameLower ||
    levenshteinDistance(known.toLowerCase(), nameLower) <= 2
  );
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Convert parsed info to medication create input
 */
export function parsedToMedInput(parsed: ParsedMedicationInfo): {
  name: string;
  raw_input?: string;
  intake_type?: string;
  strength_value?: string;
  strength_unit?: string;
  dosis_morgens?: string;
  dosis_mittags?: string;
  dosis_abends?: string;
  dosis_nacht?: string;
} {
  const result: ReturnType<typeof parsedToMedInput> = {
    name: parsed.displayName,
    raw_input: parsed.rawInput !== parsed.displayName ? parsed.rawInput : undefined,
  };

  // Set intake type based on PRN detection
  if (parsed.isPrn) {
    result.intake_type = 'as_needed';
  } else if (parsed.frequencyPerDay && parsed.frequencyPerDay > 0) {
    result.intake_type = 'regular';
  }

  // Set strength if extracted
  if (parsed.doseValue !== undefined) {
    result.strength_value = String(parsed.doseValue);
  }
  if (parsed.doseUnit) {
    result.strength_unit = parsed.doseUnit;
  }

  // Set times of day for regular medications
  if (parsed.timesOfDay) {
    if (parsed.timesOfDay.morning) result.dosis_morgens = '1';
    if (parsed.timesOfDay.noon) result.dosis_mittags = '1';
    if (parsed.timesOfDay.evening) result.dosis_abends = '1';
    if (parsed.timesOfDay.night) result.dosis_nacht = '1';
  }

  return result;
}
