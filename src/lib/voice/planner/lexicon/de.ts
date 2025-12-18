/**
 * German Lexicon for Voice OS
 * 
 * Umfassendes deutsches Vokabular für Voice-Erkennung
 * Enthält Operator-Wörter, Objekt-Wörter, Modifier und Filler
 */

// ============================================
// Filler Words (werden entfernt beim Canonicalize)
// ============================================

export const FILLER_WORDS = new Set([
  // Höflichkeitsfloskeln
  'bitte', 'mal', 'kurz', 'eben', 'schnell', 'gerne',
  // Füllwörter
  'äh', 'ähm', 'hmm', 'hm', 'also', 'halt', 'ja', 'ne', 'naja',
  'eigentlich', 'sozusagen', 'quasi', 'irgendwie',
  // Höfliche Einleitungen
  'kannst', 'könntest', 'würdest', 'könnten', 'würden',
  'du', 'mir', 'mich', 'uns', 'bitte',
  // Artikel
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer',
  // Possessivpronomen (teilweise, da manchmal semantisch wichtig)
  'mein', 'meine', 'meinen', 'meinem', 'meiner',
]);

// ============================================
// Operators (Aktion-auslösende Wörter)
// ============================================

export type OperatorType = 
  | 'OPEN' 
  | 'FIND' 
  | 'LATEST' 
  | 'COUNT' 
  | 'STATS' 
  | 'CREATE' 
  | 'EDIT' 
  | 'DELETE' 
  | 'RATE' 
  | 'HELP';

export const OPERATORS: Record<OperatorType, string[]> = {
  // Navigation / Öffnen
  OPEN: [
    'öffne', 'öffnen', 'aufmachen', 'zeig', 'zeige', 'anzeigen',
    'bring', 'geh', 'gehe', 'navigiere', 'wechsle', 'wechsel',
    'starte', 'start', 'zu', 'auf'
  ],
  
  // Suchen / Listen
  FIND: [
    'zeig', 'liste', 'such', 'suche', 'finde', 'filter', 'filtere',
    'gib', 'alle', 'welche'
  ],
  
  // Letzter / Neuester
  LATEST: [
    'zuletzt', 'letzte', 'letzter', 'letzten', 'letztes',
    'neueste', 'neuester', 'neuesten',
    'vorhin', 'kürzlich', 'eben',
    'wann', // in "wann zuletzt"
  ],
  
  // Zählen
  COUNT: [
    'zähle', 'zählen', 'anzahl', 'summe', 'insgesamt',
    'wie', 'viele', 'oft', // "wie oft", "wie viele"
    'an', // "an wie vielen tagen"
  ],
  
  // Statistiken / Trends
  STATS: [
    'durchschnitt', 'durchschnittlich', 'schnitt', 'mittel',
    'trend', 'trends', 'entwicklung', 'verlauf',
    'verglichen', 'vergleich', 'gegenüber',
    'mehr', 'weniger', 'steigend', 'fallend'
  ],
  
  // Erstellen
  CREATE: [
    'erstelle', 'erstellen', 'anlegen', 'neu', 'neue', 'neuen', 'neuer',
    'mach', 'mache', 'richte', 'einrichten',
    'hinzufügen', 'hinzu', 'eintragen', 'speicher', 'speichere', 'speichern',
    'merke', 'merken', 'notiere', 'notieren'
  ],
  
  // Bearbeiten
  EDIT: [
    'bearbeite', 'bearbeiten', 'ändere', 'ändern', 'änderung',
    'korrigiere', 'korrigieren', 'anpassen', 'aktualisiere', 'aktualisieren',
    'setze', 'setzen', 'ersetze', 'ersetzen',
    'ergänze', 'ergänzen', 'trage', 'nachtragen'
  ],
  
  // Löschen
  DELETE: [
    'lösche', 'löschen', 'entferne', 'entfernen',
    'weg', 'wegmachen', 'verwerfen', 'verwerfe',
    'raus', 'rausnehmen'
  ],
  
  // Bewerten
  RATE: [
    'bewerte', 'bewerten', 'bewertung',
    'wirkung', 'wirksam', 'wirkt', 'gewirkt',
    'geholfen', 'hilft', 'half',
    'effekt', 'effektiv'
  ],
  
  // Hilfe
  HELP: [
    'hilfe', 'help', 'anleitung', 'erklär', 'erkläre', 'erklären',
    'befehle', 'kommandos', 'funktionen',
    'was', 'kann', 'sagen', // "was kann ich sagen"
    'wie', 'geht' // "wie geht das"
  ]
};

// ============================================
// Object Words (Ziel-Objekte)
// ============================================

export type ObjectType = 
  | 'ENTRIES' 
  | 'NOTES' 
  | 'REMINDERS' 
  | 'ANALYSIS' 
  | 'REPORT' 
  | 'MEDPLAN' 
  | 'MEDS' 
  | 'PROFILE' 
  | 'SETTINGS'
  | 'DOCTORS';

export const OBJECTS: Record<ObjectType, string[]> = {
  // Schmerzeinträge / Tagebuch
  ENTRIES: [
    'eintrag', 'einträge', 'entry',
    'schmerzeintrag', 'schmerzeinträge',
    'migräneeintrag', 'migräneeinträge',
    'kopfschmerzeintrag', 'kopfschmerzeinträge',
    'tagebuch', 'diary',
    'aufzeichnung', 'aufzeichnungen'
  ],
  
  // Notizen
  NOTES: [
    'notiz', 'notizen', 'note', 'notes',
    'kontext', 'kontextnotiz', 'kontextnotizen',
    'merke', 'merkung', 'anmerkung', 'anmerkungen',
    'kommentar', 'kommentare', 'hinweis', 'hinweise'
  ],
  
  // Erinnerungen
  REMINDERS: [
    'erinnerung', 'erinnerungen', 'reminder',
    'termin', 'termine', 'appointment',
    'arzttermin', 'arzttermine',
    'wecker', 'alarm'
  ],
  
  // Auswertung / Analyse
  ANALYSIS: [
    'auswertung', 'auswertungen',
    'analyse', 'analysen', 'analysis',
    'statistik', 'statistiken',
    'trends', 'muster', 'pattern',
    'übersicht'
  ],
  
  // Berichte / Export
  REPORT: [
    'bericht', 'berichte', 'report',
    'pdf', 'export',
    'arztbericht', 'arztberichte',
    'kopfschmerztagebuch'
  ],
  
  // Medikationsplan
  MEDPLAN: [
    'medikationsplan', 'medikamentplan',
    'medplan', 'therapieplan',
    'prophylaxeplan', 'behandlungsplan'
  ],
  
  // Medikamente
  MEDS: [
    'medikament', 'medikamente', 'medication',
    'tablette', 'tabletten', 'pille', 'pillen',
    'spritze', 'spritzen', 'injektion',
    'einnahme', 'einnahmen',
    'dosis', 'dosierung'
  ],
  
  // Profil / Persönliche Daten
  PROFILE: [
    'profil', 'profile',
    'persönliche', 'daten', 'stammdaten',
    'patientendaten'
  ],
  
  // Einstellungen
  SETTINGS: [
    'einstellungen', 'settings',
    'konfiguration', 'optionen',
    'präferenzen'
  ],
  
  // Ärzte
  DOCTORS: [
    'arzt', 'ärzte', 'doktor', 'doktoren',
    'arztdaten', 'ärzteliste',
    'neurologe', 'neurologen',
    'hausarzt', 'hausärzte'
  ]
};

// ============================================
// Modifiers
// ============================================

// Ordinalzahlen (Position)
export const ORDINALS: Record<string, number> = {
  'letzter': 1, 'letzte': 1, 'letzten': 1, 'letztes': 1,
  'vorletzter': 2, 'vorletzte': 2, 'vorletzten': 2, 'vorletztes': 2,
  'drittletzter': 3, 'drittletzte': 3, 'drittletzten': 3,
  'viertletzter': 4, 'viertletzte': 4,
  'erster': 1, 'erste': 1, 'ersten': 1,
  'zweiter': 2, 'zweite': 2, 'zweiten': 2,
  'dritter': 3, 'dritte': 3, 'dritten': 3,
};

// Filter-Wörter
export const FILTER_WORDS = [
  'mit', 'ohne', 'enthält', 'wo', 'bei', 'von', 'für',
  'nur', 'alle', 'jeder', 'jede', 'jeden'
];

// Schmerz-Schwellenwerte
export const PAIN_THRESHOLDS = [
  'mindestens', 'minimal', 'minimum',
  'über', 'größer', 'höher', 'mehr',
  'unter', 'kleiner', 'niedriger', 'weniger',
  'genau', 'exakt'
];

// Zeitangaben
export const TIME_WORDS = {
  // Relative Tage
  relative: {
    'heute': 0,
    'gestern': -1,
    'vorgestern': -2,
    'morgen': 1,
    'übermorgen': 2,
  },
  
  // Relative Perioden
  periods: [
    'diese woche', 'letzte woche', 'nächste woche',
    'diesen monat', 'letzten monat', 'nächsten monat',
    'dieses jahr', 'letztes jahr'
  ],
  
  // Zeiträume mit Zahlen (Pattern)
  rangePatterns: [
    /letzte(?:n)?\s*(\d+)\s*tage?/i,
    /letzte(?:n)?\s*(\d+)\s*woche(?:n)?/i,
    /letzte(?:n)?\s*(\d+)\s*monat(?:e)?/i,
    /(\d+)\s*tage?\s*(?:zurück|her)/i,
  ],
  
  // Standard-Zeiträume
  standardRanges: {
    '7 tage': 7,
    'eine woche': 7,
    '14 tage': 14,
    'zwei wochen': 14,
    '30 tage': 30,
    'ein monat': 30,
    'einen monat': 30,
    '3 monate': 90,
    'drei monate': 90,
    '6 monate': 180,
    'sechs monate': 180,
    'ein jahr': 365,
  }
};

// ============================================
// Rating Expressions
// ============================================

export const RATING_EXPRESSIONS: Record<string, number> = {
  // Sehr negativ (0-2)
  'gar nicht': 0, 'überhaupt nicht': 0, 'keine wirkung': 0,
  'nichts': 0, 'wirkungslos': 0,
  'schlecht': 1, 'kaum': 1, 'minimal': 1,
  'sehr schlecht': 0, 'katastrophal': 0,
  
  // Negativ (2-4)
  'wenig': 2, 'schwach': 2,
  'etwas': 3, 'ein bisschen': 3,
  'mäßig': 4, 'mittelmäßig': 4,
  
  // Neutral (5)
  'mittel': 5, 'durchschnittlich': 5, 'okay': 5, 'ok': 5,
  
  // Positiv (6-8)
  'ganz gut': 6, 'ordentlich': 6,
  'gut': 7, 'wirksam': 7,
  'sehr gut': 8, 'stark': 8,
  
  // Sehr positiv (9-10)
  'super': 9, 'toll': 9, 'prima': 9,
  'hervorragend': 10, 'perfekt': 10, 'bestens': 10,
  'ausgezeichnet': 10, 'sehr wirksam': 10,
};

// ============================================
// Medication Categories
// ============================================

export const MEDICATION_CATEGORIES: Record<string, string[]> = {
  'triptan': [
    'triptan', 'triptane',
    'sumatriptan', 'rizatriptan', 'zolmitriptan',
    'eletriptan', 'naratriptan', 'almotriptan', 'frovatriptan',
    'imigran', 'maxalt', 'ascotop', 'relert', 'relpax'
  ],
  'schmerzmittel': [
    'schmerzmittel', 'schmerztablette', 'schmerztabletten',
    'ibuprofen', 'paracetamol', 'aspirin', 'acetylsalicylsäure',
    'diclofenac', 'naproxen', 'novalgin', 'metamizol'
  ],
  'prophylaxe': [
    'prophylaxe', 'vorbeugung',
    'ajovy', 'fremanezumab', 'aimovig', 'erenumab',
    'emgality', 'galcanezumab',
    'topiramat', 'topamax',
    'betablocker', 'metoprolol', 'propranolol',
    'amitriptylin', 'flunarizin'
  ],
  'antiemetikum': [
    'antiemetikum', 'gegen übelkeit',
    'metoclopramid', 'mcp', 'domperidon', 'vomex', 'dimenhydrinat'
  ]
};

// ============================================
// Helper Functions
// ============================================

/**
 * Entfernt Filler-Wörter und normalisiert Text
 */
export function canonicalizeText(text: string): string {
  let normalized = text
    .toLowerCase()
    .trim()
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove punctuation except hyphens in compound words
    .replace(/[.,!?;:'"„""«»]/g, '')
    // Normalize German quotes
    .replace(/[„""]/g, '"')
    // Remove common phrases that add no semantic value
    .replace(/kannst du (mir\s+)?/g, '')
    .replace(/könntest du (mir\s+)?/g, '')
    .replace(/würdest du (mir\s+)?/g, '')
    .replace(/ich möchte\s+/g, '')
    .replace(/ich will\s+/g, '')
    .replace(/ich hätte gerne?\s+/g, '');
  
  // Remove filler words but preserve structure
  const words = normalized.split(' ');
  const filtered = words.filter(word => !FILLER_WORDS.has(word) || word.length > 3);
  
  return filtered.join(' ').trim();
}

/**
 * Erkennt Operator aus Text
 */
export function detectOperator(text: string): OperatorType | null {
  const lower = text.toLowerCase();
  
  // Check each operator type
  for (const [opType, keywords] of Object.entries(OPERATORS)) {
    for (const keyword of keywords) {
      // Use word boundary check for short keywords
      if (keyword.length <= 3) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(lower)) {
          return opType as OperatorType;
        }
      } else if (lower.includes(keyword)) {
        return opType as OperatorType;
      }
    }
  }
  
  return null;
}

/**
 * Erkennt Objekt-Typ aus Text
 */
export function detectObject(text: string): ObjectType | null {
  const lower = text.toLowerCase();
  
  for (const [objType, keywords] of Object.entries(OBJECTS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return objType as ObjectType;
      }
    }
  }
  
  return null;
}

/**
 * Extrahiert Ordinalzahl aus Text
 */
export function extractOrdinal(text: string): number | null {
  const lower = text.toLowerCase();
  
  // Check word ordinals
  for (const [word, value] of Object.entries(ORDINALS)) {
    if (lower.includes(word)) {
      return value;
    }
  }
  
  // Check # notation: #1, #2, etc.
  const hashMatch = lower.match(/#(\d+)/);
  if (hashMatch) {
    return parseInt(hashMatch[1], 10);
  }
  
  return null;
}

/**
 * Extrahiert Rating aus Text
 */
export function extractRating(text: string): number | null {
  const lower = text.toLowerCase();
  
  // Check explicit numbers first (0-10)
  const numberMatch = lower.match(/(?:mit|auf|bewertung|rating|wirkung)\s*:?\s*(\d+)/i);
  if (numberMatch) {
    const num = parseInt(numberMatch[1], 10);
    if (num >= 0 && num <= 10) return num;
  }
  
  // Check rating expressions
  for (const [expr, value] of Object.entries(RATING_EXPRESSIONS)) {
    if (lower.includes(expr)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Findet Medikamenten-Kategorie
 */
export function findMedicationCategory(medName: string): string | null {
  const lower = medName.toLowerCase();
  
  for (const [category, keywords] of Object.entries(MEDICATION_CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw) || kw.includes(lower))) {
      return category;
    }
  }
  
  return null;
}

/**
 * Extrahiert Zeitraum aus Text
 */
export function extractTimeRange(text: string): { days: number } | null {
  const lower = text.toLowerCase();
  
  // Check standard ranges
  for (const [phrase, days] of Object.entries(TIME_WORDS.standardRanges)) {
    if (lower.includes(phrase)) {
      return { days };
    }
  }
  
  // Check pattern-based ranges
  for (const pattern of TIME_WORDS.rangePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      // Adjust for weeks/months
      if (pattern.source.includes('woche')) {
        return { days: num * 7 };
      }
      if (pattern.source.includes('monat')) {
        return { days: num * 30 };
      }
      return { days: num };
    }
  }
  
  return null;
}

/**
 * Prüft ob ein Operator explizit im Text vorkommt (für Safety-Checks)
 */
export function hasExplicitOperator(text: string, operatorType: OperatorType): boolean {
  const lower = text.toLowerCase();
  const keywords = OPERATORS[operatorType];
  
  return keywords.some(keyword => {
    // Require word boundary for short keywords
    if (keyword.length <= 3) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(lower);
    }
    return lower.includes(keyword);
  });
}
