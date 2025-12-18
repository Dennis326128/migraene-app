/**
 * Action Skills (Phase 3)
 * 
 * Skills für Mutations-Aktionen (mittleres bis hohes Risiko)
 * - create_reminder: Erinnerung erstellen
 * - save_voice_note: Notiz speichern
 * - rate_intake: Medikamentenwirkung bewerten
 * - quick_pain_entry: Schneller Schmerzeintrag
 */

import type { Skill, SkillMatchResult, VoiceUserContext } from '../types';
import type { MutationPlan, SlotFillingPlan, ReminderPayload, VoiceNotePayload, RatingPayload } from '../../types';
import { 
  canonicalizeText, 
  extractTimeRange,
  extractRating,
  OPERATORS,
  OBJECTS,
} from '../../lexicon/de';
import { calculateExampleScore, combineScores } from '../types';

// ============================================
// Helper: Parse Time Expression
// ============================================

function parseTimeExpression(text: string): { dateTime: string; repeat: 'none' | 'daily' | 'weekly' } | null {
  const now = new Date();
  const lower = text.toLowerCase();
  
  // Check for repeat patterns
  let repeat: 'none' | 'daily' | 'weekly' = 'none';
  if (/\b(täglich|jeden\s*tag|immer)\b/.test(lower)) {
    repeat = 'daily';
  } else if (/\b(wöchentlich|jede\s*woche)\b/.test(lower)) {
    repeat = 'weekly';
  }
  
  // Time patterns
  const timeMatch = lower.match(/\b(\d{1,2}):?(\d{2})?\s*(uhr)?\b/);
  let hour = 8; // Default to 8:00
  let minute = 0;
  
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  } else if (/\b(morgens?|früh)\b/.test(lower)) {
    hour = 8;
  } else if (/\b(mittags?)\b/.test(lower)) {
    hour = 12;
  } else if (/\b(abends?|nachmittags?)\b/.test(lower)) {
    hour = 18;
  } else if (/\b(nachts?|spät)\b/.test(lower)) {
    hour = 22;
  }
  
  // Date patterns
  let targetDate = new Date(now);
  
  if (/\b(morgen)\b/.test(lower)) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/\bin\s*(\d+)\s*(stunde|stunden|h)\b/.test(lower)) {
    const hoursMatch = lower.match(/\bin\s*(\d+)\s*(stunde|stunden|h)\b/);
    if (hoursMatch) {
      targetDate = new Date(now.getTime() + parseInt(hoursMatch[1], 10) * 60 * 60 * 1000);
      return { dateTime: targetDate.toISOString(), repeat };
    }
  } else if (/\bin\s*(\d+)\s*(minute|minuten|min)\b/.test(lower)) {
    const minMatch = lower.match(/\bin\s*(\d+)\s*(minute|minuten|min)\b/);
    if (minMatch) {
      targetDate = new Date(now.getTime() + parseInt(minMatch[1], 10) * 60 * 1000);
      return { dateTime: targetDate.toISOString(), repeat };
    }
  }
  
  // Set time on date
  targetDate.setHours(hour, minute, 0, 0);
  
  // If time is in the past today, assume tomorrow
  if (targetDate <= now && repeat === 'none') {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  
  return { dateTime: targetDate.toISOString(), repeat };
}

// ============================================
// Helper: Extract Medication from Transcript
// ============================================

function extractMedicationFromTranscript(
  text: string, 
  userMeds: Array<{ name: string }>
): { medication: string; confidence: number } | null {
  const lower = text.toLowerCase();
  
  // Check user's actual medications first
  for (const med of userMeds) {
    const medLower = med.name.toLowerCase();
    const medNormalized = medLower.replace(/\d+\s*(mg|ml)/gi, '').trim();
    
    if (lower.includes(medLower) || lower.includes(medNormalized)) {
      return { medication: med.name, confidence: 0.95 };
    }
  }
  
  // Check for category keywords
  const categories = [
    { keywords: ['triptan', 'triptane', 'sumatriptan', 'rizatriptan'], value: 'triptan' },
    { keywords: ['schmerzmittel', 'ibuprofen', 'paracetamol', 'aspirin'], value: 'schmerzmittel' },
  ];
  
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw)) {
        return { medication: kw, confidence: 0.8 };
      }
    }
  }
  
  return null;
}

// ============================================
// Skill: Create Reminder
// ============================================

export const createReminderSkill: Skill = {
  id: 'create_reminder',
  name: 'Erinnerung erstellen',
  category: 'ACTION',
  examples: [
    'erinnere mich an triptan um 14 uhr',
    'erinnerung für medikament morgen früh',
    'erinner mich in 2 stunden an tablette',
    'setze erinnerung für 18 uhr',
    'erinnere mich täglich an prophylaxe',
    'wecker stellen für medikament',
    'reminder morgen 8 uhr triptan',
  ],
  keywords: ['erinner', 'erinnerung', 'reminder', 'wecker', 'alarm', 'uhr', 'morgen'],
  requiredSlots: [
    { name: 'title', type: 'string', required: true, description: 'Woran erinnern?' },
  ],
  optionalSlots: [
    { name: 'dateTime', type: 'time', required: false, description: 'Wann?' },
    { name: 'medications', type: 'medication', required: false },
    { name: 'repeat', type: 'string', required: false },
  ],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasReminderKeyword = OPERATORS.CREATE.some(w => text.includes(w)) ||
                               /\b(erinner|erinnerung|reminder|wecker|alarm)\w*\b/.test(text);
    const hasTimeKeyword = /\b(\d{1,2}:\d{2}|\d{1,2}\s*uhr|morgen|abend|mittag|stunde|minute)\b/.test(text);
    
    if (hasReminderKeyword) reasons.push('has_reminder_keyword');
    if (hasTimeKeyword) reasons.push('has_time_keyword');
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    if (medExtract) reasons.push(`medication_found:${medExtract.medication}`);
    
    // Parse time
    const timeResult = parseTimeExpression(text);
    if (timeResult) reasons.push('time_parsed');
    
    let confidence = 0;
    
    if (hasReminderKeyword && hasTimeKeyword) {
      confidence = 0.9;
    } else if (hasReminderKeyword) {
      confidence = 0.75;
    } else if (hasTimeKeyword && medExtract) {
      confidence = 0.6;
    }
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: {
        title: medExtract ? `${medExtract.medication} nehmen` : 'Erinnerung',
        dateTime: timeResult?.dateTime,
        repeat: timeResult?.repeat,
        medications: medExtract ? [medExtract.medication] : undefined,
      },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): MutationPlan | SlotFillingPlan {
    const title = slots.title as string || 'Erinnerung';
    const dateTime = slots.dateTime as string;
    const medications = slots.medications as string[] | undefined;
    const repeat = (slots.repeat as 'none' | 'daily' | 'weekly') || 'none';
    
    // If no time, ask for it
    if (!dateTime) {
      return {
        kind: 'slot_filling',
        missingSlot: 'dateTime',
        prompt: 'Wann soll ich dich erinnern?',
        suggestions: [
          { label: 'In 1 Stunde', value: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
          { label: 'In 2 Stunden', value: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
          { label: 'Morgen früh (8 Uhr)', value: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); })() },
        ],
        partial: {
          targetSkillId: 'create_reminder',
          collectedSlots: slots,
        },
        summary: 'Erinnerung erstellen',
        confidence,
      };
    }
    
    const payload: ReminderPayload = {
      title,
      dateTime,
      medications,
      repeat,
    };
    
    const formattedTime = new Date(dateTime).toLocaleString('de-DE', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    return {
      kind: 'mutation',
      mutationType: 'create_reminder',
      payload,
      risk: 'low',
      summary: `Erinnerung: "${title}" um ${formattedTime}`,
      confidence,
    };
  },
};

// ============================================
// Skill: Save Voice Note
// ============================================

export const saveVoiceNoteSkill: Skill = {
  id: 'save_voice_note',
  name: 'Notiz speichern',
  category: 'ACTION',
  examples: [
    'speichere das als notiz',
    'notiere das',
    'merk dir das',
    'als notiz speichern',
    'speichere',
    'notiz: kopfschmerzen nach kaffee',
    'merke: stress bei der arbeit',
    'notiz speichern',
  ],
  keywords: ['speicher', 'notiz', 'notiere', 'merk', 'aufschreiben'],
  requiredSlots: [
    { name: 'text', type: 'string', required: true, description: 'Was notieren?' },
  ],
  optionalSlots: [],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasSaveKeyword = OPERATORS.CREATE.some(w => text.includes(w)) ||
                           /\b(notiz|notiere|merk|aufschreiben)\w*\b/.test(text);
    const hasNoteKeyword = OBJECTS.NOTES.some(w => text.includes(w));
    
    if (hasSaveKeyword) reasons.push('has_save_keyword');
    if (hasNoteKeyword) reasons.push('has_note_keyword');
    
    let confidence = 0;
    
    // Strong signal: explicit "speichere als notiz" pattern
    if (/\b(als\s+notiz|notiz\s*:)\b/.test(text)) {
      confidence = 0.95;
      reasons.push('explicit_note_pattern');
    } else if (hasSaveKeyword && hasNoteKeyword) {
      confidence = 0.85;
    } else if (hasSaveKeyword) {
      confidence = 0.7;
    } else if (hasNoteKeyword) {
      confidence = 0.5;
    }
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    // Extract the actual note text (remove command words)
    let noteText = transcript
      .replace(/\b(speicher|notiz|notiere|merk|als notiz|aufschreiben)\w*\s*:?\s*/gi, '')
      .trim();
    
    // If nothing left, use original transcript
    if (noteText.length < 3) {
      noteText = transcript;
    }
    
    return {
      confidence,
      slots: { text: noteText },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): MutationPlan {
    const text = slots.text as string;
    
    const payload: VoiceNotePayload = {
      text,
      occurredAt: new Date().toISOString(),
    };
    
    const preview = text.length > 40 ? text.substring(0, 40) + '...' : text;
    
    return {
      kind: 'mutation',
      mutationType: 'save_voice_note',
      payload,
      risk: 'low',
      summary: `Notiz: "${preview}"`,
      confidence,
      undo: {
        kind: 'toast_undo',
        windowMs: 8000,
        undoPlan: {
          kind: 'mutation',
          mutationType: 'delete_voice_note',
          payload: { targetId: '', targetType: 'note' },
          risk: 'low',
          summary: 'Notiz rückgängig machen',
          confidence: 1,
        },
      },
    };
  },
};

// ============================================
// Skill: Rate Medication Intake
// ============================================

export const rateIntakeSkill: Skill = {
  id: 'rate_intake',
  name: 'Medikamentenwirkung bewerten',
  category: 'ACTION',
  examples: [
    'bewerte die wirkung von triptan',
    'triptan wirkung bewerten',
    'wie gut hat das triptan gewirkt',
    'wirkung bewerten',
    'bewertung abgeben für sumatriptan',
    'das triptan hat gut geholfen',
    'das hat nicht gewirkt',
    'medikament wirkung eintragen',
  ],
  keywords: ['bewert', 'wirkung', 'gewirkt', 'geholfen', 'rating'],
  requiredSlots: [
    { name: 'medName', type: 'medication', required: true, description: 'Welches Medikament?' },
    { name: 'rating', type: 'number', required: true, description: 'Wie gut? (0-10)' },
  ],
  optionalSlots: [
    { name: 'entryId', type: 'number', required: false },
    { name: 'notes', type: 'string', required: false },
  ],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasRateKeyword = OPERATORS.RATE.some(w => text.includes(w)) ||
                           /\b(bewert|wirkung|gewirkt|geholfen|rating)\w*\b/.test(text);
    const hasEffectKeyword = /\b(wirkung|effekt|geholfen|gewirkt|hilft)\b/.test(text);
    
    if (hasRateKeyword) reasons.push('has_rate_keyword');
    if (hasEffectKeyword) reasons.push('has_effect_keyword');
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    if (medExtract) reasons.push(`medication_found:${medExtract.medication}`);
    
    // Extract rating from text
    const ratingValue = extractRating(text);
    if (ratingValue !== null) reasons.push(`rating_found:${ratingValue}`);
    
    // Implicit ratings from phrases
    let implicitRating: number | null = null;
    if (/\b(sehr gut|super|toll|perfekt)\b/.test(text)) {
      implicitRating = 9;
      reasons.push('implicit_rating:very_good');
    } else if (/\b(gut|geholfen|gewirkt)\b/.test(text)) {
      implicitRating = 7;
      reasons.push('implicit_rating:good');
    } else if (/\b(etwas|bisschen|wenig)\b/.test(text)) {
      implicitRating = 4;
      reasons.push('implicit_rating:somewhat');
    } else if (/\b(nicht|gar nicht|überhaupt nicht)\b.*\b(gewirkt|geholfen)\b/.test(text)) {
      implicitRating = 1;
      reasons.push('implicit_rating:not_at_all');
    }
    
    let confidence = 0;
    
    if (hasRateKeyword && medExtract) {
      confidence = 0.9;
    } else if (hasEffectKeyword && medExtract) {
      confidence = 0.8;
    } else if (hasRateKeyword) {
      confidence = 0.6;
    }
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    const finalRating = ratingValue ?? implicitRating;
    
    return {
      confidence,
      slots: {
        medName: medExtract?.medication,
        rating: finalRating,
      },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): MutationPlan | SlotFillingPlan {
    const medName = slots.medName as string | undefined;
    const rating = slots.rating as number | undefined;
    
    // If no medication, ask for it
    if (!medName) {
      const medSuggestions = (context.userMeds || []).slice(0, 4).map(med => ({
        label: med.name,
        value: med.name,
      }));
      
      return {
        kind: 'slot_filling',
        missingSlot: 'medName',
        prompt: 'Welches Medikament möchtest du bewerten?',
        suggestions: medSuggestions.length > 0 ? medSuggestions : [
          { label: 'Triptan', value: 'triptan' },
          { label: 'Schmerzmittel', value: 'schmerzmittel' },
        ],
        partial: {
          targetSkillId: 'rate_intake',
          collectedSlots: slots,
        },
        summary: 'Medikament bewerten',
        confidence,
      };
    }
    
    // If no rating, ask for it
    if (rating === undefined) {
      return {
        kind: 'slot_filling',
        missingSlot: 'rating',
        prompt: `Wie gut hat ${medName} gewirkt?`,
        suggestions: [
          { label: 'Sehr gut (9)', value: '9' },
          { label: 'Gut (7)', value: '7' },
          { label: 'Etwas (4)', value: '4' },
          { label: 'Gar nicht (1)', value: '1' },
        ],
        partial: {
          targetSkillId: 'rate_intake',
          collectedSlots: slots,
        },
        summary: `${medName} bewerten`,
        confidence,
      };
    }
    
    const payload: RatingPayload = {
      entryId: (slots.entryId as number) || -1, // -1 = latest entry with this med
      medName,
      rating,
      notes: slots.notes as string | undefined,
    };
    
    const ratingLabel = rating >= 8 ? 'sehr gut' : rating >= 5 ? 'gut' : rating >= 3 ? 'mäßig' : 'schlecht';
    
    return {
      kind: 'mutation',
      mutationType: 'rate_intake',
      payload,
      risk: 'medium',
      summary: `${medName} als "${ratingLabel}" (${rating}/10) bewerten`,
      confidence,
    };
  },
};

// ============================================
// Skill: Quick Pain Entry
// ============================================

export const quickPainEntrySkill: Skill = {
  id: 'quick_pain_entry',
  name: 'Schneller Schmerzeintrag',
  category: 'ACTION',
  examples: [
    'kopfschmerzen stärke 7',
    'migräne eintragen',
    'schmerzen jetzt',
    'kopfschmerz stärke 5 mit triptan',
    'starke kopfschmerzen',
    'leichte migräne',
    'schmerz eintrag stärke 6',
  ],
  keywords: ['kopfschmerz', 'migräne', 'schmerz', 'stärke', 'eintrag'],
  requiredSlots: [
    { name: 'painLevel', type: 'number', required: true, description: 'Wie stark? (0-10)' },
  ],
  optionalSlots: [
    { name: 'medications', type: 'medication', required: false },
    { name: 'notes', type: 'string', required: false },
  ],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasPainKeyword = OBJECTS.ENTRIES.some(w => text.includes(w)) ||
                           /\b(kopfschmerz|migräne|schmerz)\w*\b/.test(text);
    const hasLevelKeyword = /\b(stärke|level|stufe)\b/.test(text);
    const hasCreateKeyword = OPERATORS.CREATE.some(w => text.includes(w));
    
    if (hasPainKeyword) reasons.push('has_pain_keyword');
    if (hasLevelKeyword) reasons.push('has_level_keyword');
    if (hasCreateKeyword) reasons.push('has_create_keyword');
    
    // Extract pain level
    let painLevel: number | null = null;
    const levelMatch = text.match(/\b(?:stärke|level|stufe)\s*(\d+)\b/);
    if (levelMatch) {
      painLevel = Math.min(10, Math.max(0, parseInt(levelMatch[1], 10)));
      reasons.push(`pain_level_found:${painLevel}`);
    }
    
    // Implicit levels
    if (/\b(leicht|gering)\w*\b/.test(text)) {
      painLevel = painLevel ?? 3;
      reasons.push('implicit_level:light');
    } else if (/\b(mittel|mäßig)\w*\b/.test(text)) {
      painLevel = painLevel ?? 5;
      reasons.push('implicit_level:medium');
    } else if (/\b(stark|heftig|schlimm)\w*\b/.test(text)) {
      painLevel = painLevel ?? 7;
      reasons.push('implicit_level:strong');
    } else if (/\b(sehr stark|extrem|unerträglich)\w*\b/.test(text)) {
      painLevel = painLevel ?? 9;
      reasons.push('implicit_level:severe');
    }
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    if (medExtract) reasons.push(`medication_found:${medExtract.medication}`);
    
    let confidence = 0;
    
    if (hasPainKeyword && painLevel !== null) {
      confidence = 0.9;
    } else if (hasPainKeyword && hasCreateKeyword) {
      confidence = 0.8;
    } else if (hasPainKeyword) {
      confidence = 0.6;
    }
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: {
        painLevel,
        medications: medExtract ? [medExtract.medication] : undefined,
        notes: transcript,
      },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): MutationPlan | SlotFillingPlan {
    const painLevel = slots.painLevel as number | undefined;
    const medications = slots.medications as string[] | undefined;
    const notes = slots.notes as string | undefined;
    
    // If no pain level, ask for it
    if (painLevel === undefined) {
      return {
        kind: 'slot_filling',
        missingSlot: 'painLevel',
        prompt: 'Wie stark sind die Schmerzen? (0-10)',
        suggestions: [
          { label: 'Leicht (3)', value: '3' },
          { label: 'Mittel (5)', value: '5' },
          { label: 'Stark (7)', value: '7' },
          { label: 'Sehr stark (9)', value: '9' },
        ],
        partial: {
          targetSkillId: 'quick_pain_entry',
          collectedSlots: slots,
        },
        summary: 'Schmerzeintrag erstellen',
        confidence,
      };
    }
    
    const payload = {
      painLevel,
      medications,
      notes,
      timestamp: new Date().toISOString(),
    };
    
    const medText = medications?.length ? ` mit ${medications.join(', ')}` : '';
    
    return {
      kind: 'mutation',
      mutationType: 'quick_pain_entry',
      payload,
      risk: 'low',
      summary: `Schmerz Stärke ${painLevel}${medText}`,
      confidence,
      undo: {
        kind: 'toast_undo',
        windowMs: 8000,
        undoPlan: {
          kind: 'mutation',
          mutationType: 'delete_entry',
          payload: { targetId: -1, targetType: 'entry' },
          risk: 'medium',
          summary: 'Eintrag rückgängig machen',
          confidence: 1,
        },
      },
    };
  },
};

// ============================================
// Export All Action Skills
// ============================================

export const actionSkills: Skill[] = [
  createReminderSkill,
  saveVoiceNoteSkill,
  rateIntakeSkill,
  quickPainEntrySkill,
];
