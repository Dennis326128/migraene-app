import { berlinDateToday } from "@/lib/tz";

export interface ParsedVoiceEntry {
  selectedDate: string;
  selectedTime: string;
  painLevel: string;
  medications: string[];
  notes: string;
  isNow: boolean;
  confidence: {
    time: 'high' | 'medium' | 'low';
    pain: 'high' | 'medium' | 'low';
    meds: 'high' | 'medium' | 'low';
  };
  medicationEffect?: {
    rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
    medName?: string;
    sideEffects?: string[];
    confidence: 'high' | 'medium' | 'low';
  };
}

// Number words to digits mapping for German
const NUMBER_WORDS: Record<string, string> = {
  'null': '0',
  'eins': '1',
  'zwei': '2', 
  'drei': '3',
  'vier': '4',
  'fünf': '5',
  'sechs': '6',
  'sieben': '7',
  'acht': '8',
  'neun': '9',
  'zehn': '10'
};

// Time phrases for robust parsing
const TIME_PHRASES: Record<string, { hours?: number; minutes?: number; relative?: boolean }> = {
  'viertel nach': { minutes: 15, relative: true },
  'halb': { minutes: 30, relative: true },
  'viertel vor': { minutes: -15, relative: true },
  'drei viertel': { minutes: 45, relative: true },
  'heute morgen': { hours: 7, minutes: 0 },
  'heute mittag': { hours: 12, minutes: 0 },
  'heute abend': { hours: 20, minutes: 0 },
  'gestern morgen': { hours: 7, minutes: 0, relative: true },
  'gestern abend': { hours: 20, minutes: 0, relative: true }
};

// Convert number words to digits in text
export function convertNumberWords(text: string): string {
  let result = text;
  
  // Convert written numbers to digits
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit);
  }
  
  // Handle "X von zehn" patterns
  result = result.replace(/(\d+)\s+von\s+zehn/gi, '$1');
  
  return result;
}

// German pain level mapping
const PAIN_LEVEL_PATTERNS = [
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(10|zehn)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(9|neun)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(8|acht)/i, level: "sehr_stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(7|sieben)/i, level: "stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(6|sechs)/i, level: "stark" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(5|fünf)/i, level: "mittel" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(4|vier)/i, level: "mittel" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(3|drei)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(2|zwei)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(1|eins)/i, level: "leicht" },
  { pattern: /(schmerz|pain|migräne|kopfschmerz).{0,20}(0|null|kein)/i, level: "leicht" },
  
  // Alternative patterns with numbers first
  { pattern: /(10|zehn).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(9|neun).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(8|acht).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(7|sieben).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(6|sechs).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(5|fünf).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(4|vier).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(3|drei).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },
  { pattern: /(2|zwei).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },
  { pattern: /(1|eins).{0,20}(schmerz|pain|migräne|kopfschmerz)/i, level: "leicht" },

  // Intensity words
  { pattern: /(sehr starke?|unerträglich|extremer?|heftige?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "sehr_stark" },
  { pattern: /(starke?|schwere?|massive?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "stark" },
  { pattern: /(mittlere?|mäßige?|normale?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "mittel" },
  { pattern: /(leichte?|schwache?|geringe?).{0,30}(schmerz|migräne|kopfschmerz)/i, level: "leicht" },
];

// Common medications with dosage patterns
const MEDICATION_PATTERNS = [
  { name: "Sumatriptan", pattern: /(sumatriptan|suma).{0,20}(\d{1,3})/i },
  { name: "Ibuprofen", pattern: /(ibuprofen|ibu).{0,20}(\d{1,4})/i },
  { name: "Aspirin", pattern: /(aspirin|ass).{0,20}(\d{1,4})/i },
  { name: "Paracetamol", pattern: /(paracetamol|para).{0,20}(\d{1,4})/i },
  { name: "Rizatriptan", pattern: /(rizatriptan|riza).{0,20}(\d{1,3})/i },
  { name: "Almotriptan", pattern: /(almotriptan|almo).{0,20}(\d{1,3})/i },
  { name: "Naratriptan", pattern: /(naratriptan|nara).{0,20}(\d{1,3})/i }
];

// Time patterns for German voice input  
const TIME_PATTERNS = [
  // Relative time patterns
  { pattern: /vor\s+(\d+|einer?|zwei|drei|vier|fünf|sechs)\s+(minute|minuten)/i, type: 'relative_minutes' },
  { pattern: /vor\s+(\d+|einer?|zwei|drei|vier|fünf|sechs)\s+(stunde|stunden)/i, type: 'relative_hours' },
  
  // Specific times
  { pattern: /(\d{1,2}):(\d{2})/i, type: 'time' },
  { pattern: /(\d{1,2})\s+uhr/i, type: 'hour' },
  { pattern: /(halb|viertel nach|viertel vor|drei viertel)\s+(\d+)/i, type: 'quarter' },
  
  // Day references
  { pattern: /(heute|gestern|vorgestern)/i, type: 'day' },
  { pattern: /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/i, type: 'weekday' },
  
  // "Now" indicators
  { pattern: /(jetzt|gerade|sofort|eben)/i, type: 'now' }
];

function parseTime(text: string) {
  const now = new Date();
  const today = berlinDateToday();
  
  // Check for "now" indicators first
  for (const timePattern of TIME_PATTERNS) {
    if (timePattern.type === 'now') {
      const match = text.match(timePattern.pattern);
      if (match) {
        console.log('🕒 Time parsed as "now"');
        return { 
          date: today, 
          time: '',
          isNow: true 
        };
      }
    }
  }
  
  // Try to parse relative time (vor X Minuten/Stunden)
  for (const timePattern of TIME_PATTERNS) {
    const match = text.match(timePattern.pattern);
    if (!match) continue;
    
    if (timePattern.type === 'relative_minutes') {
      const minutesStr = match[1];
      let minutes = parseInt(minutesStr) || convertWordToNumber(minutesStr) || 0;
      
      const targetTime = new Date(now.getTime() - minutes * 60 * 1000);
      const targetDate = targetTime.toISOString().split('T')[0];
      const targetTimeStr = targetTime.toTimeString().slice(0, 5);
      
      console.log(`🕒 Time parsed: ${minutes} minutes ago -> ${targetDate} ${targetTimeStr}`);
      return { 
        date: targetDate, 
        time: targetTimeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'relative_hours') {
      const hoursStr = match[1];
      let hours = parseInt(hoursStr) || convertWordToNumber(hoursStr) || 0;
      
      const targetTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const targetDate = targetTime.toISOString().split('T')[0];
      const targetTimeStr = targetTime.toTimeString().slice(0, 5);
      
      console.log(`🕒 Time parsed: ${hours} hours ago -> ${targetDate} ${targetTimeStr}`);
      return { 
        date: targetDate, 
        time: targetTimeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'time') {
      const hours = match[1];
      const minutes = match[2];
      const timeStr = `${hours.padStart(2, '0')}:${minutes}`;
      
      console.log(`🕒 Time parsed: specific time -> ${today} ${timeStr}`);
      return { 
        date: today, 
        time: timeStr,
        isNow: false 
      };
    }
    
    if (timePattern.type === 'day') {
      const dayRef = match[1].toLowerCase();
      let targetDate = today;
      
      if (dayRef === 'gestern') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = yesterday.toISOString().split('T')[0];
      }
      
      console.log(`🕒 Time parsed: day reference -> ${targetDate}`);
      return { 
        date: targetDate, 
        time: '',
        isNow: false 
      };
    }
  }
  
  // If no specific time found, assume "now"
  console.log('🕒 No specific time found, defaulting to "now"');
  return { 
    date: today, 
    time: '',
    isNow: true 
  };
}

function convertWordToNumber(word: string): number {
  const wordNumbers: { [key: string]: number } = {
    'einer': 1, 'eine': 1, 'ein': 1,
    'zwei': 2,
    'drei': 3,
    'vier': 4,
    'fünf': 5,
    'sechs': 6
  };
  
  return wordNumbers[word.toLowerCase()] || 0;
}

function parsePainLevel(text: string): string {
  // First try to find explicit numeric patterns
  const numericMatch = text.match(/\b(\d+)\s*(?:\/10|von\s*10|out\s*of\s*10)?\b/);
  if (numericMatch) {
    const level = parseInt(numericMatch[1]);
    if (level >= 0 && level <= 10) {
      console.log(`🎯 Pain level parsed: ${level} (numeric)`);
      return level.toString();
    }
  }
  
  // Then try category patterns
  for (const painPattern of PAIN_LEVEL_PATTERNS) {
    if (painPattern.pattern.test(text)) {
      console.log(`🎯 Pain level parsed: ${painPattern.level} (category)`);
      return painPattern.level;
    }
  }
  
  console.log('🎯 No pain level found');
  return '';
}

function parseMedicationEffect(text: string): { rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good'; confidence: 'high' | 'medium' | 'low' } {
  const effectPatterns = [
    { pattern: /(gar nicht|überhaupt nicht|null|keine wirkung)/i, rating: 'none' as const },
    { pattern: /(schlecht|kaum|wenig|schwach)/i, rating: 'poor' as const },
    { pattern: /(mittel|ok|okay|mittelgut|etwas|teilweise)/i, rating: 'moderate' as const },
    { pattern: /(gut|besser|geholfen|wirksam)/i, rating: 'good' as const },
    { pattern: /(sehr gut|ausgezeichnet|perfekt|super|toll)/i, rating: 'very_good' as const },
  ];

  // Check for medication effect context
  const hasEffectContext = /(wirkung|gewirkt|geholfen|tablette|medikament)/i.test(text);
  
  for (const effectPattern of effectPatterns) {
    if (effectPattern.pattern.test(text)) {
      console.log(`💊 Medication effect parsed: ${effectPattern.rating}`);
      return {
        rating: effectPattern.rating,
        confidence: hasEffectContext ? 'high' : 'medium'
      };
    }
  }
  
  return undefined;
}

function parseMedications(text: string): string[] {
  const medications: string[] = [];
  
  for (const medPattern of MEDICATION_PATTERNS) {
    let match;
    const regex = new RegExp(medPattern.pattern.source, medPattern.pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      const dosage = match[2];
      const medName = dosage ? `${medPattern.name} ${dosage} mg` : medPattern.name;
      medications.push(medName);
    }
  }
  
  return medications;
}

function extractNotes(text: string, parsedTime: any, parsedPain: string, parsedMeds: string[]): string {
  let cleanedText = text;
  
  // Remove recognized time expressions
  for (const timePattern of TIME_PATTERNS) {
    cleanedText = cleanedText.replace(timePattern.pattern, '');
  }
  
  // Remove recognized pain expressions  
  for (const painPattern of PAIN_LEVEL_PATTERNS) {
    cleanedText = cleanedText.replace(painPattern.pattern, '');
  }
  
  // Remove recognized medications
  for (const medPattern of MEDICATION_PATTERNS) {
    cleanedText = cleanedText.replace(medPattern.pattern, '');
  }
  
  // Clean up extra whitespace and punctuation
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')
    .replace(/^\s*[,.\-:;]\s*/, '')
    .trim();
    
  return cleanedText;
}

// Determine confidence levels for parsed data
function calculateConfidence(text: string, parsedTime: any, parsedPain: string, parsedMeds: string[]): ParsedVoiceEntry['confidence'] {
  const normalizedText = convertNumberWords(text.toLowerCase());
  
  // Time confidence
  let timeConfidence: 'high' | 'medium' | 'low' = 'low';
  if (parsedTime.isNow) {
    timeConfidence = 'high'; // "now" is explicit and clear
  } else if (parsedTime.date !== berlinDateToday() || parsedTime.time !== '') {
    timeConfidence = 'high'; // Explicit time mentioned
  }
  
  // Pain confidence - be more generous with numbers
  let painConfidence: 'high' | 'medium' | 'low' = 'low';
  if (parsedPain && parsedPain !== '') {
    // Direct numbers get high confidence
    const isDirectNumber = /^\d+$/.test(parsedPain);
    if (isDirectNumber) {
      console.log(`[Confidence] Pain level ${parsedPain} is a direct number -> HIGH confidence`);
      painConfidence = 'high';
    } else {
      // Category words get medium confidence
      const hasExplicitPain = /\b(\d+|null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b.*?(schmerz|migräne|pain)/i.test(normalizedText);
      painConfidence = hasExplicitPain ? 'high' : 'medium';
      console.log(`[Confidence] Pain level ${parsedPain} categorized as ${painConfidence}`);
    }
  }
  
  // Medication confidence
  let medsConfidence: 'high' | 'medium' | 'low' = 'high'; // Default: assume no meds if not mentioned
  if (parsedMeds.length > 0) {
    const hasExplicitMeds = /\b(genommen|eingenommen|tablette|medikament|mg|gramm)\b/i.test(normalizedText);
    medsConfidence = hasExplicitMeds ? 'high' : 'medium';
  }
  
  const result = { time: timeConfidence, pain: painConfidence, meds: medsConfidence };
  console.log(`[Confidence] Calculated:`, result);
  return result;
}

// Check which required fields are missing for slot-filling
export function getMissingSlots(entry: ParsedVoiceEntry): ('time' | 'pain' | 'meds')[] {
  const missing: ('time' | 'pain' | 'meds')[] = [];
  
  console.log(`[getMissingSlots] Analyzing entry:`, {
    painLevel: entry.painLevel,
    isNow: entry.isNow,
    medications: entry.medications,
    confidence: entry.confidence
  });
  
  // Time is missing only if we have no time info at all AND it's not "now"
  if (!entry.isNow && entry.confidence.time === 'low' && !entry.selectedTime) {
    console.log(`[getMissingSlots] Time marked as missing`);
    missing.push('time');
  }
  
  // Pain is missing only if completely empty (not just low confidence)
  if (!entry.painLevel || entry.painLevel === '') {
    console.log(`[getMissingSlots] Pain marked as missing`);
    missing.push('pain');
  }
  
  // Meds are optional - only ask if user explicitly mentioned meds but we couldn't parse them well
  if (entry.medications.length > 0 && entry.confidence.meds === 'low') {
    console.log(`[getMissingSlots] Meds marked as missing (mentioned but unclear)`);
    missing.push('meds');
  }
  
  console.log(`[getMissingSlots] Missing slots:`, missing);
  return missing;
}

export function parseGermanVoiceEntry(text: string): ParsedVoiceEntry {
  console.log('🎯 Parsing voice entry:', text);
  
  // Convert number words first
  const normalizedText = convertNumberWords(text);
  
  const timeResult = parseTime(normalizedText);
  const painLevel = parsePainLevel(normalizedText);
  const medications = parseMedications(normalizedText);
  const medicationEffect = parseMedicationEffect(normalizedText);
  const confidence = calculateConfidence(text, timeResult, painLevel, medications);
  
  const notes = extractNotes(normalizedText, timeResult, painLevel, medications);
  
  const result: ParsedVoiceEntry = {
    selectedDate: timeResult.date,
    selectedTime: timeResult.time,
    painLevel,
    medications,
    notes,
    isNow: timeResult.isNow,
    confidence,
    medicationEffect: medicationEffect && medicationEffect.rating !== 'none' ? medicationEffect : undefined
  };
  
  console.log('🎙️ Parsed result:', result);
  console.log('🎙️ Missing slots check:', getMissingSlots(result));
  return result;
}