import { berlinDateToday } from "@/lib/tz";

// ============================================
// Types
// ============================================

export type ConfidenceLevelType = 'high' | 'medium' | 'low';

export interface ParsedMedicationHit {
  raw: string;
  normalizedName: string;
  matchedMedicationId?: string;
  matchedMedicationName?: string;
  doseQuarters?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  strengthMg?: number;
  confidence: number;
}

export interface ParsedVoiceEntry {
  selectedDate: string;
  selectedTime: string;
  painLevel: string;
  medications: string[]; // Legacy: string array for backwards compatibility
  medicationsStructured: ParsedMedicationHit[]; // New: structured medication data
  notes: string;
  isNow: boolean;
  confidence: {
    time: ConfidenceLevelType;
    pain: ConfidenceLevelType;
    meds: ConfidenceLevelType;
  };
  medicationEffect?: {
    rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
    medName?: string;
    sideEffects?: string[];
    confidence: ConfidenceLevelType;
  };
}

// ============================================
// ADD_MEDICATION Parsing Types
// ============================================

export interface ParsedAddMedication {
  name: string;
  displayName: string; // Title-cased for UI
  strengthValue?: number;
  strengthUnit?: 'mg' | 'ml' | 'µg' | 'mcg' | 'g';
  formFactor?: 'tablette' | 'kapsel' | 'spray' | 'tropfen' | 'injektion' | 'pflaster' | 'spritze';
  confidence: number;
  rawInput: string;
}

interface NormalizedTranscript {
  original: string;
  normalized: string;
  tokens: string[];
}

interface TimeResult {
  date: string;
  time: string;
  isNow: boolean;
}

// ============================================
// Constants - Compiled once for performance
// ============================================

// Extended number words (0-60 for minutes)
const NUMBER_WORDS: Record<string, number> = {
  'null': 0, 'kein': 0, 'keine': 0,
  'eins': 1, 'ein': 1, 'eine': 1, 'einen': 1, 'einer': 1,
  'zwei': 2, 'zwo': 2,
  'drei': 3,
  'vier': 4,
  'fünf': 5, 'fuenf': 5,
  'sechs': 6,
  'sieben': 7,
  'acht': 8,
  'neun': 9,
  'zehn': 10,
  'elf': 11,
  'zwölf': 12, 'zwoelf': 12,
  'dreizehn': 13,
  'vierzehn': 14,
  'fünfzehn': 15, 'fuenfzehn': 15,
  'sechzehn': 16,
  'siebzehn': 17,
  'achtzehn': 18,
  'neunzehn': 19,
  'zwanzig': 20,
  'einundzwanzig': 21,
  'zweiundzwanzig': 22,
  'dreiundzwanzig': 23,
  'vierundzwanzig': 24,
  'fünfundzwanzig': 25, 'fuenfundzwanzig': 25,
  'dreißig': 30, 'dreissig': 30,
  'vierzig': 40,
  'fünfzig': 50, 'fuenfzig': 50,
  'sechzig': 60,
};

// Medication aliases (common ASR errors + abbreviations)
const MEDICATION_ALIASES: Record<string, string> = {
  // Triptans
  'suma': 'sumatriptan',
  'sumatriptan': 'sumatriptan',
  'somatriptan': 'sumatriptan', // Common ASR error
  'zomatriptan': 'sumatriptan',
  'sumo': 'sumatriptan',
  'riza': 'rizatriptan',
  'rizatriptan': 'rizatriptan',
  'risatriptan': 'rizatriptan',
  'maxalt': 'rizatriptan',
  'nara': 'naratriptan',
  'naratriptan': 'naratriptan',
  'ele': 'eletriptan',
  'eletriptan': 'eletriptan',
  'relpax': 'eletriptan',
  'almo': 'almotriptan',
  'almotriptan': 'almotriptan',
  'frova': 'frovatriptan',
  'frovatriptan': 'frovatriptan',
  'zolmi': 'zolmitriptan',
  'zolmitriptan': 'zolmitriptan',
  'imigran': 'sumatriptan',
  // NSAIDs
  'ibu': 'ibuprofen',
  'ibuprofen': 'ibuprofen',
  'iboprofen': 'ibuprofen',
  'para': 'paracetamol',
  'paracetamol': 'paracetamol',
  'aspirin': 'acetylsalicylsaeure',
  'ass': 'acetylsalicylsaeure',
  'acetylsalicylsäure': 'acetylsalicylsaeure',
  'naproxen': 'naproxen',
  'diclofenac': 'diclofenac',
  'diclo': 'diclofenac',
  'voltaren': 'diclofenac',
  // Others
  'novalgin': 'metamizol',
  'metamizol': 'metamizol',
  'novaminsulfon': 'metamizol',
  'mcp': 'metoclopramid',
  'metoclopramid': 'metoclopramid',
  'vomex': 'dimenhydrinat',
  'dimenhydrinat': 'dimenhydrinat',
};

// ASR normalization replacements
const ASR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b('ner|ner|'ne|ne)\s+/gi, 'einer '],
  [/\b('nen|nen)\s+/gi, 'einen '],
  [/\b('nem|nem)\s+/gi, 'einem '],
  [/\b1\s*h\b/gi, '1 stunde'],
  [/\b(\d+)\s*h\b/gi, '$1 stunden'],
  [/\b(\d+)\s*min\b/gi, '$1 minuten'],
  [/\b(\d+)\s*std\b/gi, '$1 stunden'],
  [/(\d+)\s*\/\s*10\b/gi, '$1 von 10'],
  [/(\d+)\s*von\s*zehn/gi, '$1'],
  [/\bheute\s+morgen\b/gi, 'heute morgen'],
  [/\bgestern\s+abend\b/gi, 'gestern abend'],
];

// Pre-compiled regex patterns
const RELATIVE_TIME_PATTERNS = [
  { regex: /\b(vor|seit)\s+(\d+(?:[.,]\d+)?)\s*(minute(?:n)?|min)/i, type: 'minutes' as const },
  { regex: /\b(vor|seit)\s+(\d+(?:[.,]\d+)?)\s*(stunde(?:n)?|std|h)/i, type: 'hours' as const },
  { regex: /\b(vor|seit)\s+(einer?|einem)\s*(minute)/i, type: 'one_minute' as const },
  { regex: /\b(vor|seit)\s+(einer?|einem)\s*(stunde)/i, type: 'one_hour' as const },
  { regex: /\b(anderthalb|eineinhalb)\s*(stunde(?:n)?)/i, type: 'ninety_minutes' as const },
  { regex: /\b(anderthalb|eineinhalb)\s*(minute(?:n)?)/i, type: 'ninety_seconds' as const },
];

const ABSOLUTE_TIME_PATTERNS = [
  { regex: /\b(?:um|gegen)?\s*(\d{1,2})[:.](\d{2})\b/i, type: 'clock' as const },
  { regex: /\b(?:um|gegen)?\s*(\d{1,2})\s*uhr(?:\s*(\d{1,2}))?\b/i, type: 'uhr' as const },
  { regex: /\bhalb\s+(\d{1,2})\b/i, type: 'halb' as const },
  { regex: /\bviertel\s+nach\s+(\d{1,2})\b/i, type: 'viertel_nach' as const },
  { regex: /\bviertel\s+vor\s+(\d{1,2})\b/i, type: 'viertel_vor' as const },
  { regex: /\bdrei\s*viertel\s+(\d{1,2})\b/i, type: 'drei_viertel' as const },
];

const NOW_PATTERNS = /\b(jetzt|gerade|sofort|eben|soeben|aktuell)\b/i;

const DAY_PATTERNS: Array<{ regex: RegExp; daysAgo: number; defaultHour?: number }> = [
  { regex: /\bheute\s+morgen\b/i, daysAgo: 0, defaultHour: 7 },
  { regex: /\bheute\s+mittag\b/i, daysAgo: 0, defaultHour: 12 },
  { regex: /\bheute\s+nachmittag\b/i, daysAgo: 0, defaultHour: 15 },
  { regex: /\bheute\s+abend\b/i, daysAgo: 0, defaultHour: 20 },
  { regex: /\bheute\s+nacht\b/i, daysAgo: 0, defaultHour: 23 },
  { regex: /\bgestern\s+morgen\b/i, daysAgo: 1, defaultHour: 7 },
  { regex: /\bgestern\s+mittag\b/i, daysAgo: 1, defaultHour: 12 },
  { regex: /\bgestern\s+nachmittag\b/i, daysAgo: 1, defaultHour: 15 },
  { regex: /\bgestern\s+abend\b/i, daysAgo: 1, defaultHour: 20 },
  { regex: /\bgestern\s+nacht\b/i, daysAgo: 1, defaultHour: 23 },
  { regex: /\bgestern\b/i, daysAgo: 1 },
  { regex: /\bvorgestern\b/i, daysAgo: 2 },
];

const PAIN_CONTEXT_REGEX = /\b(schmerz|pain|migräne|kopfschmerz|stärke|level|intensität|attacke|skala)/i;
const MG_CONTEXT_REGEX = /\b\d+\s*mg\b/i;

const DOSE_PATTERNS: Array<{ regex: RegExp; quarters: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }> = [
  { regex: /\b(ein\s*)?viertel\b/i, quarters: 1 },
  { regex: /\b(1\/4|0[.,]25)\b/i, quarters: 1 },
  { regex: /\bhalbe?\b/i, quarters: 2 },
  { regex: /\b(1\/2|0[.,]5)\b/i, quarters: 2 },
  { regex: /\bdrei\s*viertel\b/i, quarters: 3 },
  { regex: /\b(3\/4|0[.,]75)\b/i, quarters: 3 },
  { regex: /\b(eine?|1)\s*tablette?\b/i, quarters: 4 },
  { regex: /\banderthalb\s*tablette/i, quarters: 6 },
  { regex: /\b(eineinhalb|1[.,]5)\s*tablette/i, quarters: 6 },
  { regex: /\b(zwei|2)\s*tablette/i, quarters: 8 },
];

const EFFECT_PATTERNS: Array<{ regex: RegExp; rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good' }> = [
  { regex: /\b(gar\s*nicht|überhaupt\s*nicht|null|keine\s*wirkung|unwirksam)\b/i, rating: 'none' },
  { regex: /\b(schlecht|kaum|wenig|schwach|nicht\s*geholfen)\b/i, rating: 'poor' },
  { regex: /\b(mittel|ok|okay|mittelgut|etwas|teilweise|einigermaßen)\b/i, rating: 'moderate' },
  { regex: /\b(gut|besser|geholfen|wirksam|effektiv)\b/i, rating: 'good' },
  { regex: /\b(sehr\s*gut|ausgezeichnet|perfekt|super|toll|hervorragend|bestens)\b/i, rating: 'very_good' },
];

// ADD_MEDICATION trigger patterns (use normalized umlaut-free forms: ü→ue, etc.)
const ADD_MEDICATION_TRIGGERS = [
  /\b(fuege)\s+.+\s+(hinzu|an)\b/i,           // "füge X hinzu" (normalized)
  /\b(lege|leg)\s+.+\s+an\b/i,                 // "lege X an"
  /\bneues?\s+medikament\b/i,                  // "neues medikament"
  /\bmedikament\s+(hinzufuegen|anlegen|erstellen)\b/i, // "medikament hinzufügen"
  /\b(erstelle?|erstell)\s+(?:ein\s+)?medikament\b/i, // "erstelle medikament"
  /\bmedikament\s+(?:mit\s+(?:dem\s+)?namen?)\b/i,    // "medikament mit dem namen"
  /\b(speichere?|speicher)\s+(?:das\s+)?medikament\b/i, // "speichere medikament"
  /\bneue\s+(?:arznei|medizin)\b/i,            // "neue arznei"
  /\bhinzufuegen\b/i,                          // standalone "hinzufügen" (normalized)
];

// Strength unit patterns for medication parsing
const STRENGTH_UNIT_PATTERN = /\b(\d{1,4})\s*(mg|milligramm|mcg|µg|mikrogramm|g|gramm|ml|milliliter)\b/i;

// Form factor patterns
const FORM_FACTOR_PATTERNS: Array<{ regex: RegExp; form: ParsedAddMedication['formFactor'] }> = [
  { regex: /\btablette?n?\b/i, form: 'tablette' },
  { regex: /\bkapsel[n]?\b/i, form: 'kapsel' },
  { regex: /\b(nasen)?spray\b/i, form: 'spray' },
  { regex: /\btropfen\b/i, form: 'tropfen' },
  { regex: /\binjektion(?:en)?\b/i, form: 'injektion' },
  { regex: /\bspritze[n]?\b/i, form: 'spritze' },
  { regex: /\bpflaster\b/i, form: 'pflaster' },
];

// ============================================
// Normalization Layer
// ============================================

export function normalizeTranscriptDE(text: string): NormalizedTranscript {
  let normalized = text.toLowerCase().trim();
  
  // Apply ASR replacements
  for (const [pattern, replacement] of ASR_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  
  // Normalize umlauts for consistency
  normalized = normalized
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')  
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  
  // Remove double spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Tokenize
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
  
  return {
    original: text,
    normalized,
    tokens
  };
}

function convertNumberWordsInText(text: string): string {
  let result = text;
  
  // Sort by length desc to match longer words first
  const sortedWords = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  
  for (const word of sortedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, String(NUMBER_WORDS[word]));
  }
  
  return result;
}

// ============================================
// Levenshtein Distance (for fuzzy matching)
// ============================================

export function levenshteinDistance(a: string, b: string): number {
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

export function calculateSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

// ============================================
// Time Parsing
// ============================================

function parseTime(text: string, tokens: string[]): TimeResult {
  const now = new Date();
  const today = berlinDateToday();
  const textWithNumbers = convertNumberWordsInText(text);
  
  // 1. Check for "now" indicators first (highest priority)
  if (NOW_PATTERNS.test(text)) {
    console.log('🕒 Time parsed as "now"');
    return { 
      date: today, 
      time: now.toTimeString().slice(0, 5),
      isNow: true 
    };
  }
  
  // 2. Check relative time patterns
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    const match = textWithNumbers.match(pattern.regex);
    if (match) {
      let deltaMinutes = 0;
      
      switch (pattern.type) {
        case 'minutes':
          deltaMinutes = parseFloat(match[2].replace(',', '.'));
          break;
        case 'hours':
          deltaMinutes = parseFloat(match[2].replace(',', '.')) * 60;
          break;
        case 'one_minute':
          deltaMinutes = 1;
          break;
        case 'one_hour':
          deltaMinutes = 60;
          break;
        case 'ninety_minutes':
          deltaMinutes = 90;
          break;
        case 'ninety_seconds':
          deltaMinutes = 1.5;
          break;
      }
      
      const targetTime = new Date(now.getTime() - deltaMinutes * 60 * 1000);
      console.log(`🕒 Relative time: ${deltaMinutes}min ago -> ${targetTime.toISOString()}`);
      
      return {
        date: targetTime.toISOString().split('T')[0],
        time: targetTime.toTimeString().slice(0, 5),
        isNow: false
      };
    }
  }
  
  // 3. Check absolute time patterns
  for (const pattern of ABSOLUTE_TIME_PATTERNS) {
    const match = textWithNumbers.match(pattern.regex);
    if (match) {
      let hours = 0;
      let minutes = 0;
      
      switch (pattern.type) {
        case 'clock':
          hours = parseInt(match[1], 10);
          minutes = parseInt(match[2], 10);
          break;
        case 'uhr':
          hours = parseInt(match[1], 10);
          minutes = match[2] ? parseInt(match[2], 10) : 0;
          break;
        case 'halb':
          // "halb drei" = 2:30 (German convention)
          hours = (parseInt(match[1], 10) - 1 + 24) % 24;
          minutes = 30;
          break;
        case 'viertel_nach':
          hours = parseInt(match[1], 10);
          minutes = 15;
          break;
        case 'viertel_vor':
          hours = (parseInt(match[1], 10) - 1 + 24) % 24;
          minutes = 45;
          break;
        case 'drei_viertel':
          hours = (parseInt(match[1], 10) - 1 + 24) % 24;
          minutes = 45;
          break;
      }
      
      // Clamp values
      hours = Math.max(0, Math.min(23, hours));
      minutes = Math.max(0, Math.min(59, minutes));
      
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      console.log(`🕒 Absolute time: ${timeStr}`);
      
      return {
        date: today,
        time: timeStr,
        isNow: false
      };
    }
  }
  
  // 4. Check day patterns with defaults
  for (const dayPattern of DAY_PATTERNS) {
    if (dayPattern.regex.test(text)) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - dayPattern.daysAgo);
      
      let timeStr = now.toTimeString().slice(0, 5);
      if (dayPattern.defaultHour !== undefined) {
        timeStr = `${String(dayPattern.defaultHour).padStart(2, '0')}:00`;
      }
      
      console.log(`🕒 Day pattern: ${dayPattern.daysAgo} days ago, ${timeStr}`);
      
      return {
        date: targetDate.toISOString().split('T')[0],
        time: timeStr,
        isNow: false
      };
    }
  }
  
  // 5. Default to "now"
  console.log('🕒 No specific time found, defaulting to "now"');
  return { 
    date: today, 
    time: now.toTimeString().slice(0, 5),
    isNow: true 
  };
}

// ============================================
// Pain Level Parsing
// ============================================

function parsePainLevel(text: string, tokens: string[]): string {
  const textWithNumbers = convertNumberWordsInText(text);
  
  // Avoid mg values being interpreted as pain
  const sanitizedText = textWithNumbers.replace(/\d+\s*mg/gi, '');
  
  // 1. Look for explicit pain context + number
  const painContextMatch = sanitizedText.match(/(?:schmerz|pain|staerke|level|intensitaet|skala)[^\d]*(\d{1,2})/i);
  if (painContextMatch) {
    const level = parseInt(painContextMatch[1], 10);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 Pain with context: ${level}`);
      return String(level);
    }
  }
  
  // 2. Look for "X von 10" pattern
  const vonZehnMatch = sanitizedText.match(/(\d{1,2})\s*(?:von\s*10|\/10)/i);
  if (vonZehnMatch) {
    const level = parseInt(vonZehnMatch[1], 10);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 Pain X/10: ${level}`);
      return String(level);
    }
  }
  
  // 3. Look for number + pain context (reversed order)
  const reversedMatch = sanitizedText.match(/(\d{1,2})[^\d]*(?:schmerz|pain|migräne|kopfschmerz)/i);
  if (reversedMatch) {
    const level = parseInt(reversedMatch[1], 10);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 Pain reversed: ${level}`);
      return String(level);
    }
  }
  
  // 4. Intensity words as fallback
  if (/\b(sehr\s*stark|unertraeglich|extrem|heftig|maximal)\b/i.test(text)) {
    console.log('🎯 Pain intensity: very strong -> 9');
    return '9';
  }
  if (/\b(stark|schwer|massiv)\b/i.test(text)) {
    console.log('🎯 Pain intensity: strong -> 7');
    return '7';
  }
  if (/\b(mittel|maessig|normal)\b/i.test(text)) {
    console.log('🎯 Pain intensity: medium -> 5');
    return '5';
  }
  if (/\b(leicht|schwach|gering)\b/i.test(text)) {
    console.log('🎯 Pain intensity: light -> 2');
    return '2';
  }
  if (/\b(keine?|null)\s*(schmerz|migräne|kopfschmerz)/i.test(text)) {
    console.log('🎯 Pain: none -> 0');
    return '0';
  }
  
  // 5. Last resort: find any standalone number 0-10 that's not in mg context
  const standaloneMatch = sanitizedText.match(/\b([0-9]|10)\b/);
  if (standaloneMatch && PAIN_CONTEXT_REGEX.test(text)) {
    const level = parseInt(standaloneMatch[1], 10);
    console.log(`🎯 Pain standalone: ${level}`);
    return String(level);
  }
  
  console.log('🎯 No pain level found');
  return '';
}

// ============================================
// Dose Extraction
// ============================================

function extractDoseQuarters(tokenWindow: string[]): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | undefined {
  const windowText = tokenWindow.join(' ');
  
  for (const pattern of DOSE_PATTERNS) {
    if (pattern.regex.test(windowText)) {
      console.log(`💊 Dose found: ${pattern.quarters} quarters`);
      return pattern.quarters;
    }
  }
  
  return undefined;
}

// ============================================
// Medication Parsing (Structured)
// ============================================

interface UserMed {
  id?: string;
  name: string;
}

function parseMedicationsStructured(
  text: string,
  tokens: string[],
  userMeds: UserMed[]
): ParsedMedicationHit[] {
  const hits: ParsedMedicationHit[] = [];
  const foundNames = new Set<string>();
  
  // Normalize user meds for matching
  const normalizedUserMeds = userMeds.map(m => ({
    ...m,
    normalized: m.name.toLowerCase().replace(/\s*\d+\s*mg.*$/i, '').trim()
  }));
  
  // Cache for fuzzy match results
  const fuzzyCache = new Map<string, { med: UserMed; similarity: number } | null>();
  
  // Extract candidates from text
  const candidates: Array<{ raw: string; index: number; strengthMg?: number }> = [];
  
  // Look for alias matches
  for (const [alias, canonical] of Object.entries(MEDICATION_ALIASES)) {
    const aliasRegex = new RegExp(`\\b${alias}\\b`, 'gi');
    let match;
    while ((match = aliasRegex.exec(text)) !== null) {
      candidates.push({
        raw: match[0],
        index: match.index
      });
    }
  }
  
  // Look for medication + mg patterns
  const mgPattern = /\b(\w{3,})\s*(\d{2,4})\s*(?:mg|milligramm)?\b/gi;
  let mgMatch;
  while ((mgMatch = mgPattern.exec(text)) !== null) {
    candidates.push({
      raw: mgMatch[1],
      index: mgMatch.index,
      strengthMg: parseInt(mgMatch[2], 10)
    });
  }
  
  // Process each candidate (limit to 8 for performance)
  const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.raw.toLowerCase(), c])).values())
    .slice(0, 8);
  
  for (const candidate of uniqueCandidates) {
    const rawLower = candidate.raw.toLowerCase();
    
    // Skip stopwords
    if (['vor', 'nach', 'mit', 'und', 'oder', 'bei', 'wegen', 'durch'].includes(rawLower)) {
      continue;
    }
    
    // Try alias lookup first
    const canonicalName = MEDICATION_ALIASES[rawLower];
    
    // Try to match against user meds
    let bestMatch: { med: UserMed; similarity: number } | null = null;
    
    // 1. Exact match
    const exactMatch = normalizedUserMeds.find(m => 
      m.normalized === rawLower || 
      m.normalized === canonicalName ||
      m.name.toLowerCase().startsWith(rawLower)
    );
    
    if (exactMatch) {
      bestMatch = { med: exactMatch, similarity: 0.95 };
    } else {
      // 2. Check cache
      const cacheKey = rawLower;
      if (fuzzyCache.has(cacheKey)) {
        bestMatch = fuzzyCache.get(cacheKey)!;
      } else {
        // 3. Fuzzy match
        for (const userMed of normalizedUserMeds) {
          const sim = calculateSimilarity(rawLower, userMed.normalized);
          const canonicalSim = canonicalName ? calculateSimilarity(canonicalName, userMed.normalized) : 0;
          const maxSim = Math.max(sim, canonicalSim);
          
          if (maxSim >= 0.75 && (!bestMatch || maxSim > bestMatch.similarity)) {
            bestMatch = { med: userMed, similarity: maxSim };
          }
        }
        fuzzyCache.set(cacheKey, bestMatch);
      }
    }
    
    // Get token window for dose extraction
    const tokenIndex = tokens.findIndex(t => t.includes(rawLower) || rawLower.includes(t));
    const windowStart = Math.max(0, tokenIndex - 3);
    const windowEnd = Math.min(tokens.length, tokenIndex + 4);
    const tokenWindow = tokens.slice(windowStart, windowEnd);
    
    const doseQuarters = extractDoseQuarters(tokenWindow);
    
    // Build hit
    const matchedName = bestMatch?.med.name || (canonicalName ? 
      canonicalName.charAt(0).toUpperCase() + canonicalName.slice(1) : 
      candidate.raw.charAt(0).toUpperCase() + candidate.raw.slice(1));
    
    if (!foundNames.has(matchedName.toLowerCase())) {
      foundNames.add(matchedName.toLowerCase());
      
      hits.push({
        raw: candidate.raw,
        normalizedName: rawLower,
        matchedMedicationId: bestMatch?.med.id,
        matchedMedicationName: bestMatch?.med.name || matchedName,
        doseQuarters: doseQuarters || 4, // Default to 1 tablet
        strengthMg: candidate.strengthMg,
        confidence: bestMatch?.similarity || (canonicalName ? 0.8 : 0.5)
      });
    }
  }
  
  console.log(`💊 Medications parsed:`, hits.map(h => ({
    name: h.matchedMedicationName,
    dose: h.doseQuarters,
    conf: h.confidence
  })));
  
  return hits;
}

// ============================================
// Medication Effect Parsing
// ============================================

function parseMedicationEffect(text: string): ParsedVoiceEntry['medicationEffect'] | undefined {
  const hasEffectContext = /\b(wirkung|gewirkt|geholfen|tablette|medikament|nehm|einnahme)\b/i.test(text);
  
  for (const pattern of EFFECT_PATTERNS) {
    if (pattern.regex.test(text)) {
      console.log(`💊 Medication effect: ${pattern.rating}`);
      return {
        rating: pattern.rating,
        confidence: hasEffectContext ? 'high' : 'medium'
      };
    }
  }
  
  return undefined;
}

// ============================================
// Notes Extraction
// ============================================

function extractNotes(
  text: string,
  timeResult: TimeResult,
  painLevel: string,
  meds: ParsedMedicationHit[]
): string {
  let cleanedText = text;
  
  // Remove time expressions
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    cleanedText = cleanedText.replace(pattern.regex, '');
  }
  for (const pattern of ABSOLUTE_TIME_PATTERNS) {
    cleanedText = cleanedText.replace(pattern.regex, '');
  }
  cleanedText = cleanedText.replace(NOW_PATTERNS, '');
  
  // Remove pain expressions
  cleanedText = cleanedText.replace(/\b(schmerz|pain|staerke|level)[^\d]*\d+/gi, '');
  cleanedText = cleanedText.replace(/\d+\s*(?:von\s*10|\/10)/gi, '');
  
  // Remove medication names
  for (const med of meds) {
    const medRegex = new RegExp(`\\b${med.raw}\\b`, 'gi');
    cleanedText = cleanedText.replace(medRegex, '');
  }
  
  // Remove dose expressions
  for (const pattern of DOSE_PATTERNS) {
    cleanedText = cleanedText.replace(pattern.regex, '');
  }
  
  // Remove common filler words
  cleanedText = cleanedText.replace(/\b(genommen|eingenommen|tablette|mg|milligramm)\b/gi, '');
  
  // Clean up whitespace and punctuation
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')
    .replace(/^\s*[,.\-:;]\s*/, '')
    .replace(/\s*[,.\-:;]\s*$/, '')
    .trim();
  
  return cleanedText;
}

// ============================================
// Confidence Calculation
// ============================================

function calculateConfidence(
  text: string,
  timeResult: TimeResult,
  painLevel: string,
  meds: ParsedMedicationHit[]
): ParsedVoiceEntry['confidence'] {
  // Time confidence
  let timeConfidence: ConfidenceLevelType = 'low';
  if (timeResult.isNow) {
    timeConfidence = 'high';
  } else if (timeResult.time) {
    timeConfidence = 'high';
  }
  
  // Pain confidence
  let painConfidence: ConfidenceLevelType = 'low';
  if (painLevel && /^([0-9]|10)$/.test(painLevel)) {
    painConfidence = 'high';
  } else if (painLevel) {
    painConfidence = 'medium';
  }
  
  // Meds confidence
  let medsConfidence: ConfidenceLevelType = 'high';
  if (meds.length > 0) {
    const avgConfidence = meds.reduce((sum, m) => sum + m.confidence, 0) / meds.length;
    medsConfidence = avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low';
  }
  
  return { time: timeConfidence, pain: painConfidence, meds: medsConfidence };
}

// ============================================
// Main Parser Function
// ============================================

export function parseGermanVoiceEntry(
  text: string, 
  userMeds: Array<{ id?: string; name: string }> = []
): ParsedVoiceEntry {
  console.log('🎯 Parsing voice entry:', text);
  
  // Normalize input
  const { normalized, tokens } = normalizeTranscriptDE(text);
  console.log('🎯 Normalized:', normalized);
  
  // Parse components
  const timeResult = parseTime(normalized, tokens);
  const painLevel = parsePainLevel(normalized, tokens);
  const medicationsStructured = parseMedicationsStructured(normalized, tokens, userMeds);
  const medicationEffect = parseMedicationEffect(normalized);
  const confidence = calculateConfidence(text, timeResult, painLevel, medicationsStructured);
  const notes = extractNotes(normalized, timeResult, painLevel, medicationsStructured);
  
  // Build result with both legacy and structured meds
  const result: ParsedVoiceEntry = {
    selectedDate: timeResult.date,
    selectedTime: timeResult.time,
    painLevel,
    medications: medicationsStructured.map(m => m.matchedMedicationName || m.raw), // Legacy
    medicationsStructured, // New structured format
    notes,
    isNow: timeResult.isNow,
    confidence,
    medicationEffect: medicationEffect?.rating !== 'none' ? medicationEffect : undefined
  };
  
  console.log('🎙️ Parsed result:', {
    pain: result.painLevel,
    time: result.selectedTime,
    isNow: result.isNow,
    meds: result.medicationsStructured.map(m => `${m.matchedMedicationName}(${m.doseQuarters}q)`),
    effect: result.medicationEffect?.rating
  });
  
  return result;
}

// ============================================
// Slot Filling Helper
// ============================================

export function getMissingSlots(entry: ParsedVoiceEntry): ('time' | 'pain' | 'meds')[] {
  const missing: ('time' | 'pain' | 'meds')[] = [];
  
  // Time is never missing if isNow=true
  if (!entry.isNow && (!entry.selectedDate || !entry.selectedTime)) {
    missing.push('time');
  }
  
  // Pain is missing only if completely empty
  if (!entry.painLevel || entry.painLevel === '' || entry.painLevel === '-') {
    missing.push('pain');
  }
  
  // Meds are optional - never mark as missing
  
  return missing;
}

// Export legacy function for backwards compatibility
export function generateUserMedicationPatterns(userMeds: Array<{ name: string }> = []): Array<{ name: string; pattern: RegExp; noDosage?: boolean }> {
  // This is now deprecated - using parseMedicationsStructured instead
  // Keep for backwards compatibility
  return userMeds.map(med => ({
    name: med.name,
    pattern: new RegExp(`\\b${med.name.split(' ')[0].toLowerCase()}\\b`, 'i')
  }));
}

// ============================================
// ADD_MEDICATION Parser
// ============================================

/**
 * Checks if transcript is an "add medication" command
 * Uses normalized text (umlauts converted: ü→ue, etc.)
 */
export function isAddMedicationTrigger(text: string): boolean {
  const { normalized } = normalizeTranscriptDE(text);
  const matches = ADD_MEDICATION_TRIGGERS.some(pattern => pattern.test(normalized));
  console.log('[ADD_MED_TRIGGER]', { input: text.substring(0, 50), normalized: normalized.substring(0, 50), matches });
  return matches;
}

/**
 * Parses "add medication" voice command
 * Extracts: name, strength, unit, form factor
 */
export function parseAddMedicationCommand(text: string): ParsedAddMedication | null {
  console.log('💊 Parsing add medication command:', text);
  
  const { normalized, original } = normalizeTranscriptDE(text);
  
  // Must be a valid add trigger
  if (!ADD_MEDICATION_TRIGGERS.some(pattern => pattern.test(normalized))) {
    console.log('💊 No add-medication trigger found in normalized text:', normalized);
    return null;
  }
  
  let workingText = normalized;
  let confidence = 0.7; // Base confidence for valid trigger
  
  // 1. Extract strength + unit first (before name extraction)
  let strengthValue: number | undefined;
  let strengthUnit: ParsedAddMedication['strengthUnit'];
  
  const strengthMatch = workingText.match(STRENGTH_UNIT_PATTERN);
  if (strengthMatch) {
    strengthValue = parseInt(strengthMatch[1], 10);
    const rawUnit = strengthMatch[2].toLowerCase();
    
    // Normalize unit
    if (rawUnit === 'milligramm' || rawUnit === 'mg') strengthUnit = 'mg';
    else if (rawUnit === 'mikrogramm' || rawUnit === 'mcg' || rawUnit === 'µg') strengthUnit = 'µg';
    else if (rawUnit === 'gramm' || rawUnit === 'g') strengthUnit = 'g';
    else if (rawUnit === 'milliliter' || rawUnit === 'ml') strengthUnit = 'ml';
    
    // Remove strength from working text
    workingText = workingText.replace(STRENGTH_UNIT_PATTERN, ' ');
    confidence += 0.1; // Boost confidence for having strength
  }
  
  // 2. Extract form factor
  let formFactor: ParsedAddMedication['formFactor'];
  for (const { regex, form } of FORM_FACTOR_PATTERNS) {
    if (regex.test(workingText)) {
      formFactor = form;
      workingText = workingText.replace(regex, ' ');
      break;
    }
  }
  
  // 3. Remove add-verb phrases (use normalized umlaut-free forms)
  const removePatterns = [
    /\b(fuege)\s+(ein\s+)?(medikament\s+)?/gi,       // füge (normalized)
    /\b(lege|leg)\s+(ein\s+)?(medikament\s+)?/gi,
    /\bneues?\s+medikament\s*/gi,
    /\bmedikament\s+(?:mit\s+(?:dem\s+)?namen?)\s*/gi,
    /\b(erstelle?|erstell)\s+(?:ein\s+)?(?:medikament\s+)?/gi,
    /\b(speichere?|speicher)\s+(?:das\s+)?(?:medikament\s+)?/gi,
    /\bneue\s+(?:arznei|medizin)\s*/gi,
    /\b(?:hinzu|an)\s*$/gi,
    /\bbitte\b/gi,
    /\bnamens?\b/gi,
    /\bmit\s+dem\s+namen\b/gi,
    /^ein\s+/gi,
    /\bich\s+/gi,
    /\bmit\s+\d+\s*(mg|milligramm|mcg|ml)?\s*$/gi, // remove trailing "mit 20 mg"
  ];
  
  for (const pattern of removePatterns) {
    workingText = workingText.replace(pattern, ' ');
  }
  
  // 4. Clean and extract name
  workingText = workingText
    .replace(/\s+/g, ' ')
    .replace(/^\s*[,.\-:;]\s*/, '')
    .replace(/\s*[,.\-:;]\s*$/, '')
    .trim();
  
  // Name validation
  if (!workingText || workingText.length < 2) {
    console.log('💊 No valid medication name found');
    return null;
  }
  
  // Check for known medication alias to boost confidence
  const lowerName = workingText.toLowerCase();
  if (MEDICATION_ALIASES[lowerName]) {
    confidence += 0.15;
    workingText = MEDICATION_ALIASES[lowerName];
  }
  
  // Title-case the display name
  const displayName = workingText
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  const result: ParsedAddMedication = {
    name: workingText.toLowerCase(),
    displayName,
    strengthValue,
    strengthUnit,
    formFactor,
    confidence: Math.min(confidence, 0.95),
    rawInput: original
  };
  
  console.log('💊 Parsed add medication:', result);
  return result;
}
