/**
 * voiceGrammar.ts
 * Zentrale Konstanten und Vokabular-Maps für das Voice-Input-System.
 * Alle Synonyme, Mappings und Patterns für die Spracherkennung.
 */

// ============================================================
// === SCHMERZSTÄRKE ===
// ============================================================

/** Zahlen-Wörter auf Deutsch (Standard + Österreichisch/Bayerisch) */
export const NUMBER_WORD_MAP: Record<string, number> = {
  // Standard Deutsch
  'null': 0,
  'eins': 1,
  'eine': 1,
  'ein': 1,
  'zwei': 2,
  'drei': 3,
  'vier': 4,
  'fünf': 5,
  'sechs': 6,
  'sieben': 7,
  'acht': 8,
  'neun': 9,
  'zehn': 10,
  // Österreichisch / Bayerisch
  'oas': 1,
  'zwoa': 2,
  'viare': 4,
  'viere': 4,
  'fuaf': 5,
  'fünfe': 5,
  'sechse': 6,
  'sibn': 7,
  'siebn': 7,
  'ochte': 8,
  'neine': 9,
  // Varianten
  'zwo': 2,
  'dreizehn': 13, // wird ignoriert wenn > 10
};

/** Deskriptive Schmerzstärke → Zahlenwert */
export const PAIN_DESCRIPTOR_MAP: Record<string, number> = {
  'keine': 0,
  'kein': 0,
  'keinerlei': 0,
  'schmerzfrei': 0,
  'kaum': 1,
  'kaum spürbar': 1,
  'minimal': 1,
  'leicht': 2,
  'leichte': 2,
  'wenig': 2,
  'gering': 2,
  'geringe': 2,
  'leichter': 3,
  'mittel': 5,
  'mittelmäßig': 5,
  'mäßig': 5,
  'moderat': 5,
  'moderate': 5,
  'erträglich': 4,
  'erträglicher': 4,
  'stark': 7,
  'starke': 7,
  'starker': 7,
  'heftig': 7,
  'heftige': 7,
  'heftiger': 7,
  'schlimm': 7,
  'schlimmer': 8,
  'schlimme': 7,
  'sehr stark': 8,
  'sehr starke': 8,
  'brutal': 9,
  'brutale': 9,
  'fürchterlich': 9,
  'fürchterliche': 9,
  'furchtbar': 9,
  'furchtbare': 9,
  'schrecklich': 9,
  'unerträglich': 10,
  'unerträgliche': 10,
  'maximal': 10,
  'maximale': 10,
  'nicht auszuhalten': 10,
  'kaum auszuhalten': 9,
  'extrem': 9,
  'extreme': 9,
  'sehr schlimm': 8,
  'schlimmste': 10,
};

/** Patterns für strukturierte Schmerzstärke-Angaben */
export const PAIN_LEVEL_PATTERNS = [
  // "X von 10", "X/10"
  /\b(\d+(?:[.,]\d+)?)\s*(?:von|\/)\s*10\b/i,
  // "Stärke X"
  /\b(?:stärke|level|niveau|schmerzstärke|schmerzlevel|schmerzgrad)\s+(\d+)\b/i,
  // "Schmerzstärke X"
  /\bschmerzstärke\s+(\d+)\b/i,
  // "Schmerz X"
  /\bschmerz(?:en)?\s+(\d+)\b/i,
];

// ============================================================
// === SYMPTOME ===
// ============================================================

/**
 * Alle 19 Symptome aus dem Katalog mit sämtlichen Synonymen und Schreibweisen.
 * Key = kanonische ID, Value = Array aller erkennbaren Phrasen.
 */
export const SYMPTOM_MAP: Record<string, string[]> = {
  'uebelkeit': [
    'übelkeit', 'übel', 'mir ist schlecht', 'schlechtes gefühl im bauch',
    'brechreiz', 'mir wird schlecht', 'ist mir schlecht', 'mir schlecht',
    'bauchübel', 'magenübel', 'schlecht im magen', 'magenschmerzen',
    'mir dreht sich der magen', 'brechreiz',
  ],
  'erbrechen': [
    'erbrechen', 'erbrochen', 'übergeben', 'gekotzt', 'kotzen',
    'übergegeben', 'mich übergeben', 'habe mich übergeben',
    'habe erbrochen', 'musste erbrechen', 'musste mich übergeben',
  ],
  'schwindel': [
    'schwindel', 'schwindelig', 'schwindlig', 'dreht sich', 'dreht alles',
    'drehschwindel', 'alles dreht sich', 'welt dreht sich',
    'schwankschwindel', 'benommenheit', 'benommen',
  ],
  'lichtempfindlichkeit': [
    'lichtempfindlich', 'lichtscheu', 'licht tut weh', 'licht stört',
    'photophobie', 'licht schmerzt', 'lichtempfindlichkeit',
    'licht macht schmerzen', 'licht schlimmer', 'licht unangenehm',
    'photo phobie',
  ],
  'geraeuschempfindlichkeit': [
    'geräuschempfindlich', 'lärmempfindlich', 'lärm tut weh',
    'phonophobie', 'lärm stört', 'geräusche stören',
    'geräuschempfindlichkeit', 'lärmempfindlichkeit',
    'geräusche unangenehm', 'geräusche machen schmerzen',
    'laute geräusche', 'phono phobie',
  ],
  'geruchsempfindlichkeit': [
    'geruchsempfindlich', 'osmophobie', 'gerüche stören',
    'geruch tut weh', 'geruchsempfindlichkeit', 'gerüche unangenehm',
    'gerüche schlimmer', 'osmophobia',
  ],
  'sehstoerungen': [
    'sehstörung', 'sehstörungen', 'verschwommen', 'flimmern', 'flackern',
    'gesichtsfeldausfall', 'sehfeld', 'sehe schlecht', 'augenflimmern',
    'blitze', 'sehe verschwommen', 'verschwommenes sehen',
    'augen flimmern', 'sehprobleme', 'visuell gestört',
    'schlecht sehen', 'schleiersehen',
  ],
  'kribbeln': [
    'kribbeln', 'kribbelig', 'taubheit', 'taub', 'ameisenlaufen',
    'kribbeln im arm', 'kribbeln im gesicht', 'eingeschlafen',
    'kribbeln in den fingern', 'kribbeln im bein', 'kribbeln im hand',
    'pelziges gefühl', 'taubheitsgefühl', 'pelzig',
  ],
  'muedigkeit': [
    'müdigkeit', 'müde', 'erschöpfung', 'erschöpft', 'k.o.', 'ko',
    'kraftlos', 'abgeschlagen', 'schlapp', 'todmüde', 'toderschöpft',
    'sehr müde', 'extrem müde', 'kaputt', 'ermattet', 'entkräftet',
    'antriebslos', 'energie fehlt', 'keine energie',
  ],
  'appetitlosigkeit': [
    'appetitlosigkeit', 'kein appetit', 'kein hunger', 'mag nichts essen',
    'appetitlos', 'esse nichts', 'will nichts essen', 'kann nichts essen',
    'keinen hunger', 'keinen appetit',
  ],
  'nackenschmerz': [
    'nackenschmerz', 'nackenschmerzen', 'nacken schmerzt', 'steifer nacken',
    'nackenverspannung', 'verspannung im nacken', 'nacken verspannt',
    'steife nacken', 'harter nacken', 'nacken tut weh', 'nackenweh',
    'verspannter nacken',
  ],
  'wortfindungsstoerung': [
    'wortfindungsstörung', 'wortfindungsstörungen', 'finde keine wörter',
    'wörter nicht finden', 'sprachprobleme', 'stottern', 'durcheinander reden',
    'wörter fallen mir nicht ein', 'worte fehlen', 'vergesse wörter',
    'kann nicht sprechen', 'spreche durcheinander', 'rede durcheinander',
  ],
  'doppelbilder': [
    'doppelbilder', 'sehe doppelt', 'doppelt sehen', 'diplopie',
    'alles doppelt', 'doppeltsehen', 'diplopia',
  ],
  'gleichgewichtsstoerung': [
    'gleichgewichtsstörung', 'gleichgewichtsprobleme', 'schwanke',
    'schwankend', 'unsicherer gang', 'sturz', 'stolpern',
    'gleichgewicht gestört', 'taumeln', 'taumelnd', 'wanken',
    'kann nicht gerade gehen',
  ],
  'hitzewallungen': [
    'hitzewallungen', 'hitzewallung', 'hitzegefühl', 'schweißausbruch',
    'schwitzen', 'zu warm', 'mir ist heiß', 'schwitze', 'hitze',
    'wärme', 'überhitzt', 'heiß',
  ],
  'kaeltegefuehl': [
    'kältegefühl', 'frieren', 'friert mich', 'kalt', 'schüttelfrost',
    'mir ist kalt', 'friere', 'schütteln', 'zittern', 'kälteschauer',
    'gänsehaut',
  ],
  'spannungskopfschmerz': [
    'spannungskopfschmerz', 'spannungskopfschmerzen', 'drückend',
    'drückendes gefühl', 'helm', 'band um kopf', 'wie ein helm',
    'druck auf kopf', 'kopfdruck', 'druckschmerz', 'spannung im kopf',
    'kopf eingespannt',
  ],
  'konzentrationsstoerung': [
    'konzentrationsstörung', 'konzentrationsprobleme', 'kann nicht konzentrieren',
    'konzentration weg', 'vergesslich', 'verwirrt', 'gedankennebeligkeit',
    'brain fog', 'nebel im kopf', 'kopfnebel', 'gedankennebel',
    'kann nicht denken', 'denken fällt schwer', 'unklar im kopf',
    'gedanken schwer', 'benebelt',
  ],
  'aura': [
    'aura', 'flimmerskotom', 'gesichtsfeldausfall', 'kriechende taubheit',
    'mit aura', 'hatte aura', 'aura gehabt',
  ],
};

// ============================================================
// === SCHMERZLOKALISATION ===
// ============================================================

export const LOCATION_MAP: Record<string, string[]> = {
  'einseitig_links': [
    'links', 'linke seite', 'linksseitig', 'linke kopfseite',
    'auf der linken seite', 'links im kopf', 'linke hälfte',
    'nur links', 'auf der linken',
  ],
  'einseitig_rechts': [
    'rechts', 'rechte seite', 'rechtsseitig', 'rechte kopfseite',
    'auf der rechten seite', 'rechts im kopf', 'rechte hälfte',
    'nur rechts', 'auf der rechten',
  ],
  'beidseitig': [
    'beidseitig', 'beide seiten', 'ganz', 'überall', 'komplett',
    'der ganze kopf', 'ganzer kopf', 'beidseits', 'beide seiten',
    'überall im kopf', 'diffus',
  ],
  'stirn': [
    'stirn', 'stirnbereich', 'vorne', 'forehead', 'vorne am kopf',
    'an der stirn', 'über den augen',
  ],
  'schlaefe': [
    'schläfe', 'schläfen', 'temporal', 'seitlich', 'an der schläfe',
    'schläfenbereich', 'linke schläfe', 'rechte schläfe',
  ],
  'nacken': [
    'nacken', 'hinterkopf', 'okzipital', 'genick', 'nackenwurzel',
    'hinten am kopf', 'hinteres kopf', 'am hinterkopf', 'okzipitaler',
  ],
  'auge': [
    'auge', 'augen', 'hinter dem auge', 'orbital', 'um das auge',
    'augenhöhle', 'um die augen', 'hinter dem auge',
    'ums auge', 'augenschmerz',
  ],
  'kiefer': [
    'kiefer', 'kieferschmerz', 'wange', 'zahn', 'zähne',
    'kiefergelenk', 'im kiefer', 'kieferbereich', 'wangen',
  ],
  'gesicht': [
    'gesicht', 'wangen', 'nase', 'facial', 'gesichtsbereich',
    'im gesicht', 'face',
  ],
};

// ============================================================
// === AURA-TYP ===
// ============================================================

export const AURA_MAP: Record<string, string[]> = {
  'visuell': [
    'flimmern', 'flackern', 'blitze', 'gesichtsfeldausfall',
    'skotom', 'sehstörung', 'visuelle aura', 'augenflimmern',
    'visuelle erscheinungen', 'lichtblitze', 'zickzack',
    'flimmerskotom', 'sehausfall', 'gesichtsfeldstörung',
  ],
  'sensorisch': [
    'kribbeln', 'taubheit', 'ameisenlaufen', 'sensorische aura',
    'kriechende taubheit', 'taubheitsgefühl', 'kriechend',
    'pelziges gefühl', 'sensorisch',
  ],
  'sprachlich': [
    'sprachproblem', 'wortfindungsstörung', 'stottern',
    'sprachliche aura', 'aphasie', 'dysarthrie',
    'kann nicht sprechen', 'sprechen schwierig',
  ],
  'motorisch': [
    'schwäche', 'lähmung', 'arm schwach', 'motorische aura',
    'hemiplegie', 'motorisch', 'kraftlosigkeit im arm',
    'bein schwach', 'halbseitenlähmung',
  ],
  'hirnstamm': [
    'schwindel mit aura', 'doppelbilder mit aura', 'hirnstammaura',
    'basiliäre aura', 'basiläre aura', 'hirnstamm',
  ],
  'keine': [
    'keine aura', 'ohne aura', 'kein flimmern', 'keine aura gehabt',
  ],
};

// ============================================================
// === ZEITAUSDRÜCKE ===
// ============================================================

/** Zahlwörter für Zeitberechnungen */
export const TIME_NUMBER_WORDS: Record<string, number> = {
  'null': 0,
  'ein': 1, 'eine': 1, 'einem': 1, 'einen': 1,
  'zwei': 2, 'zwo': 2, 'zwoa': 2,
  'drei': 3,
  'vier': 4, 'viare': 4,
  'fünf': 5, 'fuaf': 5,
  'sechs': 6, 'sechse': 6,
  'sieben': 7, 'sibn': 7, 'siebn': 7,
  'acht': 8, 'ochte': 8,
  'neun': 9, 'neine': 9,
  'zehn': 10,
  'elf': 11,
  'zwölf': 12,
  'dreizehn': 13,
  'vierzehn': 14,
  'fünfzehn': 15,
  'sechzehn': 16,
  'siebzehn': 17,
  'achtzehn': 18,
  'neunzehn': 19,
  'zwanzig': 20,
  'einundzwanzig': 21,
  'zweiundzwanzig': 22,
  'dreiundzwanzig': 23,
  'vierundzwanzig': 24,
  'fünfundzwanzig': 25,
  'sechsundzwanzig': 26,
  'siebenundzwanzig': 27,
  'achtundzwanzig': 28,
  'neunundzwanzig': 29,
  'dreißig': 30, 'dreizig': 30,
  'vierzig': 40,
  'fünfzig': 50, 'fuenfzig': 50,
  'sechzig': 60,
};

/** Stunden-Wörter für "um X Uhr" */
export const HOUR_WORD_MAP: Record<string, number> = {
  'null': 0, 'mitternacht': 0,
  'eins': 1, 'ein': 1, 'eine': 1,
  'zwei': 2, 'zwo': 2,
  'drei': 3,
  'vier': 4,
  'fünf': 5,
  'sechs': 6,
  'sieben': 7,
  'acht': 8,
  'neun': 9,
  'zehn': 10,
  'elf': 11,
  'zwölf': 12,
  'mittag': 12,
};

/** Tageszeiten mit Default-Uhrzeiten */
export const DAYTIME_MAP: Record<string, { hour: number; minute: number }> = {
  'früh': { hour: 6, minute: 0 },
  'morgen': { hour: 7, minute: 0 },
  'morgens': { hour: 7, minute: 0 },
  'frühmorgens': { hour: 5, minute: 0 },
  'frühstück': { hour: 7, minute: 30 },
  'vormittag': { hour: 9, minute: 0 },
  'vormittags': { hour: 9, minute: 0 },
  'mittag': { hour: 12, minute: 0 },
  'mittagszeit': { hour: 12, minute: 0 },
  'mittags': { hour: 12, minute: 0 },
  'nachmittag': { hour: 15, minute: 0 },
  'nachmittags': { hour: 15, minute: 0 },
  'abend': { hour: 19, minute: 0 },
  'abends': { hour: 19, minute: 0 },
  'nacht': { hour: 23, minute: 0 },
  'nachts': { hour: 23, minute: 0 },
  'mitternacht': { hour: 0, minute: 0 },
  'in der nacht': { hour: 2, minute: 0 },
  'letzte nacht': { hour: 2, minute: 0 },
};

// ============================================================
// === MEDIKAMENTEN-DOSIS ===
// ============================================================

export const DOSE_WORD_MAP: Record<string, number> = {
  // Quarters (1 Tablette = 4 quarters)
  'ein viertel': 1,
  'viertel': 1,
  'eine viertel': 1,
  'halbe': 2,
  'halb': 2,
  'halber': 2,
  'halbes': 2,
  'eine halbe': 2,
  'eine': 4,
  'ein': 4,
  'ganze': 4,
  'ganzen': 4,
  'ganzer': 4,
  'eine ganze': 4,
  'anderthalb': 6,
  'eineinhalb': 6,
  'ein und halb': 6,
  'einundeinhalf': 6,
  'zwei': 8,
  'zwei ganze': 8,
  'drei': 12,
};

/** Einheiten die zu Sprühstößen gehören */
export const SPRAY_WORDS = [
  'sprühstoß', 'sprühstöße', 'sprüh', 'spray', 'sprays',
  'hub', 'hübe', 'nasal', 'nasalspray',
];

/** Einheiten die zu Tabletten gehören */
export const TABLET_WORDS = [
  'tablette', 'tabletten', 'pille', 'pillen', 'kapsel', 'kapseln',
  'tabl', 'tab', 'drag', 'dragee', 'dragée',
];

// ============================================================
// === ME/CFS ===
// ============================================================

export const MECFS_MAP: Record<string, string[]> = {
  'none': [
    'keine', 'kein me/cfs', 'nichts', 'gut', 'normal',
    'kein me cfs', 'kein mecfs', 'keine beschwerden',
    'keine me cfs beschwerden', 'gut heute',
  ],
  'mild': [
    'leicht', 'leichte beschwerden', 'bisschen', 'wenig',
    'leichte symptome', 'kaum me/cfs', 'kaum', 'geringfügig',
    'ein bisschen me/cfs', 'etwas me/cfs',
  ],
  'moderate': [
    'mittel', 'mittelmäßig', 'moderat', 'mäßig',
    'moderate beschwerden', 'moderates me/cfs',
    'mittelstark', 'nicht gut heute',
  ],
  'severe': [
    'schwer', 'schwere beschwerden', 'schlimm', 'sehr schlimm',
    'stark beeinträchtigt', 'schweres me/cfs', 'sehr stark',
    'heftig', 'extrem', 'sehr schlimme beschwerden',
    'crash', 'post-exertional malaise', 'pem',
  ],
};

// ============================================================
// === PRIVAT-FLAG ===
// ============================================================

export const PRIVATE_TRIGGERS = [
  'privat', 'nur für mich', 'geheim', 'nicht teilen',
  'vertraulich', 'private', 'nur ich', 'persönlich',
  'nicht weitergeben', 'nur privat',
];

// ============================================================
// === NEGATIONS-WÖRTER ===
// ============================================================

export const NEGATION_WORDS = [
  'keine', 'kein', 'nicht', 'ohne', 'nie', 'niemals',
  'keinerlei', 'keinen', 'keiner', 'keines',
];

// ============================================================
// === KORREKTUR-INDIKATOREN ===
// ============================================================

export const CORRECTION_TRIGGERS = [
  'nein', 'korrektur', 'ich meinte', 'ich meine', 'eigentlich',
  'nicht', 'falsch', 'stimmt nicht', 'gemeint war', 'gemeint',
  'ich meinte eigentlich',
];

// ============================================================
// === FÜLLWÖRTER ===
// ============================================================

/** Wörter, die aus der Notiz entfernt werden */
export const FILLER_WORDS = [
  'also', 'äh', 'ähm', 'ich habe', 'ich hab', 'und dann',
  'dann', 'übrigens', 'eigentlich', 'quasi', 'sozusagen',
  'halt', 'mal', 'einfach', 'irgendwie', 'doch', 'ja',
  'ne', 'nä', 'gell', 'gell?', 'hm', 'hmm',
];

// ============================================================
// === EINSTIEGS-WÖRTER (Kontext-Erkennung) ===
// ============================================================

/** Signalwörter für neue Einträge */
export const NEW_ENTRY_TRIGGERS = [
  'ich habe', 'ich hab', 'ich nehme', 'ich nehm',
  'schmerz', 'kopfschmerz', 'migräne', 'attacke',
  'habe genommen', 'hab genommen',
];

/** Signalwörter für Kontext-Einträge (Ergänzungen) */
export const CONTEXT_ENTRY_TRIGGERS = [
  'außerdem', 'auch', 'noch', 'dazu', 'zusätzlich',
  'ergänzend', 'hinzu', 'und auch',
];

// ============================================================
// === JETZT-WÖRTER ===
// ============================================================

export const NOW_WORDS = [
  'jetzt', 'gerade', 'sofort', 'eben', 'aktuell',
  'momentan', 'gerade eben', 'grad', 'grad eben',
  'im moment', 'gerade jetzt',
];

// ============================================================
// === WOCHENTAG-MAPPING ===
// ============================================================

export const WEEKDAY_MAP: Record<string, number> = {
  'montag': 1, 'mo': 1,
  'dienstag': 2, 'di': 2,
  'mittwoch': 3, 'mi': 3,
  'donnerstag': 4, 'do': 4,
  'freitag': 5, 'fr': 5,
  'samstag': 6, 'sa': 6, 'sonnabend': 6,
  'sonntag': 0, 'so': 0,
};

// ============================================================
// === TYPISCHE MEDIKAMENTEN-SYNONYME ===
// ============================================================

/** Häufige Synonyme für Migräne-Medikamente (zusätzlich zu Lexikon) */
export const MEDICATION_SYNONYMS: Record<string, string> = {
  // Triptane
  'sumatriptan': 'sumatriptan',
  'sumitriptan': 'sumatriptan',
  'sumatriotan': 'sumatriptan',
  'imigran': 'sumatriptan',
  'imigrand': 'sumatriptan',

  'rizatriptan': 'rizatriptan',
  'maxalt': 'rizatriptan',
  'maxal': 'rizatriptan',

  'eletriptan': 'eletriptan',
  'relpax': 'eletriptan',

  'naratriptan': 'naratriptan',
  'naramig': 'naratriptan',

  'almotriptan': 'almotriptan',
  'almogran': 'almotriptan',

  'zolmitriptan': 'zolmitriptan',
  'zomig': 'zolmitriptan',

  // Analgetika
  'ibuprofen': 'ibuprofen',
  'ibu': 'ibuprofen',
  'ibuprof': 'ibuprofen',

  'paracetamol': 'paracetamol',
  'pcm': 'paracetamol',
  'paracet': 'paracetamol',
  'tylenol': 'paracetamol',

  'aspirin': 'aspirin',
  'ass': 'aspirin',
  'acetylsalicyl': 'aspirin',

  'metamizol': 'metamizol',
  'novalgin': 'metamizol',
  'analgin': 'metamizol',

  // Antiemetika
  'metoclopramid': 'metoclopramid',
  'mcp': 'metoclopramid',
  'paspertin': 'metoclopramid',

  'domperidon': 'domperidon',
  'motilium': 'domperidon',
};
