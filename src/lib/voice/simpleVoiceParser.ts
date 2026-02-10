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
  painFromDescriptor?: boolean; // True if estimated from descriptive words
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
  medsNeedReview: boolean;      // Any medication match is uncertain
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

// Preposition patterns: "bei 5", "auf 5" (only valid near pain context)
const PAIN_PREPOSITION_PATTERNS = [
  /\b(?:bei|auf)\s+(\d{1,2})\b/i,
];

// Intensity word mappings (ordered: most specific first to avoid partial matches)
const INTENSITY_WORD_MAP: Array<{ regex: RegExp; value: number }> = [
  { regex: /\b(keine?r?|null)\s*(schmerz\w*|kopfschmerz\w*|migräne\w*|migraene\w*|attacke\w*|weh)\b/i, value: 0 },
  { regex: /\b(sehr\s*leichte?r?|minimale?r?|kaum\s*spürbar\w*|kaum\s*merklich\w*)\b/i, value: 1 },
  { regex: /\b(leichte?r?|schwache?r?|geringe?r?|dezente?r?|ein\s*bisschen)\b/i, value: 3 },
  { regex: /\b(mittel\w*|mäßige?r?|maessige?r?|mässige?r?|moderate?r?|so\s*mittel|geht\s*so)\b/i, value: 5 },
  { regex: /\b(sehr\s*starke?r?|unerträglich\w*|extreme?r?|maximale?r?|höllische?r?|brutale?r?|kaum\s*auszuhalten)\b/i, value: 9 },
  { regex: /\b(starke?r?|schwere?r?|heftige?r?|massive?r?|schlimme?r?|richtig\s*schlimm\w*|echt\s*schlimm\w*)\b/i, value: 7 },
];

/**
 * Check if a token is a time-unit word (to exclude numbers near it from pain)
 */
function isTimeUnitToken(token: string): boolean {
  return /^(minute|minuten|min|stunde|stunden|std|sekunde|sekunden|sek|tage?|wochen?)$/i.test(token);
}

/**
 * Check if a token is a dose-unit word (to exclude numbers near it from pain)
 */
function isDoseUnitToken(token: string): boolean {
  return /^(mg|milligramm|ml|mcg|mikrogramm|gramm|tropfen|sprühstöße?)$/i.test(token);
}

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

  // Normalize text: replace number words with digits
  let normalized = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(num));
  }

  // Remove mg/dosage values and clock times to avoid confusion
  const sanitized = normalized
    .replace(/\d+\s*mg/gi, '[DOSE]')
    .replace(/\d+\s*milligramm/gi, '[DOSE]')
    .replace(/\d{1,2}:\d{2}/g, '[TIME]');

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
  const tokens = sanitized.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Also check multi-token triggers (e.g., "schmerz stärke" → join adjacent)
    const multiToken = i < tokens.length - 1 ? token + tokens[i + 1] : '';
    const isTrigger = isPainKeyword(token) || (multiToken && isPainKeyword(multiToken));

    if (isTrigger) {
      let bestMatch: { value: number; distance: number } | null = null;
      
      for (let j = Math.max(0, i - 2); j < Math.min(tokens.length, i + 5); j++) {
        if (j === i) continue;
        
        // Skip tokens adjacent to time or dose units
        const nextToken = j + 1 < tokens.length ? tokens[j + 1] : '';
        const prevToken = j > 0 ? tokens[j - 1] : '';
        if (isTimeUnitToken(nextToken) || isDoseUnitToken(nextToken)) continue;
        if (isTimeUnitToken(tokens[j]) || isDoseUnitToken(tokens[j])) continue;
        if (/^(vor|seit)$/i.test(prevToken)) continue;
        // Skip numbers that came from "ein/eine" followed by intensity qualifiers
        if (/^(bisschen|wenig|paar)$/i.test(nextToken)) continue;
        
        const cleanToken = tokens[j].replace(/[,.:;!?]/g, '');
        const numMatch = cleanToken.match(/^(\d{1,2})$/);
        if (numMatch) {
          const level = parseInt(numMatch[1], 10);
          if (level >= 0 && level <= 10) {
            const distance = Math.abs(j - i);
            const adjustedDist = j > i ? distance : distance + 10;
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

  // 4. Check for "bei X" / "auf X" — ONLY if pain context is present
  const hasPainContext = /\b(schmerz\w*|migräne\w*|migraene\w*|kopfschmerz\w*|kopfweh|attacke\w*|anfall\w*|weh)\b/i.test(text);
  if (hasPainContext) {
    for (const pattern of PAIN_PREPOSITION_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        const level = parseInt(match[1], 10);
        // Ensure it's not near a time/dose unit
        const afterMatch = sanitized.substring((match.index || 0) + match[0].length).trim();
        if (level >= 0 && level <= 10 && !isTimeUnitToken(afterMatch.split(/\s+/)[0] || '')) {
          return {
            value: level,
            confidence: 0.70,
            evidence: match[0],
            needsReview: true,
          };
        }
      }
    }
  }

  // 5. Check for intensity words — ONLY if pain context is present
  // Match against original lowercase text (not sanitized) to preserve "ein bisschen" etc.
  const lowerText = text.toLowerCase();
  if (hasPainContext) {
    // Check "wenig" separately: only as pain if directly adjacent to pain word, NOT in "wenig geschlafen" etc.
    const wenigAsPain = /\bwenig\s+(schmerz\w*|kopfschmerz\w*|kopfweh|migräne\w*|migraene\w*|weh)\b/i.test(text);
    
    for (const { regex, value } of INTENSITY_WORD_MAP) {
      const match = lowerText.match(regex);
      if (match) {
        // Guard: "wenig" alone should not match without direct pain context
        if (/wenig/i.test(match[0]) && !wenigAsPain) continue;
        return {
          value,
          confidence: value === 0 ? 0.70 : 0.60,
          evidence: match[0],
          needsReview: true,
          painFromDescriptor: true,
        };
      }
    }
  }

  // 6. Check for standalone number with pain context nearby
  if (/\b(schmerz\w*|migräne\w*|migraene\w*|kopfschmerz\w*|attacke\w*|anfall\w*|kopfweh)\b/i.test(text)) {
    const standaloneMatch = sanitized.match(/\b([0-9]|10)\b/);
    if (standaloneMatch) {
      const level = parseInt(standaloneMatch[1], 10);
      // Verify this number isn't adjacent to a time/dose unit
      const matchIdx = standaloneMatch.index || 0;
      const afterText = sanitized.substring(matchIdx + standaloneMatch[0].length).trim();
      const firstWordAfter = afterText.split(/\s+/)[0] || '';
      if (level >= 0 && level <= 10 && !isTimeUnitToken(firstWordAfter) && !isDoseUnitToken(firstWordAfter) && !/^(bisschen|wenig|paar)$/i.test(firstWordAfter)) {
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
    regex: /\b(?:vor|seit)\s+(?:einer?|einem|1)\s+halben?\s+(?:stunde)\b/i,
    minutesAgo: () => 30,
    display: () => 'vor einer halben Stunde'
  },
  {
    regex: /\b(anderthalb|eineinhalb)\s*(stunde|stunden)\b/i,
    minutesAgo: () => 90,
    display: () => 'vor anderthalb Stunden'
  },
  {
    regex: /\b(?:vor|seit)\s+(?:einer?|einem|1)\s+(?:viertel\s*stunde)\b/i,
    minutesAgo: () => 15,
    display: () => 'vor einer Viertelstunde'
  },
  {
    regex: /\b(?:vor|seit)\s+(?:einer?|einem|1)\s+(?:dreiviertel\s*stunde)\b/i,
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
  {
    // "um 8" / "gegen 14" (without "uhr") — only if preceded by um/gegen
    regex: /\b(?:um|gegen)\s+(\d{1,2})\b/i,
    parse: (m, text) => {
      const hours = parseInt(m[1], 10);
      if (hours > 24) return { hours: 0, minutes: 0 }; // invalid, will be clamped
      const isPM = /nachmittag|abend|pm/i.test(text.toLowerCase());
      return { hours: (isPM && hours < 12) ? hours + 12 : hours, minutes: 0 };
    }
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

// Dose patterns - ordered by specificity (most specific first)
const DOSE_PATTERNS: Array<{ regex: RegExp; quarters: number; text: string }> = [
  { regex: /\bviertel\s*(tablette|kapsel)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\b(1\/4|0[.,]25)\s*(tablette|kapsel)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\bhalbe?\s*(tablette|kapsel)?\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\b(1\/2|0[.,]5)\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\bdrei\s*viertel\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\b(3\/4|0[.,]75)\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\bganze?\s*(tablette|kapsel)?\b/i, quarters: 4, text: '1 Tablette' },
  { regex: /\banderthalb\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(eineinhalb|1[.,]5)\s*(tablette|kapsel)?\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(zwei|2)\s*(tablette|kapsel)/i, quarters: 8, text: '2 Tabletten' },
  { regex: /\b(drei|3)\s*(tablette|kapsel)/i, quarters: 12, text: '3 Tabletten' },
  // "eine tablette" or standalone "eine" near a med (handled in parseMedications)
  { regex: /\b(eine?|1)\s*(tablette|kapsel)\b/i, quarters: 4, text: '1 Tablette' },
  // Spray/drops
  { regex: /\b(einen?|1)\s*(sprühstoß|hub|spray)\b/i, quarters: 4, text: '1 Sprühstoß' },
  { regex: /\b(zwei|2)\s*(sprühstöße|hübe|sprays?)\b/i, quarters: 8, text: '2 Sprühstöße' },
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
  const doseWords = /^(eine[nrm]?|halbe?|ganze?|viertel|dreiviertel|anderthalb|eineinhalb|tablette[n]?|kapsel[n]?|sprühstoß|sprühstöße|hübe?|spray[s]?|tropfen|\d+)$/i;
  const intakeVerbs = /^(genommen|eingenommen|eingeworfen|geschluckt|nehme|nehmen|nehm|geschmissen|mg|milligramm|ml)$/i;
  
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
  
  // === STEP 1: Remove time slots ===
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
  // Orphaned time unit words
  cleaned = cleaned.replace(/\b(minuten|minute|min|stunden|stunde|std|tage?)\b/gi, '');

  // === STEP 2: Remove pain slots (comprehensive) ===
  // 2.1 Pain triggers + number
  for (const trigger of PAIN_INTENSITY_TRIGGERS) {
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escaped + '\\s*\\d{0,2}', 'gi'), '');
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');
  }
  cleaned = cleaned.replace(/\b\d+\s*(?:von\s*10|\/10|auf\s*10|aus\s*10)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:bei|auf)\s+\d{1,2}\b/gi, '');

  // 2.2 Intensity descriptors (ALWAYS remove – they were used for pain estimation)
  cleaned = cleaned.replace(/\b(sehr|extrem|richtig|total|echt|kaum|ziemlich|unglaublich|wahnsinnig|stark|starke|starker|starken|starkes|leicht|leichte|leichter|leichten|leichtes|mittel|mittelstark|mittelstarke|mittelstarker|mittelstarken|mittelstarkes|heftig|heftige|heftiger|heftigen|massiv|massive|massiver|schlimm|schlimme|schlimmer|schwer|schwere|schwerer|brutal|brutale|höllisch|höllische|unerträglich|unerträgliche|minimal|minimale|dezent|dezente|schwach|schwache|schwacher|gering|geringe|geringer|maximal|maximale|mäßig|mäßige|moderat|moderate|spürbar|spuerbar)\b/gi, '');

  // 2.3 Pain context words (redundant, not real context)
  cleaned = cleaned.replace(/\b(kopfschmerze?n?|kopfweh|migräne|migraene|schmerze?n?|attacke|anfall|schmerzattacke)\b/gi, '');

  // 2.4 Fuzzy pain keyword pass (STT-mangled variants)
  const remainingTokens = cleaned.split(/\s+/).filter(Boolean);
  const cleanedTokens = remainingTokens.filter(token => {
    const stripped = token.replace(/[,.:;!?]/g, '');
    if (stripped.length < 4) return true;
    if (isPainKeyword(stripped)) return false;
    return true;
  });
  cleaned = cleanedTokens.join(' ');

  // === STEP 3: Remove medication slots (robust, global) ===
  // 3.1 Dose patterns anywhere: "800 mg", "400mg", "50 milligramm"
  cleaned = cleaned.replace(/\b\d+\s*(?:mg|milligramm|ml|µg|ug)\b/gi, '');
  // 3.2 Intake verbs (global)
  cleaned = cleaned.replace(/\b(genommen|eingenommen|eingeworfen|geschluckt|geschmissen|nehme|nehmen|nehm|nimm|nimmst)\b/gi, '');
  // 3.3 Quantity words + tablet/capsule forms (global)
  cleaned = cleaned.replace(/\b(tablette[n]?|kapsel[n]?|sprühstoß|sprühstöße|hübe?|spray[s]?|tropfen)\b/gi, '');
  cleaned = cleaned.replace(/\b(eine[nrm]?|halbe?|ganze?|viertel|dreiviertel|anderthalb|eineinhalb)\b/gi, '');
  // 3.4 Remove recognized med names that may have survived token-span removal
  for (const med of medications) {
    const medName = med.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp('\\b' + medName + '\\b', 'gi'), '');
  }

  // === STEP 4: Whitespace & punctuation cleanup (intermediate) ===
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[\s,.\-:;]+/, '').replace(/[\s,.\-:;]+$/, '');
  cleaned = cleaned.replace(/[,]{2,}/g, ',').replace(/[.]{2,}/g, '.');
  cleaned = cleaned.replace(/^\s*[,.\-:;]\s*/, '').replace(/\s*[,.\-:;]\s*$/, '');

  // === STEP 5: Strip leading filler phrases (loop until stable) ===
  const LEADING_FILLERS = /^(ich\s+hab(e)?|habe|hab|ich|es\s+ist|es\s+sind|das\s+ist|gerade|momentan|aktuell|jetzt|seit|also|und|aber|oder|dann|noch|nur|so|da|ja|nein|doch|mal|bitte|plus)\b[\s,.:;\-]*/i;
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(LEADING_FILLERS, '').trim();
  }

  // === STEP 6: Strip trailing orphaned connectors ===
  cleaned = cleaned.replace(/\s+(und|oder|aber|dann|also|noch|mal|bitte|plus)\s*$/i, '').trim();

  // === STEP 7: Final quality gate ===
  // If only short filler words remain, clear entirely
  cleaned = cleaned.replace(/^(und|oder|aber|dann|also|noch|nur|bin|ist|war|hat|mit|bei|es|das|die|der|den|dem|ein|eine|so|da|ja|nein|doch|mal|bitte|plus)\s*$/i, '');
  cleaned = cleaned.trim();

  // If less than 3 chars or only digits remain → empty
  if (cleaned.length < 3 || /^\d+$/.test(cleaned)) {
    cleaned = '';
  }

  // Final: if no meaningful content words remain, clear
  if (cleaned.length > 0) {
    const CONTENT_PATTERNS = /\b(übelkeit|erbrechen|lichtempfindlich|geräuschempfindlich|schwindel|aura|flimmern|sehstörung|links|rechts|linksseiti|rechtsseiti|hinterm?\s*auge|nacken|pulsierend|stechend|drückend|hämmernd|ziehend|dumpf|stress|wetter|menstruation|periode|schlaf|dehydriert|alkohol|kaffee|müde|erschöpft|sport|training|reise|essen|getrunken|wegen|nach|seit|durch|morgens|abends|nachts|mittags)\b/i;
    if (!CONTENT_PATTERNS.test(cleaned)) {
      // Check if it's just 1-2 short meaningless words
      const words = cleaned.split(/\s+/).filter(w => w.length > 0);
      if (words.length <= 2 && words.every(w => w.replace(/[,.:;!?]/g, '').length <= 4)) {
        cleaned = '';
      }
    }
  }
  
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
      medsNeedReview: false,
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
  
  // Clean notes (remove extracted parts, using span-based cleanup)
  // Always clean notes to remove slot noise, even for context entries
  const note = cleanNotes(normalized, time, painIntensity, medications, medTokenSpans);
  
  // Calculate if needs review
  const medsNeedReview = medications.some(m => m.needsReview);
  const needsReview = 
    medsNeedReview || 
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
    medsNeedReview,
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
