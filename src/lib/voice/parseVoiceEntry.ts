/**
 * parseVoiceEntry.ts
 * Unified Voice-Parser-Pipeline für Migräne-Tracking.
 * Ersetzt simpleVoiceParser.ts und integriert heuristicDraftEngine.ts.
 *
 * Kein LLM – rein regex/fuzzy-basiert.
 * Span-basierter Ansatz: Jede Extraktion merkt sich Start/End-Index.
 * extractNote() gibt den verbleibenden Text als Notiz zurück.
 */

import {
  SYMPTOM_MAP,
  LOCATION_MAP,
  AURA_MAP,
  MECFS_MAP,
  PRIVATE_TRIGGERS,
  FILLER_WORDS,
  NEGATION_WORDS,
  NOW_WORDS,
  NEW_ENTRY_TRIGGERS,
  CONTEXT_ENTRY_TRIGGERS,
  PAIN_DESCRIPTOR_MAP,
  PAIN_LEVEL_PATTERNS,
  NUMBER_WORD_MAP,
  DOSE_WORD_MAP,
  TABLET_WORDS,
  SPRAY_WORDS,
  CORRECTION_TRIGGERS,
} from './voiceGrammar';

import {
  normalizeText,
  levenshtein,
  jaroWinkler,
  matchMedication,
  matchSymptom,
  matchLocation,
  matchAura,
  spansOverlap,
  removeSpans,
  findAllSpans,
  MedEntry,
} from './voiceFuzzyMatcher';

import {
  parseTimeExpression,
  ParsedTime,
} from './voiceTimeParser';

// ============================================================
// === TYPEN ===
// ============================================================

export type { MedEntry };

export interface ParsedMedication {
  name: string;
  medicationId?: string;
  doseQuarters: number;
  doseText: string;
  takenTime?: string;    // HH:mm — wenn pro Medikament gesagt
  takenDate?: string;    // YYYY-MM-DD
  confidence: number;
  needsReview: boolean;
  matchType: 'exact' | 'fuzzy' | 'prefix' | 'synonym';
}

export interface UncertainField {
  field: string;
  value: string;
  confidence: number;
  alternatives?: string[];
}

export interface VoiceParseResult {
  // Kern-Felder
  entry_type: 'new_entry' | 'context_entry';
  confidence: number;
  raw_text: string;

  // Zeit
  occurredAt: {
    date: string;
    time: string;
    displayText?: string;
    confidence: number;
    isDefault: boolean;
  };

  // Schmerz
  painLevel: number | null;
  painLevelConfidence: number;
  painLevelDisplay: string;

  // Lokalisation
  painLocations: string[];
  locationsConfidence: number;

  // Aura
  auraType: string | null;
  auraConfidence: number;

  // Medikamente
  medications: ParsedMedication[];

  // Symptome
  symptoms: string[];
  symptomsConfidence: number;

  // ME/CFS
  meCfsLevel: string | null;
  meCfsConfidence: number;

  // Privat-Flag
  isPrivate: boolean;

  // Notiz
  note: string;

  // Review-Hints
  needsReview: boolean;
  uncertainFields: UncertainField[];
}

// ============================================================
// === INTERNER HELFER: SPAN-VERWALTUNG ===
// ============================================================

/** Zusammengeführte Span-Liste (keine Überschneidungen) */
function mergeSpans(spans: [number, number][]): [number, number][] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (current[0] <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], current[1])];
    } else {
      merged.push(current);
    }
  }
  return merged;
}

// ============================================================
// === ENTRY TYPE KLASSIFIKATION ===
// ============================================================

/**
 * Klassifiziert ob der Eintrag ein neuer Eintrag oder ein Kontext-Eintrag ist.
 * new_entry: Neue Migräne-Attacke / neuer Schmerzmoment
 * context_entry: Ergänzung zu bestehendem Eintrag
 */
export function classifyEntryType(
  tokens: string[]
): { type: 'new_entry' | 'context_entry'; confidence: number } {
  const text = tokens.join(' ').toLowerCase();

  let contextScore = 0;
  let newScore = 0;

  for (const trigger of CONTEXT_ENTRY_TRIGGERS) {
    if (text.includes(normalizeText(trigger))) contextScore += 1;
  }

  for (const trigger of NEW_ENTRY_TRIGGERS) {
    if (text.includes(normalizeText(trigger))) newScore += 1;
  }

  // Schmerzwörter → new_entry
  if (/\bkopfschmerz|\bmigräne|\battacke|\bschmerz\b/i.test(text)) newScore += 2;
  // Ergänzungs-Konjunktionen
  if (/^(außerdem|auch|dazu|noch)\b/.test(text.trim())) contextScore += 2;

  if (contextScore > newScore) {
    return { type: 'context_entry', confidence: Math.min(0.85 + contextScore * 0.05, 0.95) };
  }
  return { type: 'new_entry', confidence: Math.min(0.75 + newScore * 0.05, 0.95) };
}

// ============================================================
// === SCHMERZSTÄRKE PARSEN ===
// ============================================================

/**
 * Erkennt Schmerzstärke (0-10) im Text.
 * Gibt Wert, Confidence und den erkannten Span zurück.
 */
export function parsePainLevel(text: string): {
  value: number | null;
  confidence: number;
  display: string;
  spanStart: number;
  spanEnd: number;
} {
  const norm = text.toLowerCase();

  // --- Negations-Guard ---
  // "keine Schmerzen" → 0 (explizit), NICHT null
  {
    const pattern = /\bkeine?\s+schmerzen?\b/i;
    const m = pattern.exec(norm);
    if (m) {
      return {
        value: 0,
        confidence: 0.90,
        display: 'keine Schmerzen',
        spanStart: m.index,
        spanEnd: m.index + m[0].length,
      };
    }
  }

  // --- Pattern 1: Strukturierte Angaben ("X von 10", "X/10", "Stärke X") ---
  for (const pattern of PAIN_LEVEL_PATTERNS) {
    const m = pattern.exec(norm);
    if (m) {
      const rawVal = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(rawVal) && rawVal >= 0 && rawVal <= 10) {
        return {
          value: Math.round(rawVal),
          confidence: 0.95,
          display: `${Math.round(rawVal)}/10`,
          spanStart: m.index,
          spanEnd: m.index + m[0].length,
        };
      }
    }
  }

  // --- Pattern 2: "Schmerz X" mit Zahl (isoliertes Wort) ---
  {
    const pattern = /\b(?:schmerz(?:en)?|kopfschmerz(?:en)?|stärke|niveau|level)\s+(\d{1,2})\b/i;
    const m = pattern.exec(norm);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 0 && val <= 10) {
        return {
          value: val,
          confidence: 0.92,
          display: `${val}/10`,
          spanStart: m.index,
          spanEnd: m.index + m[0].length,
        };
      }
    }
  }

  // --- Pattern 3: Einzelne Zahl (1-10) als Wort oder Ziffer ---
  // Priorität: Zahlen die nach Schmerz-Kontext-Wörtern kommen
  {
    const contextPattern = /\b(?:schmerz|kopfschmerz|stärke|niveau|level|migräne)\b[\s,]+(\w+)\b/i;
    const m = contextPattern.exec(norm);
    if (m) {
      const numVal = parseInt(m[1], 10);
      const wordVal = NUMBER_WORD_MAP[normalizeText(m[1])];
      const val = !isNaN(numVal) ? numVal : wordVal;
      if (val !== undefined && val >= 0 && val <= 10) {
        return {
          value: val,
          confidence: 0.88,
          display: `${val}/10`,
          spanStart: m.index,
          spanEnd: m.index + m[0].length,
        };
      }
    }
  }

  // --- Pattern 4: Isolierte Zahl (hohe Ambiguität) ---
  // Nur als Schmerzstärke interpretieren wenn keine bessere Erklärung
  {
    // Standalone-Zahl (nicht in Uhrzeit, nicht in Dosis-Kontext)
    const pattern = /(?<![:\d])(?<!\bum\s)(?<!\bgegen\s)\b([0-9]|10)\b(?!\s*(?:uhr|:|minuten?|stunden?|mg|ml|tablette))/i;
    const m = pattern.exec(norm);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 0 && val <= 10) {
        return {
          value: val,
          confidence: 0.65,
          display: `${val}/10`,
          spanStart: m.index,
          spanEnd: m.index + m[0].length,
        };
      }
    }
  }

  // --- Pattern 5: Deskriptoren ---
  // Längste Phrase zuerst (z.B. "sehr stark" vor "stark")
  const sortedDescriptors = Object.entries(PAIN_DESCRIPTOR_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [phrase, value] of sortedDescriptors) {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      // Guard: Negation davor?
      const before = norm.slice(Math.max(0, m.index - 15), m.index);
      if (/\bkein(?:e|er|es)?\b|\bnicht\b/.test(before)) continue;

      // Guard: Kontext-Prüfung – ist das im Schmerz-Kontext?
      const context = norm.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
      const isPainContext = /schmerz|kopf|migräne|attacke|weh|tut/.test(context);
      const confidence = isPainContext ? 0.82 : 0.68;

      return {
        value,
        confidence,
        display: phrase,
        spanStart: m.index,
        spanEnd: m.index + m[0].length,
      };
    }
  }

  return {
    value: null,
    confidence: 0,
    display: '',
    spanStart: 0,
    spanEnd: 0,
  };
}

// ============================================================
// === SCHMERZLOKALISATION PARSEN ===
// ============================================================

/**
 * Erkennt alle Schmerz-Lokalisationen im Text.
 */
export function parsePainLocations(text: string): {
  locations: string[];
  confidence: number;
  spans: [number, number][];
} {
  const norm = text.toLowerCase();
  const foundLocations = new Map<string, { confidence: number; span: [number, number] }>();
  const spans: [number, number][] = [];

  // Window-basiertes Matching: Text in Chunks aufteilen und gegen LOCATION_MAP matchen
  for (const [locationId, phrases] of Object.entries(LOCATION_MAP)) {
    for (const phrase of phrases) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
      const m = pattern.exec(norm);
      if (m) {
        // Negations-Guard
        const before = norm.slice(Math.max(0, m.index - 20), m.index);
        if (/\bnicht\b|\bkeine?\b|\bohne\b/.test(before)) continue;

        const existing = foundLocations.get(locationId);
        const score = 0.90;
        if (!existing || score > existing.confidence) {
          foundLocations.set(locationId, {
            confidence: score,
            span: [m.index, m.index + m[0].length],
          });
        }
      }
    }
  }

  // Fuzzy-Matching für nicht direkt erkannte Phrasen
  const tokens = norm.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 3) continue;

    // Token-Position schätzen
    let tokenStart = 0;
    let pos = 0;
    for (let j = 0; j < i; j++) {
      pos += tokens[j].length + 1;
    }
    tokenStart = pos;

    const match = matchLocation(token);
    if (match && !foundLocations.has(match.locationId)) {
      foundLocations.set(match.locationId, {
        confidence: match.confidence * 0.9, // leicht reduziert für Fuzzy
        span: [tokenStart, tokenStart + token.length],
      });
    }
  }

  const locations: string[] = [];
  let totalConfidence = 0;

  for (const [locationId, data] of foundLocations) {
    locations.push(locationId);
    spans.push(data.span);
    totalConfidence += data.confidence;
  }

  const avgConfidence = locations.length > 0 ? totalConfidence / locations.length : 0;

  return { locations, confidence: avgConfidence, spans };
}

// ============================================================
// === AURA-TYP PARSEN ===
// ============================================================

/**
 * Erkennt den Aura-Typ im Text.
 */
export function parseAuraType(text: string): {
  auraType: string | null;
  confidence: number;
  span: [number, number] | null;
} {
  const norm = text.toLowerCase();

  // "keine Aura" explizit
  {
    const pattern = /\bkeine?\s+aura\b/i;
    const m = pattern.exec(norm);
    if (m) {
      return {
        auraType: 'keine',
        confidence: 0.95,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // Direktes Matching gegen AURA_MAP
  for (const [auraType, phrases] of Object.entries(AURA_MAP)) {
    for (const phrase of phrases) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
      const m = pattern.exec(norm);
      if (m) {
        return {
          auraType,
          confidence: 0.90,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  // Fuzzy-Matching Token für Token
  const tokens = norm.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4) continue;

    const match = matchAura(token);
    if (match && match.confidence >= 0.82) {
      let tokenStart = 0;
      for (let j = 0; j < i; j++) {
        tokenStart += tokens[j].length + 1;
      }
      return {
        auraType: match.auraType,
        confidence: match.confidence * 0.88,
        span: [tokenStart, tokenStart + token.length],
      };
    }
  }

  return { auraType: null, confidence: 0, span: null };
}

// ============================================================
// === SYMPTOME PARSEN ===
// ============================================================

/**
 * Erkennt alle Begleitsymptome im Text.
 */
export function parseSymptoms(text: string): {
  symptoms: string[];
  confidence: number;
  spans: [number, number][];
} {
  const norm = text.toLowerCase();
  const foundSymptoms = new Map<string, { confidence: number; span: [number, number] }>();

  // Direktes Matching gegen SYMPTOM_MAP
  for (const [symptomId, phrases] of Object.entries(SYMPTOM_MAP)) {
    // Längste Phrase zuerst (spezifischer vor allgemeiner)
    const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);

    for (const phrase of sortedPhrases) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
      const m = pattern.exec(norm);
      if (!m) continue;

      // Negations-Guard: ±3 Tokens vor dem Match
      const textBefore = norm.slice(Math.max(0, m.index - 25), m.index);
      const hasNegation = NEGATION_WORDS.some(neg => {
        const negPattern = new RegExp(`\\b${neg}\\b`, 'i');
        return negPattern.test(textBefore);
      });
      if (hasNegation) continue;

      const existing = foundSymptoms.get(symptomId);
      if (!existing || 0.90 > existing.confidence) {
        foundSymptoms.set(symptomId, {
          confidence: 0.90,
          span: [m.index, m.index + m[0].length],
        });
        break; // Erstes/bestes Match für dieses Symptom gefunden
      }
    }
  }

  // Fuzzy-Matching für nicht direkt erkannte Symptome
  const tokens = norm.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4) continue;

    // Token-Position
    let tokenStart = 0;
    for (let j = 0; j < i; j++) {
      tokenStart += tokens[j].length + 1;
    }

    // Negations-Check für diesen Token
    const hasPrevNeg = NEGATION_WORDS.some(neg =>
      i > 0 && normalizeText(tokens[i - 1]) === normalizeText(neg)
    );
    const hasPrev2Neg = NEGATION_WORDS.some(neg =>
      i > 1 && normalizeText(tokens[i - 2]) === normalizeText(neg)
    );
    if (hasPrevNeg || hasPrev2Neg) continue;

    const match = matchSymptom(token);
    if (match && match.confidence >= 0.82 && !foundSymptoms.has(match.symptomId)) {
      foundSymptoms.set(match.symptomId, {
        confidence: match.confidence * 0.88,
        span: [tokenStart, tokenStart + token.length],
      });
    }
  }

  const symptoms: string[] = [];
  const spans: [number, number][] = [];
  let totalConfidence = 0;

  for (const [symptomId, data] of foundSymptoms) {
    symptoms.push(symptomId);
    spans.push(data.span);
    totalConfidence += data.confidence;
  }

  const avgConfidence = symptoms.length > 0 ? totalConfidence / symptoms.length : 0;

  return { symptoms, confidence: avgConfidence, spans };
}

// ============================================================
// === ME/CFS PARSEN ===
// ============================================================

/**
 * Erkennt ME/CFS-Level im Text.
 */
export function parseMeCfs(text: string): {
  level: string | null;
  confidence: number;
  span: [number, number] | null;
} {
  const norm = text.toLowerCase();

  // "ME/CFS" als Kontext-Marker
  const hasMeCfsContext = /\bme[\s/]?cfs\b|\bmyalgische\b|\bchronische\s+erschöpf/i.test(norm);

  // Direktes Matching
  for (const [level, phrases] of Object.entries(MECFS_MAP)) {
    const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of sortedPhrases) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
      const m = pattern.exec(norm);
      if (m) {
        const confidence = hasMeCfsContext ? 0.90 : 0.72;
        return {
          level,
          confidence,
          span: [m.index, m.index + m[0].length],
        };
      }
    }
  }

  return { level: null, confidence: 0, span: null };
}

// ============================================================
// === MEDIKAMENTE PARSEN ===
// ============================================================

/**
 * Erkennt Medikamente mit Dosis und optionalem Zeitpunkt im Text.
 */
export function parseMedications(
  text: string,
  lexicon: MedEntry[],
  globalTime: ParsedTime
): ParsedMedication[] {
  const medications: ParsedMedication[] = [];
  const norm = text.toLowerCase();

  // Text in Segmente aufteilen (durch Konjunktionen/Kommata)
  // Jedes Segment wird separat auf Medikament + Dosis + Zeit gescannt
  const segments = splitIntoMedSegments(text);

  for (const segment of segments) {
    const segNorm = segment.text.toLowerCase();

    // --- Medikamenten-Name finden ---
    // Tokenisieren und jedes Token/Bigramm/Trigramm testen
    const tokens = segNorm.split(/\s+/);
    let medMatch = null;

    // Bigramme/Trigramme zuerst (längere Matches bevorzugen)
    for (let window = 3; window >= 1; window--) {
      for (let i = 0; i <= tokens.length - window; i++) {
        const phrase = tokens.slice(i, i + window).join(' ');
        const match = matchMedication(phrase, lexicon);
        if (match && (!medMatch || match.confidence > medMatch.confidence)) {
          medMatch = { ...match, tokenStart: i, tokenEnd: i + window };
        }
      }
      if (medMatch && medMatch.confidence >= 0.85) break;
    }

    if (!medMatch) continue;

    // Negations-Guard
    const medTokenStart = (medMatch as any).tokenStart ?? 0;
    const hasPrevNeg = NEGATION_WORDS.some(neg =>
      medTokenStart > 0 && normalizeText(tokens[medTokenStart - 1]) === normalizeText(neg)
    );
    if (hasPrevNeg) continue;

    // --- Dosis erkennen ---
    const doseResult = parseDose(segNorm);

    // --- Per-Medikament-Zeitpunkt ---
    let takenTime: string | undefined;
    let takenDate: string | undefined;

    const segTime = parseTimeExpression(segment.text);
    if (!segTime.isDefault) {
      takenTime = segTime.time;
      takenDate = segTime.date;
    } else {
      // Global-Zeit verwenden
      takenTime = globalTime.time;
      takenDate = globalTime.date;
    }

    // Korrektur-Guard: "nein ich meine ..."
    // Wird in der Haupt-Pipeline behandelt

    const med: ParsedMedication = {
      name: medMatch.medEntry.name,
      medicationId: medMatch.medEntry.id,
      doseQuarters: doseResult.quarters,
      doseText: doseResult.text,
      takenTime,
      takenDate,
      confidence: medMatch.confidence,
      needsReview: medMatch.needsReview,
      matchType: medMatch.matchType,
    };

    medications.push(med);
  }

  return medications;
}

// ---- Hilfsfunktion: Text in Medikamenten-Segmente aufteilen ----

interface TextSegment {
  text: string;
  start: number;
  end: number;
}

function splitIntoMedSegments(text: string): TextSegment[] {
  // Segmente durch Trennwörter/Satzzeichen
  // "und", "sowie", ",", "dann", "danach", "außerdem", "dazu"
  const splitPattern = /\b(?:und\s+dann|danach|anschließend|dann|sowie|außerdem|zusätzlich)\b|[,;]/gi;
  const segments: TextSegment[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = splitPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index).trim(),
        start: lastIndex,
        end: match.index,
      });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex).trim(),
      start: lastIndex,
      end: text.length,
    });
  }

  // Wenn keine Splits → gesamten Text als ein Segment
  if (segments.length === 0) {
    segments.push({ text: text.trim(), start: 0, end: text.length });
  }

  return segments.filter(s => s.text.length > 0);
}

// ---- Hilfsfunktion: Dosis parsen ----

interface DoseResult {
  quarters: number;
  text: string;
  span: [number, number] | null;
}

function parseDose(segText: string): DoseResult {
  const norm = segText.toLowerCase();

  // "X mg" → als Text speichern, nicht in Quarters
  {
    const pattern = /\b(\d+(?:[.,]\d+)?)\s*mg\b/i;
    const m = pattern.exec(norm);
    if (m) {
      return { quarters: 4, text: `${m[1]} mg`, span: [m.index, m.index + m[0].length] };
    }
  }

  // "X ml"
  {
    const pattern = /\b(\d+(?:[.,]\d+)?)\s*ml\b/i;
    const m = pattern.exec(norm);
    if (m) {
      return { quarters: 4, text: `${m[1]} ml`, span: [m.index, m.index + m[0].length] };
    }
  }

  // Sprühstöße
  for (const sprayWord of SPRAY_WORDS) {
    const escapedSprayWord = sprayWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `\\b(\\w+)\\s+${escapedSprayWord}|${escapedSprayWord}(?:n)?\\s+(\\w+)|\\b(ein|einen|zwei|drei)\\s+${escapedSprayWord}`,
      'i'
    );
    const m = pattern.exec(norm);
    if (m) {
      const countToken = m[1] ?? m[2] ?? m[3] ?? 'ein';
      const count = parseDoseNumber(countToken);
      if (count !== null) {
        return {
          quarters: count * 4,
          text: `${countToken} ${sprayWord}`,
          span: [m.index, m.index + m[0].length],
        };
      }
      return { quarters: 4, text: `1 ${sprayWord}`, span: null };
    }
  }

  // Tabletten-Wörter
  for (const tabletWord of TABLET_WORDS) {
    const escapedTabletWord = tabletWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `\\b(anderthalb|eineinhalb|ein(?:e[rns]?)?|zwei|drei|halb(?:e[rns]?)?|ganz(?:e[rns]?)?|viertel|ein\\s+viertel)\\s+${escapedTabletWord}`,
      'i'
    );
    const m = pattern.exec(norm);
    if (m) {
      const countToken = normalizeText(m[1]);
      const quarters = DOSE_WORD_MAP[countToken] ?? 4;
      return {
        quarters,
        text: `${m[1]} ${tabletWord}`,
        span: [m.index, m.index + m[0].length],
      };
    }
  }

  // Allgemeine Dosis-Wörter
  const sortedDoseWords = Object.entries(DOSE_WORD_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, quarters] of sortedDoseWords) {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      // Kontext: Muss in Medikamenten-Nähe sein
      const context = norm.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
      const medContext = TABLET_WORDS.some(tw => context.includes(tw)) ||
                         SPRAY_WORDS.some(sw => context.includes(sw));
      if (medContext) {
        return { quarters, text: phrase, span: [m.index, m.index + m[0].length] };
      }
    }
  }

  return { quarters: 4, text: '1 Tablette', span: null };
}

function parseDoseNumber(token: string): number | null {
  const normToken = normalizeText(token);
  if (normToken in DOSE_WORD_MAP) return DOSE_WORD_MAP[normToken] / 4;
  const num = parseInt(normToken, 10);
  if (!isNaN(num)) return num;
  return null;
}

// ============================================================
// === NOTIZ EXTRAHIEREN ===
// ============================================================

/**
 * Entfernt alle genutzten Spans und Füllwörter aus dem Text.
 * Gibt den bereinigten Rest als Notiz zurück.
 */
export function extractNote(
  text: string,
  usedSpans: [number, number][]
): string {
  // Spans zusammenführen (keine Überschneidungen)
  const merged = mergeSpans(usedSpans);

  // Spans aus Text entfernen
  let note = removeSpans(text, merged);

  // Füllwörter entfernen
  for (const filler of FILLER_WORDS) {
    const escapedFiller = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedFiller}\\b`, 'gi');
    note = note.replace(pattern, ' ');
  }

  // Satzzeichen am Anfang/Ende bereinigen
  note = note
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.!?]+/, '')
    .replace(/[\s,;.!?]+$/, '')
    .trim();

  return note;
}

// ============================================================
// === PRIVAT-FLAG ERKENNEN ===
// ============================================================

function detectPrivateFlag(text: string): { isPrivate: boolean; span: [number, number] | null } {
  const norm = text.toLowerCase();
  for (const trigger of PRIVATE_TRIGGERS) {
    const pattern = new RegExp(`\\b${trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = pattern.exec(norm);
    if (m) {
      return { isPrivate: true, span: [m.index, m.index + m[0].length] };
    }
  }
  return { isPrivate: false, span: null };
}

// ============================================================
// === KORREKTUR-VERARBEITUNG ===
// ============================================================

/**
 * Prüft ob der Text eine Korrektur einer vorherigen Aussage enthält.
 * Pattern: "nein / ich meinte Y" → Y als neuen Wert zurückgeben.
 */
function applyCorrectionGuard(text: string): string {
  const norm = text.toLowerCase();

  // "nein, ich meinte X" oder "eigentlich X" oder "ich meine X"
  const correctionPattern = /\b(nein|nicht\s+das|ich\s+meine\s+eigentlich|ich\s+meinte?|eigentlich|gemeint\s+war)\s+(.+?)(?:\.|,|$)/i;
  const m = correctionPattern.exec(norm);

  if (m && m[2]) {
    // Alten Teil entfernen (alles vor dem Korrektur-Trigger)
    return m[2].trim();
  }

  return text;
}

// ============================================================
// === HAUPT-FUNKTION ===
// ============================================================

/**
 * Vollständige Voice-Parser-Pipeline.
 * Parst ein Sprach-Transkript und gibt ein strukturiertes VoiceParseResult zurück.
 *
 * @param transcript - Rohtext des Sprach-Transkripts
 * @param userMedLexicon - Medikamenten-Lexikon des Nutzers
 * @param now - Aktueller Zeitpunkt (default: Date.now())
 */
export function parseVoiceEntry(
  transcript: string,
  userMedLexicon: MedEntry[],
  now: Date = new Date()
): VoiceParseResult {
  // --- Vorverarbeitung ---
  const cleanedText = applyCorrectionGuard(transcript.trim());
  const tokens = cleanedText.toLowerCase().split(/\s+/);

  // Alle genutzten Spans sammeln
  const usedSpans: [number, number][] = [];

  // ---- 1. Entry Type ----
  const { type: entry_type, confidence: typeConf } = classifyEntryType(tokens);

  // ---- 2. Zeit ----
  const parsedTime = parseTimeExpression(cleanedText, now);
  if (parsedTime.span) usedSpans.push(parsedTime.span);

  // ---- 3. Privat-Flag ----
  const { isPrivate, span: privateSpan } = detectPrivateFlag(cleanedText);
  if (privateSpan) usedSpans.push(privateSpan);

  // ---- 4. Schmerzstärke ----
  const painResult = parsePainLevel(cleanedText);
  const painLevel = painResult.value;
  const painLevelConfidence = painResult.confidence;
  const painLevelDisplay = painResult.display;
  if (painResult.spanStart < painResult.spanEnd) {
    usedSpans.push([painResult.spanStart, painResult.spanEnd]);
  }

  // ---- 5. Schmerzlokalisation ----
  const locResult = parsePainLocations(cleanedText);
  const painLocations = locResult.locations;
  locResult.spans.forEach(s => usedSpans.push(s));

  // ---- 6. Aura ----
  const auraResult = parseAuraType(cleanedText);
  const auraType = auraResult.auraType;
  if (auraResult.span) usedSpans.push(auraResult.span);

  // ---- 7. Symptome ----
  const symptomResult = parseSymptoms(cleanedText);
  const symptoms = symptomResult.symptoms;
  symptomResult.spans.forEach(s => usedSpans.push(s));

  // ---- 8. ME/CFS ----
  const mecfsResult = parseMeCfs(cleanedText);
  const meCfsLevel = mecfsResult.level;
  if (mecfsResult.span) usedSpans.push(mecfsResult.span);

  // ---- 9. Medikamente ----
  const medications = parseMedications(cleanedText, userMedLexicon, parsedTime);
  // Medikamenten-Spans sind schwer exakt zu bestimmen → grobe Abschätzung entfällt hier,
  // da parseMedications intern die Segmente kennt; Notiz wird ohnehin robust bereinigt

  // ---- 10. Notiz ----
  const note = extractNote(cleanedText, usedSpans);

  // ---- 11. uncertainFields & needsReview ----
  const uncertainFields: UncertainField[] = [];
  let needsReview = false;

  if (painLevelConfidence > 0 && painLevelConfidence < 0.80) {
    uncertainFields.push({
      field: 'painLevel',
      value: String(painLevel),
      confidence: painLevelConfidence,
    });
    needsReview = true;
  }

  if (parsedTime.isDefault) {
    uncertainFields.push({
      field: 'occurredAt',
      value: `${parsedTime.date} ${parsedTime.time}`,
      confidence: parsedTime.confidence,
    });
  }

  medications.forEach(med => {
    if (med.needsReview || med.confidence < 0.80) {
      uncertainFields.push({
        field: 'medication',
        value: med.name,
        confidence: med.confidence,
        alternatives: [],
      });
      needsReview = true;
    }
  });

  if (auraResult.confidence > 0 && auraResult.confidence < 0.75) {
    uncertainFields.push({
      field: 'auraType',
      value: auraType ?? '',
      confidence: auraResult.confidence,
    });
    needsReview = true;
  }

  // ---- 12. Gesamt-Confidence ----
  const confidenceScores = [
    typeConf,
    painLevelConfidence > 0 ? painLevelConfidence : 0.5,
    parsedTime.confidence,
    locResult.confidence > 0 ? locResult.confidence : 0.5,
    symptomResult.confidence > 0 ? symptomResult.confidence : 0.5,
  ];
  const overallConfidence =
    confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length;

  return {
    entry_type,
    confidence: overallConfidence,
    raw_text: transcript,

    occurredAt: {
      date: parsedTime.date,
      time: parsedTime.time,
      displayText: parsedTime.displayText,
      confidence: parsedTime.confidence,
      isDefault: parsedTime.isDefault,
    },

    painLevel,
    painLevelConfidence,
    painLevelDisplay,

    painLocations,
    locationsConfidence: locResult.confidence,

    auraType,
    auraConfidence: auraResult.confidence,

    medications,

    symptoms,
    symptomsConfidence: symptomResult.confidence,

    meCfsLevel,
    meCfsConfidence: mecfsResult.confidence,

    isPrivate,

    note,

    needsReview,
    uncertainFields,
  };
}
