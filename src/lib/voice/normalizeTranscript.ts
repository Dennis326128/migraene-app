/**
 * Unified Transcript Normalization
 * Central normalization function for the entire voice pipeline
 * 
 * Applied BEFORE any intent classification or entity extraction
 */

// ASR-specific replacements to handle common transcription errors
const ASR_REPLACEMENTS: Array<[RegExp, string]> = [
  // German contractions
  [/\b('ner|ner|'ne|ne)\s+/gi, 'einer '],
  [/\b('nen|nen)\s+/gi, 'einen '],
  [/\b('nem|nem)\s+/gi, 'einem '],
  // Time abbreviations
  [/\b1\s*h\b/gi, '1 stunde'],
  [/\b(\d+)\s*h\b/gi, '$1 stunden'],
  [/\b(\d+)\s*min\b/gi, '$1 minuten'],
  [/\b(\d+)\s*std\b/gi, '$1 stunden'],
  // Pain scale notation
  [/(\d+)\s*\/\s*10\b/gi, '$1 von 10'],
  [/(\d+)\s*von\s*zehn/gi, '$1'],
  // Common time phrases
  [/\bheute\s+morgen\b/gi, 'heute morgen'],
  [/\bgestern\s+abend\b/gi, 'gestern abend'],
  // Dosage variations - normalize mg patterns
  [/\bm\s*g\b/gi, 'mg'],
  [/\bmilli\s*gram+\b/gi, 'milligramm'],
  [/\bmikro\s*gram+\b/gi, 'mikrogramm'],
  // Common ASR errors for medications
  [/\bsomatriptan\b/gi, 'sumatriptan'],
  [/\bzomatriptan\b/gi, 'sumatriptan'],
  [/\brisatriptan\b/gi, 'rizatriptan'],
  [/\biboprofen\b/gi, 'ibuprofen'],
];

export interface NormalizedResult {
  original: string;
  normalized: string;
  tokens: string[];
}

/**
 * Main normalization function
 * Use this everywhere in the voice pipeline before processing
 */
export function normalizeTranscript(text: string): NormalizedResult {
  if (!text) {
    return { original: '', normalized: '', tokens: [] };
  }

  // 1. Trim and lowercase
  let normalized = text.toLowerCase().trim();
  
  // 2. Apply ASR replacements
  for (const [pattern, replacement] of ASR_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  
  // 3. Normalize umlauts for consistent matching
  normalized = normalizeUmlauts(normalized);
  
  // 4. Remove multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 5. Tokenize
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
  
  return {
    original: text,
    normalized,
    tokens
  };
}

/**
 * Normalize German umlauts to ASCII equivalents
 * ü → ue, ö → oe, ä → ae, ß → ss
 */
export function normalizeUmlauts(text: string): string {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Check if text contains add-medication verbs
 * Works on already normalized text (umlauts converted)
 */
export function hasAddMedicationVerb(normalizedText: string): boolean {
  const addVerbs = [
    /\bfuege\b/,           // füge (normalized)
    /\bhinzufuegen\b/,     // hinzufügen (normalized)
    /\banlegen\b/,
    /\blege\s+.+\s+an\b/,
    /\bleg\s+.+\s+an\b/,
    /\berstell/,
    /\bspeichere?\b/,
    /\bneues?\s+medikament/,
    /\bmedikament\s+hinzu/,
    /\bmedikament\s+anlegen/,
  ];
  
  return addVerbs.some(pattern => pattern.test(normalizedText));
}

/**
 * Check if text contains pain-related keywords
 */
export function hasPainKeywords(normalizedText: string): boolean {
  const painKeywords = [
    /\bschmerz/,
    /\bkopfschmerz/,
    /\bmigraene\b/,  // normalized from migräne
    /\battacke\b/,
    /\banfall\b/,
    /\bstaerke\s*\d/,  // normalized from stärke
    /\blevel\s*\d/,
    /\bintensitaet\b/, // normalized from intensität
  ];
  
  return painKeywords.some(pattern => pattern.test(normalizedText));
}

/**
 * Check if text contains analytics/question keywords
 */
export function hasAnalyticsKeywords(normalizedText: string): boolean {
  const analyticsKeywords = [
    /\bwie\s*viel/,
    /\bwieviel/,
    /\bwie\s*oft/,
    /\bwie\s*lang/,
    /\bdurchschnitt/,
    /\bstatistik/,
    /\bauswertung/,
    /\banalyse\b/,
    /\buebersicht\b/,  // normalized from übersicht
    /\bletzt\w*\s+\d+\s+tag/,
    /\bschmerzfrei/,
    /\bohne\s+(kopf)?schmerz/,
  ];
  
  return analyticsKeywords.some(pattern => pattern.test(normalizedText));
}

/**
 * Detect dosage patterns in text (e.g., "500 mg", "20mg")
 */
export function hasDosagePattern(normalizedText: string): boolean {
  return /\b\d{1,4}\s*(mg|milligramm|mcg|mikrogramm|ml|g)\b/i.test(normalizedText);
}

/**
 * Extract medication name candidate near a dosage
 * Returns the word(s) immediately before or after the dosage pattern
 */
export function extractMedNameNearDosage(normalizedText: string): string | null {
  // Pattern: word(s) followed by dosage
  const beforeMatch = normalizedText.match(/\b([a-z]{3,}(?:\s+[a-z]{3,})?)\s+\d{1,4}\s*(?:mg|milligramm|mcg|ml)/i);
  if (beforeMatch) {
    return beforeMatch[1].trim();
  }
  
  // Pattern: dosage followed by word(s)
  const afterMatch = normalizedText.match(/\d{1,4}\s*(?:mg|milligramm|mcg|ml)\s+([a-z]{3,})/i);
  if (afterMatch) {
    return afterMatch[1].trim();
  }
  
  return null;
}
