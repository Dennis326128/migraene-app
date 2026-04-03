/**
 * voiceFuzzyMatcher.ts
 * Fuzzy-Matching-Algorithmen für medizinische Begriffe.
 * Kein LLM, kein externes Paket – rein TypeScript.
 *
 * Enthält:
 *   - Levenshtein-Distanz (iterativ, O(n*m))
 *   - Jaro-Winkler-Ähnlichkeit
 *   - Normalisierung (Umlaute, Kleinschreibung)
 *   - findBestMatch()
 *   - matchMedication(), matchSymptom(), matchLocation()
 *   - Trigramm-Vorfilter für Performance
 */

import { SYMPTOM_MAP, LOCATION_MAP, MEDICATION_SYNONYMS, AURA_MAP } from './voiceGrammar';

// ============================================================
// === TYPEN ===
// ============================================================

export interface MedEntry {
  id: string;
  name: string;
  activeIngredient?: string;
  defaultDoseQuarters?: number;
  synonyms?: string[];
}

export interface MedicationMatch {
  medEntry: MedEntry;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'prefix' | 'synonym';
  matchedTerm: string;
  needsReview: boolean;
}

export interface FuzzyMatch {
  match: string;
  score: number;       // 0-1, höher = besser
  distance?: number;   // Levenshtein-Distanz
}

// ============================================================
// === TEXT-NORMALISIERUNG ===
// ============================================================

/**
 * Normalisiert Text für Matching:
 * - Umlaute expandieren: ä→ae, ö→oe, ü→ue, ß→ss
 * - Kleinschreibung
 * - Trim + mehrfache Leerzeichen entfernen
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/à|á|â/g, 'a')
    .replace(/è|é|ê/g, 'e')
    .replace(/ì|í|î/g, 'i')
    .replace(/ò|ó|ô/g, 'o')
    .replace(/ù|ú|û/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisiert nur Umlaute, ohne Großschreibung zu ändern
 * (für Ausgabe/Anzeige)
 */
export function normalizeUmlauts(input: string): string {
  return input
    .replace(/ä/g, 'ae')
    .replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'oe')
    .replace(/Ö/g, 'Oe')
    .replace(/ü/g, 'ue')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

// ============================================================
// === LEVENSHTEIN-DISTANZ ===
// ============================================================

/**
 * Berechnet die Levenshtein-Editierdistanz zwischen zwei Strings.
 * Iterative DP-Implementierung, O(n*m) Zeit und O(min(n,m)) Speicher.
 */
export function levenshtein(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 0;
  if (na.length === 0) return nb.length;
  if (nb.length === 0) return na.length;

  // Optimierung: kürzerer String in Zeile
  const [s, t] = na.length <= nb.length ? [na, nb] : [nb, na];
  const m = s.length;
  const n = t.length;

  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,        // Deletion
        curr[i - 1] + 1,    // Insertion
        prev[i - 1] + cost  // Substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// ============================================================
// === JARO-WINKLER-ÄHNLICHKEIT ===
// ============================================================

/**
 * Berechnet die Jaro-Ähnlichkeit zwischen zwei Strings.
 * Gut geeignet für kurze Strings und Tippfehler.
 */
export function jaro(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchDist < 0) return 0.0;

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Übereinstimmungen finden
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Transpositionen zählen
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    matches / s1.length +
    matches / s2.length +
    (matches - transpositions / 2) / matches
  ) / 3;
}

/**
 * Berechnet Jaro-Winkler-Ähnlichkeit.
 * Bevorzugt Strings mit gleichem Präfix (p = 0.1, max 4 Zeichen).
 */
export function jaroWinkler(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  const jaroScore = jaro(s1, s2);

  // Gemeinsames Präfix berechnen (max 4 Zeichen)
  let prefixLen = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }

  return jaroScore + prefixLen * 0.1 * (1 - jaroScore);
}

// ============================================================
// === TRIGRAMM-VORFILTER ===
// ============================================================

/**
 * Extrahiert Trigramme aus einem String.
 * Beispiel: "hallo" → {"hal", "all", "llo"}
 */
export function trigrams(s: string): Set<string> {
  const result = new Set<string>();
  const padded = ` ${s} `;
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

/**
 * Berechnet Trigramm-Ähnlichkeit (Jaccard-Index) zwischen zwei Strings.
 * Schneller Vorfilter vor dem teuren Levenshtein/Jaro-Winkler.
 */
export function trigramSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0.0;

  const tA = trigrams(na);
  const tB = trigrams(nb);

  let intersection = 0;
  for (const t of tA) {
    if (tB.has(t)) intersection++;
  }

  const union = tA.size + tB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============================================================
// === ALLGEMEINES FUZZY-MATCHING ===
// ============================================================

/**
 * Findet den besten Match aus einer Liste von Kandidaten.
 * Nutzt Trigramm-Vorfilter + Levenshtein/Jaro-Winkler.
 *
 * @param input - Eingabetext
 * @param candidates - Liste der möglichen Kandidaten
 * @param threshold - Minimale Ähnlichkeit (0-1), default 0.70
 * @param useJaroWinkler - Jaro-Winkler statt Levenshtein, default false
 */
export function findBestMatch(
  input: string,
  candidates: string[],
  threshold: number = 0.70,
  useJaroWinkler: boolean = false
): FuzzyMatch | null {
  const normInput = normalizeText(input);

  if (normInput.length === 0 || candidates.length === 0) return null;

  // Exakter Match zuerst
  for (const candidate of candidates) {
    if (normalizeText(candidate) === normInput) {
      return { match: candidate, score: 1.0, distance: 0 };
    }
  }

  let bestMatch: FuzzyMatch | null = null;
  let bestScore = -1;

  // Trigramm-Vorfilter: Nur Kandidaten mit Trigramm-Score > 0.2 weiterverarbeiten
  const TRIGRAM_THRESHOLD = 0.15;

  for (const candidate of candidates) {
    const normCandidate = normalizeText(candidate);

    // Trigramm-Vorfilter (Performance-Optimierung)
    const triScore = trigramSimilarity(normInput, normCandidate);
    if (triScore < TRIGRAM_THRESHOLD && normInput.length > 4) continue;

    let score: number;
    let distance: number | undefined;

    if (useJaroWinkler) {
      score = jaroWinkler(normInput, normCandidate);
    } else {
      const dist = levenshtein(normInput, normCandidate);
      distance = dist;
      // Levenshtein in Score umwandeln (normalisiert auf Max-Länge)
      const maxLen = Math.max(normInput.length, normCandidate.length);
      score = maxLen === 0 ? 1 : 1 - dist / maxLen;
    }

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = { match: candidate, score, distance };
    }
  }

  return bestMatch;
}

// ============================================================
// === MEDIKAMENTEN-MATCHING ===
// ============================================================

/**
 * Maximale Levenshtein-Distanz basierend auf Wortlänge.
 */
function getMedMaxDist(wordLen: number): number {
  if (wordLen <= 6) return 1;
  if (wordLen <= 10) return 2;
  return 3;
}

/**
 * Matcht einen Eingabetext gegen das Medikamenten-Lexikon.
 * Strategie:
 * 1. Exakter Match (normalisiert)
 * 2. Synonym-Check (voiceGrammar.MEDICATION_SYNONYMS)
 * 3. Prefix-Match (mind. 5 Zeichen)
 * 4. Levenshtein mit längenabhängigem Threshold
 * 5. Jaro-Winkler als Fallback
 */
export function matchMedication(input: string, lexicon: MedEntry[]): MedicationMatch | null {
  if (!input || lexicon.length === 0) return null;

  const normInput = normalizeText(input);
  if (normInput.length < 3) return null;

  let bestEntry: MedEntry | null = null;
  let bestScore = 0;
  let bestMatchType: MedicationMatch['matchType'] = 'fuzzy';
  let bestMatchedTerm = '';

  // Synonym-Lookup zuerst
  const synonymResolved = MEDICATION_SYNONYMS[normInput];
  if (synonymResolved) {
    for (const entry of lexicon) {
      if (normalizeText(entry.name) === normalizeText(synonymResolved) ||
          normalizeText(entry.activeIngredient ?? '') === normalizeText(synonymResolved)) {
        return {
          medEntry: entry,
          confidence: 0.95,
          matchType: 'synonym',
          matchedTerm: input,
          needsReview: false,
        };
      }
    }
  }

  for (const entry of lexicon) {
    // Alle Kandidaten für diesen Eintrag
    const candidates: string[] = [entry.name];
    if (entry.activeIngredient) candidates.push(entry.activeIngredient);
    if (entry.synonyms) candidates.push(...entry.synonyms);

    for (const candidate of candidates) {
      const normCandidate = normalizeText(candidate);

      // 1. Exakter Match
      if (normInput === normCandidate) {
        return {
          medEntry: entry,
          confidence: 1.0,
          matchType: 'exact',
          matchedTerm: candidate,
          needsReview: false,
        };
      }

      // 2. Prefix-Match (mind. 5 Zeichen)
      if (normInput.length >= 5 && normCandidate.startsWith(normInput)) {
        const score = 0.88 + (normInput.length / normCandidate.length) * 0.10;
        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
          bestMatchType = 'prefix';
          bestMatchedTerm = candidate;
        }
        continue;
      }

      // Trigramm-Vorfilter
      const triScore = trigramSimilarity(normInput, normCandidate);
      if (triScore < 0.10 && normInput.length > 5) continue;

      // 3. Levenshtein
      const dist = levenshtein(normInput, normCandidate);
      const maxDist = getMedMaxDist(Math.max(normInput.length, normCandidate.length));

      if (dist <= maxDist) {
        const maxLen = Math.max(normInput.length, normCandidate.length);
        const score = 1 - dist / maxLen;
        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
          bestMatchType = 'fuzzy';
          bestMatchedTerm = candidate;
        }
      }

      // 4. Jaro-Winkler als Fallback
      const jw = jaroWinkler(normInput, normCandidate);
      if (jw >= 0.88 && jw > bestScore) {
        bestScore = jw;
        bestEntry = entry;
        bestMatchType = 'fuzzy';
        bestMatchedTerm = candidate;
      }
    }
  }

  if (!bestEntry || bestScore < 0.60) return null;

  const confidence = bestScore;
  const needsReview = confidence < 0.80 || bestMatchType === 'fuzzy';

  return {
    medEntry: bestEntry,
    confidence,
    matchType: bestMatchType,
    matchedTerm: bestMatchedTerm,
    needsReview,
  };
}

// ============================================================
// === SYMPTOM-MATCHING ===
// ============================================================

/**
 * Matcht einen Text-Token gegen alle bekannten Symptome.
 * Nutzt Jaro-Winkler (Threshold ≥ 0.82) für robuste Erkennung.
 *
 * @returns Bestes Symptom-Match oder null
 */
export function matchSymptom(
  input: string
): { symptomId: string; confidence: number; matchedPhrase: string } | null {
  const normInput = normalizeText(input);
  if (normInput.length < 3) return null;

  let bestSymptomId = '';
  let bestScore = 0;
  let bestPhrase = '';

  for (const [symptomId, phrases] of Object.entries(SYMPTOM_MAP)) {
    for (const phrase of phrases) {
      const normPhrase = normalizeText(phrase);

      // Exakter Match
      if (normInput === normPhrase) {
        return { symptomId, confidence: 1.0, matchedPhrase: phrase };
      }

      // Enthält-Prüfung (für kurze Schlüsselwörter)
      if (normInput.includes(normPhrase) || normPhrase.includes(normInput)) {
        const score = Math.min(normInput.length, normPhrase.length) /
                      Math.max(normInput.length, normPhrase.length);
        if (score > bestScore && score >= 0.70) {
          bestScore = score * 0.97; // leicht reduziert für Enthält-Match
          bestSymptomId = symptomId;
          bestPhrase = phrase;
        }
        continue;
      }

      // Jaro-Winkler
      const jw = jaroWinkler(normInput, normPhrase);
      if (jw >= 0.82 && jw > bestScore) {
        bestScore = jw;
        bestSymptomId = symptomId;
        bestPhrase = phrase;
      }
    }
  }

  if (!bestSymptomId || bestScore < 0.75) return null;

  return { symptomId: bestSymptomId, confidence: bestScore, matchedPhrase: bestPhrase };
}

// ============================================================
// === LOKALISATIONS-MATCHING ===
// ============================================================

/**
 * Matcht einen Text-Token gegen alle bekannten Schmerz-Lokalisationen.
 * Nutzt Levenshtein ≤ 2 für robuste Erkennung.
 */
export function matchLocation(
  input: string
): { locationId: string; confidence: number; matchedPhrase: string } | null {
  const normInput = normalizeText(input);
  if (normInput.length < 2) return null;

  let bestLocationId = '';
  let bestScore = 0;
  let bestPhrase = '';

  for (const [locationId, phrases] of Object.entries(LOCATION_MAP)) {
    for (const phrase of phrases) {
      const normPhrase = normalizeText(phrase);

      // Exakter Match
      if (normInput === normPhrase) {
        return { locationId, confidence: 1.0, matchedPhrase: phrase };
      }

      // Enthält-Prüfung
      if (normInput.includes(normPhrase) || normPhrase.includes(normInput)) {
        const score = Math.min(normInput.length, normPhrase.length) /
                      Math.max(normInput.length, normPhrase.length);
        if (score > bestScore && score >= 0.65) {
          bestScore = score * 0.96;
          bestLocationId = locationId;
          bestPhrase = phrase;
        }
        continue;
      }

      // Levenshtein ≤ 2
      const dist = levenshtein(normInput, normPhrase);
      if (dist <= 2) {
        const maxLen = Math.max(normInput.length, normPhrase.length);
        const score = 1 - dist / maxLen;
        if (score > bestScore && score >= 0.70) {
          bestScore = score;
          bestLocationId = locationId;
          bestPhrase = phrase;
        }
      }
    }
  }

  if (!bestLocationId || bestScore < 0.65) return null;

  return { locationId: bestLocationId, confidence: bestScore, matchedPhrase: bestPhrase };
}

// ============================================================
// === AURA-MATCHING ===
// ============================================================

import { AURA_MAP } from './voiceGrammar';

/**
 * Matcht einen Text-Token gegen alle bekannten Aura-Typen.
 */
export function matchAura(
  input: string
): { auraType: string; confidence: number; matchedPhrase: string } | null {
  const normInput = normalizeText(input);
  if (normInput.length < 3) return null;

  let bestAuraType = '';
  let bestScore = 0;
  let bestPhrase = '';

  for (const [auraType, phrases] of Object.entries(AURA_MAP)) {
    for (const phrase of phrases) {
      const normPhrase = normalizeText(phrase);

      if (normInput === normPhrase) {
        return { auraType, confidence: 1.0, matchedPhrase: phrase };
      }

      if (normInput.includes(normPhrase) || normPhrase.includes(normInput)) {
        const score = Math.min(normInput.length, normPhrase.length) /
                      Math.max(normInput.length, normPhrase.length);
        if (score > bestScore && score >= 0.65) {
          bestScore = score * 0.96;
          bestAuraType = auraType;
          bestPhrase = phrase;
        }
        continue;
      }

      const jw = jaroWinkler(normInput, normPhrase);
      if (jw >= 0.82 && jw > bestScore) {
        bestScore = jw;
        bestAuraType = auraType;
        bestPhrase = phrase;
      }
    }
  }

  if (!bestAuraType || bestScore < 0.70) return null;

  return { auraType: bestAuraType, confidence: bestScore, matchedPhrase: bestPhrase };
}

// ============================================================
// === HILFSFUNKTIONEN ===
// ============================================================

/**
 * Prüft ob ein Token ein Negationswort in einem Kontext-Fenster hat.
 * @param tokens - Alle Tokens des Texts
 * @param tokenIndex - Index des zu prüfenden Tokens
 * @param windowSize - Wie viele Tokens vor dem Token prüfen (default: 3)
 */
export function hasNegationInWindow(
  tokens: string[],
  tokenIndex: number,
  windowSize: number = 3
): boolean {
  const negationWords = ['keine', 'kein', 'nicht', 'ohne', 'nie', 'niemals', 'keinerlei', 'keinen', 'keiner', 'keines'];
  const start = Math.max(0, tokenIndex - windowSize);
  for (let i = start; i < tokenIndex; i++) {
    const normToken = normalizeText(tokens[i]);
    if (negationWords.some((neg: string) => normalizeText(neg) === normToken)) {
      return true;
    }
  }
  return false;
}

/**
 * Findet alle Vorkommen eines Patterns im Text und gibt Spans zurück.
 */
export function findAllSpans(
  text: string,
  pattern: RegExp
): [number, number][] {
  const spans: [number, number][] = [];
  const flags = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
  let match: RegExpExecArray | null;
  while ((match = flags.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

/**
 * Prüft ob zwei Spans sich überschneiden.
 */
export function spansOverlap(
  a: [number, number],
  b: [number, number]
): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Entfernt Text aus einem String basierend auf Spans (sortiert).
 * Spans dürfen sich NICHT überschneiden.
 */
export function removeSpans(text: string, spans: [number, number][]): string {
  if (spans.length === 0) return text;

  // Nach Start-Index sortieren
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);

  let result = '';
  let lastEnd = 0;
  for (const [start, end] of sorted) {
    result += text.slice(lastEnd, start);
    lastEnd = end;
  }
  result += text.slice(lastEnd);

  // Mehrfache Leerzeichen bereinigen
  return result.replace(/\s{2,}/g, ' ').trim();
}
