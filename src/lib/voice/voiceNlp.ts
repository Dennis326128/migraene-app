/**
 * Voice NLP - Natural Language Processing für Voice-Eingaben
 * Analysiert Transkripte und extrahiert strukturierte Daten
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

  // 1. Intent-Klassifikation
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
 */
function classifyIntent(
  transcript: string,
  userContext: VoiceUserContext
): { 
  intent: VoiceIntent; 
  intentConfidence: number 
} {
  const lower = transcript.toLowerCase();

  // 0. Check: Analytics Query? (Fragen zu Statistiken)
  if (isAnalyticsQuestion(lower)) {
    return { intent: 'analytics_query', intentConfidence: 0.9 };
  }

  // 0.5. Check: Add Medication Trigger? (BEFORE pain entry check)
  // But ONLY if there are NO pain indicators - otherwise it's a pain entry with meds
  const hasPainContext = /\b(schmerz|kopfschmerz|migräne|stärke|level|intensität|attacke|anfall)\b/i.test(lower);
  const hasTimeContext = /\b(vor|seit|gestern|heute|jetzt|gerade|genommen|eingenommen)\b/i.test(lower);
  
  if (isAddMedicationTrigger(transcript) && !hasPainContext && !hasTimeContext) {
    const parsed = parseAddMedicationCommand(transcript);
    if (parsed && parsed.name.length >= 2) {
      return { intent: 'add_medication', intentConfidence: parsed.confidence };
    }
  }

  // 1. Check: Medication Update Trigger? (Höchste Priorität für Medikamenten-Änderungen)
  const medUpdateMatch = detectMedicationUpdateIntent(lower, userContext);
  if (medUpdateMatch.confidence > 0.7) {
    return { intent: 'medication_update', intentConfidence: medUpdateMatch.confidence };
  }

  // 1.5. Check: Medication Effect Rating? (Bewertung der Wirksamkeit)
  if (isMedicationEffectRating(lower)) {
    return { intent: 'medication_effect', intentConfidence: 0.85 };
  }

  // 2. Check: Reminder-Trigger?
  if (isReminderTrigger(transcript)) {
    return { intent: 'reminder', intentConfidence: 0.9 };
  }

  // 3. Check: Pain Entry Indikatoren
  const painIndicators = [
    'schmerz', 'kopfschmerz', 'migräne',
    'stärke', 'level', 'intensität',
    /\b[0-9]|zehn\b/, // Zahlen
    'leicht', 'mittel', 'stark',
    'attacke', 'anfall'
  ];

  const hasPainIndicator = painIndicators.some(indicator => {
    if (typeof indicator === 'string') {
      return lower.includes(indicator);
    }
    return indicator.test(lower);
  });

  if (hasPainIndicator) {
    return { intent: 'pain_entry', intentConfidence: 0.85 };
  }

  // 4. Fallback: Note
  if (transcript.trim().length > 5) {
    return { intent: 'note', intentConfidence: 0.7 };
  }

  return { intent: 'unknown', intentConfidence: 0.3 };
}

/**
 * Erkennt Analytics-Fragen / Q&A Intent
 * Verbessert: Erkennt W-Fragen, Fragezeichen, und typische Frage-Phrasen
 */
function isAnalyticsQuestion(lower: string): boolean {
  // 1. Check for question mark
  if (lower.includes('?')) {
    // If question mark present and health/data topic mentioned, it's likely a question
    const healthTopics = [
      'migräne', 'kopfschmerz', 'schmerz', 'medikament', 'triptan', 
      'tag', 'tage', 'woche', 'monat', 'einnahme', 'anfall', 'attacke'
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
  
  // 3. W-Fragen irgendwo mit Health Context
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
  
  // 4. Analytik-Keywords
  const analyticsTriggers = [
    /zähl/,
    /durchschnitt/,
    /statistik/,
    /auswertung/,
    /analyse/,
    /übersicht/,
  ];
  if (analyticsTriggers.some(p => p.test(lower))) {
    return true;
  }
  
  // 5. Typische Frage-Phrasen
  const questionPhrases = [
    'kannst du',
    'könntest du',
    'zeige mir',
    'zeig mir',
    'analysiere',
    'analysier',
    'erklär',
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
    // Also needs health context
    const healthTopics = ['migräne', 'kopfschmerz', 'schmerz', 'medikament', 'triptan', 'tag', 'einnahme'];
    if (healthTopics.some(t => lower.includes(t))) {
      return true;
    }
  }
  
  // 6. Legacy pattern: Question pattern + topic (original logic)
  const legacyPatterns = [
    /wie\s*(?:viele?|oft)/,
    /wieviele?/,
  ];
  const hasLegacyQuestion = legacyPatterns.some(p => p.test(lower));
  if (hasLegacyQuestion) {
    const topics = [
      'triptan', 'sumatriptan', 'rizatriptan', 'zolmitriptan',
      'schmerzmittel', 'ibuprofen', 'paracetamol',
      'migräne', 'kopfschmerz',
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
  
  // Migräne-Tage
  if (/migräne.?tag|kopfschmerz.?tag|wie\s*(?:viele?|oft)\s*(?:migräne|kopfschmerz)/.test(lower)) {
    return {
      queryType: 'migraine_days',
      timeRangeDays,
      confidence: 0.9
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
 */
function extractAddMedication(transcript: string): VoiceAddMedication | undefined {
  const parsed = parseAddMedicationCommand(transcript);
  if (!parsed) return undefined;
  
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

  // Zeitpunkt
  const occurredAt = parsed.selectedDate && parsed.selectedTime
    ? `${parsed.selectedDate}T${parsed.selectedTime}:00`
    : new Date().toISOString();
  
  const occurredAtConfidence = calculateTimeConfidence(transcript);

  // Notes: Resttext der nicht in Struktur passt
  const notes = transcript; // Vereinfacht, könnte noch bereinigt werden

  return {
    painLevel,
    painLevelConfidence,
    medications,
    occurredAt,
    occurredAtConfidence,
    notes
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
