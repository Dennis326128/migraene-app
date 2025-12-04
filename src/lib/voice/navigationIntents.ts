/**
 * Navigation Intent Parser
 * Erkennt Navigations-Befehle aus Spracheingaben
 */

import { format, addDays, addMonths, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';

// ============================================
// Types
// ============================================

export type NavigationIntentType =
  | 'navigate_reminder_create'
  | 'navigate_appointment_create'
  | 'navigate_profile_edit'
  | 'navigate_doctor_edit'
  | 'navigate_diary'
  | 'navigate_analysis'
  | 'navigate_report'
  | 'navigate_medications'
  | 'navigate_settings'
  | 'help';

export interface ParsedReminder {
  title: string;
  date: string;
  time: string;
  timeOfDay?: 'morning' | 'noon' | 'evening' | 'night';
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  medications?: string[];
  notes?: string;
  isAppointment?: boolean;
}

export interface ParsedAppointment {
  title: string;
  doctorName?: string;
  specialty?: string;
  date: string;
  time: string;
  reason?: string;
}

export interface DiaryFilter {
  startDate?: string;
  endDate?: string;
  period?: 'week' | 'month' | 'custom';
}

export interface AnalysisOptions {
  startDate?: string;
  endDate?: string;
  period?: 'week' | 'month' | '3months' | 'year';
}

export interface ReportOptions {
  startDate?: string;
  endDate?: string;
  period?: 'month' | '3months' | 'year';
}

export type NavigationIntent =
  | { type: 'navigate_reminder_create'; payload: ParsedReminder }
  | { type: 'navigate_appointment_create'; payload: ParsedAppointment }
  | { type: 'navigate_profile_edit'; payload?: undefined }
  | { type: 'navigate_doctor_edit'; payload?: undefined }
  | { type: 'navigate_diary'; payload?: DiaryFilter }
  | { type: 'navigate_analysis'; payload?: AnalysisOptions }
  | { type: 'navigate_report'; payload?: ReportOptions }
  | { type: 'navigate_medications'; payload?: undefined }
  | { type: 'navigate_settings'; payload?: undefined }
  | { type: 'help'; payload?: undefined }
  | null;

// ============================================
// Patterns
// ============================================

const REMINDER_PATTERNS = [
  /erinner(e|ung)?\s*(mich|uns)?\s*(an|um|bitte)?/i,
  /nicht\s+vergessen/i,
  /benachrichtig/i,
  /alarm\s+(stellen|setzen|für)/i,
];

const APPOINTMENT_PATTERNS = [
  /arzttermin/i,
  /termin\s*(bei|mit|beim)?\s*(dr\.?|doktor|arzt|neurologe|hausarzt)?/i,
  /neuen?\s+termin/i,
  /termin\s+(anlegen|eintragen|erstellen)/i,
];

const PROFILE_PATTERNS = [
  /persönliche\s+daten/i,
  /meine\s+daten/i,
  /profil\s*(bearbeiten|ändern|aktualisieren)?/i,
  /adresse\s*(ändern|bearbeiten)?/i,
  /kontaktdaten/i,
];

const DOCTOR_PATTERNS = [
  /arzt\s*(daten|info|informationen)/i,
  /meine\s*(ärzte?|arzt)/i,
  /(neurologe|hausarzt)\s*(hinzufügen|eintragen)/i,
  /arzt\s*(hinzufügen|eintragen|bearbeiten)/i,
];

const DIARY_PATTERNS = [
  /tagebuch/i,
  /kopfschmerz\s*tagebuch/i,
  /migräne\s*tagebuch/i,
  /einträge\s*(zeigen|anzeigen|sehen)/i,
  /zeig\s*(mir)?\s*(meine?)?\s*einträge/i,
  /letzte(n)?\s+(einträge|tage|woche)/i,
];

const ANALYSIS_PATTERNS = [
  /auswertung/i,
  /analyse/i,
  /statistik/i,
  /muster/i,
  /trend/i,
  /übersicht/i,
];

const REPORT_PATTERNS = [
  /arztbericht/i,
  /bericht\s*(erstellen|generieren|machen)?/i,
  /pdf/i,
  /für\s*(den|das)?\s*arzt/i,
  /arztgespräch/i,
];

const MEDICATIONS_PATTERNS = [
  /medikamente\s*(anzeigen|zeigen|übersicht)?/i,
  /meine\s+medikamente/i,
  /medikamentenliste/i,
];

const SETTINGS_PATTERNS = [
  /einstellungen/i,
  /settings/i,
  /konfiguration/i,
];

const HELP_PATTERNS = [
  /hilfe/i,
  /help/i,
  /was\s+kann\s+ich\s+(hier\s+)?sagen/i,
  /welche\s+(sprach)?befehle/i,
  /wie\s+funktioniert/i,
  /beispiele?/i,
];

// Time of day patterns
const TIME_OF_DAY = {
  morning: { pattern: /morgens?|früh|vormittags?/i, defaultTime: '08:00' },
  noon: { pattern: /mittags?/i, defaultTime: '12:00' },
  evening: { pattern: /abends?|nachmittags?/i, defaultTime: '18:00' },
  night: { pattern: /nachts?|spät/i, defaultTime: '22:00' },
};

// Repeat patterns
const REPEAT_PATTERNS = {
  daily: /täglich|jeden\s+tag|alle\s+tage/i,
  weekly: /wöchentlich|jede\s+woche|alle\s+(vier|4)\s+wochen/i,
  monthly: /monatlich|jeden\s+monat/i,
};

// Period patterns for diary/analysis
const PERIOD_PATTERNS = {
  week: /letzte(n)?\s+(7|sieben)\s+tage|diese\s+woche|letzte\s+woche/i,
  month: /letzte(r|n)?\s+monat|diese(r|n)?\s+monat|letzten\s+30\s+tage/i,
  '3months': /letzte(n)?\s+(drei|3)\s+monate|letzten\s+90\s+tage/i,
  year: /letzte(s|n)?\s+jahr|letzten\s+12\s+monate/i,
};

// ============================================
// Main Detection Function
// ============================================

export function detectNavigationIntent(
  transcript: string,
  userMeds: Array<{ name: string }> = []
): NavigationIntent {
  const lower = transcript.toLowerCase();
  
  console.log('🧭 Navigation Intent Detection:', transcript.substring(0, 80));

  // 1. Help (höchste Priorität für explizite Hilfe-Anfragen)
  if (HELP_PATTERNS.some(p => p.test(lower))) {
    console.log('✅ Intent: help');
    return { type: 'help' };
  }

  // 2. Arzttermin (spezifischer als Erinnerung)
  if (APPOINTMENT_PATTERNS.some(p => p.test(lower))) {
    const payload = parseAppointmentIntent(transcript);
    console.log('✅ Intent: navigate_appointment_create', payload);
    return { type: 'navigate_appointment_create', payload };
  }

  // 3. Erinnerung
  if (REMINDER_PATTERNS.some(p => p.test(lower))) {
    const payload = parseReminderIntent(transcript, userMeds);
    console.log('✅ Intent: navigate_reminder_create', payload);
    return { type: 'navigate_reminder_create', payload };
  }

  // 4. Arztbericht/PDF
  if (REPORT_PATTERNS.some(p => p.test(lower))) {
    const payload = parseReportOptions(transcript);
    console.log('✅ Intent: navigate_report', payload);
    return { type: 'navigate_report', payload };
  }

  // 5. Tagebuch
  if (DIARY_PATTERNS.some(p => p.test(lower))) {
    const payload = parseDiaryFilter(transcript);
    console.log('✅ Intent: navigate_diary', payload);
    return { type: 'navigate_diary', payload };
  }

  // 6. Auswertung/Analyse
  if (ANALYSIS_PATTERNS.some(p => p.test(lower))) {
    const payload = parseAnalysisOptions(transcript);
    console.log('✅ Intent: navigate_analysis', payload);
    return { type: 'navigate_analysis', payload };
  }

  // 7. Profil
  if (PROFILE_PATTERNS.some(p => p.test(lower))) {
    console.log('✅ Intent: navigate_profile_edit');
    return { type: 'navigate_profile_edit' };
  }

  // 8. Arztdaten
  if (DOCTOR_PATTERNS.some(p => p.test(lower))) {
    console.log('✅ Intent: navigate_doctor_edit');
    return { type: 'navigate_doctor_edit' };
  }

  // 9. Medikamente
  if (MEDICATIONS_PATTERNS.some(p => p.test(lower))) {
    console.log('✅ Intent: navigate_medications');
    return { type: 'navigate_medications' };
  }

  // 10. Einstellungen
  if (SETTINGS_PATTERNS.some(p => p.test(lower))) {
    console.log('✅ Intent: navigate_settings');
    return { type: 'navigate_settings' };
  }

  console.log('❌ No navigation intent detected');
  return null;
}

// ============================================
// Parser Functions
// ============================================

function parseReminderIntent(
  transcript: string,
  userMeds: Array<{ name: string }>
): ParsedReminder {
  const lower = transcript.toLowerCase();
  
  // Extract date
  const date = extractDate(transcript);
  
  // Extract time
  const { time, timeOfDay } = extractTime(transcript);
  
  // Extract repeat
  let repeat: 'none' | 'daily' | 'weekly' | 'monthly' = 'none';
  for (const [key, pattern] of Object.entries(REPEAT_PATTERNS)) {
    if (pattern.test(lower)) {
      repeat = key as 'daily' | 'weekly' | 'monthly';
      break;
    }
  }
  
  // Extract medications
  const medications = userMeds
    .filter(med => lower.includes(med.name.toLowerCase()))
    .map(med => med.name);
  
  // Generate title
  let title = 'Erinnerung';
  if (medications.length > 0) {
    title = medications.join(', ');
  } else {
    // Try to extract subject
    const subjectMatch = transcript.match(/(?:an|für|wegen)\s+(?:mein(?:e|en)?\s+)?(.+?)(?:\s+(?:um|am|morgen|heute|täglich)|$)/i);
    if (subjectMatch && subjectMatch[1]) {
      title = subjectMatch[1].trim();
      // Capitalize
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
  }
  
  return {
    title: title.substring(0, 100),
    date,
    time,
    timeOfDay,
    repeat,
    medications: medications.length > 0 ? medications : undefined,
    notes: transcript
  };
}

function parseAppointmentIntent(transcript: string): ParsedAppointment {
  const lower = transcript.toLowerCase();
  
  // Extract date
  const date = extractDate(transcript);
  
  // Extract time
  const { time } = extractTime(transcript);
  
  // Extract doctor name
  let doctorName: string | undefined;
  const doctorMatch = transcript.match(/(?:bei|mit|beim)\s+(dr\.?\s*\w+|\w+\s+\w+)/i);
  if (doctorMatch) {
    doctorName = doctorMatch[1].trim();
  }
  
  // Extract specialty
  let specialty: string | undefined;
  const specialtyPatterns = [
    { pattern: /neurologe|neurologie/i, value: 'Neurologie' },
    { pattern: /hausarzt|allgemein/i, value: 'Hausarzt' },
    { pattern: /zahnarzt|dental/i, value: 'Zahnarzt' },
    { pattern: /augenarzt|ophthalmolog/i, value: 'Augenarzt' },
    { pattern: /orthopäde|orthopädie/i, value: 'Orthopädie' },
  ];
  for (const { pattern, value } of specialtyPatterns) {
    if (pattern.test(lower)) {
      specialty = value;
      break;
    }
  }
  
  // Extract reason
  let reason: string | undefined;
  const reasonMatch = transcript.match(/(?:wegen|für|zur)\s+(.+?)(?:\s+(?:um|am|bei)|$)/i);
  if (reasonMatch) {
    reason = reasonMatch[1].trim();
  }
  
  // Generate title
  let title = 'Arzttermin';
  if (doctorName) {
    title = `Termin ${doctorName}`;
  } else if (specialty) {
    title = `Termin ${specialty}`;
  }
  
  return {
    title: title.substring(0, 100),
    doctorName,
    specialty,
    date,
    time,
    reason
  };
}

function parseDiaryFilter(transcript: string): DiaryFilter | undefined {
  const lower = transcript.toLowerCase();
  
  // Check for period patterns
  for (const [period, pattern] of Object.entries(PERIOD_PATTERNS)) {
    if (pattern.test(lower)) {
      const now = new Date();
      let startDate: string;
      let endDate = format(now, 'yyyy-MM-dd');
      
      switch (period) {
        case 'week':
          startDate = format(subDays(now, 7), 'yyyy-MM-dd');
          break;
        case 'month':
          startDate = format(subMonths(now, 1), 'yyyy-MM-dd');
          break;
        case '3months':
          startDate = format(subMonths(now, 3), 'yyyy-MM-dd');
          break;
        case 'year':
          startDate = format(subMonths(now, 12), 'yyyy-MM-dd');
          break;
        default:
          startDate = format(subDays(now, 7), 'yyyy-MM-dd');
      }
      
      return {
        startDate,
        endDate,
        period: period === '3months' ? 'custom' : period as 'week' | 'month'
      };
    }
  }
  
  // Check for specific month
  const monthMatch = lower.match(/(?:von|im|für)\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/i);
  if (monthMatch) {
    const monthNames: Record<string, number> = {
      januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
      juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11
    };
    const monthIndex = monthNames[monthMatch[1].toLowerCase()];
    if (monthIndex !== undefined) {
      const year = new Date().getFullYear();
      const monthDate = new Date(year, monthIndex, 1);
      return {
        startDate: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(monthDate), 'yyyy-MM-dd'),
        period: 'month'
      };
    }
  }
  
  return undefined;
}

function parseAnalysisOptions(transcript: string): AnalysisOptions | undefined {
  // Same logic as diary filter
  return parseDiaryFilter(transcript) as AnalysisOptions | undefined;
}

function parseReportOptions(transcript: string): ReportOptions | undefined {
  const filter = parseDiaryFilter(transcript);
  if (filter) {
    return {
      startDate: filter.startDate,
      endDate: filter.endDate,
      period: filter.period === 'week' ? 'month' : (filter.period as 'month' | '3months')
    };
  }
  // Default to last month for reports
  const now = new Date();
  return {
    startDate: format(subMonths(now, 1), 'yyyy-MM-dd'),
    endDate: format(now, 'yyyy-MM-dd'),
    period: 'month'
  };
}

// ============================================
// Helper Functions
// ============================================

function extractDate(transcript: string): string {
  const lower = transcript.toLowerCase();
  const now = new Date();
  
  // Today
  if (/heute/i.test(lower)) {
    return format(now, 'yyyy-MM-dd');
  }
  
  // Tomorrow
  if (/morgen(?!\s*um)/i.test(lower)) {
    return format(addDays(now, 1), 'yyyy-MM-dd');
  }
  
  // Day after tomorrow
  if (/übermorgen/i.test(lower)) {
    return format(addDays(now, 2), 'yyyy-MM-dd');
  }
  
  // In X days
  const inDaysMatch = lower.match(/in\s+(\d+)\s+tagen?/i);
  if (inDaysMatch) {
    return format(addDays(now, parseInt(inDaysMatch[1])), 'yyyy-MM-dd');
  }
  
  // Next week
  if (/nächste\s+woche/i.test(lower)) {
    return format(addDays(now, 7), 'yyyy-MM-dd');
  }
  
  // Weekday names
  const weekdayPatterns: Array<{ pattern: RegExp; offset: number }> = [
    { pattern: /montag/i, offset: 1 },
    { pattern: /dienstag/i, offset: 2 },
    { pattern: /mittwoch/i, offset: 3 },
    { pattern: /donnerstag/i, offset: 4 },
    { pattern: /freitag/i, offset: 5 },
    { pattern: /samstag/i, offset: 6 },
    { pattern: /sonntag/i, offset: 0 },
  ];
  
  for (const { pattern, offset } of weekdayPatterns) {
    if (pattern.test(lower)) {
      const currentDay = now.getDay();
      let daysToAdd = offset - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
      return format(addDays(now, daysToAdd), 'yyyy-MM-dd');
    }
  }
  
  // Specific date (e.g., "am 15. März", "15.3.", "15. März")
  const dateMatch = transcript.match(/(\d{1,2})\.?\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|jun|jul|aug|sep|okt|nov|dez|\d{1,2})?\.?/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    if (day >= 1 && day <= 31) {
      let month = now.getMonth();
      let year = now.getFullYear();
      
      if (dateMatch[2]) {
        const monthNames: Record<string, number> = {
          januar: 0, jan: 0, februar: 1, feb: 1, märz: 2, mär: 2, 
          april: 3, apr: 3, mai: 4, juni: 5, jun: 5, juli: 6, jul: 6,
          august: 7, aug: 7, september: 8, sep: 8, oktober: 9, okt: 9,
          november: 10, nov: 10, dezember: 11, dez: 11
        };
        const parsedMonth = monthNames[dateMatch[2].toLowerCase()];
        if (parsedMonth !== undefined) {
          month = parsedMonth;
        } else {
          // Numeric month
          const numMonth = parseInt(dateMatch[2]);
          if (numMonth >= 1 && numMonth <= 12) {
            month = numMonth - 1;
          }
        }
      }
      
      const resultDate = new Date(year, month, day);
      if (resultDate < now) {
        // If date is in the past, assume next year
        resultDate.setFullYear(year + 1);
      }
      return format(resultDate, 'yyyy-MM-dd');
    }
  }
  
  // Default: today
  return format(now, 'yyyy-MM-dd');
}

function extractTime(transcript: string): { time: string; timeOfDay?: 'morning' | 'noon' | 'evening' | 'night' } {
  const lower = transcript.toLowerCase();
  
  // Explicit time (e.g., "um 8 Uhr", "8:30", "14:00")
  const timeMatch = transcript.match(/(\d{1,2})[:\s]?(\d{2})?\s*(?:uhr)?/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      // Determine timeOfDay from hours
      let timeOfDay: 'morning' | 'noon' | 'evening' | 'night' | undefined;
      if (hours >= 5 && hours < 11) timeOfDay = 'morning';
      else if (hours >= 11 && hours < 14) timeOfDay = 'noon';
      else if (hours >= 14 && hours < 21) timeOfDay = 'evening';
      else timeOfDay = 'night';
      
      return { time, timeOfDay };
    }
  }
  
  // Time of day patterns
  for (const [tod, config] of Object.entries(TIME_OF_DAY)) {
    if (config.pattern.test(lower)) {
      return { 
        time: config.defaultTime, 
        timeOfDay: tod as 'morning' | 'noon' | 'evening' | 'night' 
      };
    }
  }
  
  // Default
  return { time: '09:00' };
}

// ============================================
// Help Content
// ============================================

export const VOICE_HELP_EXAMPLES = [
  {
    category: 'Eintrag erfassen',
    examples: [
      'Migräne Stärke 7, habe Sumatriptan genommen',
      'Kopfschmerzen seit heute Morgen',
      'Leichte Kopfschmerzen, keine Medikamente',
    ]
  },
  {
    category: 'Erinnerungen',
    examples: [
      'Erinnere mich morgen um 8 Uhr an Sumatriptan',
      'Tägliche Erinnerung für meine Tabletten',
    ]
  },
  {
    category: 'Termine',
    examples: [
      'Arzttermin am Montag um 10 Uhr beim Neurologen',
      'Neuen Termin für nächste Woche anlegen',
    ]
  },
  {
    category: 'Anzeigen',
    examples: [
      'Zeig mir mein Tagebuch der letzten Woche',
      'Auswertung vom letzten Monat',
      'Arztbericht erstellen',
    ]
  },
  {
    category: 'Navigation',
    examples: [
      'Meine Medikamente anzeigen',
      'Persönliche Daten bearbeiten',
      'Einstellungen öffnen',
    ]
  },
];
