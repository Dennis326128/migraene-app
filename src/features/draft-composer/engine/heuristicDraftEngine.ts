/**
 * HeuristikDraftEngine
 * Parses free text input to extract structured draft data
 * No AI/LLM - pure regex and heuristic matching
 */

import { format, subDays, parse, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import type { 
  DraftResult, 
  DraftEngineResult, 
  MedicationIntake,
  AttackDraft,
  DraftField,
  ConfidenceLevel,
  DraftSectionType 
} from '../types/draft.types';
import { EFFECT_PHRASES, MEDICATION_SYNONYMS } from '../types/draft.types';

interface UserMedication {
  id: string;
  name: string;
  wirkstoff?: string | null;
}

interface ParseContext {
  userMeds: UserMedication[];
  timezone: string;
  now: Date;
}

/**
 * Main entry point - parses text and returns structured draft
 */
export function parseTextToDraft(
  text: string, 
  userMeds: UserMedication[],
  timezone: string = 'Europe/Berlin'
): DraftEngineResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const now = new Date();
  
  const context: ParseContext = { userMeds, timezone, now };
  const lowerText = text.toLowerCase().trim();
  
  // Parse all components
  const attack = parseAttack(lowerText, context);
  const medications = parseMedications(lowerText, context);
  const symptoms = parseSymptoms(lowerText);
  const triggers = parseTriggers(lowerText);
  const notes = parseNotes(text, attack, medications);
  
  // Determine active sections
  const activeSections: DraftSectionType[] = [];
  if (attack) activeSections.push('attack');
  if (medications.length > 0) activeSections.push('medication');
  if (symptoms.value && symptoms.value.length > 0) activeSections.push('symptoms');
  if (triggers.value && triggers.value.length > 0) activeSections.push('triggers');
  if (notes.value) activeSections.push('notes');
  
  // Check for uncertain fields
  const uncertainFields: string[] = [];
  if (attack?.date.confidence === 'low') uncertainFields.push('date');
  if (attack?.time.confidence === 'low') uncertainFields.push('time');
  medications.forEach((med, i) => {
    if (med.time.confidence === 'low') uncertainFields.push(`medication_${i}_time`);
    if (med.medicationName.confidence === 'low') uncertainFields.push(`medication_${i}_name`);
  });
  
  // Check required fields
  const missingRequired: string[] = [];
  if (!attack?.painLevel.value) missingRequired.push('painLevel');
  if (!attack?.date.value) missingRequired.push('date');
  if (!attack?.time.value) missingRequired.push('time');
  
  const draft: DraftResult = {
    originalText: text,
    parsedAt: now.toISOString(),
    attack: attack || undefined,
    medications,
    symptoms,
    triggers,
    notes,
    hasUncertainFields: uncertainFields.length > 0,
    missingRequiredFields: missingRequired,
    activeSections,
  };
  
  return { draft, errors, warnings };
}

/**
 * Parse attack/headache information
 */
function parseAttack(text: string, ctx: ParseContext): AttackDraft | null {
  // Check if there's any indication of headache/migraine
  const hasAttackIndicator = /migräne|kopfschmerz|kopfweh|attacke|anfall|schmerz/i.test(text);
  
  const date = parseDate(text, ctx);
  const time = parseTime(text, ctx);
  const painLevel = parsePainLevel(text);
  const painLocation = parsePainLocation(text);
  const duration = parseDuration(text);
  
  // If we have any attack-related data, create attack draft
  if (hasAttackIndicator || date.value || painLevel.value) {
    return {
      date,
      time,
      painLevel,
      painLocation: painLocation.value ? painLocation : undefined,
      duration: duration.value ? duration : undefined,
    };
  }
  
  return null;
}

/**
 * Parse date from text
 */
function parseDate(text: string, ctx: ParseContext): DraftField<string> {
  const today = format(ctx.now, 'yyyy-MM-dd');
  const yesterday = format(subDays(ctx.now, 1), 'yyyy-MM-dd');
  const dayBeforeYesterday = format(subDays(ctx.now, 2), 'yyyy-MM-dd');
  
  // Relative dates
  if (/\bheute\b/i.test(text)) {
    return { value: today, confidence: 'high', source: 'parsed' };
  }
  if (/\bgestern\b/i.test(text)) {
    return { value: yesterday, confidence: 'high', source: 'parsed' };
  }
  if (/\bvorgestern\b/i.test(text)) {
    return { value: dayBeforeYesterday, confidence: 'high', source: 'parsed' };
  }
  
  // Weekday parsing
  const weekdays = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
  const weekdayMatch = text.match(new RegExp(`\\b(${weekdays.join('|')})\\b`, 'i'));
  if (weekdayMatch) {
    const targetDay = weekdays.indexOf(weekdayMatch[1].toLowerCase());
    const currentDay = ctx.now.getDay();
    let daysAgo = currentDay - targetDay;
    if (daysAgo <= 0) daysAgo += 7; // Assume past week
    const date = format(subDays(ctx.now, daysAgo), 'yyyy-MM-dd');
    return { value: date, confidence: 'medium', source: 'parsed', needsConfirmation: true };
  }
  
  // Explicit date patterns (DD.MM. or DD.MM.YYYY)
  const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? 
      (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : 
      ctx.now.getFullYear();
    
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
    
    if (isValid(parsed)) {
      return { value: dateStr, confidence: 'high', source: 'parsed' };
    }
  }
  
  // Default to today with low confidence
  return { value: today, confidence: 'low', source: 'default', needsConfirmation: true };
}

/**
 * Parse time from text
 */
function parseTime(text: string, ctx: ParseContext): DraftField<string> {
  // Explicit time patterns
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*uhr/i,
    /(\d{1,2}):(\d{2})/,
    /(\d{1,2})\s*uhr/i,
    /um\s*(\d{1,2})/i,
    /gegen\s*(\d{1,2})/i,
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        return { value: time, confidence: 'high', source: 'parsed' };
      }
    }
  }
  
  // Time of day phrases
  const timeOfDayMap: Record<string, string> = {
    'früh': '07:00',
    'morgens': '08:00',
    'vormittag': '10:00',
    'mittag': '12:00',
    'nachmittag': '15:00',
    'abend': '19:00',
    'abends': '19:00',
    'nacht': '22:00',
    'nachts': '23:00',
  };
  
  for (const [phrase, time] of Object.entries(timeOfDayMap)) {
    if (text.includes(phrase)) {
      return { 
        value: time, 
        confidence: 'medium', 
        source: 'parsed',
        originalText: phrase,
        needsConfirmation: true 
      };
    }
  }
  
  // No time found
  return { value: null, confidence: 'low', source: 'default', needsConfirmation: true };
}

/**
 * Parse pain level from text
 */
function parsePainLevel(text: string): DraftField<number> {
  // Explicit numeric pain level
  const numericMatch = text.match(/(?:stärke|stufe|level|schmerzstärke)\s*(\d{1,2})/i);
  if (numericMatch) {
    const level = parseInt(numericMatch[1]);
    if (level >= 1 && level <= 10) {
      return { value: level, confidence: 'high', source: 'parsed' };
    }
  }
  
  // Direct number mention with context
  const numberMatch = text.match(/(\d{1,2})\s*(?:von\s*10|\/\s*10)/i);
  if (numberMatch) {
    const level = parseInt(numberMatch[1]);
    if (level >= 1 && level <= 10) {
      return { value: level, confidence: 'high', source: 'parsed' };
    }
  }
  
  // Descriptive pain levels
  const painPhrases: Array<{ pattern: RegExp; level: number; confidence: ConfidenceLevel }> = [
    { pattern: /sehr\s+stark|unerträglich|extrem|höllisch/i, level: 9, confidence: 'medium' },
    { pattern: /stark|heftig|schlimm/i, level: 7, confidence: 'medium' },
    { pattern: /mittel|mäßig|moderat/i, level: 5, confidence: 'medium' },
    { pattern: /leicht|gering|schwach/i, level: 3, confidence: 'medium' },
  ];
  
  for (const { pattern, level, confidence } of painPhrases) {
    if (pattern.test(text)) {
      return { value: level, confidence, source: 'parsed', needsConfirmation: true };
    }
  }
  
  // Default - no pain level found
  return { value: null, confidence: 'low', source: 'default', needsConfirmation: true };
}

/**
 * Parse pain location
 */
function parsePainLocation(text: string): DraftField<string> {
  const locations: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /links|linke seite/i, value: 'einseitig_links' },
    { pattern: /rechts|rechte seite/i, value: 'einseitig_rechts' },
    { pattern: /beidseitig|beide seiten|überall/i, value: 'beidseitig' },
    { pattern: /stirn/i, value: 'stirn' },
    { pattern: /nacken|hinterkopf/i, value: 'nacken' },
    { pattern: /schläfe/i, value: 'schlaefe' },
  ];
  
  for (const { pattern, value } of locations) {
    if (pattern.test(text)) {
      return { value, confidence: 'high', source: 'parsed' };
    }
  }
  
  return { value: null, confidence: 'low', source: 'default' };
}

/**
 * Parse duration
 */
function parseDuration(text: string): DraftField<string> {
  const durationPatterns: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /ganzen?\s+tag/i, value: 'ganzer Tag' },
    { pattern: /(\d+)\s*stunde/i, value: '$1 Stunden' },
    { pattern: /halben?\s+tag/i, value: 'halber Tag' },
    { pattern: /kurz/i, value: 'kurz' },
    { pattern: /lang/i, value: 'langanhaltend' },
  ];
  
  for (const { pattern, value } of durationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const result = value.replace('$1', match[1] || '');
      return { value: result, confidence: 'medium', source: 'parsed' };
    }
  }
  
  return { value: null, confidence: 'low', source: 'default' };
}

/**
 * Parse medications from text
 */
function parseMedications(text: string, ctx: ParseContext): MedicationIntake[] {
  const medications: MedicationIntake[] = [];
  const lowerText = text.toLowerCase();
  
  // Try to match against user's medications first
  for (const med of ctx.userMeds) {
    const medName = med.name.toLowerCase();
    const wirkstoff = med.wirkstoff?.toLowerCase() || '';
    
    // Check direct name match
    if (lowerText.includes(medName)) {
      const intake = createMedicationIntake(med, text, 'high');
      if (intake) medications.push(intake);
      continue;
    }
    
    // Check wirkstoff match
    if (wirkstoff && lowerText.includes(wirkstoff)) {
      const intake = createMedicationIntake(med, text, 'high');
      if (intake) medications.push(intake);
      continue;
    }
    
    // Check synonyms
    const synonyms = MEDICATION_SYNONYMS[wirkstoff] || MEDICATION_SYNONYMS[medName] || [];
    for (const synonym of synonyms) {
      if (lowerText.includes(synonym.toLowerCase())) {
        const intake = createMedicationIntake(med, text, 'medium');
        if (intake) medications.push(intake);
        break;
      }
    }
  }
  
  // Check for multiplier (e.g., "2x Sumatriptan")
  const multiplierMatch = text.match(/(\d+)\s*(?:x|mal)\s+(\w+)/gi);
  if (multiplierMatch) {
    // This is handled by splitting intakes with different times
  }
  
  return medications;
}

/**
 * Create a medication intake object
 */
function createMedicationIntake(
  med: UserMedication, 
  fullText: string,
  nameConfidence: ConfidenceLevel
): MedicationIntake | null {
  const lowerText = fullText.toLowerCase();
  const medNameLower = med.name.toLowerCase();
  
  // Find time context around this medication mention
  const medIndex = lowerText.indexOf(medNameLower);
  const contextStart = Math.max(0, medIndex - 50);
  const contextEnd = Math.min(lowerText.length, medIndex + med.name.length + 50);
  const context = lowerText.slice(contextStart, contextEnd);
  
  // Parse time from context
  const time = parseTimeFromContext(context);
  
  // Parse effect
  const effect = parseEffectFromContext(context);
  
  return {
    id: crypto.randomUUID(),
    medicationName: { 
      value: med.name, 
      confidence: nameConfidence, 
      source: 'parsed' 
    },
    medicationId: med.id,
    time,
    effect: effect.value ? effect : undefined,
  };
}

/**
 * Parse time from medication context
 */
function parseTimeFromContext(context: string): DraftField<string> {
  // Look for time patterns near medication
  const timePatterns = [
    /um\s*(\d{1,2}):?(\d{2})?\s*(?:uhr)?/i,
    /gegen\s*(\d{1,2}):?(\d{2})?\s*(?:uhr)?/i,
    /(\d{1,2}):(\d{2})/,
  ];
  
  for (const pattern of timePatterns) {
    const match = context.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      if (hour >= 0 && hour <= 23) {
        return {
          value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          confidence: 'high',
          source: 'parsed',
        };
      }
    }
  }
  
  // Time of day
  if (/abend/i.test(context)) {
    return { value: '19:00', confidence: 'low', source: 'parsed', originalText: 'abends', needsConfirmation: true };
  }
  if (/mittag/i.test(context)) {
    return { value: '12:00', confidence: 'low', source: 'parsed', originalText: 'mittags', needsConfirmation: true };
  }
  if (/morgen|früh/i.test(context)) {
    return { value: '08:00', confidence: 'low', source: 'parsed', originalText: 'morgens', needsConfirmation: true };
  }
  
  return { value: null, confidence: 'low', source: 'default', needsConfirmation: true };
}

/**
 * Parse effect from context
 */
function parseEffectFromContext(context: string): DraftField<'none' | 'low' | 'medium' | 'good' | 'excellent'> {
  for (const [phrase, effect] of Object.entries(EFFECT_PHRASES)) {
    if (context.includes(phrase)) {
      return { 
        value: effect, 
        confidence: 'medium', 
        source: 'parsed',
        originalText: phrase,
      };
    }
  }
  
  return { value: null, confidence: 'low', source: 'default' };
}

/**
 * Parse symptoms from text
 */
function parseSymptoms(text: string): DraftField<string[]> {
  const symptomPatterns = [
    'übelkeit', 'erbrechen', 'schwindel', 'lichtempfindlich', 
    'lärmempfindlich', 'aura', 'sehstörung', 'taubheit',
    'kribbeln', 'müdigkeit', 'erschöpfung', 'nackenschmerzen',
    'augenschmerzen', 'tränen', 'verstopfte nase'
  ];
  
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  
  for (const symptom of symptomPatterns) {
    if (lowerText.includes(symptom)) {
      found.push(symptom.charAt(0).toUpperCase() + symptom.slice(1));
    }
  }
  
  if (found.length > 0) {
    return { value: found, confidence: 'high', source: 'parsed' };
  }
  
  return { value: [], confidence: 'low', source: 'default' };
}

/**
 * Parse triggers from text
 */
function parseTriggers(text: string): DraftField<string[]> {
  const triggerPatterns = [
    { pattern: /stress/i, value: 'Stress' },
    { pattern: /schlafmangel|wenig\s+(?:ge)?schlaf/i, value: 'Schlafmangel' },
    { pattern: /wetter|wetterumschlag/i, value: 'Wetter' },
    { pattern: /alkohol|wein|bier/i, value: 'Alkohol' },
    { pattern: /koffein|kaffee/i, value: 'Koffein' },
    { pattern: /hunger|nicht\s+gegessen/i, value: 'Hunger' },
    { pattern: /hormone?|periode|menstruation|zyklus/i, value: 'Hormonell' },
    { pattern: /bildschirm|computer|handy/i, value: 'Bildschirmarbeit' },
    { pattern: /lärm|laut/i, value: 'Lärm' },
    { pattern: /licht|hell|sonne/i, value: 'Licht' },
    { pattern: /geruch|duft|parfum/i, value: 'Geruch' },
  ];
  
  const found: string[] = [];
  
  for (const { pattern, value } of triggerPatterns) {
    if (pattern.test(text)) {
      found.push(value);
    }
  }
  
  if (found.length > 0) {
    return { value: found, confidence: 'high', source: 'parsed' };
  }
  
  return { value: [], confidence: 'low', source: 'default' };
}

/**
 * Extract remaining text as notes
 */
function parseNotes(
  originalText: string, 
  attack: AttackDraft | null,
  medications: MedicationIntake[]
): DraftField<string> {
  // For now, include original text as notes for reference
  // In future, could strip out parsed portions
  
  // Look for "wurde schlimmer", "besser geworden", etc.
  const progressPatterns = [
    /wurde\s+(schlimmer|besser|stärker|schwächer)/gi,
    /(verschlimmert|verbessert)\s+sich/gi,
    /hat\s+(zugenommen|abgenommen)/gi,
  ];
  
  const progressNotes: string[] = [];
  for (const pattern of progressPatterns) {
    const matches = originalText.match(pattern);
    if (matches) {
      progressNotes.push(...matches);
    }
  }
  
  // Combine progress notes with original text reference
  const notesContent = progressNotes.length > 0 
    ? `${progressNotes.join('. ')}.\n\n---\nOriginaltext: "${originalText}"`
    : `Originaltext: "${originalText}"`;
  
  return { 
    value: notesContent, 
    confidence: 'high', 
    source: 'parsed' 
  };
}
