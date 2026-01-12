/**
 * Simple Voice Parser
 * Focused extraction for pain entries and context notes
 * 
 * Only 2 outcomes:
 * 1. PAIN_ENTRY: Structured data with time, pain level, medications
 * 2. CONTEXT_NOTE: Free text note
 * 
 * Philosophy: Fail-open to note, never block
 */

import { berlinDateToday } from '@/lib/tz';
import { 
  buildUserMedicationLexicon, 
  findMedicationMentions,
  type UserMedication,
  type TranscriptMedicationHit 
} from './medicationFuzzyMatch';

// ============================================
// Types
// ============================================

export type SimpleVoiceResultType = 'pain_entry' | 'context_note';

export interface ParsedTime {
  date: string;      // YYYY-MM-DD
  time: string;      // HH:mm
  isNow: boolean;    // True if no explicit time mentioned
  confidence: 'high' | 'medium' | 'low';
  displayText?: string; // "vor 33 Minuten", "heute Morgen", etc.
}

export interface ParsedPainLevel {
  value: number;     // 0-10
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
}

export interface ParsedMedication {
  name: string;           // Canonical medication name
  medicationId?: string;  // If matched to user's med
  doseQuarters: number;   // 1=quarter, 2=half, 4=full, 8=two
  doseText?: string;      // "halbe Tablette"
  confidence: number;     // 0-1
  needsReview: boolean;   // If uncertain match
}

export interface SimpleVoiceResult {
  type: SimpleVoiceResultType;
  
  // For pain entries
  time?: ParsedTime;
  painLevel?: ParsedPainLevel;
  medications?: ParsedMedication[];
  
  // For all
  rawTranscript: string;
  cleanedNotes: string;   // Transcript minus extracted parts
  
  // Overall confidence
  overallConfidence: 'high' | 'medium' | 'low';
  needsReview: boolean;   // Any field uncertain?
}

// ============================================
// Constants
// ============================================

// Pain detection keywords
const PAIN_KEYWORDS = [
  /\b(kopfschmerz|kopfweh|migräne|migraene|schmerz|schmerzattacke)\b/i,
  /\b(attacke|anfall)\b/i,
  /\bschmerz(stärke|staerke|level|wert)?\s*\d/i,
  /\b\d+\s*(von\s*10|\/10)\b/i,
  /\b(genommen|eingenommen|tablette|triptan)\b/i,
];

// Number words (German)
const NUMBER_WORDS: Record<string, number> = {
  'null': 0, 'kein': 0, 'keine': 0,
  'eins': 1, 'ein': 1, 'eine': 1,
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

// Relative time patterns
const RELATIVE_TIME_PATTERNS: Array<{ regex: RegExp; minutesAgo: (m: RegExpMatchArray) => number; display: (m: RegExpMatchArray) => string }> = [
  { 
    regex: /\bvor\s+(\d+)\s*(minute|minuten|min)\b/i,
    minutesAgo: m => parseInt(m[1], 10),
    display: m => `vor ${m[1]} Minuten`
  },
  { 
    regex: /\bvor\s+(\d+)\s*(stunde|stunden|std|h)\b/i,
    minutesAgo: m => parseInt(m[1], 10) * 60,
    display: m => `vor ${m[1]} Stunde${parseInt(m[1], 10) > 1 ? 'n' : ''}`
  },
  {
    regex: /\bvor\s+(einer?|einem)\s+(stunde)\b/i,
    minutesAgo: () => 60,
    display: () => 'vor einer Stunde'
  },
  {
    regex: /\b(anderthalb|eineinhalb)\s*(stunde|stunden)\b/i,
    minutesAgo: () => 90,
    display: () => 'vor anderthalb Stunden'
  },
  {
    regex: /\bseit\s+(\d+)\s*(minute|minuten|min)\b/i,
    minutesAgo: m => parseInt(m[1], 10),
    display: m => `seit ${m[1]} Minuten`
  },
  {
    regex: /\bseit\s+(\d+)\s*(stunde|stunden|std|h)\b/i,
    minutesAgo: m => parseInt(m[1], 10) * 60,
    display: m => `seit ${m[1]} Stunde${parseInt(m[1], 10) > 1 ? 'n' : ''}`
  },
];

// Day phrases
const DAY_PATTERNS: Array<{ regex: RegExp; daysAgo: number; defaultHour?: number; display: string }> = [
  { regex: /\bheute\s+morgen\b/i, daysAgo: 0, defaultHour: 7, display: 'heute Morgen' },
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
];

// Clock time patterns
const CLOCK_PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => { hours: number; minutes: number } }> = [
  {
    regex: /\b(?:um|gegen)?\s*(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: parseInt(m[2], 10) })
  },
  {
    regex: /\b(?:um|gegen)?\s*(\d{1,2})\s*uhr(?:\s*(\d{1,2}))?\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: m[2] ? parseInt(m[2], 10) : 0 })
  },
  {
    regex: /\bhalb\s+(\d{1,2})\b/i,
    parse: m => ({ hours: (parseInt(m[1], 10) - 1 + 24) % 24, minutes: 30 }) // "halb drei" = 2:30
  },
  {
    regex: /\bviertel\s+nach\s+(\d{1,2})\b/i,
    parse: m => ({ hours: parseInt(m[1], 10), minutes: 15 })
  },
  {
    regex: /\bviertel\s+vor\s+(\d{1,2})\b/i,
    parse: m => ({ hours: (parseInt(m[1], 10) - 1 + 24) % 24, minutes: 45 })
  },
];

// Dose patterns
const DOSE_PATTERNS: Array<{ regex: RegExp; quarters: number; text: string }> = [
  { regex: /\bviertel\s*(tablette)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\b(1\/4|0[.,]25)\s*(tablette)?\b/i, quarters: 1, text: 'Viertel Tablette' },
  { regex: /\bhalbe?\s*(tablette)?\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\b(1\/2|0[.,]5)\b/i, quarters: 2, text: 'halbe Tablette' },
  { regex: /\bdrei\s*viertel\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\b(3\/4|0[.,]75)\b/i, quarters: 3, text: 'dreiviertel Tablette' },
  { regex: /\b(eine?|1)\s*tablette?\b/i, quarters: 4, text: '1 Tablette' },
  { regex: /\banderthalb\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(eineinhalb|1[.,]5)\b/i, quarters: 6, text: 'eineinhalb Tabletten' },
  { regex: /\b(zwei|2)\s*tablette/i, quarters: 8, text: '2 Tabletten' },
];

// ============================================
// Time Parsing
// ============================================

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
      }
      
      return {
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
      
      return {
        date: today,
        time: timeStr,
        isNow: false,
        confidence: 'high',
        displayText: `um ${timeStr} Uhr`
      };
    }
  }
  
  // 4. Check for "now" indicators
  if (/\b(jetzt|gerade|sofort|eben|soeben|aktuell)\b/i.test(text)) {
    return {
      date: today,
      time: now.toTimeString().slice(0, 5),
      isNow: true,
      confidence: 'high',
      displayText: 'jetzt'
    };
  }
  
  // 5. Default to now
  return {
    date: today,
    time: now.toTimeString().slice(0, 5),
    isNow: true,
    confidence: 'high'
  };
}

// ============================================
// Pain Level Parsing
// ============================================

function parsePainLevel(text: string): ParsedPainLevel | null {
  // Convert number words
  let normalized = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(num));
  }
  
  // Remove mg values to avoid confusion
  const sanitized = normalized.replace(/\d+\s*mg/gi, '');
  
  // 1. Explicit patterns: "Stärke 7", "Schmerzlevel 7", "7 von 10"
  const explicitPatterns = [
    /\b(?:schmerz|pain|stärke|staerke|level|intensität|intensitaet|skala)[^\d]*(\d{1,2})/i,
    /\b(\d{1,2})\s*(?:von\s*10|\/10)/i,
    /\b(\d{1,2})[^\d]*(?:schmerz|pain|migräne|kopfschmerz)/i,
  ];
  
  for (const pattern of explicitPatterns) {
    const match = sanitized.match(pattern);
    if (match) {
      const level = parseInt(match[1], 10);
      if (level >= 0 && level <= 10) {
        return { value: level, confidence: 'high', needsReview: false };
      }
    }
  }
  
  // 2. Intensity words
  const intensityMap: Array<{ regex: RegExp; value: number }> = [
    { regex: /\b(sehr\s*stark|unerträglich|extrem|heftig|maximal)\b/i, value: 9 },
    { regex: /\b(stark|schwer|massiv)\b/i, value: 7 },
    { regex: /\b(mittel|mäßig|maessig|normal)\b/i, value: 5 },
    { regex: /\b(leicht|schwach|gering|wenig)\b/i, value: 3 },
    { regex: /\b(keine?|null)\s*(schmerz|migräne|kopfschmerz)/i, value: 0 },
  ];
  
  for (const { regex, value } of intensityMap) {
    if (regex.test(sanitized)) {
      return { value, confidence: 'medium', needsReview: true };
    }
  }
  
  // 3. Standalone number 0-10 with pain context nearby
  if (/\b(schmerz|migräne|kopfschmerz|attacke|anfall)\b/i.test(text)) {
    const standaloneMatch = sanitized.match(/\b([0-9]|10)\b/);
    if (standaloneMatch) {
      return { 
        value: parseInt(standaloneMatch[1], 10), 
        confidence: 'medium', 
        needsReview: true 
      };
    }
  }
  
  return null;
}

// ============================================
// Medication Parsing
// ============================================

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
    const windowStart = Math.max(0, hit.startIndex - 3);
    const windowEnd = Math.min(tokens.length, hit.endIndex + 4);
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
// Intent Detection
// ============================================

function isPainEntry(text: string, medications: ParsedMedication[], painLevel: ParsedPainLevel | null): boolean {
  // Check for pain keywords
  if (PAIN_KEYWORDS.some(pattern => pattern.test(text))) {
    return true;
  }
  
  // Has medications (strong indicator)
  if (medications.length > 0) {
    return true;
  }
  
  // Has pain level
  if (painLevel !== null) {
    return true;
  }
  
  return false;
}

// ============================================
// Clean Notes
// ============================================

function cleanNotes(
  text: string,
  time: ParsedTime,
  painLevel: ParsedPainLevel | null,
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
  cleaned = cleaned.replace(/\b(?:schmerz|pain|stärke|level)[^\d]*\d+/gi, '');
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
// Main Parser Function
// ============================================

/**
 * Parse a voice transcript into either a pain entry or context note
 * 
 * @param transcript - Raw voice transcript
 * @param userMeds - User's medications for matching
 * @returns Parsed result (never fails, falls back to context_note)
 */
export function parseSimpleVoiceEntry(
  transcript: string,
  userMeds: UserMedication[] = []
): SimpleVoiceResult {
  if (!transcript || transcript.trim().length < 2) {
    return {
      type: 'context_note',
      rawTranscript: transcript,
      cleanedNotes: transcript,
      overallConfidence: 'low',
      needsReview: false
    };
  }
  
  // Normalize text
  const normalized = transcript.trim();
  
  // Parse components
  const time = parseTime(normalized);
  const painLevel = parsePainLevel(normalized);
  const medications = parseMedications(normalized, userMeds);
  
  // Determine type
  const isPain = isPainEntry(normalized, medications, painLevel);
  
  // Clean notes (remove extracted parts)
  const cleanedNotes = isPain 
    ? cleanNotes(normalized, time, painLevel, medications)
    : normalized;
  
  // Calculate overall confidence
  const hasUncertainItems = medications.some(m => m.needsReview) || (painLevel?.needsReview ?? false);
  const confidenceFactors = [
    time.confidence === 'high' ? 1 : time.confidence === 'medium' ? 0.5 : 0,
    painLevel ? (painLevel.confidence === 'high' ? 1 : 0.5) : 0,
    medications.length > 0 ? Math.min(...medications.map(m => m.confidence)) : 0
  ].filter(c => c > 0);
  
  const avgConfidence = confidenceFactors.length > 0 
    ? confidenceFactors.reduce((a, b) => a + b, 0) / confidenceFactors.length
    : 0.5;
  
  const overallConfidence: 'high' | 'medium' | 'low' = 
    avgConfidence >= 0.85 ? 'high' : 
    avgConfidence >= 0.6 ? 'medium' : 'low';
  
  if (isPain) {
    return {
      type: 'pain_entry',
      time,
      painLevel: painLevel || undefined,
      medications: medications.length > 0 ? medications : undefined,
      rawTranscript: transcript,
      cleanedNotes,
      overallConfidence,
      needsReview: hasUncertainItems
    };
  }
  
  return {
    type: 'context_note',
    time,
    rawTranscript: transcript,
    cleanedNotes: normalized,
    overallConfidence: 'high',
    needsReview: false
  };
}

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
