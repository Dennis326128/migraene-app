/**
 * Query Skills
 * 
 * Skills für Datenabfragen (read-only, geringes Risiko)
 * - last_entry: Letzten Eintrag anzeigen/öffnen
 * - last_entry_with_med: Letzten Eintrag mit Medikament
 * - last_intake_med: Wann zuletzt Medikament genommen
 * - count_med_range: Wie viele Tage mit Medikament
 * - count_migraine_range: Wie viele Migränetage
 * - avg_pain_range: Durchschnittlicher Schmerz
 */

import type { Skill, SkillMatchResult, VoiceUserContext } from '../types';
import type { QueryPlan, OpenEntryPlan } from '../../types';
import { 
  canonicalizeText, 
  extractTimeRange, 
  extractOrdinal,
  OPERATORS,
  OBJECTS,
} from '../../lexicon/de';
import { calculateExampleScore, combineScores } from '../types';

// ============================================
// Helper: Extract medication from transcript
// ============================================

function extractMedicationFromTranscript(
  text: string, 
  userMeds: Array<{ name: string }>
): { medication: string; confidence: number } | null {
  const lower = text.toLowerCase();
  
  // 1. Check user's actual medications first (highest priority)
  for (const med of userMeds) {
    const medLower = med.name.toLowerCase();
    const medNormalized = medLower.replace(/\d+\s*(mg|ml)/gi, '').trim();
    
    if (lower.includes(medLower) || lower.includes(medNormalized)) {
      return { medication: med.name, confidence: 0.95 };
    }
  }
  
  // 2. Check for category keywords
  const categories = [
    { keywords: ['triptan', 'triptane', 'sumatriptan', 'rizatriptan', 'maxalt', 'imigran'], value: 'triptan' },
    { keywords: ['schmerzmittel', 'nsar', 'ibuprofen', 'paracetamol', 'aspirin'], value: 'schmerzmittel' },
    { keywords: ['prophylaxe', 'vorbeugung'], value: 'prophylaxe' },
    { keywords: ['cgrp', 'anti-cgrp', 'ajovy', 'aimovig', 'emgality'], value: 'cgrp' },
  ];
  
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw)) {
        // Return the specific med name if found, otherwise category
        const specificMed = cat.keywords.find(k => k.length > 4 && lower.includes(k));
        return { 
          medication: specificMed || cat.value, 
          confidence: specificMed ? 0.9 : 0.8 
        };
      }
    }
  }
  
  // 3. Try to extract any word that looks like a medication name
  const medPatterns = [
    /\b([a-zäöü]+(?:triptan|profen|tamol|pirin|xen))\b/i,
    /\b(ajovy|aimovig|emgality|botox|topiramat|amitriptylin)\b/i,
  ];
  
  for (const pattern of medPatterns) {
    const match = text.match(pattern);
    if (match) {
      return { medication: match[1], confidence: 0.75 };
    }
  }
  
  return null;
}

// ============================================
// Skill: Last Entry
// ============================================

export const lastEntrySkill: Skill = {
  id: 'last_entry',
  name: 'Letzter Eintrag',
  category: 'QUERY',
  examples: [
    'zeig mir meinen letzten eintrag',
    'öffne den letzten eintrag',
    'letzter eintrag',
    'was war mein letzter eintrag',
    'zeig letzten schmerzeintrag',
    'öffne meinen letzten migräneeintrag',
    'wann war mein letzter eintrag',
    'den letzten eintrag bitte',
  ],
  keywords: ['letzter', 'letzte', 'eintrag', 'öffne', 'zeig'],
  requiredSlots: [],
  optionalSlots: [{ name: 'ordinal', type: 'number', required: false }],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    // Keywords für "letzter Eintrag"
    const hasLatestKeyword = /\b(letzt|vorhin|eben|gerade)\w*\b/.test(text);
    const hasEntryKeyword = OBJECTS.ENTRIES.some(w => text.includes(w));
    const hasOpenKeyword = OPERATORS.OPEN.some(w => text.includes(w)) || 
                          OPERATORS.LATEST.some(w => text.includes(w));
    
    if (hasLatestKeyword) reasons.push('has_latest_keyword');
    if (hasEntryKeyword) reasons.push('has_entry_keyword');
    if (hasOpenKeyword) reasons.push('has_open_keyword');
    
    // Check for medication mention (would be different skill)
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    if (medExtract) {
      // This should be handled by last_entry_with_med skill
      return { confidence: 0.3, slots: {}, reasons: ['has_medication_mention'] };
    }
    
    // Score calculation
    let confidence = 0;
    
    if (hasLatestKeyword && hasEntryKeyword) {
      confidence = 0.85;
    } else if (hasEntryKeyword && hasOpenKeyword) {
      confidence = 0.75;
    } else if (hasLatestKeyword && hasOpenKeyword) {
      confidence = 0.6;
    }
    
    // Boost with example matching
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    // Extract ordinal
    const ordinal = extractOrdinal(text);
    
    return {
      confidence,
      slots: ordinal ? { ordinal } : {},
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): OpenEntryPlan {
    const ordinal = (slots.ordinal as number) || 1;
    const ordinalText = ordinal === 1 ? 'letzten' : 
                        ordinal === 2 ? 'vorletzten' : 
                        `${ordinal}.-letzten`;
    
    return {
      kind: 'open_entry',
      entryId: -ordinal, // Negative number signals "latest N-th entry"
      summary: `Öffne ${ordinalText} Eintrag`,
      confidence,
    };
  },
};

// ============================================
// Skill: Last Entry with Medication
// ============================================

export const lastEntryWithMedSkill: Skill = {
  id: 'last_entry_with_med',
  name: 'Letzter Eintrag mit Medikament',
  category: 'QUERY',
  examples: [
    'zeig den letzten eintrag mit sumatriptan',
    'öffne letzten eintrag mit triptan',
    'letzter eintrag mit ibuprofen',
    'zeig mir den letzten wo ich triptan genommen habe',
    'öffne den eintrag wo ich zuletzt schmerzmittel hatte',
    'letzter migräneeintrag mit medikament',
  ],
  keywords: ['letzter', 'eintrag', 'mit', 'triptan', 'medikament'],
  requiredSlots: [{ name: 'medication', type: 'medication', required: true, description: 'Welches Medikament?' }],
  optionalSlots: [{ name: 'ordinal', type: 'number', required: false }],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasLatestKeyword = /\b(letzt|vorhin|zuletzt)\w*\b/.test(text);
    const hasEntryKeyword = OBJECTS.ENTRIES.some(w => text.includes(w));
    const hasOpenKeyword = OPERATORS.OPEN.some(w => text.includes(w));
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    
    if (!medExtract) {
      return { confidence: 0, slots: {}, reasons: ['no_medication_found'] };
    }
    
    reasons.push(`medication_found:${medExtract.medication}`);
    if (hasLatestKeyword) reasons.push('has_latest_keyword');
    if (hasEntryKeyword) reasons.push('has_entry_keyword');
    
    let confidence = 0;
    
    if (hasLatestKeyword && hasEntryKeyword && medExtract) {
      confidence = 0.9;
    } else if ((hasLatestKeyword || hasEntryKeyword) && medExtract) {
      confidence = 0.75;
    } else if (medExtract && hasOpenKeyword) {
      confidence = 0.65;
    }
    
    // Adjust by medication confidence
    confidence = confidence * medExtract.confidence;
    
    const ordinal = extractOrdinal(text);
    
    return {
      confidence,
      slots: { 
        medication: medExtract.medication,
        ...(ordinal ? { ordinal } : {}),
      },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): QueryPlan {
    const medication = slots.medication as string;
    const ordinal = (slots.ordinal as number) || 1;
    
    return {
      kind: 'query',
      queryType: 'last_entry_with_med',
      params: { medName: medication, limit: ordinal },
      summary: `Öffne letzten Eintrag mit ${medication}`,
      confidence,
      actions: [
        { label: 'Eintrag öffnen', action: 'close' },
        { label: 'Fertig', action: 'close' },
      ],
    };
  },
};

// ============================================
// Skill: Last Medication Intake (Wann zuletzt?)
// ============================================

export const lastIntakeMedSkill: Skill = {
  id: 'last_intake_med',
  name: 'Letzte Medikamenteneinnahme',
  category: 'QUERY',
  examples: [
    'wann habe ich zuletzt triptan genommen',
    'wann war die letzte triptan einnahme',
    'wann zuletzt sumatriptan',
    'wann habe ich das letzte mal ibuprofen genommen',
    'letzte einnahme triptan',
    'wann nahm ich zuletzt schmerzmittel',
    'wann hab ich zuletzt medikament genommen',
    'wann war meine letzte tabletteneinnahme',
  ],
  keywords: ['wann', 'zuletzt', 'letzte', 'einnahme', 'genommen', 'triptan'],
  requiredSlots: [{ name: 'medication', type: 'medication', required: true, description: 'Welches Medikament meinst du?' }],
  optionalSlots: [],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    // "Wann zuletzt" Pattern ist der Hauptindikator
    const hasWannZuletzt = /\bwann\b.*\b(zuletzt|letzte?)\b|\b(zuletzt|letzte?)\b.*\bwann\b/.test(text);
    const hasLatestKeyword = OPERATORS.LATEST.some(w => text.includes(w));
    const hasIntakeKeyword = /\b(einnahme|genommen|nahm|nehmen|tablette|eingenommen)\b/.test(text);
    
    if (hasWannZuletzt) reasons.push('has_wann_zuletzt');
    if (hasLatestKeyword) reasons.push('has_latest_keyword');
    if (hasIntakeKeyword) reasons.push('has_intake_keyword');
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    
    if (!medExtract) {
      // Ohne Medikament macht diese Query keinen Sinn
      // Aber: "wann zuletzt tablette" könnte generisch sein
      if (hasIntakeKeyword && hasWannZuletzt) {
        return { 
          confidence: 0.5, 
          slots: { medication: 'tabletten' }, 
          reasons: ['generic_intake_query'] 
        };
      }
      return { confidence: 0, slots: {}, reasons: ['no_medication_found'] };
    }
    
    reasons.push(`medication_found:${medExtract.medication}`);
    
    let confidence = 0;
    
    // "Wann zuletzt X" ist sehr starkes Signal
    if (hasWannZuletzt && medExtract) {
      confidence = 0.95;
    } else if (hasLatestKeyword && hasIntakeKeyword && medExtract) {
      confidence = 0.85;
    } else if (hasLatestKeyword && medExtract) {
      confidence = 0.7;
    } else if (medExtract) {
      confidence = 0.5;
    }
    
    // Boost mit Example-Score
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: { medication: medExtract.medication },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): QueryPlan {
    const medication = slots.medication as string;
    
    return {
      kind: 'query',
      queryType: 'last_intake_med',
      params: { medName: medication },
      summary: `Wann zuletzt ${medication} genommen?`,
      confidence,
      actions: [
        { label: 'Eintrag öffnen', action: 'close' },
        { label: 'Fertig', action: 'close' },
      ],
    };
  },
};

// ============================================
// Skill: Count Medication Days
// ============================================

export const countMedRangeSkill: Skill = {
  id: 'count_med_range',
  name: 'Medikamententage zählen',
  category: 'QUERY',
  examples: [
    'wie oft habe ich triptan genommen',
    'wie viele triptantage hatte ich',
    'an wie vielen tagen triptan',
    'wie oft ibuprofen in den letzten 30 tagen',
    'zähle triptaneinnahmen',
    'wie viele tage mit schmerzmittel',
    'anzahl triptan tage diesen monat',
    'wie viele sumatriptan einnahmen',
  ],
  keywords: ['wie oft', 'wie viele', 'tage', 'zähle', 'anzahl', 'triptan'],
  requiredSlots: [{ name: 'medication', type: 'medication', required: true, description: 'Welches Medikament?' }],
  optionalSlots: [{ name: 'timeRange', type: 'timeRange', required: false, description: 'Welcher Zeitraum?' }],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasCountKeyword = OPERATORS.COUNT.some(w => text.includes(w));
    const hasDayKeyword = /\b(tag|tage|tagen)\b/.test(text);
    
    if (hasCountKeyword) reasons.push('has_count_keyword');
    if (hasDayKeyword) reasons.push('has_day_keyword');
    
    // Extract medication
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    
    if (!medExtract) {
      return { confidence: 0, slots: {}, reasons: ['no_medication_found'] };
    }
    
    reasons.push(`medication_found:${medExtract.medication}`);
    
    // Extract time range
    const timeRange = extractTimeRange(text);
    if (timeRange) {
      reasons.push(`time_range:${timeRange.days}d`);
    }
    
    let confidence = 0;
    
    if (hasCountKeyword && medExtract) {
      confidence = 0.9;
    } else if (hasDayKeyword && medExtract) {
      confidence = 0.7;
    } else if (medExtract) {
      confidence = 0.5;
    }
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: { 
        medication: medExtract.medication,
        days: timeRange?.days || 30,
      },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): QueryPlan {
    const medication = slots.medication as string;
    const days = (slots.days as number) || 30;
    
    return {
      kind: 'query',
      queryType: 'count_med_range',
      params: { medName: medication, timeRange: { from: '', to: '', days } },
      summary: `Zähle ${medication}-Tage (${days} Tage)`,
      confidence,
      actions: [
        { label: 'Einträge anzeigen', action: 'close' },
        { label: 'Fertig', action: 'close' },
      ],
    };
  },
};

// ============================================
// Skill: Count Migraine Days
// ============================================

export const countMigraineRangeSkill: Skill = {
  id: 'count_migraine_range',
  name: 'Migränetage zählen',
  category: 'QUERY',
  examples: [
    'wie viele migränetage hatte ich',
    'wie oft hatte ich kopfschmerzen',
    'an wie vielen tagen migräne',
    'zähle meine kopfschmerztage',
    'wie viele schmerztage diesen monat',
    'anzahl migränetage letzte 30 tage',
  ],
  keywords: ['wie viele', 'migräne', 'kopfschmerz', 'tage', 'zähle'],
  requiredSlots: [],
  optionalSlots: [{ name: 'timeRange', type: 'timeRange', required: false, description: 'Welcher Zeitraum?' }],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasCountKeyword = OPERATORS.COUNT.some(w => text.includes(w));
    const hasMigraineKeyword = /\b(migräne|kopfschmerz|schmerz)(?:tage?|en?)?\b/.test(text);
    const hasDayKeyword = /\b(tag|tage|tagen)\b/.test(text);
    
    if (hasCountKeyword) reasons.push('has_count_keyword');
    if (hasMigraineKeyword) reasons.push('has_migraine_keyword');
    if (hasDayKeyword) reasons.push('has_day_keyword');
    
    // Don't match if a specific medication is mentioned
    const medExtract = extractMedicationFromTranscript(text, context.userMeds || []);
    if (medExtract && medExtract.confidence > 0.7) {
      return { confidence: 0.2, slots: {}, reasons: ['medication_mentioned_use_other_skill'] };
    }
    
    let confidence = 0;
    
    if (hasCountKeyword && hasMigraineKeyword) {
      confidence = 0.9;
    } else if (hasMigraineKeyword && hasDayKeyword) {
      confidence = 0.75;
    } else if (hasCountKeyword && hasDayKeyword) {
      confidence = 0.5;
    }
    
    const timeRange = extractTimeRange(text);
    if (timeRange) reasons.push(`time_range:${timeRange.days}d`);
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: { days: timeRange?.days || 30 },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): QueryPlan {
    const days = (slots.days as number) || 30;
    
    return {
      kind: 'query',
      queryType: 'count_migraine_range',
      params: { timeRange: { from: '', to: '', days } },
      summary: `Zähle Migränetage (${days} Tage)`,
      confidence,
      actions: [
        { label: 'Einträge anzeigen', action: 'close' },
        { label: 'Fertig', action: 'close' },
      ],
    };
  },
};

// ============================================
// Skill: Average Pain Level
// ============================================

export const avgPainRangeSkill: Skill = {
  id: 'avg_pain_range',
  name: 'Durchschnittlicher Schmerz',
  category: 'QUERY',
  examples: [
    'wie stark waren meine schmerzen durchschnittlich',
    'durchschnittlicher schmerzlevel',
    'mittlere schmerzstärke',
    'wie hoch war mein schmerz im schnitt',
    'durchschnitt schmerzstärke letzte woche',
  ],
  keywords: ['durchschnitt', 'schnitt', 'mittel', 'schmerz', 'stärke'],
  requiredSlots: [],
  optionalSlots: [{ name: 'timeRange', type: 'timeRange', required: false, description: 'Welcher Zeitraum?' }],
  
  match(transcript: string, canonicalized: string, context: VoiceUserContext): SkillMatchResult {
    const text = canonicalized || canonicalizeText(transcript);
    const reasons: string[] = [];
    
    const hasStatsKeyword = OPERATORS.STATS.some(w => text.includes(w));
    const hasPainKeyword = /\b(schmerz|pain|level|stärke|intensität)\b/.test(text);
    
    if (hasStatsKeyword) reasons.push('has_stats_keyword');
    if (hasPainKeyword) reasons.push('has_pain_keyword');
    
    let confidence = 0;
    
    if (hasStatsKeyword && hasPainKeyword) {
      confidence = 0.85;
    } else if (hasStatsKeyword) {
      confidence = 0.5;
    }
    
    const timeRange = extractTimeRange(text);
    if (timeRange) reasons.push(`time_range:${timeRange.days}d`);
    
    const exampleScore = calculateExampleScore(text, this.examples);
    confidence = combineScores(confidence, exampleScore);
    
    return {
      confidence,
      slots: { days: timeRange?.days || 30 },
      reasons,
    };
  },
  
  buildPlan(slots, context, confidence): QueryPlan {
    const days = (slots.days as number) || 30;
    
    return {
      kind: 'query',
      queryType: 'avg_pain_range',
      params: { timeRange: { from: '', to: '', days } },
      summary: `Durchschnittlicher Schmerz (${days} Tage)`,
      confidence,
      actions: [
        { label: 'Auswertung öffnen', action: 'close' },
        { label: 'Fertig', action: 'close' },
      ],
    };
  },
};

// ============================================
// Export All Query Skills
// ============================================

export const querySkills: Skill[] = [
  lastEntrySkill,
  lastEntryWithMedSkill,
  lastIntakeMedSkill,
  countMedRangeSkill,
  countMigraineRangeSkill,
  avgPainRangeSkill,
];
