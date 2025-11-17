import { format, addDays, parse, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';

export interface ParsedReminderEntry {
  type: 'medication' | 'appointment' | null;
  title: string;
  medications: string[];
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timeOfDay: 'morning' | 'noon' | 'evening' | 'night' | null;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  notes: string;
  confidence: {
    type: 'high' | 'medium' | 'low';
    time: 'high' | 'medium' | 'low';
    medications: 'high' | 'medium' | 'low';
  };
}

const REMINDER_TRIGGERS = [
  /erinner(e|ung)/i,
  /remind(er)?/i,
  /alarm/i,
  /benachrichtig/i,
  /nicht vergessen/i,
];

const MEDICATION_PATTERNS = [
  /medikament/i,
  /tablette/i,
  /nehmen|einnehmen/i,
  /dosis/i,
];

const APPOINTMENT_PATTERNS = [
  /termin/i,
  /arzt/i,
  /meeting/i,
  /besprechung/i,
  /krankenhaus/i,
  /praxis/i,
  /physiotherapie/i,
  /zahnarzt/i,
];

const TIME_OF_DAY_PATTERNS = {
  morning: { pattern: /morgens?|früh/i, defaultTime: '08:00' },
  noon: { pattern: /mittags?|12:?00/i, defaultTime: '12:00' },
  evening: { pattern: /abends?|18:?00/i, defaultTime: '18:00' },
  night: { pattern: /nachts?|22:?00/i, defaultTime: '22:00' },
};

const RELATIVE_TIME_PATTERNS = [
  { pattern: /heute/i, days: 0 },
  { pattern: /morgen(?!\s*um)/i, days: 1 },
  { pattern: /übermorgen/i, days: 2 },
  { pattern: /in (\d+) tagen?/i, daysFromMatch: true },
  { pattern: /nächste woche/i, days: 7 },
];

const REPEAT_PATTERNS = {
  daily: /täglich|jeden tag|alle tage/i,
  weekly: /wöchentlich|jede woche/i,
  monthly: /monatlich|jeden monat/i,
};

export function isReminderTrigger(text: string): boolean {
  return REMINDER_TRIGGERS.some(pattern => pattern.test(text));
}

function detectReminderType(text: string, medications: string[]): 'medication' | 'appointment' | null {
  const hasMedPattern = MEDICATION_PATTERNS.some(p => p.test(text));
  const hasApptPattern = APPOINTMENT_PATTERNS.some(p => p.test(text));
  const hasMedications = medications.length > 0;
  
  if (hasMedPattern || hasMedications) return 'medication';
  if (hasApptPattern) return 'appointment';
  return null;
}

function extractMedications(text: string, userMeds: Array<{ name: string }>): string[] {
  const medications: string[] = [];
  const lowerText = text.toLowerCase();
  
  // User-Medikamente erkennen
  userMeds.forEach(med => {
    const pattern = new RegExp(`\\b${med.name.toLowerCase()}\\b`, 'i');
    if (pattern.test(lowerText)) {
      medications.push(med.name);
    }
  });
  
  // "und" zwischen Wörtern erkennen und prüfen ob es Medikamente sind
  const andPattern = /(\w+)\s+und\s+(\w+)/gi;
  const matches = text.matchAll(andPattern);
  for (const match of matches) {
    const word1 = match[1];
    const word2 = match[2];
    
    const med1 = userMeds.find(m => m.name.toLowerCase() === word1.toLowerCase());
    const med2 = userMeds.find(m => m.name.toLowerCase() === word2.toLowerCase());
    
    if (med1 && !medications.includes(med1.name)) {
      medications.push(med1.name);
    }
    if (med2 && !medications.includes(med2.name)) {
      medications.push(med2.name);
    }
  }
  
  return medications;
}

function parseTimeForReminder(text: string): {
  date: string;
  time: string;
  timeOfDay: 'morning' | 'noon' | 'evening' | 'night' | null;
  confidence: 'high' | 'medium' | 'low';
} {
  let date = format(new Date(), 'yyyy-MM-dd');
  let time = '08:00';
  let timeOfDay: 'morning' | 'noon' | 'evening' | 'night' | null = null;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // Check for time of day patterns
  for (const [tod, config] of Object.entries(TIME_OF_DAY_PATTERNS)) {
    if (config.pattern.test(text)) {
      timeOfDay = tod as 'morning' | 'noon' | 'evening' | 'night';
      time = config.defaultTime;
      confidence = 'high';
      break;
    }
  }
  
  // Check for explicit time (HH:mm or HH Uhr)
  const timePattern = /(\d{1,2}):?(\d{2})?\s*(?:uhr)?/i;
  const timeMatch = text.match(timePattern);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      confidence = 'high';
      
      // Bestimme timeOfDay basierend auf Uhrzeit
      if (hours >= 5 && hours < 11) timeOfDay = 'morning';
      else if (hours >= 11 && hours < 14) timeOfDay = 'noon';
      else if (hours >= 14 && hours < 21) timeOfDay = 'evening';
      else timeOfDay = 'night';
    }
  }
  
  // Check for relative date patterns
  for (const pattern of RELATIVE_TIME_PATTERNS) {
    const match = text.match(pattern.pattern);
    if (match) {
      let days = pattern.days;
      if (pattern.daysFromMatch && match[1]) {
        days = parseInt(match[1]);
      }
      date = format(addDays(new Date(), days), 'yyyy-MM-dd');
      confidence = 'high';
      break;
    }
  }
  
  return { date, time, timeOfDay, confidence };
}

function detectRepeatPattern(text: string): 'none' | 'daily' | 'weekly' | 'monthly' {
  for (const [repeat, pattern] of Object.entries(REPEAT_PATTERNS)) {
    if (pattern.test(text)) {
      return repeat as 'daily' | 'weekly' | 'monthly';
    }
  }
  return 'none';
}

function generateTitle(
  text: string,
  type: 'medication' | 'appointment' | null,
  medications: string[],
  timeOfDay: string | null
): string {
  if (type === 'medication' && medications.length > 0) {
    return medications.join(', ');
  }
  
  if (type === 'appointment') {
    // Versuche Termin-Titel zu extrahieren
    const appointmentWords = text
      .replace(/erinner(e|ung)|nicht vergessen|an|um|uhr|\d+:\d+/gi, '')
      .trim();
    
    if (appointmentWords.length > 3) {
      return appointmentWords.slice(0, 50);
    }
    return 'Termin';
  }
  
  return 'Erinnerung';
}

function extractNotes(text: string): string {
  // Entferne Trigger-Wörter und extrahiere Rest als Notizen
  let notes = text;
  
  REMINDER_TRIGGERS.forEach(pattern => {
    notes = notes.replace(pattern, '');
  });
  
  return notes.trim();
}

function calculateConfidence(
  text: string,
  type: 'medication' | 'appointment' | null,
  medications: string[],
  timeConfidence: 'high' | 'medium' | 'low'
): {
  type: 'high' | 'medium' | 'low';
  time: 'high' | 'medium' | 'low';
  medications: 'high' | 'medium' | 'low';
} {
  const typeConfidence: 'high' | 'medium' | 'low' = type ? 'high' : 'low';
  const medConfidence: 'high' | 'medium' | 'low' = 
    medications.length > 0 ? 'high' : 
    type === 'medication' ? 'low' : 
    'high'; // For appointments, med confidence is high (not needed)
  
  return {
    type: typeConfidence,
    time: timeConfidence,
    medications: medConfidence,
  };
}

export function parseGermanReminderEntry(
  text: string,
  userMeds: Array<{ name: string }> = []
): ParsedReminderEntry {
  console.log('🔍 Parsing Reminder:', text);
  
  const medications = extractMedications(text, userMeds);
  const type = detectReminderType(text, medications);
  const { date, time, timeOfDay, confidence: timeConfidence } = parseTimeForReminder(text);
  const repeat = detectRepeatPattern(text);
  const title = generateTitle(text, type, medications, timeOfDay);
  const notes = extractNotes(text);
  const confidence = calculateConfidence(text, type, medications, timeConfidence);
  
  const result = {
    type,
    title,
    medications,
    date,
    time,
    timeOfDay,
    repeat,
    notes,
    confidence,
  };
  
  console.log('📊 Parsed Reminder Result:', result);
  
  return result;
}
