import { berlinDateToday } from "@/lib/tz";

export interface ParsedVoiceEntry {
  selectedDate: string;
  selectedTime: string;
  painLevel: string;
  medications: string[];
  notes: string;
  isNow: boolean;
  medicationEffect?: {
    rating: 'none' | 'poor' | 'moderate' | 'good' | 'very_good';
    medName?: string;
    sideEffects?: string[];
    confidence: 'high' | 'medium' | 'low';
  };
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

// Common German medications with dosage patterns
const MEDICATION_PATTERNS = [
  { pattern: /(sumatriptan|sumatripan)\s*(\d{1,3})?\s*(mg|milligramm)?/gi, name: "Sumatriptan" },
  { pattern: /(ibuprofen|ibu)\s*(\d{1,4})?\s*(mg|milligramm)?/gi, name: "Ibuprofen" },
  { pattern: /(paracetamol|para)\s*(\d{1,4})?\s*(mg|milligramm)?/gi, name: "Paracetamol" },
  { pattern: /(aspirin|ass|acetylsalicylsäure)\s*(\d{1,4})?\s*(mg|milligramm)?/gi, name: "Aspirin" },
  { pattern: /(novalgin|metamizol)\s*(\d{1,4})?\s*(mg|milligramm)?/gi, name: "Novalgin" },
  { pattern: /(almotriptan)\s*(\d{1,3})?\s*(mg|milligramm)?/gi, name: "Almotriptan" },
  { pattern: /(rizatriptan)\s*(\d{1,3})?\s*(mg|milligramm)?/gi, name: "Rizatriptan" },
  { pattern: /(diclofenac)\s*(\d{1,3})?\s*(mg|milligramm)?/gi, name: "Diclofenac" },
];

// Time parsing patterns for German
const TIME_PATTERNS = [
  // Relative time
  { pattern: /vor\s+(\d{1,3})\s*(minute[n]?|min)/i, type: 'relative_minutes' },
  { pattern: /vor\s+(\d{1,2})\s*(stunde[n]?|std)/i, type: 'relative_hours' },
  { pattern: /vor\s+(\d{1,2})\s*tag(en?)?/i, type: 'relative_days' },
  
  // Yesterday/today patterns
  { pattern: /gestern(\s+um)?\s*(\d{1,2})[:.:](\d{2})/i, type: 'yesterday_time' },
  { pattern: /vorgestern(\s+um)?\s*(\d{1,2})[:.:](\d{2})/i, type: 'day_before_yesterday_time' },
  { pattern: /heute(\s+um)?\s*(\d{1,2})[:.:](\d{2})/i, type: 'today_time' },
  { pattern: /gestern\s*(morgen|vormittag)/i, type: 'yesterday_morning' },
  { pattern: /gestern\s*(abend|nachmittag)/i, type: 'yesterday_evening' },
  { pattern: /heute\s*(morgen|vormittag)/i, type: 'today_morning' },
  { pattern: /heute\s*(abend|nachmittag)/i, type: 'today_evening' },
  
  // Absolute time
  { pattern: /am\s+(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s*um\s*(\d{1,2})[:.:](\d{2})/i, type: 'absolute_date_time' },
  { pattern: /(\d{1,2})[:.:](\d{2})\s*uhr/i, type: 'time_only' },
  
  // Day names (assuming current week)
  { pattern: /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(\s+um\s*(\d{1,2})[:.:](\d{2}))?/i, type: 'weekday' },
];

function parseTime(text: string): { date: string; time: string; isNow: boolean } {
  const now = new Date();
  const berlinToday = berlinDateToday();
  
  for (const timePattern of TIME_PATTERNS) {
    const match = text.match(timePattern.pattern);
    if (!match) continue;
    
    switch (timePattern.type) {
      case 'relative_minutes': {
        const minutes = parseInt(match[1]);
        const resultTime = new Date(now.getTime() - minutes * 60000);
        return {
          date: resultTime.toISOString().slice(0, 10),
          time: resultTime.toTimeString().slice(0, 5),
          isNow: false
        };
      }
      
      case 'relative_hours': {
        const hours = parseInt(match[1]);
        const resultTime = new Date(now.getTime() - hours * 3600000);
        return {
          date: resultTime.toISOString().slice(0, 10),
          time: resultTime.toTimeString().slice(0, 5),
          isNow: false
        };
      }
      
      case 'relative_days': {
        const days = parseInt(match[1]);
        const resultTime = new Date(now.getTime() - days * 86400000);
        return {
          date: resultTime.toISOString().slice(0, 10),
          time: "12:00", // Default to noon if no time specified
          isNow: false
        };
      }
      
      case 'yesterday_time': {
        const hour = parseInt(match[2]);
        const minute = parseInt(match[3]);
        const yesterday = new Date(now.getTime() - 86400000);
        yesterday.setHours(hour, minute, 0, 0);
        return {
          date: yesterday.toISOString().slice(0, 10),
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          isNow: false
        };
      }
      
      case 'today_time': {
        const hour = parseInt(match[2]);
        const minute = parseInt(match[3]);
        return {
          date: berlinToday,
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          isNow: false
        };
      }
      
      case 'yesterday_morning': {
        const yesterday = new Date(now.getTime() - 86400000);
        return {
          date: yesterday.toISOString().slice(0, 10),
          time: "07:00",
          isNow: false
        };
      }
      
      case 'yesterday_evening': {
        const yesterday = new Date(now.getTime() - 86400000);
        return {
          date: yesterday.toISOString().slice(0, 10),
          time: "20:00",
          isNow: false
        };
      }
      
      case 'today_morning': {
        return {
          date: berlinToday,
          time: "07:00",
          isNow: false
        };
      }
      
      case 'today_evening': {
        return {
          date: berlinToday,
          time: "20:00",
          isNow: false
        };
      }
      
      case 'time_only': {
        const hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        return {
          date: berlinToday,
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          isNow: false
        };
      }
    }
  }
  
  // No time found - default to "now"
  return {
    date: berlinToday,
    time: now.toTimeString().slice(0, 5),
    isNow: true
  };
}

function parsePainLevel(text: string): string {
  // First: Try to extract exact numbers 0-10
  const numberPattern = /(schmerz|pain|migräne|kopfschmerz).{0,20}(\d{1,2})/i;
  const reverseNumberPattern = /(\d{1,2}).{0,20}(schmerz|pain|migräne|kopfschmerz)/i;
  
  let match = text.match(numberPattern) || text.match(reverseNumberPattern);
  
  if (match) {
    const number = parseInt(match[2] || match[1]);
    if (number >= 0 && number <= 10) {
      return number.toString();
    }
  }
  
  // Fallback: Use intensity words and map to approximate numbers
  for (const pattern of PAIN_LEVEL_PATTERNS) {
    if (pattern.pattern.test(text)) {
      // Map categories to representative numbers
      switch (pattern.level) {
        case "sehr_stark": return "9";
        case "stark": return "7";
        case "mittel": return "5";
        case "leicht": return "2";
        default: return pattern.level;
      }
    }
  }
  
  return ""; // No pain level found
}

function parseMedicationEffect(text: string): ParsedVoiceEntry['medicationEffect'] {
  // Simple effect patterns for quick implementation
  const effects = [
    { pattern: /(gar nicht|nicht).{0,20}(geholfen|gewirkt)/i, rating: 'none' as const },
    { pattern: /(schlecht|wenig).{0,20}(geholfen|gewirkt)/i, rating: 'poor' as const },
    { pattern: /(mittel|ok|okay).{0,20}(geholfen|gewirkt)/i, rating: 'moderate' as const },
    { pattern: /(gut).{0,20}(geholfen|gewirkt)/i, rating: 'good' as const },
    { pattern: /(sehr gut|super).{0,20}(geholfen|gewirkt)/i, rating: 'very_good' as const },
  ];

  for (const effect of effects) {
    if (effect.pattern.test(text)) {
      return {
        rating: effect.rating,
        confidence: 'medium'
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
  let notes = text;
  
  // Remove recognized time expressions
  for (const timePattern of TIME_PATTERNS) {
    notes = notes.replace(timePattern.pattern, '');
  }
  
  // Remove recognized pain expressions
  for (const painPattern of PAIN_LEVEL_PATTERNS) {
    notes = notes.replace(painPattern.pattern, '');
  }
  
  // Remove recognized medications
  for (const medPattern of MEDICATION_PATTERNS) {
    notes = notes.replace(medPattern.pattern, '');
  }
  
  // Clean up the remaining text
  notes = notes
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/^[,.\s]+|[,.\s]+$/g, '') // Remove leading/trailing punctuation and spaces
    .trim();
  
  return notes;
}

export function parseGermanVoiceEntry(text: string): ParsedVoiceEntry {
  console.log('🎙️ Parsing voice text:', text);
  
  const timeResult = parseTime(text);
  const painLevel = parsePainLevel(text);
  const medications = parseMedications(text);
  const notes = extractNotes(text, timeResult, painLevel, medications);
  
  const result: ParsedVoiceEntry = {
    selectedDate: timeResult.date,
    selectedTime: timeResult.time,
    painLevel,
    medications,
    notes,
    isNow: timeResult.isNow
  };
  
  console.log('🎙️ Parsed result:', result);
  return result;
}