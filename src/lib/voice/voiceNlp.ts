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
  ConfidenceLevel
} from '@/types/voice.types';
import { parseGermanVoiceEntry } from './germanParser';
import { parseGermanReminderEntry, isReminderTrigger } from './reminderParser';
import { parseOccurredAt } from './timeOnly';

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
  const { intent, intentConfidence } = classifyIntent(transcript);
  console.log(`🎯 Intent: ${intent} (confidence: ${intentConfidence})`);

  // 2. Strukturierte Daten je nach Intent extrahieren
  let painEntry: VoicePainEntry | undefined;
  let reminder: VoiceReminder | undefined;

  switch (intent) {
    case 'pain_entry':
      painEntry = extractPainEntry(transcript, userContext);
      break;
    
    case 'reminder':
      reminder = extractReminder(transcript, userContext);
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
    rawTranscript: transcript,
    sttConfidence
  };
}

/**
 * Klassifiziert den Intent des Transkripts
 */
function classifyIntent(transcript: string): { 
  intent: VoiceIntent; 
  intentConfidence: number 
} {
  const lower = transcript.toLowerCase();

  // 1. Check: Reminder-Trigger?
  if (isReminderTrigger(transcript)) {
    return { intent: 'reminder', intentConfidence: 0.9 };
  }

  // 2. Check: Pain Entry Indikatoren
  const painIndicators = [
    'schmerz', 'kopfschmerz', 'migräne',
    'stärke', 'level', 'intensität',
    /\b[0-9]|zehn\b/, // Zahlen
    'leicht', 'mittel', 'stark'
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

  // 3. Fallback: Note
  // Wenn keine klaren Indikatoren, aber Text vorhanden
  if (transcript.trim().length > 5) {
    return { intent: 'note', intentConfidence: 0.7 };
  }

  return { intent: 'unknown', intentConfidence: 0.3 };
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
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

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
