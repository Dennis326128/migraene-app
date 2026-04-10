/**
 * everydayParser.ts
 * Erweiterte Erkennung für Alltags- und ME/CFS-relevante Inhalte.
 * 
 * Ergänzt den bestehenden parseVoiceEntry um:
 * - Essen/Trinken
 * - Ruhe/Schlaf
 * - Aktivität/Belastung
 * - Umwelt/Kontext
 * - ME/CFS-relevante Zustände
 * - Zeitbezug/Verlauf
 * - Kausale Zusammenhänge
 * 
 * WICHTIG: Diese Erkennung ist NUR eine Hilfsschicht.
 * Der Rohtext bleibt IMMER erhalten.
 * 
 * === STRUCTURED_DATA SCHEMA (everyday) ===
 * 
 *   entities[]       – recognized items (food, activity, etc.)
 *   timeReferences[] – temporal markers (gerade, seit, nach dem...)
 *   causalLinks[]    – detected cause→effect hints
 *   mecfsSignals     – ME/CFS-specific summary (optional)
 *   summary          – compact machine-readable digest
 */

// ============================================================
// === TYPEN ===
// ============================================================

export interface EverydayEntity {
  category: string;
  value: string;
  detail?: string;
  confidence: number;
  span: [number, number];
}

export interface TimeReference {
  text: string;
  type: 'now' | 'recent' | 'relative' | 'absolute' | 'sequential';
  /** Normalized hint for analysis (e.g. 'nach_duschen', 'seit_morgen') */
  normalizedHint?: string;
  confidence: number;
}

export interface CausalLink {
  cause: string;
  effect: string;
  confidence: number;
}

/** ME/CFS-specific signal summary for analysis */
export interface MecfsSignal {
  /** Detected exertion trigger (duschen, einkaufen, termin...) */
  trigger?: string;
  /** State description (platt, brainfog, crash...) */
  state: string;
  /** Severity hint: mild | moderate | severe */
  severity: 'mild' | 'moderate' | 'severe';
  /** Whether a PEM pattern is suggested (activity → delayed crash) */
  pemSuggested: boolean;
}

export interface EverydayParseResult {
  entities: EverydayEntity[];
  timeReferences: TimeReference[];
  causalLinks: CausalLink[];
  mecfsSignals?: MecfsSignal;
  /** Compact summary for structured_data */
  summary: {
    categories: string[];
    primaryCategory?: string;
    hasTimeReference: boolean;
    hasCausalHint: boolean;
    hasMecfsSignal: boolean;
  };
}

// ============================================================
// === PATTERNS ===
// ============================================================

interface EntityPattern {
  category: string;
  patterns: { regex: RegExp; value: string; detail?: string }[];
}

const EVERYDAY_PATTERNS: EntityPattern[] = [
  // --- ESSEN / TRINKEN ---
  {
    category: 'food_drink',
    patterns: [
      { regex: /\bkaffee/i, value: 'kaffee', detail: 'getränk' },
      { regex: /\btee\b/i, value: 'tee', detail: 'getränk' },
      { regex: /\bwasser\b/i, value: 'wasser', detail: 'getränk' },
      { regex: /\bcola\b/i, value: 'cola', detail: 'getränk' },
      { regex: /\bsaft\b/i, value: 'saft', detail: 'getränk' },
      { regex: /\balkoho/i, value: 'alkohol', detail: 'getränk' },
      { regex: /\bbier\b/i, value: 'bier', detail: 'getränk' },
      { regex: /\bwein\b/i, value: 'wein', detail: 'getränk' },
      { regex: /\bmilch\b/i, value: 'milch', detail: 'getränk' },
      { regex: /\bsmoothie/i, value: 'smoothie', detail: 'getränk' },
      { regex: /\benergy/i, value: 'energydrink', detail: 'getränk' },
      { regex: /\bfrühstück/i, value: 'frühstück', detail: 'mahlzeit' },
      { regex: /\bmittagessen/i, value: 'mittagessen', detail: 'mahlzeit' },
      { regex: /\babendessen/i, value: 'abendessen', detail: 'mahlzeit' },
      { regex: /\bgegessen/i, value: 'essen', detail: 'mahlzeit' },
      { regex: /\besse\b/i, value: 'essen', detail: 'mahlzeit' },
      { regex: /\bsnack/i, value: 'snack', detail: 'mahlzeit' },
      { regex: /\bschokolade/i, value: 'schokolade', detail: 'nahrung' },
      { regex: /\bpizza/i, value: 'pizza', detail: 'nahrung' },
      { regex: /\bbrot\b/i, value: 'brot', detail: 'nahrung' },
      { regex: /\bjoghurt/i, value: 'joghurt', detail: 'nahrung' },
      { regex: /\bmüsli/i, value: 'müsli', detail: 'nahrung' },
      { regex: /\bnüsse/i, value: 'nüsse', detail: 'nahrung' },
      { regex: /\bkäse/i, value: 'käse', detail: 'nahrung' },
      { regex: /\bchips/i, value: 'chips', detail: 'nahrung' },
      { regex: /\bobst\b/i, value: 'obst', detail: 'nahrung' },
      { regex: /\bgemüse/i, value: 'gemüse', detail: 'nahrung' },
      { regex: /\bsalat\b/i, value: 'salat', detail: 'nahrung' },
      { regex: /\bgetrunken/i, value: 'getrunken', detail: 'trinken' },
      { regex: /\btrinke?\b/i, value: 'trinken', detail: 'trinken' },
      { regex: /\betwas\s+gegessen/i, value: 'etwas_gegessen', detail: 'mahlzeit' },
      { regex: /\bnichts?\s+gegessen/i, value: 'nichts_gegessen', detail: 'mahlzeit' },
      { regex: /\bwenig\s+gegessen/i, value: 'wenig_gegessen', detail: 'mahlzeit' },
      { regex: /\bwenig\s+getrunken/i, value: 'wenig_getrunken', detail: 'trinken' },
    ],
  },

  // --- RUHE / SCHLAF ---
  {
    category: 'sleep_rest',
    patterns: [
      { regex: /\bhingelegt/i, value: 'hingelegt' },
      { regex: /\blege?\s*(?:mich\s+)?(?:jetzt\s+)?hin/i, value: 'hinlegen' },
      { regex: /\bins?\s*bett/i, value: 'ins_bett' },
      { regex: /\bgeschlafen/i, value: 'geschlafen' },
      { regex: /\bschlafe?\b/i, value: 'schlafen' },
      { regex: /\baufgewacht/i, value: 'aufgewacht' },
      { regex: /\baufgestanden/i, value: 'aufgestanden' },
      { regex: /\bpause\b/i, value: 'pause' },
      { regex: /\bausgeruht/i, value: 'ausgeruht' },
      { regex: /\bdöse?n/i, value: 'dösen' },
      { regex: /\bnickerchen/i, value: 'nickerchen' },
      { regex: /\bdurchgeschlafen/i, value: 'durchgeschlafen' },
      { regex: /\beingeschlafen/i, value: 'eingeschlafen' },
      { regex: /\brunter(?:gefahren|kommen)/i, value: 'runterfahren' },
      { regex: /\bschlecht\s+geschlafen/i, value: 'schlecht_geschlafen', detail: 'qualität' },
      { regex: /\bgut\s+geschlafen/i, value: 'gut_geschlafen', detail: 'qualität' },
      { regex: /\bkaum\s+geschlafen/i, value: 'kaum_geschlafen', detail: 'qualität' },
      { regex: /\bmusste?\s+(?:mich\s+)?hinlegen/i, value: 'musste_hinlegen', detail: 'zwang' },
    ],
  },

  // --- AKTIVITÄT / BELASTUNG ---
  {
    category: 'activity',
    patterns: [
      { regex: /\bspazier/i, value: 'spaziergang' },
      { regex: /\bduschen?\b|geduscht/i, value: 'duschen' },
      { regex: /\bbaden?\b|gebadet/i, value: 'baden' },
      { regex: /\beinkauf/i, value: 'einkaufen' },
      { regex: /\barbeiten?\b|gearbeitet/i, value: 'arbeiten' },
      { regex: /\btermin\b/i, value: 'termin' },
      { regex: /\barzt/i, value: 'arzttermin' },
      { regex: /\bhaushalt/i, value: 'haushalt' },
      { regex: /\bputzen/i, value: 'putzen' },
      { regex: /\bkochen?\b|gekocht/i, value: 'kochen' },
      { regex: /\btreppe/i, value: 'treppe' },
      { regex: /\bfahren?\b|gefahren/i, value: 'fahren' },
      { regex: /\bsport\b/i, value: 'sport' },
      { regex: /\btraining/i, value: 'training' },
      { regex: /\bjoggen/i, value: 'joggen' },
      { regex: /\byoga\b/i, value: 'yoga' },
      { regex: /\bschwimm/i, value: 'schwimmen' },
      { regex: /\bbildschirm/i, value: 'bildschirmarbeit' },
      { regex: /\bcomputer/i, value: 'computer' },
      { regex: /\bhandy/i, value: 'handy' },
      { regex: /\bbesuch\b/i, value: 'besuch' },
      { regex: /\btreffen/i, value: 'treffen' },
      { regex: /\bdraußen\b/i, value: 'draußen' },
      { regex: /\bunterwegs/i, value: 'unterwegs' },
      { regex: /\btelefonier/i, value: 'telefonieren' },
      { regex: /\blesen\b|gelesen/i, value: 'lesen' },
      { regex: /\bkurz\s+draußen/i, value: 'kurz_draußen' },
    ],
  },

  // --- UMWELT / KONTEXT ---
  {
    category: 'environment',
    patterns: [
      { regex: /\bregen(?:et)?\b/i, value: 'regen' },
      { regex: /\bhitze/i, value: 'hitze' },
      { regex: /\bheiß\b/i, value: 'heiß' },
      { regex: /\bkalt\b|kälte/i, value: 'kalt' },
      { regex: /\bsonne/i, value: 'sonne' },
      { regex: /\bwetterwechsel/i, value: 'wetterwechsel' },
      { regex: /\bhelles?\s+licht/i, value: 'helles_licht' },
      { regex: /\bgrell/i, value: 'grelles_licht' },
      { regex: /\blaut\b/i, value: 'laut' },
      { regex: /\blärm/i, value: 'lärm' },
      { regex: /\bstickig/i, value: 'stickig' },
      { regex: /\bschwül/i, value: 'schwül' },
      { regex: /\bmenschen(?:menge|masse)/i, value: 'menschenmenge' },
      { regex: /\bgeruch|gerüche|gestank/i, value: 'gerüche' },
      { regex: /\bparfum|parfüm/i, value: 'parfum' },
      { regex: /\bwind\b/i, value: 'wind' },
      { regex: /\bsturm/i, value: 'sturm' },
      { regex: /\bgewitter/i, value: 'gewitter' },
      { regex: /\blicht\b.*\b(?:schlimm|grell|hell|blendet|stört|nervt)/i, value: 'licht_störend', detail: 'reiz' },
      { regex: /\bhell\b.*\bhier/i, value: 'hell_hier', detail: 'reiz' },
      { regex: /\blaut\b.*\bhier/i, value: 'laut_hier', detail: 'reiz' },
    ],
  },

  // --- ME/CFS-RELEVANTE ZUSTÄNDE ---
  {
    category: 'mecfs_state',
    patterns: [
      { regex: /\berschöpf/i, value: 'erschöpft' },
      { regex: /\bkomplett\s+platt/i, value: 'komplett_platt', detail: 'severe' },
      { regex: /\btotal\s+platt/i, value: 'total_platt', detail: 'severe' },
      { regex: /\bvöllig\s+platt/i, value: 'völlig_platt', detail: 'severe' },
      { regex: /\bvoll\s+platt/i, value: 'voll_platt', detail: 'severe' },
      { regex: /\bplatt\b/i, value: 'platt' },
      { regex: /\bfertig\b/i, value: 'fertig' },
      { regex: /\bcrash/i, value: 'crash', detail: 'severe' },
      { regex: /\bpem\b/i, value: 'pem', detail: 'severe' },
      { regex: /\breizüberflutet/i, value: 'reizüberflutet', detail: 'severe' },
      { regex: /\breizüberflut/i, value: 'reizüberflutung', detail: 'severe' },
      { regex: /\bbrain\s*fog/i, value: 'brainfog', detail: 'moderate' },
      { regex: /\bnebel\s*(?:im\s*)?kopf/i, value: 'brainfog', detail: 'moderate' },
      { regex: /\bkognitiv(?:e)?\s+erschöpf/i, value: 'kognitive_erschöpfung', detail: 'moderate' },
      { regex: /\borthostatisch/i, value: 'orthostatisch', detail: 'moderate' },
      { regex: /\bkreislauf/i, value: 'kreislauf', detail: 'moderate' },
      { regex: /\bkraftlos/i, value: 'kraftlos' },
      { regex: /\benergiel/i, value: 'energielos' },
      { regex: /\bausgepowert/i, value: 'ausgepowert', detail: 'severe' },
      { regex: /\bausgelaugt/i, value: 'ausgelaugt', detail: 'moderate' },
      { regex: /\bnicht\s+belastbar/i, value: 'nicht_belastbar', detail: 'severe' },
      { regex: /\bschwach\b/i, value: 'schwach' },
      { regex: /\bschwäche/i, value: 'schwäche' },
      { regex: /\bzittrig/i, value: 'zittrig', detail: 'moderate' },
      { regex: /\bbenommen/i, value: 'benommen', detail: 'moderate' },
      { regex: /\bbenebelt/i, value: 'benebelt', detail: 'moderate' },
      { regex: /\bcrashig/i, value: 'crashig', detail: 'severe' },
      { regex: /\bmatschig/i, value: 'matschig', detail: 'moderate' },
      { regex: /\bschlapp/i, value: 'schlapp' },
      { regex: /\bkaputt\b/i, value: 'kaputt', detail: 'moderate' },
      { regex: /\bkomplett\s+(?:erledigt|kaputt|fertig|am\s+ende)/i, value: 'komplett_fertig', detail: 'severe' },
      { regex: /\bdeutlich\s+schlechter/i, value: 'verschlechtert' },
      { regex: /\bviel\s+schlechter/i, value: 'verschlechtert' },
      { regex: /\bverschlechter/i, value: 'verschlechtert' },
      { regex: /\bdaneben\b/i, value: 'daneben' },
      { regex: /\bnicht\s+gut\b/i, value: 'nicht_gut' },
      { regex: /\bkomisch\b/i, value: 'komisch' },
    ],
  },

  // --- WELLBEING (positive signals, also relevant for analysis) ---
  {
    category: 'wellbeing',
    patterns: [
      { regex: /\bgut\b(?!\s+geschlafen)/i, value: 'gut' },
      { regex: /\bbesser\b/i, value: 'besser' },
      { regex: /\berho(?:lt|lung)/i, value: 'erholt' },
      { regex: /\bfit\b/i, value: 'fit' },
      { regex: /\bwohl\b/i, value: 'wohl' },
    ],
  },
];

// --- ZEITBEZÜGE (expanded) ---
const TIME_REFERENCE_PATTERNS: { regex: RegExp; type: TimeReference['type']; hint?: string }[] = [
  // NOW
  { regex: /\bgerade\b/i, type: 'now', hint: 'jetzt' },
  { regex: /\bjetzt\b/i, type: 'now', hint: 'jetzt' },
  { regex: /\baktuell\b/i, type: 'now', hint: 'jetzt' },
  { regex: /\bim\s+moment\b/i, type: 'now', hint: 'jetzt' },
  // RECENT
  { regex: /\beben\b/i, type: 'recent', hint: 'eben' },
  { regex: /\bvorhin\b/i, type: 'recent', hint: 'vorhin' },
  { regex: /\bvor\s+kurzem/i, type: 'recent', hint: 'vor_kurzem' },
  // RELATIVE durations
  { regex: /\bvor\s+(\d+|ein(?:er)?|zwei|drei|vier|fünf)\s+(minute|stunde)/i, type: 'relative', hint: 'vor_zeit' },
  { regex: /\bseit\s+(\d+|ein(?:er)?|zwei|drei|vier|fünf)\s+(minute|stunde)/i, type: 'relative', hint: 'seit_zeit' },
  { regex: /\bseit\s+stunden\b/i, type: 'relative', hint: 'seit_stunden' },
  { regex: /\bseit\s+heute\s+(morgen|mittag|abend|früh|vormittag|nachmittag)/i, type: 'absolute', hint: 'seit_tageszeit' },
  { regex: /\bheute\s+(morgen|mittag|abend|nacht|früh|vormittag|nachmittag)\b/i, type: 'absolute', hint: 'tageszeit' },
  { regex: /\bgestern\s*(abend|nacht|morgen|mittag)?\b/i, type: 'absolute', hint: 'gestern' },
  // SEQUENTIAL / after-activity
  { regex: /\bnach\s+dem\s+(aufstehen|essen|frühstück|mittagessen|abendessen|duschen|baden|termin|spazier\w*|einkauf\w*|training|sport|schlafen|kochen|putzen|arbeiten)/i, type: 'sequential', hint: 'nach_aktivität' },
  { regex: /\bvor\s+dem\s+(schlafen|essen|termin|aufstehen|frühstück|training)/i, type: 'sequential', hint: 'vor_aktivität' },
  { regex: /\bbeim\s+(aufstehen|essen|duschen|einkauf\w*|spazier\w*|arbeiten|kochen)/i, type: 'sequential', hint: 'während_aktivität' },
  // SEQUENTIAL connectors
  { regex: /\bspäter\b/i, type: 'sequential', hint: 'später' },
  { regex: /\bdanach\b/i, type: 'sequential', hint: 'danach' },
  { regex: /\banschließend\b/i, type: 'sequential', hint: 'danach' },
  { regex: /\bdann\b/i, type: 'sequential', hint: 'dann' },
  { regex: /\bnachher\b/i, type: 'sequential', hint: 'nachher' },
  { regex: /\bvorher\b/i, type: 'sequential', hint: 'vorher' },
];

// --- KAUSAL-MUSTER (expanded) ---
const CAUSAL_PATTERNS: { regex: RegExp; causeGroup: number; effectGroup: number }[] = [
  // "nach dem Duschen komplett platt"
  { regex: /nach\s+(?:dem\s+)?(\w+(?:\s+\w+)?)\s+(?:bin\s+(?:ich\s+)?|habe\s+(?:ich\s+)?|ist\s+|fühle?\s+(?:ich\s+)?|wurde?\s+(?:ich\s+)?)?(?:jetzt\s+|dann\s+|total\s+|komplett\s+|völlig\s+|voll\s+)?(.+)/i, causeGroup: 1, effectGroup: 2 },
  // "X und jetzt/danach/seitdem Y"
  { regex: /(.+?)\s+(?:und\s+)?(?:jetzt|danach|seitdem|dann)\s+(.+)/i, causeGroup: 1, effectGroup: 2 },
  // "seit dem X"
  { regex: /seit\s+(?:dem\s+)?(\w+(?:\s+\w+)?)\s+(.+)/i, causeGroup: 1, effectGroup: 2 },
  // "X, später Y"
  { regex: /(.+?),?\s+später\s+(.+)/i, causeGroup: 1, effectGroup: 2 },
];

// ME/CFS PEM trigger activities
const PEM_TRIGGER_ACTIVITIES = new Set([
  'duschen', 'baden', 'einkaufen', 'spaziergang', 'termin', 'arzttermin',
  'arbeiten', 'haushalt', 'putzen', 'kochen', 'sport', 'training',
  'joggen', 'schwimmen', 'treppe', 'besuch', 'treffen', 'unterwegs',
  'draußen', 'kurz_draußen',
]);

const SEVERE_MECFS_VALUES = new Set([
  'komplett_platt', 'total_platt', 'völlig_platt', 'voll_platt',
  'crash', 'crashig', 'pem', 'reizüberflutet', 'reizüberflutung',
  'ausgepowert', 'nicht_belastbar', 'komplett_fertig',
]);

// ============================================================
// === HAUPT-FUNKTION ===
// ============================================================

/**
 * Parst Alltagsinhalte aus einer Spracheingabe.
 * Ergänzende Schicht zum bestehenden parseVoiceEntry.
 */
export function parseEverydayContent(text: string): EverydayParseResult {
  const norm = text.toLowerCase();
  const entities: EverydayEntity[] = [];
  const timeReferences: TimeReference[] = [];
  const causalLinks: CausalLink[] = [];

  // Entity-Extraktion
  for (const group of EVERYDAY_PATTERNS) {
    for (const { regex, value, detail } of group.patterns) {
      const match = regex.exec(norm);
      if (match) {
        entities.push({
          category: group.category,
          value,
          detail,
          confidence: 0.85,
          span: [match.index, match.index + match[0].length],
        });
      }
    }
  }

  // Zeitreferenzen
  for (const { regex, type, hint } of TIME_REFERENCE_PATTERNS) {
    const match = regex.exec(norm);
    if (match) {
      timeReferences.push({
        text: match[0],
        type,
        normalizedHint: hint,
        confidence: 0.80,
      });
    }
  }

  // Kausale Zusammenhänge
  for (const { regex, causeGroup, effectGroup } of CAUSAL_PATTERNS) {
    const match = regex.exec(norm);
    if (match && match[causeGroup] && match[effectGroup]) {
      const cause = match[causeGroup].trim();
      const effect = match[effectGroup].trim();
      // Only add if both parts are substantial
      if (cause.length >= 3 && effect.length >= 2) {
        causalLinks.push({ cause, effect, confidence: 0.60 });
      }
    }
  }

  // ME/CFS signal detection
  const mecfsSignals = detectMecfsSignals(entities, timeReferences, causalLinks);

  // Build summary
  const categories = [...new Set(entities.map(e => e.category))];
  const primaryCategory = categories.length > 0
    ? (categories.includes('mecfs_state') ? 'mecfs_state' : categories[0])
    : undefined;

  return {
    entities,
    timeReferences,
    causalLinks,
    mecfsSignals: mecfsSignals ?? undefined,
    summary: {
      categories,
      primaryCategory,
      hasTimeReference: timeReferences.length > 0,
      hasCausalHint: causalLinks.length > 0,
      hasMecfsSignal: mecfsSignals !== null,
    },
  };
}

/**
 * Detects ME/CFS-specific PEM patterns.
 * Looks for activity + exhaustion combinations.
 */
function detectMecfsSignals(
  entities: EverydayEntity[],
  timeRefs: TimeReference[],
  causalLinks: CausalLink[],
): MecfsSignal | null {
  const mecfsEntities = entities.filter(e => e.category === 'mecfs_state');
  if (mecfsEntities.length === 0) return null;

  // Find activity that could be a trigger
  const activityEntities = entities.filter(e => e.category === 'activity');
  const trigger = activityEntities.find(a => PEM_TRIGGER_ACTIVITIES.has(a.value));

  // Determine severity
  const hasSevere = mecfsEntities.some(e => SEVERE_MECFS_VALUES.has(e.value));
  const hasModerate = mecfsEntities.some(e => e.detail === 'moderate');
  const severity: MecfsSignal['severity'] = hasSevere ? 'severe' : hasModerate ? 'moderate' : 'mild';

  // Primary state
  const state = mecfsEntities[0].value;

  // PEM suggested if: activity + exhaustion + sequential time reference
  const hasSequentialTime = timeRefs.some(t => t.type === 'sequential' || t.type === 'recent');
  const hasCausalLink = causalLinks.length > 0;
  const pemSuggested = !!(trigger && (hasSequentialTime || hasCausalLink));

  return {
    trigger: trigger?.value,
    state,
    severity,
    pemSuggested,
  };
}
