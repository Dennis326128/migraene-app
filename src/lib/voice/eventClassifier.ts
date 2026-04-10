/**
 * eventClassifier.ts
 * Regelbasierte Klassifikation von Spracheingaben in Event-Typen.
 * 
 * Multi-Label: Eine Aussage kann mehrere Event-Typen haben.
 * Nur Hilfsschicht – entscheidet NIEMALS ob etwas gespeichert wird.
 * 
 * "Capture first, preserve always, structure second"
 */

// ============================================================
// === EVENT-TYPEN ===
// ============================================================

export type VoiceEventType =
  | 'pain'
  | 'medication'
  | 'symptom'
  | 'food_drink'
  | 'sleep_rest'
  | 'activity'
  | 'environment'
  | 'stress_overload'
  | 'mecfs_exertion'
  | 'trigger_possible'
  | 'general_observation';

export interface EventClassification {
  type: VoiceEventType;
  confidence: number;
  matchedTerms: string[];
  subtype?: string;
}

export interface ClassificationResult {
  classifications: EventClassification[];
  tags: string[];
  medicalRelevance: 'unknown' | 'low' | 'medium' | 'high';
  /** true if this looks like meaningful content (not noise) */
  isMeaningful: boolean;
}

// ============================================================
// === PATTERN-DEFINITIONEN ===
// ============================================================

interface PatternGroup {
  type: VoiceEventType;
  subtype?: string;
  patterns: RegExp[];
  tags?: string[];
  medicalRelevance: 'low' | 'medium' | 'high';
}

const EVENT_PATTERNS: PatternGroup[] = [
  // --- PAIN ---
  {
    type: 'pain',
    patterns: [
      /\bkopfschmerz/i, /\bmigräne/i, /\battacke/i,
      /\bschmerz/i, /\bweh\s*tut/i, /\btut\s*weh/i,
      /\bdrückt/i, /\bpocht/i, /\bsticht/i, /\bhämmert/i,
      /\bzieh(?:t|en)\b/i, /\bkopfdruck/i, /\bdruckgefühl/i,
      /\bkopf\s+(?:zieht|drückt|pocht|sticht|brummt)/i,
    ],
    tags: ['schmerz'],
    medicalRelevance: 'high',
  },

  // --- MEDICATION ---
  {
    type: 'medication',
    patterns: [
      /\bnehme?\b.*(?:tablette|mg|ml|spray|tropfen)/i,
      /\beingenommen/i, /\bgenommen/i,
      /\btablette/i, /\bmedikament/i,
      /\bschmerzmittel/i, /\btriptan/i,
      /\bibuprofen/i, /\bparacetamol/i, /\baspirin/i,
      /\bsumatriptan/i, /\brizatriptan/i,
    ],
    tags: ['medikament'],
    medicalRelevance: 'high',
  },

  // --- SYMPTOM ---
  {
    type: 'symptom',
    patterns: [
      /übelkeit/i, /(?:^|\s)übel(?:\s|$|[.,!?;:])/i,
      /erbrechen/i, /schwindel/i, /schwindlig/i,
      /licht(?:empfindlich|scheu)/i,
      /geräusch(?:empfindlich)/i,
      /sehstörung/i, /flimmern/i, /(?:^|\s)aura(?:\s|$)/i,
      /kribbeln/i, /taub(?:heit)?(?:\s|$)/i,
      /benommen/i, /benebelt/i,
      /zittrig/i, /zittern/i,
      /(?:^|\s)schwach(?:\s|$)/i, /schwäche/i,
    ],
    tags: ['symptom'],
    medicalRelevance: 'high',
  },

  // --- FOOD & DRINK ---
  {
    type: 'food_drink',
    subtype: 'drink',
    patterns: [
      /\btrinke?\b/i, /\bgetrunken/i,
      /\bkaffee/i, /\btee\b/i, /\bwasser\b/i,
      /\bcola\b/i, /\bsaft\b/i, /\benergydrink/i,
      /\balkoho/i, /\bbier\b/i, /\bwein\b/i,
      /\bsmoothie/i, /\bmilch\b/i,
    ],
    tags: ['getränk'],
    medicalRelevance: 'low',
  },
  {
    type: 'food_drink',
    subtype: 'food',
    patterns: [
      /\bgegessen/i, /\besse\b/i, /\bmahlzeit/i,
      /\bfrühstück/i, /\bmittagessen/i, /\babendessen/i,
      /\bsnack/i, /\bnaschen/i,
      /\bschokolade/i, /\bpizza/i, /\bburger/i,
      /\bobst\b/i, /\bgemüse/i, /\bsalat\b/i,
      /\bbrot\b/i, /\bjoghurt/i, /\bmüsli/i,
      /\bnüsse/i, /\bkäse/i, /\bchips/i,
    ],
    tags: ['essen'],
    medicalRelevance: 'low',
  },

  // --- SLEEP & REST ---
  {
    type: 'sleep_rest',
    patterns: [
      /\bhingelegt/i, /\blege?\s*(?:mich\s+)?(?:hin|ins\s+bett)/i,
      /\bgeschlafen/i, /\bschlafe?\b/i,
      /\baufgewacht/i, /\baufgestanden/i,
      /\bpause\b/i, /\bruhe?\b/i, /\bausgeruht/i,
      /\bins\s*bett/i, /\bim\s*bett/i,
      /\bdöse?n/i, /\bnickerchen/i, /\bnap\b/i,
      /\beingeschlafen/i, /\bwachgeworden/i,
      /\bdurchgeschlafen/i,
      /\blege\b.*\bhin/i,
      /\bleg\s+mich/i,
    ],
    tags: ['schlaf', 'ruhe'],
    medicalRelevance: 'medium',
  },

  // --- ACTIVITY ---
  {
    type: 'activity',
    patterns: [
      /\bspazier/i, /\bgelaufen/i, /\bwandern/i,
      /\bduschen?\b/i, /\bgeduscht/i, /\bbaden?\b/i,
      /\beinkauf/i, /\bshopping/i, /\bsupermarkt/i, /\bladen\b/i,
      /\barbeiten?\b/i, /\bgearbeitet/i,
      /\btermin\b/i, /\barzt/i,
      /\bhaushalt/i, /\bputzen/i, /\bkochen?\b/i,
      /\btreppe/i, /\bfahren?\b/i, /\bgefahren/i,
      /\bsport\b/i, /\btraining/i, /\bjoggen/i,
      /\byoga\b/i, /\bschwimmen/i,
      /\bbildschirm/i, /\bcomputer/i, /\bhandy/i,
      /\bbesuch\b/i, /\btreffen/i,
      /\bdraußen\b/i, /\bunterwegs/i,
    ],
    tags: ['aktivität'],
    medicalRelevance: 'medium',
  },

  // --- ENVIRONMENT ---
  {
    type: 'environment',
    patterns: [
      /\bregen/i, /\bregnet/i,
      /\bhitze/i, /\bheiß\b/i, /\bwarm\b/i,
      /\bkalt\b/i, /\bkälte/i, /\bfrieren/i,
      /\bsonne/i, /\bsonnig/i,
      /\bwetter/i, /\bwetterwechsel/i,
      /\bhell\b/i, /\bhelles?\s+licht/i, /\bgrell/i,
      /\blicht\b.*\b(?:schlimm|grell|hell|blendet|stört|nervt|unerträglich)/i,
      /\blicht\b/i,
      /\blaut\b/i, /\blärm/i, /\bleise/i,
      /\bstickig/i, /\bschwül/i,
      /\bmenschen(?:menge|masse)/i, /\bvoll\b/i,
      /\bgeruch/i, /\bgerüche/i, /\bgestank/i,
      /\bparfum/i, /\bduft\b/i,
      /\bwind\b/i, /\bsturm/i, /\bgewitter/i,
      /\bdruck(?:wechsel|änderung)/i,
    ],
    tags: ['umwelt'],
    medicalRelevance: 'medium',
  },

  // --- STRESS / OVERLOAD ---
  {
    type: 'stress_overload',
    patterns: [
      /\bstress/i, /\bgestresst/i,
      /\büberfordert/i, /\büberfordr/i,
      /\breizüberflutet/i, /\breizüberflut/i,
      /\bangespannt/i, /\bnervös/i,
      /\bunruhig/i, /\baufgeregt/i,
      /\bzu\s*viel\b/i, /\balles\s*(?:zu\s*|etwas\s*)?viel/i,
      /\betwas\s+viel/i,
      /\bviel\s+um\s+die\s+ohren/i,
      /\bhektisch/i, /\bchaotisch/i,
      /\bsorgen/i, /\bängstlich/i,
      /\bschlaflos/i, /\bnicht\s+schlafen/i,
    ],
    tags: ['stress'],
    medicalRelevance: 'medium',
  },

  // --- ME/CFS EXERTION ---
  {
    type: 'mecfs_exertion',
    patterns: [
      /\berschöpf/i, /\bkomplett\s+platt/i, /\btotal\s+platt/i,
      /\bplatt\b/i, /\bfertig\b/i,
      /\bcrash/i, /\bpem\b/i,
      /\bnach\s+(?:der\s+)?(?:belastung|anstrengung|aktivität)/i,
      /\bnicht\s+belastbar/i, /\bbelastbar\b/i,
      /\bbrain\s*fog/i, /\bnebel\s*(?:im\s*)?kopf/i,
      /\bkognitiv(?:e)?\s+erschöpf/i,
      /\borthostatisch/i, /\bkreislauf/i,
      /\bnach\s+(?:dem\s+)?(?:duschen|spazier|termin|einkauf)/i,
      /\bdeutlich\s+schlechter/i, /\bviel\s+schlechter/i,
      /\bverschlechter/i,
      /\bkraftlos/i, /\benergiel/i,
      /\bausgepowert/i, /\bausgelaugt/i,
      /\bdanach\s+(?:komplett|total|völlig)\s+(?:platt|fertig|am\s+ende)/i,
    ],
    tags: ['erschöpfung', 'mecfs'],
    medicalRelevance: 'high',
  },

  // --- TRIGGER POSSIBLE ---
  {
    type: 'trigger_possible',
    patterns: [
      /\bdanach\s+(?:schmerz|kopfschmerz|migräne)/i,
      /\bdavon\s+(?:schmerz|kopf)/i,
      /\bausgelöst/i, /\btrigger/i,
      /\bimmer\s+(?:wenn|nach)/i,
      /\bjedes\s*mal/i,
      /\bvorher\b.*\b(?:schmerz|kopf|migräne)/i,
    ],
    tags: ['trigger'],
    medicalRelevance: 'high',
  },
];

// --- Noise / Müll-Filter ---
const NOISE_PATTERNS = [
  /^\s*$/,
  /^(?:äh+|ähm+|hmm+|mhm+|ok(?:ay)?|ja+|nein|ne+|hm+|oh+)\s*[.!?]*$/i,
  /^(?:test|hallo|tschüss|stopp?)\s*[.!?]*$/i,
];

/**
 * Short words that are meaningful despite being <4 chars.
 * These represent real clinical/everyday signals and must NOT be filtered as noise.
 */
const MEANINGFUL_SHORT_WORDS = new Set([
  // ME/CFS
  'pem', 'fog',
  // Symptoms
  'übel', 'müde', 'wach', 'warm', 'kalt',
  // Environment
  'hell', 'laut', 'heiß', 'wind',
  // Food/drink
  'tee', 'saft', 'bier', 'wein',
  // Activities
  'bad',
  // States
  'fit', 'gut', 'ok',
]);

const MEANINGFUL_MIN_LENGTH = 2;
const MEANINGFUL_MIN_WORDS = 1;

// ============================================================
// === HILFSFUNKTIONEN ===
// ============================================================

/**
 * Prüft ob ein Text reiner Noise ist (leere Eingabe, Füllwörter).
 * WICHTIG: Kurze aber sinnvolle Aussagen wie "bin platt", "übel", "pem" 
 * werden NICHT als Noise gewertet.
 */
export function isNoise(text: string): boolean {
  const trimmed = text.trim();
  
  if (trimmed.length < MEANINGFUL_MIN_LENGTH) return true;
  
  // Explicit noise patterns
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return true;

  // Single word: check against meaningful short words allowlist
  if (words.length === 1) {
    const word = words[0].toLowerCase().replace(/[.!?,;:]+$/, '');
    // Allow if it's in the short-words allowlist
    if (MEANINGFUL_SHORT_WORDS.has(word)) return false;
    // Allow if ≥4 chars (likely a real word)
    if (word.length >= 4) return false;
    // Otherwise too short and not in allowlist → noise
    return true;
  }

  return false;
}

// ============================================================
// === HAUPT-FUNKTION ===
// ============================================================

/**
 * Klassifiziert eine Spracheingabe in Event-Typen.
 * Multi-Label: Eine Aussage kann mehrere Typen haben.
 * 
 * Entscheidet NICHT ob etwas gespeichert wird.
 * Nur ergänzende Hilfsschicht für spätere Analyse.
 */
export function classifyVoiceEvent(text: string): ClassificationResult {
  const trimmed = text.trim();
  
  // Noise-Check
  if (isNoise(trimmed)) {
    return {
      classifications: [],
      tags: [],
      medicalRelevance: 'unknown',
      isMeaningful: false,
    };
  }

  const classifications: EventClassification[] = [];
  const allTags = new Set<string>();
  let maxMedicalRelevance: 'unknown' | 'low' | 'medium' | 'high' = 'unknown';

  const norm = trimmed.toLowerCase();

  for (const group of EVENT_PATTERNS) {
    const matchedTerms: string[] = [];
    let bestConfidence = 0;

    for (const pattern of group.patterns) {
      const match = pattern.exec(norm);
      if (match) {
        matchedTerms.push(match[0]);
        const conf = Math.min(0.95, 0.70 + (match[0].length / norm.length) * 0.3);
        bestConfidence = Math.max(bestConfidence, conf);
      }
    }

    if (matchedTerms.length > 0) {
      const boostedConf = Math.min(0.98, bestConfidence + matchedTerms.length * 0.03);
      
      classifications.push({
        type: group.type,
        confidence: boostedConf,
        matchedTerms,
        subtype: group.subtype,
      });

      if (group.tags) {
        group.tags.forEach(t => allTags.add(t));
      }

      const relOrder = { unknown: 0, low: 1, medium: 2, high: 3 };
      if (relOrder[group.medicalRelevance] > relOrder[maxMedicalRelevance]) {
        maxMedicalRelevance = group.medicalRelevance;
      }
    }
  }

  // Inline-Tag-Extraktion
  const inlineTags = extractInlineTags(norm);
  inlineTags.forEach(t => allTags.add(t));

  // Wenn keine Klassifikation → general_observation
  if (classifications.length === 0) {
    classifications.push({
      type: 'general_observation',
      confidence: 0.50,
      matchedTerms: [],
    });
  }

  return {
    classifications,
    tags: Array.from(allTags),
    medicalRelevance: maxMedicalRelevance,
    isMeaningful: true,
  };
}

/**
 * Extrahiert inline Tags aus dem Text (Getränke, Speisen, Zustände etc.)
 */
function extractInlineTags(norm: string): string[] {
  const tags: string[] = [];
  
  const TAG_EXTRACTION: [RegExp, string][] = [
    [/\bkaffee/i, 'kaffee'],
    [/\btee\b/i, 'tee'],
    [/\bwasser\b/i, 'wasser'],
    [/\bcola\b/i, 'cola'],
    [/\bschokolade/i, 'schokolade'],
    [/\bpizza/i, 'pizza'],
    [/\balkoho/i, 'alkohol'],
    [/\bbier\b/i, 'bier'],
    [/\bwein\b/i, 'wein'],
    [/\bspazier/i, 'spaziergang'],
    [/\bduschen?\b|geduscht/i, 'duschen'],
    [/\beinkauf/i, 'einkaufen'],
    [/\btermin\b/i, 'termin'],
    [/\bsport\b/i, 'sport'],
    [/\byoga\b/i, 'yoga'],
    [/\bschwimm/i, 'schwimmen'],
    [/\bjoggen/i, 'joggen'],
    [/\bregen/i, 'regen'],
    [/\bregnet/i, 'regen'],
    [/\bsonne/i, 'sonne'],
    [/\bhitze|heiß/i, 'hitze'],
    [/\bkälte|kalt/i, 'kälte'],
    [/\blärm|laut/i, 'lärm'],
    [/\bbildschirm/i, 'bildschirm'],
    [/\bstress/i, 'stress'],
    [/\bcrash/i, 'crash'],
    [/\bpem\b/i, 'pem'],
    [/\bbrain\s*fog/i, 'brainfog'],
  ];

  for (const [pattern, tag] of TAG_EXTRACTION) {
    if (pattern.test(norm)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Segmentiert einen längeren Text in Teilereignisse.
 * Erkennt Konnektoren wie "und", "dann", "danach", "jetzt".
 */
export interface VoiceSegment {
  text: string;
  index: number;
  classification: ClassificationResult;
}

export function segmentVoiceInput(text: string): VoiceSegment[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Segmentierungs-Pattern
  const SEGMENT_SPLIT = /\b(?:und\s+dann|und\s+danach|und\s+jetzt|danach|anschließend|dann|und\b|jetzt\s+(?:merke|fühle|bin|habe|ist)|jetzt\b|eben\b|außerdem)\b|[,;.!?]\s+(?=[A-ZÄÖÜ]|ich\b|mir\b|es\b|das\b)/gi;

  const segments: VoiceSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segmentIndex = 0;

  // Reset lastIndex
  SEGMENT_SPLIT.lastIndex = 0;

  while ((match = SEGMENT_SPLIT.exec(trimmed)) !== null) {
    const beforeText = trimmed.slice(lastIndex, match.index).trim();
    if (beforeText.length >= 3) {
      segments.push({
        text: beforeText,
        index: segmentIndex++,
        classification: classifyVoiceEvent(beforeText),
      });
    }
    lastIndex = match.index + match[0].length;
  }

  // Rest
  const remaining = trimmed.slice(lastIndex).trim();
  if (remaining.length >= 3) {
    segments.push({
      text: remaining,
      index: segmentIndex,
      classification: classifyVoiceEvent(remaining),
    });
  }

  // Wenn keine Segmentierung möglich → ganzer Text als ein Segment
  if (segments.length === 0) {
    segments.push({
      text: trimmed,
      index: 0,
      classification: classifyVoiceEvent(trimmed),
    });
  }

  return segments;
}

// ============================================================
// === UI-LABELS ===
// ============================================================

const EVENT_TYPE_LABELS: Record<VoiceEventType, string> = {
  pain: 'Schmerz',
  medication: 'Medikament',
  symptom: 'Symptom',
  food_drink: 'Essen/Trinken',
  sleep_rest: 'Ruhe/Schlaf',
  activity: 'Aktivität',
  environment: 'Umgebung',
  stress_overload: 'Stress/Überlastung',
  mecfs_exertion: 'Erschöpfung/Belastung',
  trigger_possible: 'Möglicher Trigger',
  general_observation: 'Alltagsnotiz',
};

const EVENT_TYPE_ICONS: Record<VoiceEventType, string> = {
  pain: '🤕',
  medication: '💊',
  symptom: '🩺',
  food_drink: '☕',
  sleep_rest: '😴',
  activity: '🚶',
  environment: '🌤️',
  stress_overload: '😰',
  mecfs_exertion: '⚡',
  trigger_possible: '⚠️',
  general_observation: '📝',
};

export function getEventTypeLabel(type: VoiceEventType): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

export function getEventTypeIcon(type: VoiceEventType): string {
  return EVENT_TYPE_ICONS[type] ?? '📝';
}

/**
 * Generates user-friendly feedback text for the classification result.
 */
export function getClassificationFeedback(result: ClassificationResult): string {
  if (!result.isMeaningful) return '';
  
  const primary = result.classifications[0];
  if (!primary) return 'Notiz gespeichert';

  const label = getEventTypeLabel(primary.type);
  const icon = getEventTypeIcon(primary.type);

  // Special feedback for medical items
  if (primary.type === 'medication') {
    return `${icon} Medikament erkannt – bitte bestätigen`;
  }
  if (primary.type === 'pain') {
    return `${icon} Schmerz erkannt – bitte prüfen`;
  }

  // Non-medical: simpler feedback
  if (result.tags.length > 0) {
    const tagDisplay = result.tags.slice(0, 2).map(t => 
      t.charAt(0).toUpperCase() + t.slice(1)
    ).join(', ');
    return `${icon} ${label}: ${tagDisplay}`;
  }

  return `${icon} Als ${label} gespeichert`;
}
