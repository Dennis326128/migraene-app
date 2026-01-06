/**
 * Voice NLP - Natural Language Processing für Voice-Eingaben
 * Analysiert Transkripte und extrahiert strukturierte Daten
 * 
 * v2: Uses centralized scoring system for better intent classification
 */

import type { 
  VoiceAnalysisResult, 
  VoiceIntent, 
  VoiceUserContext,
  VoiceMed,
  VoicePainEntry,
  VoiceReminder,
  VoiceMedicationUpdate,
  VoiceAnalyticsQuery,
  MedicationUpdateAction,
  ConfidenceLevel,
  VoiceAddMedication
} from '@/types/voice.types';
import { parseGermanVoiceEntry, levenshteinDistance, isAddMedicationTrigger, parseAddMedicationCommand } from './germanParser';
import { parseGermanReminderEntry, isReminderTrigger } from './reminderParser';
import { parseOccurredAt } from './timeOnly';
import { scoreIntents, getTopIntents, type ScoringResult } from './intentScoring';
import { voiceLogIntent, voiceLogEvent } from './voiceLogger';

// Medication update patterns
const MEDICATION_UPDATE_PATTERNS = {
  discontinued: [
    /(\w+)\s+(ab|abge)setzt/i,
    /(\w+)\s+nicht\s+mehr\s+(nehm|einnehm)/i,
    /(\w+)\s+aufgehört/i,
    /stopp\w*\s+(\w+)/i,
    /kein\w*\s+(\w+)\s+mehr/i,
    /(\w+)\s+beendet/i,
  ],
  intolerance: [
    /(\w+)\s+(ab|abge)setzt\s+wegen\s+(nebenwirkung|unverträglich|allergie)/i,
    /(\w+)\s+nicht\s+vertragen/i,
    /(\w+)\s+(unverträglich|allergie|allergisch)/i,
    /vertrage\s+(\w+)\s+nicht/i,
    /(\w+)\s+macht\s+(übel|schwindel|kopfschmerz)/i,
    /nebenwirkung\w*\s+bei\s+(\w+)/i,
    /(\w+)\s+nebenwirkung/i,
  ],
  started: [
    /(\w+)\s+angefangen/i,
    /(\w+)\s+begonnen/i,
    /starte\s+(\w+)/i,
    /(\w+)\s+neu\s+(ein)?genommen/i,
    /nehme\s+jetzt\s+(\w+)/i,
    /fange\s+mit\s+(\w+)\s+an/i,
  ],
  dosage_changed: [
    /(\w+)\s+(dosis|dosierung)\s+(erhöht|reduziert|geändert|angepasst)/i,
    /mehr\s+(\w+)/i,
    /weniger\s+(\w+)/i,
    /(\w+)\s+(hoch|runter)\s*dosier/i,
  ]
};

const INTOLERANCE_REASONS = [
  'nebenwirkung', 'nebenwirkungen',
  'unverträglich', 'unverträglichkeit',
  'allergie', 'allergisch',
  'übel', 'übelkeit',
  'schwindel', 'schwindelig',
  'kopfschmerz', 'kopfschmerzen',
  'ausschlag', 'hautausschlag',
  'jucken', 'juckreiz',
  'müde', 'müdigkeit',
  'durchfall', 'verstopfung',
];

// Medication effect rating patterns
const MEDICATION_EFFECT_PATTERNS = [
  /(?:hat|haben)\s+(?:gut|sehr gut|super|prima|toll|bestens|hervorragend|perfekt)\s+(?:geholfen|gewirkt|funktioniert)/i,
  /(?:hat|haben)\s+(?:nicht|kaum|wenig|schlecht|gar nicht|überhaupt nicht)\s+(?:geholfen|gewirkt|funktioniert)/i,
  /(?:hat|haben)\s+(?:etwas|einigermaßen|halbwegs|mittelmäßig|mäßig)\s+(?:geholfen|gewirkt|funktioniert)/i,
  /wirkung\s*[:=]?\s*(gut|schlecht|mittel|keine|stark|schwach)/i,
  /bewert(?:e|ung)\s+(?:\w+)\s+(?:mit|auf)\s+(\d+)/i,
  /(?:\w+)\s+(?:hat|war)\s+(?:wirksam|unwirksam|effektiv|ineffektiv)/i,
  /(?:schmerz|kopfschmerz|migräne)\s+(?:war|ist|wurde)\s+(?:besser|weg|weniger|stärker|schlimmer)/i,
  /(?:nach|mit)\s+(?:\w+)\s+(?:besser|weg|weniger)/i,
];

/**
 * Hauptfunktion: Analysiert Voice-Transkript und extrahiert strukturierte Daten
 */
export function analyzeVoiceTranscript(
  transcript: string,
  userContext: VoiceUserContext,
  sttConfidence?: number
): VoiceAnalysisResult {
  console.log('🧠 NLP: Analyzing transcript:', transcript.substring(0, 100) + '...');

  // 1. Intent-Klassifikation mit neuem Scoring-System
  const { intent, intentConfidence } = classifyIntent(transcript, userContext);
  console.log(`🎯 Intent: ${intent} (confidence: ${intentConfidence})`);

  // 2. Strukturierte Daten je nach Intent extrahieren
  let painEntry: VoicePainEntry | undefined;
  let reminder: VoiceReminder | undefined;
  let medicationUpdate: VoiceMedicationUpdate | undefined;
  let addMedication: VoiceAddMedication | undefined;
  let analyticsQuery: VoiceAnalyticsQuery | undefined;

  switch (intent) {
    case 'pain_entry':
      painEntry = extractPainEntry(transcript, userContext);
      break;
    
    case 'reminder':
      reminder = extractReminder(transcript, userContext);
      break;
    
    case 'medication_update':
      medicationUpdate = extractMedicationUpdate(transcript, userContext);
      break;
    
    case 'add_medication':
      addMedication = extractAddMedication(transcript);
      break;
    
    case 'analytics_query':
      analyticsQuery = extractAnalyticsQuery(transcript);
      break;
    
    case 'note':
    case 'unknown':
      // Für Notizen keine weitere Struktur nötig
      break;
  }

  return {
    intent,
    intentConfidence,
    painEntry,
    reminder,
    medicationUpdate,
    addMedication,
    analyticsQuery,
    rawTranscript: transcript,
    sttConfidence
  };
}

/**
 * Klassifiziert den Intent des Transkripts
 * Verwendet neues Scoring-System für robustere Erkennung
 */
function classifyIntent(
  transcript: string,
  userContext: VoiceUserContext
): { 
  intent: VoiceIntent; 
  intentConfidence: number 
} {
  const lower = transcript.toLowerCase();
  
  console.log('[VOICE-NLP] classifyIntent input:', transcript.substring(0, 80));

  // Use new scoring system
  const scoringResult = scoreIntents(transcript, userContext.userMeds);
  const topIntents = getTopIntents(scoringResult.scores);
  
  // Log for analytics
  voiceLogIntent(scoringResult.intent, topIntents, scoringResult.features);
  voiceLogEvent('intent_scored', {
    intent: scoringResult.intent,
    confidence: scoringResult.confidence,
    features: scoringResult.features,
  });

  console.log('[VOICE-NLP] Scoring result:', {
    intent: scoringResult.intent,
    confidence: scoringResult.confidence,
    topIntents: topIntents.slice(0, 3),
    features: scoringResult.features,
  });

  // Map scored intent to voice intent
  const intentMap: Record<string, VoiceIntent> = {
    add_medication: 'add_medication',
    pain_entry: 'pain_entry',
    medication_update: 'medication_update',
    medication_effect: 'medication_effect',
    reminder: 'reminder',
    analytics_query: 'analytics_query',
    note: 'note',
    navigation: 'unknown', // Navigation handled separately by router
    unknown: 'unknown',
  };

  const mappedIntent = intentMap[scoringResult.intent] || 'unknown';
  
  // Special case: Check for medication effect rating
  if (mappedIntent === 'pain_entry' && isMedicationEffectRating(lower)) {
    console.log('[VOICE-NLP] → medication_effect (override from effect patterns)');
    return { intent: 'medication_effect', intentConfidence: 0.85 };
  }
  
  // Special case: Check reminder trigger for better matching
  if (mappedIntent !== 'reminder' && isReminderTrigger(transcript)) {
    console.log('[VOICE-NLP] → reminder (override from trigger)');
    return { intent: 'reminder', intentConfidence: 0.9 };
  }

  // For add_medication, ensure we have good extraction
  if (mappedIntent === 'add_medication') {
    const isAddTrigger = isAddMedicationTrigger(transcript);
    const parsed = isAddTrigger ? parseAddMedicationCommand(transcript) : null;
    
    // If trigger matched but no name extracted, still proceed (form will be empty)
    if (isAddTrigger) {
      const confidence = parsed?.name ? Math.max(scoringResult.confidence, 0.85) : 0.75;
      console.log('[VOICE-NLP] → add_medication (trigger + name:', parsed?.name || '(none)', ')');
      return { intent: 'add_medication', intentConfidence: confidence };
    }
  }

  console.log(`[VOICE-NLP] → ${mappedIntent} (from scoring)`);
  return { intent: mappedIntent, intentConfidence: scoringResult.confidence };
}

/**
 * Erkennt Analytics-Fragen / Q&A Intent
 * v2: Robustere Erkennung mit mehr Patterns
 */
function isAnalyticsQuestion(lower: string): boolean {
  // 1. Check for question mark
  if (lower.includes('?')) {
    const healthTopics = [
      'migräne', 'migraene', 'kopfschmerz', 'schmerz', 'medikament', 'triptan', 
      'tag', 'tage', 'woche', 'monat', 'einnahme', 'anfall', 'attacke',
      'schmerzfrei', 'ohne schmerz'
    ];
    if (healthTopics.some(t => lower.includes(t))) {
      return true;
    }
  }
  
  // 2. W-Fragen am Anfang (strong indicator)
  const wQuestionStart = /^(wie|was|warum|welche|wann|wo|wieviel|woher|wohin|weshalb|wieso|wer|wen|wem)\s/;
  if (wQuestionStart.test(lower)) {
    return true;
  }
  
  // 3. "schmerzfreie Tage" patterns - PRIORITY
  if (/schmerzfrei\w*\s+tag/.test(lower) || /tag\w*\s+ohne\s+(kopf)?schmerz/.test(lower)) {
    return true;
  }
  
  // 4. "in den letzten X Tagen/Wochen/Monaten" pattern
  if (/in\s+den\s+letzt\w*\s+\d+\s+(tag|woche|monat)/.test(lower)) {
    return true;
  }
  if (/letzt\w*\s+\d+\s+tag/.test(lower) && /wie\s*(viel|oft)/.test(lower)) {
    return true;
  }
  if (/letzten?\s+(monat|woche)\b/.test(lower) && /wie\s*(viel|oft)/.test(lower)) {
    return true;
  }
  
  // 5. W-Fragen irgendwo mit Health Context
  const wQuestionPatterns = [
    /wie\s*(?:viele?|oft|lang|stark)/,
    /wieviele?/,
    /wann\s+(?:hatte|war|hab)/,
    /was\s+(?:hilft|wirkt|war)/,
    /welche\s+(?:medikament|tag|woche)/,
  ];
  if (wQuestionPatterns.some(p => p.test(lower))) {
    return true;
  }
  
  // 6. Analytik-Keywords
  const analyticsTriggers = [
    /zähl/,
    /durchschnitt/,
    /statistik/,
    /auswertung/,
    /analyse\b/,
    /übersicht/,
    /uebersicht/,  // normalized
    /häufig\w*\s+medikament/,
    /haeufig\w*\s+medikament/, // normalized
  ];
  if (analyticsTriggers.some(p => p.test(lower))) {
    return true;
  }
  
  // 7. Typische Frage-Phrasen
  const questionPhrases = [
    'kannst du',
    'könntest du',
    'koenntest du', // normalized
    'zeige mir',
    'zeig mir',
    'analysiere',
    'analysier',
    'erklär',
    'erklaer', // normalized
    'erkläre',
    'sag mir',
    'hilf mir',
    'gibt es',
    'habe ich',
    'hatte ich',
    'bin ich',
    'ist das',
    'stimmt es',
  ];
  if (questionPhrases.some(phrase => lower.includes(phrase))) {
    const healthTopics = ['migräne', 'migraene', 'kopfschmerz', 'schmerz', 'medikament', 'triptan', 'tag', 'einnahme'];
    if (healthTopics.some(t => lower.includes(t))) {
      return true;
    }
  }
  
  // 8. Legacy pattern: Question pattern + topic
  const legacyPatterns = [
    /wie\s*(?:viele?|oft)/,
    /wieviele?/,
  ];
  const hasLegacyQuestion = legacyPatterns.some(p => p.test(lower));
  if (hasLegacyQuestion) {
    const topics = [
      'triptan', 'sumatriptan', 'rizatriptan', 'zolmitriptan',
      'schmerzmittel', 'ibuprofen', 'paracetamol',
      'migräne', 'migraene', 'kopfschmerz',
      'tag', 'tage', 'woche', 'monat'
    ];
    if (topics.some(t => lower.includes(t))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Erkennt Medication Effect Rating Aussagen
 */
function isMedicationEffectRating(lower: string): boolean {
  return MEDICATION_EFFECT_PATTERNS.some(pattern => pattern.test(lower));
}

/**
 * Extrahiert Analytics-Query Daten
 * Enhanced: supports last_intake_med query type
 */
function extractAnalyticsQuery(transcript: string): VoiceAnalyticsQuery {
  const lower = transcript.toLowerCase();
  
  // Zeitraum erkennen
  let timeRangeDays = 30; // Default
  const daysMatch = lower.match(/letzt(?:e|en)?\s*(\d+)\s*tag/);
  if (daysMatch) {
    timeRangeDays = parseInt(daysMatch[1], 10);
  } else if (/woche/.test(lower)) {
    timeRangeDays = 7;
  } else if (/monat/.test(lower)) {
    timeRangeDays = 30;
  }
  
  // =============================================
  // NEW: "Wann zuletzt X genommen?" → last_intake_med
  // Must be checked BEFORE other medication queries
  // Enhanced patterns for better recognition (Bug #2)
  // =============================================
  const lastIntakePatterns = [
    // Primary patterns - high priority
    /wann\s+(?:habe?\s+ich\s+)?(?:das\s+)?letzte?\s*mal\s+(\w+)\s+(?:genommen|eingenommen)/i,
    /wann\s+(?:habe?\s+ich\s+)?zuletzt\s+(\w+)\s+(?:genommen|eingenommen|nehme)/i,
    /wann\s+zuletzt\s+(\w+)/i,
    /letzte?\s+einnahme\s+(?:von\s+)?(\w+)/i,
    /wann\s+(?:hab\s+ich|habe\s+ich)\s+(\w+)\s+zuletzt/i,
    /(\w+)\s+zuletzt\s+(?:genommen|eingenommen)/i,
    // More flexible patterns - "wann ... genommen"
    /wann\s+(?:habe?\s+ich\s+)?(?:ein(?:en?)?\s+)?(\w+)\s+(?:das\s+)?letzte?\s*mal\s+(?:genommen|eingenommen)/i,
    // Pattern for "letzte mal" anywhere with medication
    /letzte?\s*mal\s+(\w+)\s+(?:genommen|eingenommen)/i,
    // "wann hab ich X genommen" (without "zuletzt" but implies last time)
    /wann\s+hab(?:e)?\s+ich\s+(?:ein(?:en?)?\s+)?(\w+)\s+genommen/i,
  ];
  
  // Skip list for common false positives
  const skipWords = new Set(['das', 'mal', 'ich', 'ein', 'eine', 'einen', 'den', 'die', 'wann', 'habe', 'hab', 'zuletzt', 'letzte', 'letztes']);
  
  for (const pattern of lastIntakePatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const medName = match[1].trim();
      // Skip common false positives
      if (skipWords.has(medName.toLowerCase())) {
        continue;
      }
      return {
        queryType: 'last_intake_med',
        medName: medName,
        timeRangeDays: 365, // Search up to 1 year back
        confidence: 0.95
      };
    }
  }
  
  // Triptan-Fragen
  if (/triptan|sumatriptan|rizatriptan|zolmitriptan|maxalt|imigran/.test(lower)) {
    const specificTriptans = [
      'sumatriptan', 'rizatriptan', 'zolmitriptan', 'eletriptan', 
      'naratriptan', 'almotriptan', 'frovatriptan', 'maxalt', 'imigran'
    ];
    
    for (const triptan of specificTriptans) {
      if (lower.includes(triptan)) {
        return {
          queryType: 'med_days',
          medName: triptan,
          timeRangeDays,
          confidence: 0.9
        };
      }
    }
    
    return {
      queryType: 'triptan_days',
      medCategory: 'migraene_triptan',
      timeRangeDays,
      confidence: 0.9
    };
  }
  
  // Schmerzmittel
  if (/schmerzmittel|ibuprofen|paracetamol|aspirin|diclofenac/.test(lower)) {
    const meds = ['ibuprofen', 'paracetamol', 'aspirin', 'diclofenac', 'naproxen'];
    for (const med of meds) {
      if (lower.includes(med)) {
        return {
          queryType: 'med_days',
          medName: med,
          timeRangeDays,
          confidence: 0.85
        };
      }
    }
    
    return {
      queryType: 'med_days',
      medCategory: 'schmerzmittel_nsar',
      timeRangeDays,
      confidence: 0.8
    };
  }
  
  // Migräne-Tage / Kopfschmerztage (Tage MIT Schmerz)
  if (/migräne.?tag|kopfschmerz.?tag|wie\s*(?:viele?|oft)\s*(?:migräne|kopfschmerz)/.test(lower)) {
    return {
      queryType: 'headache_days',
      timeRangeDays,
      confidence: 0.9
    };
  }
  
  // Schmerzfreie Tage (Tage OHNE Schmerz)
  if (/schmerzfrei|ohne\s*(?:kopf)?schmerz|schmerz.?los|keine\s*(?:kopf)?schmerzen/.test(lower) && /tag/.test(lower)) {
    return {
      queryType: 'pain_free_days',
      timeRangeDays,
      confidence: 0.95
    };
  }
  
  // Einträge / Attacken zählen
  if (/wie\s*(?:viele?|oft)|anzahl|zähl/.test(lower) && /eintrag|einträge|attacke|anfall|anfälle/.test(lower)) {
    return {
      queryType: 'entries_count',
      timeRangeDays,
      confidence: 0.85
    };
  }
  
  // Durchschnitt
  if (/durchschnitt/.test(lower) && /schmerz|stärke/.test(lower)) {
    return {
      queryType: 'avg_pain',
      timeRangeDays,
      confidence: 0.85
    };
  }
  
  return {
    queryType: 'unknown',
    timeRangeDays,
    confidence: 0.3
  };
}

/**
 * Extracts Add Medication data from transcript
 * Returns default empty medication if trigger matched but no name extracted
 */
function extractAddMedication(transcript: string): VoiceAddMedication | undefined {
  const parsed = parseAddMedicationCommand(transcript);
  
  // Even if no name extracted, return a default for the form to open
  if (!parsed) {
    // Check if it's an add-medication trigger at all
    if (isAddMedicationTrigger(transcript)) {
      return {
        name: '',
        displayName: '',
        strengthValue: undefined,
        strengthUnit: undefined,
        formFactor: undefined,
        confidence: 0.7
      };
    }
    return undefined;
  }
  
  return {
    name: parsed.name,
    displayName: parsed.displayName,
    strengthValue: parsed.strengthValue,
    strengthUnit: parsed.strengthUnit,
    formFactor: parsed.formFactor,
    confidence: parsed.confidence
  };
}

/**
 * Erkennt Medication Update Intent
 */
function detectMedicationUpdateIntent(
  lower: string,
  userContext: VoiceUserContext
): { confidence: number; action?: MedicationUpdateAction } {
  // Check each action type
  for (const [action, patterns] of Object.entries(MEDICATION_UPDATE_PATTERNS)) {
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        // Check if matched medication is known
        const potentialMedName = match[1] || match[2];
        const knownMed = userContext.userMeds.find(m => 
          m.name.toLowerCase().includes(potentialMedName?.toLowerCase() || '') ||
          potentialMedName?.toLowerCase().includes(m.name.toLowerCase().substring(0, 4))
        );
        
        const baseConfidence = knownMed ? 0.9 : 0.75;
        
        // Boost confidence for intolerance if reason keywords present
        if (action === 'intolerance' || INTOLERANCE_REASONS.some(r => lower.includes(r))) {
          return { 
            confidence: Math.min(baseConfidence + 0.1, 0.95), 
            action: 'intolerance' as MedicationUpdateAction 
          };
        }
        
        return { 
          confidence: baseConfidence, 
          action: action as MedicationUpdateAction 
        };
      }
    }
  }
  
  return { confidence: 0 };
}

/**
 * Extrahiert Medication Update Daten
 */
function extractMedicationUpdate(
  transcript: string,
  userContext: VoiceUserContext
): VoiceMedicationUpdate {
  const lower = transcript.toLowerCase();
  
  let medicationName = '';
  let medicationNameConfidence = 0;
  let action: MedicationUpdateAction = 'discontinued';
  let actionConfidence = 0.5;
  let reason: string | undefined;

  // Find medication name
  for (const [actionType, patterns] of Object.entries(MEDICATION_UPDATE_PATTERNS)) {
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        const potentialMed = match[1] || match[2];
        if (potentialMed) {
          // Try to match with known medications
          const knownMed = findBestMedicationMatch(potentialMed, userContext.userMeds);
          if (knownMed) {
            medicationName = knownMed.name;
            medicationNameConfidence = knownMed.confidence;
          } else {
            // Use as-is with lower confidence
            medicationName = potentialMed.charAt(0).toUpperCase() + potentialMed.slice(1);
            medicationNameConfidence = 0.5;
          }
          action = actionType as MedicationUpdateAction;
          actionConfidence = 0.8;
          break;
        }
      }
    }
    if (medicationName) break;
  }

  // Extract reason for intolerance/discontinuation
  if (action === 'intolerance' || action === 'discontinued') {
    const reasonMatches = INTOLERANCE_REASONS.filter(r => lower.includes(r));
    if (reasonMatches.length > 0) {
      reason = reasonMatches.join(', ');
      action = 'intolerance'; // Upgrade to intolerance if we have symptoms
      actionConfidence = 0.9;
    }
    
    // Extract "wegen X" reason
    const wegenMatch = lower.match(/wegen\s+(.+?)(?:\s*[.,]|$)/);
    if (wegenMatch) {
      reason = wegenMatch[1].trim();
    }
  }

  return {
    medicationName,
    medicationNameConfidence,
    action,
    actionConfidence,
    reason,
    notes: transcript
  };
}

/**
 * Findet beste Medikamenten-Übereinstimmung
 */
function findBestMedicationMatch(
  searchTerm: string,
  userMeds: Array<{ name: string }>
): { name: string; confidence: number } | null {
  const lowerSearch = searchTerm.toLowerCase();
  
  // Exact match
  const exactMatch = userMeds.find(m => m.name.toLowerCase() === lowerSearch);
  if (exactMatch) return { name: exactMatch.name, confidence: 0.95 };
  
  // Starts with
  const startsWithMatch = userMeds.find(m => 
    m.name.toLowerCase().startsWith(lowerSearch) ||
    lowerSearch.startsWith(m.name.toLowerCase().substring(0, 4))
  );
  if (startsWithMatch) return { name: startsWithMatch.name, confidence: 0.85 };
  
  // Contains
  const containsMatch = userMeds.find(m => 
    m.name.toLowerCase().includes(lowerSearch) ||
    lowerSearch.includes(m.name.toLowerCase())
  );
  if (containsMatch) return { name: containsMatch.name, confidence: 0.75 };
  
  // Fuzzy match
  let bestFuzzy: { name: string; confidence: number } | null = null;
  for (const med of userMeds) {
    const distance = levenshteinDistance(lowerSearch, med.name.toLowerCase());
    const maxLen = Math.max(lowerSearch.length, med.name.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity > 0.6 && (!bestFuzzy || similarity > bestFuzzy.confidence)) {
      bestFuzzy = { name: med.name, confidence: similarity };
    }
  }
  
  return bestFuzzy;
}

/**
 * Extrahiert strukturierte Pain Entry Daten
 */
function extractPainEntry(
  transcript: string,
  userContext: VoiceUserContext
): VoicePainEntry {
  // Nutze bestehenden germanParser
  const parsed = parseGermanVoiceEntry(transcript, userContext.userMeds);

  // Mappe auf neue Struktur mit Confidences
  const painLevel = parsed.painLevel ? Number(parsed.painLevel) : undefined;
  const painLevelConfidence = painLevel ? calculatePainLevelConfidence(transcript, painLevel) : 0.0;

  // Medications mit Fuzzy Matching + Confidence
  const medications = extractMedicationsWithConfidence(
    transcript, 
    userContext.userMeds,
    parsed.medications || []
  );

  // Zeitpunkt - WICHTIG: isNow Flag beibehalten!
  // Wenn isNow=true (kein expliziter Zeitpunkt genannt), setzen wir occurredAt auf undefined
  // Damit die UI weiß, dass "jetzt" verwendet werden soll
  let occurredAt: string | undefined;
  const isNow = parsed.isNow;
  
  if (!isNow && parsed.selectedDate && parsed.selectedTime) {
    // Explizite Zeit wurde genannt -> occurredAt setzen
    occurredAt = `${parsed.selectedDate}T${parsed.selectedTime}:00`;
  } else {
    // isNow=true oder keine Zeit erkannt -> occurredAt bleibt undefined
    // Die UI wird dann "jetzt" als Default verwenden
    occurredAt = undefined;
  }
  
  const occurredAtConfidence = calculateTimeConfidence(transcript);

  // Notes: Resttext der nicht in Struktur passt
  const notes = transcript; // Vereinfacht, könnte noch bereinigt werden

  return {
    painLevel,
    painLevelConfidence,
    medications,
    occurredAt,
    occurredAtConfidence,
    notes,
    isNow // WICHTIG: isNow Flag weitergeben!
  };
}

/**
 * Extrahiert strukturierte Reminder Daten
 */
function extractReminder(
  transcript: string,
  userContext: VoiceUserContext
): VoiceReminder {
  // Nutze bestehenden reminderParser
  const parsed = parseGermanReminderEntry(transcript, userContext.userMeds);

  // Medications mit Confidence
  const medications = parsed.medications 
    ? extractMedicationsWithConfidence(transcript, userContext.userMeds, parsed.medications)
    : undefined;

  return {
    type: parsed.type,
    title: parsed.title,
    date: parsed.date,
    time: parsed.time,
    timeOfDay: parsed.timeOfDay || undefined,
    repeat: parsed.repeat,
    medications,
    notes: parsed.notes
  };
}

/**
 * Extrahiert Medikamente mit Fuzzy Matching und Confidence
 */
function extractMedicationsWithConfidence(
  transcript: string,
  userMeds: Array<{ name: string }>,
  parsedMeds: string[]
): VoiceMed[] {
  const lower = transcript.toLowerCase();
  const results: VoiceMed[] = [];

  for (const parsedMed of parsedMeds) {
    // Exakte Übereinstimmung?
    const exactMatch = userMeds.find(
      m => m.name.toLowerCase() === parsedMed.toLowerCase()
    );

    if (exactMatch) {
      results.push({
        name: exactMatch.name,
        confidence: 0.95,
        confidenceLevel: 'high'
      });
      continue;
    }

    // Substring-Match?
    const substringMatch = userMeds.find(
      m => lower.includes(m.name.toLowerCase())
    );

    if (substringMatch) {
      results.push({
        name: substringMatch.name,
        confidence: 0.8,
        confidenceLevel: 'medium'
      });
      continue;
    }

    // Fuzzy Match (einfache Levenshtein-Näherung)
    const fuzzyMatch = findFuzzyMatch(parsedMed, userMeds);
    if (fuzzyMatch) {
      results.push({
        name: fuzzyMatch.name,
        confidence: fuzzyMatch.confidence,
        confidenceLevel: fuzzyMatch.confidence > 0.7 ? 'medium' : 'low'
      });
    }
  }

  return results;
}

/**
 * Einfaches Fuzzy Matching für Medikamente
 */
function findFuzzyMatch(
  medName: string,
  userMeds: Array<{ name: string }>
): { name: string; confidence: number } | null {
  let bestMatch: { name: string; confidence: number } | null = null;
  const lowerMed = medName.toLowerCase();

  for (const userMed of userMeds) {
    const lowerUserMed = userMed.name.toLowerCase();
    
    // Levenshtein-Distanz berechnen (vereinfacht)
    const distance = levenshteinDistance(lowerMed, lowerUserMed);
    const maxLen = Math.max(lowerMed.length, lowerUserMed.length);
    const similarity = 1 - (distance / maxLen);

    if (similarity > 0.6 && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = {
        name: userMed.name,
        confidence: similarity
      };
    }
  }

  return bestMatch;
}

/**
 * Levenshtein-Distanz (Editier-Distanz)
 * Re-exported from germanParser for consistency
 */
export { levenshteinDistance, calculateSimilarity } from './germanParser';

/**
 * Berechnet Confidence für Pain Level
 */
function calculatePainLevelConfidence(transcript: string, painLevel?: number): number {
  if (!painLevel) return 0.0;

  const lower = transcript.toLowerCase();

  // Explizite Zahlen = hohe Confidence
  if (/stärke\s*[0-9]|level\s*[0-9]|[0-9]\s*von\s*10/.test(lower)) {
    return 0.95;
  }

  // Zahlwörter = mittlere Confidence
  if (/eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn/.test(lower)) {
    return 0.85;
  }

  // Adjektive = niedrigere Confidence
  if (/leicht|mittel|stark/.test(lower)) {
    return 0.7;
  }

  return 0.6;
}

/**
 * Berechnet Confidence für Zeitangaben
 */
function calculateTimeConfidence(transcript: string): number {
  const lower = transcript.toLowerCase();

  // Explizite Uhrzeiten = hoch
  if (/\d{1,2}:\d{2}|um\s*\d{1,2}\s*uhr/.test(lower)) {
    return 0.95;
  }

  // Relative Zeiten mit Zahlen = mittel-hoch
  if (/vor\s*\d+\s*(minute|stunde|tag)/.test(lower)) {
    return 0.85;
  }

  // Tageszeiten = mittel
  if (/gestern|heute|morgen|vormittag|nachmittag|abend/.test(lower)) {
    return 0.75;
  }

  // "jetzt" = hoch
  if (/jetzt|gerade|eben/.test(lower)) {
    return 0.9;
  }

  // Keine klare Zeitangabe
  return 0.5;
}

/**
 * Confidence-Level als Text
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}
