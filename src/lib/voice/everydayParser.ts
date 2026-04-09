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
 * 
 * WICHTIG: Diese Erkennung ist NUR eine Hilfsschicht.
 * Der Rohtext bleibt IMMER erhalten.
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

export interface EverydayParseResult {
  entities: EverydayEntity[];
  timeReferences: TimeReference[];
  causalLinks: CausalLink[];
}

export interface TimeReference {
  text: string;
  type: 'now' | 'recent' | 'relative' | 'absolute';
  confidence: number;
}

export interface CausalLink {
  cause: string;
  effect: string;
  confidence: number;
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
    ],
  },

  // --- RUHE / SCHLAF ---
  {
    category: 'sleep_rest',
    patterns: [
      { regex: /\bhingelegt/i, value: 'hingelegt' },
      { regex: /\blege?\s*(?:mich)?\s*hin/i, value: 'hinlegen' },
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
    ],
  },

  // --- ME/CFS-RELEVANTE ZUSTÄNDE ---
  {
    category: 'mecfs_state',
    patterns: [
      { regex: /\berschöpf/i, value: 'erschöpft' },
      { regex: /\bkomplett\s+platt/i, value: 'komplett_platt' },
      { regex: /\btotal\s+platt/i, value: 'total_platt' },
      { regex: /\bplatt\b/i, value: 'platt' },
      { regex: /\bfertig\b/i, value: 'fertig' },
      { regex: /\bcrash/i, value: 'crash' },
      { regex: /\bpem\b/i, value: 'pem' },
      { regex: /\breizüberflutet/i, value: 'reizüberflutet' },
      { regex: /\breizüberflut/i, value: 'reizüberflutung' },
      { regex: /\bbrain\s*fog/i, value: 'brainfog' },
      { regex: /\bnebel\s*(?:im\s*)?kopf/i, value: 'brainfog' },
      { regex: /\bkognitiv(?:e)?\s+erschöpf/i, value: 'kognitive_erschöpfung' },
      { regex: /\borthostatisch/i, value: 'orthostatisch' },
      { regex: /\bkreislauf/i, value: 'kreislauf' },
      { regex: /\bkraftlos/i, value: 'kraftlos' },
      { regex: /\benergiel/i, value: 'energielos' },
      { regex: /\bausgepowert/i, value: 'ausgepowert' },
      { regex: /\bausgelaugt/i, value: 'ausgelaugt' },
      { regex: /\bnicht\s+belastbar/i, value: 'nicht_belastbar' },
      { regex: /\bschwach\b/i, value: 'schwach' },
      { regex: /\bschwäche/i, value: 'schwäche' },
      { regex: /\bzittrig/i, value: 'zittrig' },
      { regex: /\bbenommen/i, value: 'benommen' },
      { regex: /\bbenebelt/i, value: 'benebelt' },
      { regex: /\bdeutlich\s+schlechter/i, value: 'verschlechtert' },
      { regex: /\bviel\s+schlechter/i, value: 'verschlechtert' },
      { regex: /\bverschlechter/i, value: 'verschlechtert' },
    ],
  },
];

// --- ZEITBEZÜGE ---
const TIME_REFERENCE_PATTERNS: { regex: RegExp; type: TimeReference['type'] }[] = [
  { regex: /\bgerade\b/i, type: 'now' },
  { regex: /\bjetzt\b/i, type: 'now' },
  { regex: /\beben\b/i, type: 'recent' },
  { regex: /\bvorhin\b/i, type: 'recent' },
  { regex: /\bvor\s+(?:\d+|ein(?:er)?|zwei|drei)\s+(?:minute|stunde)/i, type: 'relative' },
  { regex: /\bseit\s+(?:\d+|ein(?:er)?)\s+(?:minute|stunde)/i, type: 'relative' },
  { regex: /\bheute\s+(?:morgen|mittag|abend|nacht|früh)/i, type: 'absolute' },
  { regex: /\bnach\s+dem\s+(?:aufstehen|essen|duschen|termin|spazier)/i, type: 'relative' },
  { regex: /\bvor\s+dem\s+(?:schlafen|essen|termin)/i, type: 'relative' },
  { regex: /\bspäter\b/i, type: 'relative' },
  { regex: /\bdanach\b/i, type: 'relative' },
];

// --- KAUSAL-MUSTER ---
const CAUSAL_PATTERNS: { regex: RegExp; causeGroup: number; effectGroup: number }[] = [
  { regex: /(?:nach|seit)\s+(?:dem\s+)?(.+?)\s+(?:bin ich|habe ich|ist|merke ich|fühle ich)\s+(.+)/i, causeGroup: 1, effectGroup: 2 },
  { regex: /(.+?)\s+(?:und\s+)?(?:jetzt|danach|seitdem)\s+(.+)/i, causeGroup: 1, effectGroup: 2 },
];

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
  for (const { regex, type } of TIME_REFERENCE_PATTERNS) {
    const match = regex.exec(norm);
    if (match) {
      timeReferences.push({
        text: match[0],
        type,
        confidence: 0.80,
      });
    }
  }

  // Kausale Zusammenhänge
  for (const { regex, causeGroup, effectGroup } of CAUSAL_PATTERNS) {
    const match = regex.exec(norm);
    if (match) {
      causalLinks.push({
        cause: match[causeGroup]?.trim() ?? '',
        effect: match[effectGroup]?.trim() ?? '',
        confidence: 0.60,
      });
    }
  }

  return { entities, timeReferences, causalLinks };
}
