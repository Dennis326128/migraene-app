/**
 * Simple Voice Parser v2
 * Robust classification between new_entry and context_entry
 * 
 * Features:
 * - Rule-based high-precision heuristics first
 * - Robust pain intensity detection (handles STT errors like "Schmerzlautstärke")
 * - Fuzzy medication matching from user's list
 * - Proper time calculation for relative times
 * - Unified result object with confidence scoring
 * 
 * Philosophy: Fail-open to context_entry, never block
 */

import { berlinDateToday } from '@/lib/tz';
import { 
  buildUserMedicationLexicon, 
  findMedicationMentions,
  type UserMedication,
  type TranscriptMedicationHit 
} from './medicationFuzzyMatch';

// ============================================
// Types - Unified Result Object
// ============================================

export type EntryType = 'new_entry' | 'context_entry';

export interface ParsedTime {
  kind: 'absolute' | 'relative' | 'none';
  iso: string | null;              // Full ISO timestamp
  relative_minutes: number | null; // Minutes ago (client calculates)
  date: string;                    // YYYY-MM-DD
  time: string;                    // HH:mm
  isNow: boolean;
  confidence: 'high' | 'medium' | 'low';
  displayText?: string;
}

export interface ParsedPainIntensity {
  value: number | null;     // 0-10 or null if not detected
  confidence: number;       // 0-1
  evidence: string;         // Matched phrase for debugging
  needsReview: boolean;
}

export interface ParsedMedication {
  name: string;                 // Canonical medication name
  matched_user_med: boolean;    // From user's list?
  medicationId?: string;        // If matched to user's med
  doseQuarters: number;         // 1=quarter, 2=half, 4=full, 8=two
  doseText?: string;            // "halbe Tablette"
  confidence: number;           // 0-1
  needsReview: boolean;
}

export interface VoiceParseResult {
  entry_type: EntryType;
  confidence: number;           // 0-1 overall classification confidence
  raw_text: string;
  
  time: ParsedTime;
  pain_intensity: ParsedPainIntensity;
  medications: ParsedMedication[];
  note: string;                 // Remaining context text
  
  // UI helpers
  needsReview: boolean;
  typeCanBeToggled: boolean;    // Show toggle chip?
}

// Legacy export for backward compatibility
export type SimpleVoiceResultType = EntryType;
export interface SimpleVoiceResult {
  type: EntryType;
  time?: ParsedTime;
  painLevel?: { value: number; confidence: 'high' | 'medium' | 'low'; needsReview: boolean };
  medications?: ParsedMedication[];
  rawTranscript: string;
  cleanedNotes: string;
  overallConfidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
}

// ============================================
// Constants
// ============================================

// Number words (German)
const NUMBER_WORDS: Record<string, number> = {
  'null': 0, 'kein': 0, 'keine': 0, 'keiner': 0,
  'eins': 1, 'ein': 1, 'eine': 1, 'einer': 1,
  'zwei': 2, 'zwo': 2,
  'drei': 3,
  'vier': 4,
  'fünf': 5, 'fuenf': 5,
  'sechs': 6,
  'sieben': 7,
  'acht': 8,
  'neun': 9,
  'zehn': 10,
};

// ============================================
// PAIN INTENSITY DETECTION (robust)
// ============================================

// Synonym-/Fehlhör-Liste for pain intensity triggers (STT error tolerant)
const PAIN_INTENSITY_TRIGGERS = [
  // Correct forms
  'schmerzstärke', 'schmerzstaerke', 'schmerz stärke', 'schmerz staerke',
  'schmerzlevel', 'schmerz level', 'schmerzwert', 'schmerz wert',
  'schmerzintensität', 'schmerzintensitaet', 'schmerz intensität',
  'schmerzskala', 'schmerz skala',
  // STT error variants (CRITICAL)
  'schmerzlautstärke', 'schmerzlautstaerke', 'schmerz lautstärke', 'schmerzlaut',
  'schmerzlautsärke', 'schmerzlautsaerke', 'schmerz lautsärke',
  'schmerz stärker', 'schmerzstärker', 'schmerzstarke',
  // Additional STT error variants
  'schnellstärke', 'schnellstaerke', 'schnell stärke', 'schnellstarke',
  'schmerstärke', 'schmerstaerke', 'schmerzstärk', 'schmerzstaerk',
  'schmerz-stärke', 'schmerz-staerke',
  // Generic intensity words
  'stärke', 'staerke', 'level', 'intensität', 'intensitaet', 'skala',
  'kopfschmerzstärke', 'kopfschmerz stärke',
  'migränestärke', 'migraenestärke', 'migräne stärke',
];

/**
 * Normalize a token for pain keyword matching:
 * lowercase, replace umlauts/ß, remove hyphens/special chars
 */
function normalizePainToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[-_]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Simple Damerau-Levenshtein distance for short strings
 */
function damerauLevenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[la][lb];
}

// Pre-normalized pain keyword targets for fuzzy matching
const PAIN_KEYWORD_TARGETS = [
  'schmerzstaerke', 'staerke', 'schmerzlevel', 'schmerzwert',
  'schmerzintensitaet', 'intensitaet', 'schmerzskala', 'skala',
  'schnellstaerke', 'schmerzlautstaerke',
];

/**
 * Check if a token is a pain keyword using fuzzy matching
 * Returns true if token contains "schmerz" substring OR matches a known target via Damerau-Levenshtein ≤2
 * IMPORTANT: Does NOT match broad substrings like "schnell" alone – only full fuzzy targets.
 */
function isPainKeyword(token: string): boolean {
  const norm = normalizePainToken(token);
  if (norm.length < 4) return false;
  
  // Substring check: only "schmerz" (very specific, no false positives)
  if (norm.includes('schmerz')) return true;
  
  // Exact match against normalized triggers
  for (const trigger of PAIN_INTENSITY_TRIGGERS) {
    const normTrigger = normalizePainToken(trigger.replace(/\s+/g, ''));
    if (norm === normTrigger) return true;
  }
  
  // Fuzzy match: Damerau-Levenshtein ≤ 2 against known targets
  for (const target of PAIN_KEYWORD_TARGETS) {
    if (norm.length >= 5 && Math.abs(norm.length - target.length) <= 3) {
      if (damerauLevenshtein(norm, target) <= 2) return true;
    }
  }
  
  return false;
}

// Pattern fragments (used to recognize "X von 10" etc.)
const PAIN_SCALE_PATTERNS = [
  /(\d{1,2})\s*(?:von\s*10|\/10|auf\s*10|aus\s*10|von\s*zehn|auf\s*zehn)/i,
  /(\d{1,2})\s*[\/\\]\s*10/i,
];

// Intensity word mappings
const INTENSITY_WORD_MAP: Array<{ regex: RegExp; value: number }> = [
  { regex: /\b(sehr\s*stark|unerträglich|extrem|heftig|maximal|höllisch|brutal|kaum\s*auszuhalten)\b/i, value: 9 },
  { regex: /\b(stark|schwer|massiv|richtig\s*schlimm|echt\s*schlimm)\b/i, value: 7 },
  { regex: /\b(mittel|mäßig|maessig|mässig|normal|moderat)\b/i, value: 5 },
  { regex: /\b(leicht|schwach|gering|wenig|dezent|bisschen)\b/i, value: 3 },
  { regex: /\b(sehr\s*leicht|minimal|kaum\s*spürbar)\b/i, value: 1 },
  { regex: /\b(keine?r?|null)\s*(schmerz|kopfschmerz|migräne|attacke)/i, value: 0 },
];

/**
 * Parse pain intensity with robust STT error handling
 */
function parsePainIntensity(text: string): ParsedPainIntensity {
  const result: ParsedPainIntensity = {
    value: null,
    confidence: 0,
    evidence: '',
    needsReview: false,
  };

  // Normalize text
  let normalized = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(num));
  }

  // Remove mg/dosage values to avoid confusion
  const sanitized = normalized
    .replace(/\d+\s*mg/gi, '[DOSE]')
    .replace(/\d+\s*milligramm/gi, '[DOSE]')
    .replace(/\d{1,2}:\d{2}/g, '[TIME]'); // Remove clock times

  // 1. Check for explicit scale patterns ("X von 10", "X/10")
  for (const pattern of PAIN_SCALE_PATTERNS) {
    const match = sanitized.match(pattern);
    if (match) {
      const level = parseInt(match[1], 10);
      if (level >= 0 && level <= 10) {
        return {
          value: level,
          confidence: 0.95,
          evidence: match[0],
          needsReview: false,
        };
      }
    }
  }

  // 2. Check for trigger word + number within 4 tokens (using fuzzy isPainKeyword)
  // Number words have already been replaced with digits in `normalized`
  const tokens = sanitized.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Also check multi-token triggers (e.g., "schmerz stärke" → join adjacent)
    const multiToken = i < tokens.length - 1 ? token + tokens[i + 1] : '';
    const isTrigger = isPainKeyword(token) || (multiToken && isPainKeyword(multiToken));

    if (isTrigger) {
      // Look for number AFTER the trigger first (most natural: "schmerzstärke 5")
      // Then check before. This prevents "vor 10 minuten schmerzstärke 5" matching 10.
      let bestMatch: { value: number; distance: number } | null = null;
      
      for (let j = Math.max(0, i - 2); j < Math.min(tokens.length, i + 5); j++) {
        if (j === i) continue;
        
        // Skip tokens that are part of time/dose expressions
        if (j > 0 && /^(minute|minuten|min|stunde|stunden|std|mg|milligramm)$/i.test(tokens[Math.min(j + 1, tokens.length - 1)])) continue;
        if (/^(minute|minuten|min|stunde|stunden|std|mg|milligramm)$/i.test(tokens[j])) continue;
        // Skip if preceded by "vor"/"seit" (time expression)
        if (j > 0 && /^(vor|seit)$/i.test(tokens[j - 1])) continue;
        
        const cleanToken = tokens[j].replace(/[,.:;!?]/g, '');
        const numMatch = cleanToken.match(/^(\d{1,2})$/);
        if (numMatch) {
          const level = parseInt(numMatch[1], 10);
          if (level >= 0 && level <= 10) {
            const distance = Math.abs(j - i);
            // Prefer tokens AFTER the trigger (positive distance) and closer
            const adjustedDist = j > i ? distance : distance + 10; // penalize tokens before trigger
            if (!bestMatch || adjustedDist < bestMatch.distance) {
              bestMatch = { value: level, distance: adjustedDist };
            }
          }
        }
      }
      
      if (bestMatch) {
        return {
          value: bestMatch.value,
          confidence: 0.85,
          evidence: `${token} ... ${bestMatch.value}`,
          needsReview: false,
        };
      }
    }
  }

  // 3. Check for standalone "Stärke X" pattern
  const staerkeMatch = sanitized.match(/\b(?:nur\s*)?stärke\s*(\d{1,2})\b/i) ||
                       sanitized.match(/\b(?:nur\s*)?staerke\s*(\d{1,2})\b/i);
  if (staerkeMatch) {
    const level = parseInt(staerkeMatch[1], 10);
    if (level >= 0 && level <= 10) {
      return {
        value: level,
        confidence: 0.80,
        evidence: staerkeMatch[0],
        needsReview: false,
      };
    }
  }

  // 4. Check for intensity words — ONLY if pain context is present
  // (prevents "wenig geschlafen" from being interpreted as pain level 3)
  const hasPainContext = /\b(schmerz|migräne|migraene|kopfschmerz|kopfweh|attacke|anfall|weh)\b/i.test(text);
  if (hasPainContext) {
    for (const { regex, value } of INTENSITY_WORD_MAP) {
      const match = sanitized.match(regex);
      if (match) {
        return {
          value,
          confidence: 0.60,
          evidence: match[0],
          needsReview: true,
        };
      }
    }
  }

  // 5. Check for standalone number with pain context nearby
  if (/\b(schmerz|migräne|migraene|kopfschmerz|attacke|anfall|kopfweh)\b/i.test(text)) {
    const standaloneMatch = sanitized.match(/\b([0-9]|10)\b/);
    if (standaloneMatch) {
      const level = parseInt(standaloneMatch[1], 10);
      if (level >= 0 && level <= 10) {
        return {
          value: level,
          confidence: 0.55,
          evidence: `pain context + ${standaloneMatch[0]}`,
          needsReview: true,
        };
      }
    }
  }

  return result;
}

// ============================================
// TIME PARSING (robust German)
// ============================================

// Relative time patterns
const RELATIVE_TIME_PATTERNS: Array<{ 
  regex: RegExp; 
  minutesAgo: (m: RegExpMatchArray) => number; 
  display: (m: RegExpMatchArray) => string 
}> = [
  { 
    regex: /\b(?:vor|seit)\s+(\d+)\s*(minute|minuten|min)\b/i,
    minutesAgo: m => parseInt(m[1], 10),
    display: m => `vor ${m[1]} Minuten`
  },
  { 
    regex: /\b(?:vor|seit)\s+(\d+)\s*(stunde|stunden|std|h)\b/i,
    minutesAgo: m => parseInt(m[1], 10) * 60,
    display: m => `vor ${m[1]} Stunde${parseInt(m[1], 10) > 1 ? 'n' : ''}`
  },
  {
    regex: /\b(?:vor|seit)\s+(einer?|einem)\s+(stunde)\b/i,
    minutesAgo: () => 60,
    display: () => 'vor einer Stunde'
  },
  {
    regex: /\b(?:vor|seit)\s+(einer?|einem)\s+halben?\s+(stunde)\b/i,
    minutesAgo: () => 30,
    display: () => 'vor einer halben Stunde'
  },
  {
    regex: /\b(anderthalb|eineinhalb)\s*(stunde|stunden)\b/i,
    minutesAgo: () => 90,
    display: () => 'vor anderthalb Stunden'
  },
  {
    regex: /\b(?:vor|seit)\s+(einer?)\s+(viertel\s*stunde)\b/i,
    minutesAgo: () => 15,
    display: () => 'vor einer Viertelstunde'
  },
  {
    regex: /\b(?:vor|seit)\s+(einer?)\s+(dreiviertel\s*stunde)\b/i,
    minutesAgo: () => 45,
    display: () => 'vor einer Dreiviertelstunde'
  },
];

// Day phrases
const DAY_PATTERNS: Array<{ regex: RegExp; daysAgo: number; defaultHour?: number; display: string }> = [
  { regex: /\bheute\s+morgen\b/i, daysAgo: 0, defaultHour: 7, display: 'heute Morgen' },
  { regex: /\bheute\s+früh\b/i, daysAgo: 0, defaultHour: 7, display: 'heute früh' },
  { regex: /\bheute\s+vormittag\b/i, daysAgo: 0, defaultHour: 10, display: 'heute Vormittag' },
  { regex: /\bheute\s+mittag\b/i, daysAgo: 0, defaultHour: 12, display: 'heute Mittag' },
  { regex: /\bheute\s+nachmittag\b/i, daysAgo: 0, defaultHour: 15, display: 'heute Nachmittag' },
  { regex: /\bheute\s+abend\b/i, daysAgo: 0, defaultHour: 20, display: 'heute Abend' },
  { regex: /\bheute\s+nacht\b/i, daysAgo: 0, defaultHour: 23, display: 'heute Nacht' },
  { regex: /\bgestern\s+morgen\b/i, daysAgo: 1, defaultHour: 7, display: 'gestern Morgen' },
  { regex: /\bgestern\s+mittag\b/i, daysAgo: 1, defaultHour: 12, display: 'gestern Mittag' },
  { regex: /\bgestern\s+nachmittag\b/i, daysAgo: 1, defaultHour: 15, display: 'gestern Nachmittag' },
  { regex: /\bgestern\s+abend\b/i, daysAgo: 1, defaultHour: 20, display: 'gestern Abend' },
  { regex: /\bgestern\s+nacht\b/i, daysAgo: 1, defaultHour: 23, display: 'gestern Nacht' },
  { regex: /\bgestern\b/i, daysAgo: 1, display: 'gestern' },
  { regex: /\bvorgestern\b/i, daysAgo: 2, display: 'vorgestern' },
  { regex: /\bletzte\s+nacht\b/i, daysAgo: 0, defaultHour: 3, display: 'letzte Nacht' },
];

// Clock time patterns
const CLOCK_PATTERNS: Array<{ 
  regex: RegExp; 
  parse: (m: RegExpMatchArray, text: string) => { hours: number; minutes: number } 
}> = [
  {
    regex: /\b(?:um|gegen)\s*(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: parseInt(m[2], 10) })
  },
  {
    regex: /\b(?:um|gegen)\s*(\d{1,2})\s*uhr(?:\s*(\d{1,2}))?\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: m[2] ? parseInt(m[2], 10) : 0 })
  },
  {
    // "halb drei" = 2:30, but check for "nachmittags/abends" modifier → +12
    regex: /\bhalb\s+(\d{1,2})\b/i,
    parse: (m, text) => {
      const baseHour = (parseInt(m[1], 10) - 1 + 24) % 24;
      const lower = text.toLowerCase();
      // Check for PM-context after the match
      const isPM = /nachmittag|abend|pm/i.test(lower);
      const hours = (isPM && baseHour < 12) ? baseHour + 12 : baseHour;
      return { hours, minutes: 30 };
    }
  },
  {
    regex: /\bviertel\s+nach\s+(\d{1,2})\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: 15 })
  },
  {
    regex: /\bviertel\s+vor\s+(\d{1,2})\b/i,
    parse: m => ({ hours: (parseInt(m[1], 10) - 1 + 24) % 24, minutes: 45 })
  },
  {
    regex: /\bfünf\s+nach\s+(\d{1,2})\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: 5 })
  },
  {
    regex: /\bfünf\s+vor\s+(\d{1,2})\b/i,
    parse: m => ({ hours: (parseInt(m[1], 10) - 1 + 24) % 24, minutes: 55 })
  },
  {
    regex: /\b(\d{1,2})[:.](\d{2})\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: parseInt(m[2], 10) })
  },
];

/**
 * Parse time from text with relative time calculation
 */
function parseTime(text: string): ParsedTime {
  const now = new Date();
  const today = berlinDateToday();
  
  // Convert number words
  let normalized = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(num));
  }
  
  // 1. Check relative times first (highest precision)
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const minutesAgo = pattern.minutesAgo(match);
      const targetTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
      
      return {
        kind: 'relative',
        iso: targetTime.toISOString(),
        relative_minutes: minutesAgo,
        date: targetTime.toISOString().split('T')[0],
        time: targetTime.toTimeString().slice(0, 5),
        isNow: false,
        confidence: 'high',
        displayText: pattern.display(match)
      };
    }
  }
  
  // 2. Check day patterns
  for (const pattern of DAY_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - pattern.daysAgo);
      
      let timeStr = now.toTimeString().slice(0, 5);
      if (pattern.defaultHour !== undefined) {
        timeStr = `${String(pattern.defaultHour).padStart(2, '0')}:00`;
        targetDate.setHours(pattern.defaultHour, 0, 0, 0);
      }
      
      return {
        kind: 'absolute',
        iso: targetDate.toISOString(),
        relative_minutes: null,
        date: targetDate.toISOString().split('T')[0],
        time: timeStr,
        isNow: false,
        confidence: pattern.defaultHour !== undefined ? 'medium' : 'low',
        displayText: pattern.display
      };
    }
  }
  
  // 3. Check clock patterns
  for (const pattern of CLOCK_PATTERNS) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const { hours, minutes } = pattern.parse(match, normalized);
      const clampedHours = Math.max(0, Math.min(23, hours));
      const clampedMinutes = Math.max(0, Math.min(59, minutes));
      const timeStr = `${String(clampedHours).padStart(2, '0')}:${String(clampedMinutes).padStart(2, '0')}`;
      
      const targetDate = new Date(now);
      targetDate.setHours(clampedHours, clampedMinutes, 0, 0);
      
      return {
        kind: 'absolute',
        iso: targetDate.toISOString(),
        relative_minutes: null,
        date: today,
        time: timeStr,
        isNow: false,
        confidence: 'high',
        displayText: `um ${timeStr} Uhr`
      };
    }
  }
  
  // 4. Check for "now" indicators
  if (/\b(jetzt|gerade|sofort|eben|soeben|aktuell|momentan)\b/i.test(text)) {
    return {
      kind: 'absolute',
      iso: now.toISOString(),
      relative_minutes: 0,
      date: today,
      time: now.toTimeString().slice(0, 5),
      isNow: true,
      confidence: 'high',
      displayText: 'jetzt'
    };
  }
  
  // 5. Default to now
  return {
    kind: 'none',
    iso: now.toISOString(),
    relative_minutes: null,
    date: today,
    time: now.toTimeString().slice(0, 5),
    isNow: true,
    confidence: 'high'
  };
}

// ============================================
// MEDICATION PARSING
// ============================================

// Dose patterns
const DOSE_PATTERNS: Array<{ regex: RegExp; quarters: number; text: string }> = [
  { regex: /\bviertel\s*(tablette)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\b(1\/4|0[.,]25)\s*(tablette)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\bhalbe?\s*(tablette)?\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\b(1\/2|0[.,]5)\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\bdrei\s*viertel\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\b(3\/4|0[.,]75)\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\b(eine?|1)\s*tablette?\b/i, quarters: 4, text: '1 Tablette' },
  { regex: /\bganze?\s*tablette?\b/i, quarters: 4, text: '1 Tablette' },
  { regex: /\banderthalb\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(eineinhalb|1[.,]5)\s*(tablette)?\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(zwei|2)\s*tablette/i, quarters: 8, text: '2 Tabletten' },
];

/**
 * Parse medications from text with fuzzy matching
 * Returns medications + token spans for span-based note cleanup
 */
function parseMedications(
  text: string,
  userMeds: UserMedication[]
): { medications: ParsedMedication[]; tokenSpans: Array<{ startIndex: number; endIndex: number }> } {
  const lexicon = buildUserMedicationLexicon(userMeds);
  const hits = findMedicationMentions(text, lexicon);
  
  const medications: ParsedMedication[] = [];
  const tokenSpans: Array<{ startIndex: number; endIndex: number }> = [];
  const tokens = text.toLowerCase().split(/\s+/);
  
  for (const hit of hits) {
    if (!hit.match) continue;
    
    // Record the token span for cleanup
    tokenSpans.push({ startIndex: hit.startIndex, endIndex: hit.endIndex });
    
    // Find dose in surrounding context
    const windowStart = Math.max(0, hit.startIndex - 4);
    const windowEnd = Math.min(tokens.length, hit.endIndex + 5);
    const windowText = tokens.slice(windowStart, windowEnd).join(' ');
    
    let doseQuarters = 4; // Default: 1 full tablet
    let doseText: string | undefined;
    
    for (const pattern of DOSE_PATTERNS) {
      if (pattern.regex.test(windowText)) {
        doseQuarters = pattern.quarters;
        doseText = pattern.text;
        break;
      }
    }
    
    medications.push({
      name: hit.match.canonical,
      matched_user_med: !!hit.match.medicationId,
      medicationId: hit.match.medicationId,
      doseQuarters,
      doseText,
      confidence: hit.match.confidence,
      needsReview: hit.match.isUncertain
    });
  }
  
  return { medications, tokenSpans };
}

// ============================================
// CLASSIFICATION: Context vs New Entry
// ============================================

// Context entry trigger words
const CONTEXT_TRIGGERS = [
  /\b(trigger|auslöser|ausloser)\b/i,
  /\b(notiz|kontext|bemerkung|anmerkung)\b/i,
  /\b(schlecht\s+geschlafen|wenig\s+geschlafen|zu\s+wenig\s+schlaf)/i,
  /\b(stress|stressig|gestresst)\b/i,
  /\b(wetter|wetterumschwung|föhn|foehn|gewitter)/i,
  /\b(periode|menstruation|regel|zyklus)/i,
  /\b(essen|gegessen|getrunken|kaffee|alkohol|wein|bier)/i,
  /\b(sport|training|joggen|fitness)/i,
  /\b(reise|gereist|unterwegs|flug)/i,
  /\b(müde|muede|erschöpft|erschoepft)/i,
  /\b(viel\s+gearbeitet|lange\s+gearbeitet|überstunden)/i,
];

// New entry trigger words
const NEW_ENTRY_TRIGGERS = [
  /\b(kopfschmerz|kopfweh|migräne|migraene|schmerz|attacke|anfall)\b/i,
  /\b(genommen|eingenommen|nehme|tablette)\b/i,
  /\b(schmerzstärke|schmerzlautstärke|stärke\s*\d|level\s*\d)/i,
  /\b\d+\s*(von\s*10|\/10)\b/i,
  /\b(triptan|ibuprofen|paracetamol|naproxen|aspirin|ass)\b/i,
  /\bvor\s+\d+\s*(minute|stunde)/i,
];

/**
 * Classify text as new_entry or context_entry
 */
function classifyEntryType(
  text: string,
  painIntensity: ParsedPainIntensity,
  medications: ParsedMedication[],
  time: ParsedTime
): { type: EntryType; confidence: number; canToggle: boolean } {
  
  const hasContextTrigger = CONTEXT_TRIGGERS.some(r => r.test(text));
  const hasNewEntryTrigger = NEW_ENTRY_TRIGGERS.some(r => r.test(text));
  const hasMedications = medications.length > 0;
  const hasPainLevel = painIntensity.value !== null;
  const hasExplicitTime = !time.isNow && time.kind !== 'none';
  
  // RULE: If pain OR meds are detected, it's always a new_entry 
  // (even if context triggers are also present)
  if (hasMedications || hasPainLevel) {
    const confidence = (hasMedications ? 0.35 : 0) + (hasPainLevel ? 0.30 : 0) + 
                       (hasExplicitTime ? 0.15 : 0) + (hasNewEntryTrigger ? 0.20 : 0);
    return {
      type: 'new_entry',
      confidence: Math.min(0.95, confidence / 1.0),
      canToggle: hasContextTrigger // Allow toggle if context words also present
    };
  }
  
  // No pain, no meds: check for new entry triggers
  if (hasNewEntryTrigger && !hasContextTrigger) {
    return {
      type: 'new_entry',
      confidence: 0.55,
      canToggle: true
    };
  }
  
  // Default to context entry (fail-open)
  return {
    type: 'context_entry',
    confidence: hasContextTrigger ? 0.85 : 0.60,
    canToggle: hasNewEntryTrigger
  };
}

// ============================================
// CLEAN NOTES (remove extracted parts)
// ============================================

function cleanNotes(
  text: string,
  time: ParsedTime,
  painIntensity: ParsedPainIntensity,
  medications: ParsedMedication[],
  medTokenSpans: Array<{ startIndex: number; endIndex: number }> = []
): string {
  const tokens = text.split(/\s+/);
  
  // Build a set of token indices to remove (span-based)
  const removeIndices = new Set<number>();
  
  // 1. Mark medication token spans from fuzzy match
  for (const span of medTokenSpans) {
    for (let i = span.startIndex; i <= span.endIndex; i++) {
      removeIndices.add(i);
    }
  }
  
  // 2. Mark dose/quantity/verb tokens near each medication span (±3 tokens)
  const doseWords = /^(eine[nrm]?|halbe?|ganze?|viertel|dreiviertel|anderthalb|eineinhalb|tablette[n]?|kapsel[n]?|sprühstoß|sprühstöße|\d+)$/i;
  const intakeVerbs = /^(genommen|eingenommen|eingeworfen|geschluckt|nehme|nehmen|mg|milligramm)$/i;
  
  for (const span of medTokenSpans) {
    const windowStart = Math.max(0, span.startIndex - 3);
    const windowEnd = Math.min(tokens.length - 1, span.endIndex + 3);
    for (let i = windowStart; i <= windowEnd; i++) {
      if (removeIndices.has(i)) continue;
      const t = tokens[i].replace(/[,.:;!?]/g, '');
      if (doseWords.test(t) || intakeVerbs.test(t)) {
        removeIndices.add(i);
      }
    }
  }
  
  // 3. Remove time expressions from remaining text
  let cleaned = tokens
    .filter((_, idx) => !removeIndices.has(idx))
    .join(' ');
  
  // Remove time patterns
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, '');
  }
  for (const pattern of DAY_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, '');
  }
  for (const pattern of CLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, '');
  }
  cleaned = cleaned.replace(/\b(jetzt|gerade|sofort|eben|aktuell)\b/gi, '');
  
  // 4. Remove pain level expressions (trigger words + associated number)
  for (const trigger of PAIN_INTENSITY_TRIGGERS) {
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remove trigger word + optional following number
    cleaned = cleaned.replace(new RegExp(escaped + '\\s*\\d{0,2}', 'gi'), '');
    // Remove standalone trigger word
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');
  }
  cleaned = cleaned.replace(/\b\d+\s*(?:von\s*10|\/10|auf\s*10|aus\s*10)\b/gi, '');
  
  // 5. Fuzzy slot-noise pass: remove STT-mangled pain keywords (e.g. "schmerzstrecke")
  // Uses the same isPainKeyword fuzzy logic from the parser
  const remainingTokens = cleaned.split(/\s+/).filter(Boolean);
  const cleanedTokens = remainingTokens.filter(token => {
    const stripped = token.replace(/[,.:;!?]/g, '');
    if (stripped.length < 4) return true; // keep short words
    // If the token looks like a pain keyword (fuzzy match), remove it
    if (isPainKeyword(stripped)) return false;
    return true;
  });
  cleaned = cleanedTokens.join(' ');
  
  // 6. Remove standalone pain numbers (orphaned after trigger removal)
  // Only remove if the number is isolated (not part of a meaningful phrase)
  cleaned = cleaned.replace(/^\d{1,2}$/, ''); // entire notes is just a number
  
  // 7. Remove "now" indicators
  cleaned = cleaned.replace(/\b(jetzt|gerade|sofort|eben|aktuell|momentan)\b/gi, '');
  
  // 8. Clean up whitespace and punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[\s,.\-:;]+/, '').replace(/[\s,.\-:;]+$/, '');
  cleaned = cleaned.replace(/[,]{2,}/g, ',').replace(/[.]{2,}/g, '.');
  cleaned = cleaned.replace(/^\s*[,.\-:;]\s*/, '').replace(/\s*[,.\-:;]\s*$/, '');
  
  return cleaned;
}

// ============================================
// MAIN PARSER FUNCTION
// ============================================

/**
 * Parse a voice transcript into a unified result object
 * 
 * @param transcript - Raw voice transcript
 * @param userMeds - User's medications for matching
 * @returns VoiceParseResult (never fails, falls back to context_entry)
 */
export function parseVoiceEntry(
  transcript: string,
  userMeds: UserMedication[] = []
): VoiceParseResult {
  if (!transcript || transcript.trim().length < 2) {
    const now = new Date();
    return {
      entry_type: 'context_entry',
      confidence: 0,
      raw_text: transcript || '',
      time: {
        kind: 'none',
        iso: now.toISOString(),
        relative_minutes: null,
        date: berlinDateToday(),
        time: now.toTimeString().slice(0, 5),
        isNow: true,
        confidence: 'high'
      },
      pain_intensity: { value: null, confidence: 0, evidence: '', needsReview: false },
      medications: [],
      note: transcript || '',
      needsReview: false,
      typeCanBeToggled: false
    };
  }
  
  // Normalize text
  const normalized = transcript.trim();
  
  // Parse components
  const time = parseTime(normalized);
  const painIntensity = parsePainIntensity(normalized);
  const { medications, tokenSpans: medTokenSpans } = parseMedications(normalized, userMeds);
  
  // Classify entry type
  const classification = classifyEntryType(normalized, painIntensity, medications, time);
  
  // Clean notes (remove extracted parts for new_entry, using span-based cleanup)
  const note = classification.type === 'new_entry'
    ? cleanNotes(normalized, time, painIntensity, medications, medTokenSpans)
    : normalized;
  
  // Calculate if needs review
  const needsReview = 
    medications.some(m => m.needsReview) || 
    painIntensity.needsReview ||
    classification.confidence < 0.65;
  
  return {
    entry_type: classification.type,
    confidence: classification.confidence,
    raw_text: transcript,
    time,
    pain_intensity: painIntensity,
    medications,
    note,
    needsReview,
    typeCanBeToggled: classification.canToggle
  };
}

// ============================================
// LEGACY FUNCTION (backward compatibility)
// ============================================

/**
 * Legacy parser function for backward compatibility
 */
export function parseSimpleVoiceEntry(
  transcript: string,
  userMeds: UserMedication[] = []
): SimpleVoiceResult {
  const result = parseVoiceEntry(transcript, userMeds);
  
  // Convert confidence to category
  const confidenceCategory: 'high' | 'medium' | 'low' = 
    result.confidence >= 0.75 ? 'high' : 
    result.confidence >= 0.5 ? 'medium' : 'low';
  
  return {
    type: result.entry_type,
    time: result.time,
    painLevel: result.pain_intensity.value !== null ? {
      value: result.pain_intensity.value,
      confidence: result.pain_intensity.confidence >= 0.8 ? 'high' : 
                  result.pain_intensity.confidence >= 0.6 ? 'medium' : 'low',
      needsReview: result.pain_intensity.needsReview
    } : undefined,
    medications: result.medications.length > 0 ? result.medications : undefined,
    rawTranscript: result.raw_text,
    cleanedNotes: result.note,
    overallConfidence: confidenceCategory,
    needsReview: result.needsReview
  };
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Format dose quarters to human-readable text
 */
export function formatDoseQuarters(quarters: number): string {
  switch (quarters) {
    case 1: return '¼ Tablette';
    case 2: return '½ Tablette';
    case 3: return '¾ Tablette';
    case 4: return '1 Tablette';
    case 6: return '1½ Tabletten';
    case 8: return '2 Tabletten';
    default: return `${quarters / 4} Tablette${quarters > 4 ? 'n' : ''}`;
  }
}

/**
 * Format time for display
 */
export function formatTimeDisplay(time: ParsedTime): string {
  if (time.displayText) return time.displayText;
  if (time.isNow) return 'jetzt';
  return `${time.date} ${time.time}`;
}
