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
  // Generic intensity words
  'stärke', 'staerke', 'level', 'intensität', 'intensitaet', 'skala',
  'kopfschmerzstärke', 'kopfschmerz stärke',
  'migränestärke', 'migraenestärke', 'migräne stärke',
];

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

  // 2. Check for trigger word + number within 4 tokens
  const tokens = sanitized.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Check if this token matches a pain trigger
    const isTrigger = PAIN_INTENSITY_TRIGGERS.some(trigger => {
      const normalizedTrigger = trigger.toLowerCase().replace(/\s+/g, '');
      const normalizedToken = token.replace(/[^\wäöüß]/gi, '');
      
      // Exact match or fuzzy match (for STT errors)
      return normalizedToken === normalizedTrigger ||
             normalizedToken.includes(normalizedTrigger) ||
             normalizedTrigger.includes(normalizedToken) ||
             // Levenshtein-like: allow 1-2 char differences for longer words
             (normalizedToken.length >= 6 && 
              normalizedTrigger.length >= 6 && 
              Math.abs(normalizedToken.length - normalizedTrigger.length) <= 2 &&
              normalizedToken.substring(0, 6) === normalizedTrigger.substring(0, 6));
    });

    if (isTrigger) {
      // Look for number in nearby tokens (window of 4)
      for (let j = Math.max(0, i - 2); j < Math.min(tokens.length, i + 5); j++) {
        if (j === i) continue;
        
        const numMatch = tokens[j].match(/^(\d{1,2})$/);
        if (numMatch) {
          const level = parseInt(numMatch[1], 10);
          if (level >= 0 && level <= 10) {
            return {
              value: level,
              confidence: 0.85,
              evidence: `${token} ... ${tokens[j]}`,
              needsReview: false,
            };
          }
        }
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

  // 4. Check for intensity words
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
  parse: (m: RegExpMatchArray) => { hours: number; minutes: number } 
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
    regex: /\bhalb\s+(\d{1,2})\b/i,
    parse: m => ({ hours: (parseInt(m[1], 10) - 1 + 24) % 24, minutes: 30 })
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
      const { hours, minutes } = pattern.parse(match);
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
 */
function parseMedications(
  text: string,
  userMeds: UserMedication[]
): ParsedMedication[] {
  const lexicon = buildUserMedicationLexicon(userMeds);
  const hits = findMedicationMentions(text, lexicon);
  
  const medications: ParsedMedication[] = [];
  const tokens = text.toLowerCase().split(/\s+/);
  
  for (const hit of hits) {
    if (!hit.match) continue;
    
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
  
  return medications;
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
  
  // Scoring
  let newEntryScore = 0;
  let contextScore = 0;
  
  // Strong indicators for new entry
  if (hasMedications) newEntryScore += 0.35;
  if (hasPainLevel) newEntryScore += 0.30;
  if (hasExplicitTime && (hasMedications || hasPainLevel)) newEntryScore += 0.15;
  if (hasNewEntryTrigger) newEntryScore += 0.20;
  
  // Strong indicators for context entry
  if (hasContextTrigger && !hasMedications && !hasPainLevel) contextScore += 0.40;
  if (!hasMedications && !hasPainLevel && !hasNewEntryTrigger) contextScore += 0.30;
  
  // Decision
  const totalScore = newEntryScore + contextScore;
  const normalizedNewEntry = totalScore > 0 ? newEntryScore / totalScore : 0.5;
  
  if (newEntryScore > contextScore && (hasMedications || hasPainLevel || hasNewEntryTrigger)) {
    return {
      type: 'new_entry',
      confidence: Math.min(0.95, normalizedNewEntry),
      canToggle: normalizedNewEntry < 0.75
    };
  }
  
  // Default to context entry (fail-open)
  return {
    type: 'context_entry',
    confidence: Math.min(0.95, 1 - normalizedNewEntry),
    canToggle: normalizedNewEntry > 0.35
  };
}

// ============================================
// CLEAN NOTES (remove extracted parts)
// ============================================

function cleanNotes(
  text: string,
  time: ParsedTime,
  painIntensity: ParsedPainIntensity,
  medications: ParsedMedication[]
): string {
  let cleaned = text;
  
  // Remove time expressions
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
  
  // Remove pain level expressions
  for (const trigger of PAIN_INTENSITY_TRIGGERS) {
    cleaned = cleaned.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), '');
  }
  cleaned = cleaned.replace(/\b\d+\s*(?:von\s*10|\/10)/gi, '');
  
  // Remove medication names
  for (const med of medications) {
    cleaned = cleaned.replace(new RegExp(`\\b${med.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
  }
  
  // Remove dose expressions
  for (const pattern of DOSE_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, '');
  }
  
  // Remove common filler
  cleaned = cleaned.replace(/\b(genommen|eingenommen|tablette|tabletten|mg|milligramm)\b/gi, '');
  
  // Clean up
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[\s,.\-:;]+/, '').replace(/[\s,.\-:;]+$/, '');
  
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
  const medications = parseMedications(normalized, userMeds);
  
  // Classify entry type
  const classification = classifyEntryType(normalized, painIntensity, medications, time);
  
  // Clean notes (remove extracted parts for new_entry)
  const note = classification.type === 'new_entry'
    ? cleanNotes(normalized, time, painIntensity, medications)
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
