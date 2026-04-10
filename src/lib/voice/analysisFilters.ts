/**
 * analysisFilters.ts
 * 
 * Pure filter/classification functions for AI analysis content quality.
 * Extracted for testability — used by MigrainePatternAnalysis.tsx.
 * 
 * These filters ensure that only genuinely useful, non-trivial,
 * non-redundant content reaches the user.
 */

// ============================================================
// === TRIVIAL SEQUENCE PATTERNS ===
// ============================================================

/** Trivial/tautological sequence patterns to suppress */
export const TRIVIAL_SEQUENCE_PATTERNS = [
  /schmerz.*→.*medikament/i, /medikament.*→.*schmerz/i,
  /kopfschmerz.*→.*medikament/i, /kopfschmerz.*→.*ruhe/i, /kopfschmerz.*→.*schlaf/i,
  /migräne.*→.*medikament/i, /migräne.*→.*ruhe/i, /migräne.*→.*schlaf/i,
  /schmerz.*stärker.*→.*medikament/i, /schmerz.*→.*einnahme/i, /schmerz.*→.*triptan/i,
  /schmerz.*→.*bett/i, /schmerz.*→.*liegen/i, /schmerz.*→.*hinlegen/i,
  /schmerz.*→.*ruhe/i, /schmerz.*→.*schlaf/i,
  /schmerz.*→.*nichts/i, /schmerz.*→.*pause/i, /schmerz.*→.*dunkel/i,
  /schmerz.*→.*erbrechen/i, /schmerz.*→.*übelkeit/i,
  /schmerz.*→.*rückzug/i, /schmerz.*→.*schonung/i,
  /stark.*tag.*→.*ruhe/i, /stark.*tag.*→.*rückzug/i, /stark.*tag.*→.*bett/i,
  /beschwerden.*→.*schonung/i, /beschwerden.*→.*rückzug/i, /beschwerden.*→.*ruhe/i,
  /belastung.*→.*ruhe/i, /belastung.*→.*pause/i,
  /müdigkeit.*→.*ruhe/i, /müdigkeit.*→.*schlaf/i, /müdigkeit.*→.*bett/i,
  /müdigkeit.*schmerztag/i, /müde.*→.*ruhe/i, /müde.*→.*schlaf/i,
  /erschöpf.*→.*ruhe/i, /erschöpf.*→.*schlaf/i, /erschöpf.*→.*bett/i,
  /erschöpf.*→.*hinlegen/i, /erschöpfung.*zusammen.*schmerz/i,
  /erschöpf.*→.*pause/i, /erschöpf.*→.*nichts/i,
  /erschöpf.*→.*rückzug/i, /erschöpf.*→.*schonung/i,
  /medikament.*→.*wirkung/i, /medikament.*→.*besser/i,
  /medikament.*→.*keine.*wirkung/i, /triptan.*→.*besser/i,
  /einnahme.*→.*wirkung/i, /einnahme.*→.*besser/i,
  /medikament.*→.*beobacht/i, /einnahme.*→.*beobacht/i,
  /pain.*→.*medication/i, /medication.*→.*pain/i,
  /headache.*→.*rest/i, /fatigue.*→.*rest/i, /fatigue.*→.*sleep/i,
  /pain.*→.*rest/i, /pain.*→.*sleep/i,
  /schmerz.*müdigkeit/i, /müdigkeit.*schmerz/i,
  /schmerz.*erschöpf/i, /erschöpf.*schmerz/i,
  /attacke.*→.*ruhe/i, /attacke.*→.*bett/i, /attacke.*→.*schlaf/i,
  /anfall.*→.*ruhe/i, /anfall.*→.*medikament/i,
  /beschwerd.*→.*medikament/i, /beschwerd.*→.*bett/i,
  /schmerz.*→.*abbruch/i, /schmerz.*→.*absage/i,
  /übelkeit.*→.*ruhe/i, /übelkeit.*→.*bett/i,
  /kopfschmerz.*→.*rückzug/i, /kopfschmerz.*→.*schonung/i,
  /migräne.*→.*rückzug/i, /migräne.*→.*schonung/i, /migräne.*→.*bett/i,
  /migräne.*→.*dunkel/i, /migräne.*→.*hinlegen/i,
];

/** Phase-state arrow patterns that are always generic */
export const GENERIC_PHASE_SEQUENCES = new Set([
  'pain→medication', 'pain→rest', 'pain→fatigue', 'pain→observation',
  'fatigue→rest', 'fatigue→medication', 'fatigue→observation',
  'medication→observation', 'medication→rest', 'medication→pain',
  'observation→pain', 'observation→medication', 'observation→rest',
  'rest→observation', 'rest→pain', 'wellbeing→observation',
  'pain→medication→rest', 'pain→medication→observation',
  'medication→rest→observation', 'fatigue→rest→observation',
  'pain→rest→observation',
]);

/** Banal llmInterpretation phrases */
export const BANAL_INTERPRETATION_RX = [
  /wurde.*medikament.*eingenommen/i, /medikament.*eingenommen.*bei.*schmerz/i,
  /nach.*schmerz.*ruhe/i, /ruhe.*nach.*schmerz/i,
  /beschwerden.*führten.*zu.*rückzug/i, /übliche.*reaktion/i,
  /typische.*begleiter/i, /naheliegende.*reaktion/i,
  /selbstverständlich/i, /typische.*reaktion/i,
  /naheliegend/i, /erwartbar/i, /nicht.*überraschend/i,
  /verständlich.*dass/i, /logisch.*dass/i,
  /natürliche.*folge/i, /häufig.*beobachtet/i,
  /üblich.*bei.*migräne/i, /bekannt.*dass/i,
  /wenig.*überraschend/i, /zu.*erwarten/i,
  /begleitsymptom/i, /begleiterscheinung/i,
];

/** Banal observation/question text */
export const BANAL_CONTENT_RX = [
  /übelkeit.*begleit/i, /begleitend.*übelkeit/i,
  /lichtempfindlich.*bei.*migräne/i, /migräne.*lichtempfindlich/i,
  /schmerz.*führt.*zu.*einschränk/i, /einschränk.*durch.*schmerz/i,
  /an.*schmerztagen.*weniger.*aktiv/i, /weniger.*aktiv.*an.*schmerztagen/i,
  /müdigkeit.*an.*schmerztagen/i, /erschöpft.*nach.*attacke/i,
  /normale.*reaktion/i, /daraufhin.*ruhe/i, /danach.*rückzug/i,
  /beschwerden.*führten.*zu.*schonung/i, /migräne.*führte.*zu.*pause/i,
  /schmerz.*wurde.*mit.*medikament.*behandelt/i,
  /dann.*eingenommen/i, /wurde.*dann.*eingenommen/i,
  /schmerz.*behandelt/i, /medikament.*genommen/i,
  /daraufhin.*schonung/i, /daraufhin.*pause/i,
  /einfach.*müde/i, /allgemein.*erschöpft/i,
  /schlechter.*tag.*ohne/i,
  // Fatigue banalities
  /müde.*gewesen/i, /keine.*energie/i, /wenig.*energie/i,
  /allgemein.*müde/i, /generell.*erschöpft/i,
  /einfach.*erschöpft/i, /nur.*müde/i,
  /den.*ganzen.*tag.*müde/i, /tag.*war.*anstrengend/i,
  /war.*ein.*schwerer.*tag/i, /anstrengender.*tag/i,
  /hatte.*wenig.*kraft/i, /kaum.*kraft/i,
  // Generic symptom listings
  /symptome.*wie.*üblich/i, /wie.*bei.*jeder.*attacke/i,
  /übliche.*symptome/i, /bekannte.*symptome/i,
  /die.*üblichen.*beschwerden/i,
  // Residual filler sentences
  /an.*mehreren.*tagen.*dokumentiert/i, /wurde.*dokumentiert/i,
  /laut.*einträgen/i, /den.*einträgen.*zufolge/i,
  /im.*beobachtungszeitraum/i, /im.*analysezeitraum/i,
  /es.*wurde.*festgestellt/i, /es.*zeigt.*sich/i,
  /wie.*bereits.*erwähnt/i, /wie.*oben.*beschrieben/i,
];

/** Generic uncertainty phrases */
export const GENERIC_UNCERTAINTY_RX = [
  /mehr.*daten.*wären.*hilfreich/i, /mehr.*einträge.*nötig/i,
  /mehr.*dokumentation/i, /mehr.*beobachtung.*nötig/i,
  /es.*ist.*unklar/i, /könnte.*zufällig/i,
  /lässt.*sich.*nicht.*sicher/i, /zu.*wenig.*daten/i,
  /datenlage.*reicht.*nicht/i, /nicht.*genug.*einträge/i,
  /schwer.*zu.*beurteilen/i, /bisher.*nicht.*eindeutig/i,
  /weitere.*daten.*erforderlich/i,
  /längerer.*zeitraum.*nötig/i, /noch.*nicht.*ausreichend/i,
  /weitere.*beobachtung/i, /genauere.*dokumentation/i,
  /regelmäßiger.*eintragen/i, /mehr.*tage.*dokument/i,
  // Residual vague uncertainty
  /ob.*hier.*ein.*zusammenhang/i, /bleibt.*abzuwarten/i,
  /kann.*nicht.*abschließend/i, /abschließend.*nicht.*beurteil/i,
  /noch.*nicht.*klar.*ob/i, /hierzu.*fehlen/i,
  /grundsätzlich.*möglich/i, /pauschal.*nicht.*sagen/i,
];

/** Weak/vague pattern description phrases */
export const WEAK_DESCRIPTION_RX = [
  /tritt.*teilweise.*auf/i, /könnte.*manchmal/i,
  /allgemeine.*belastung/i, /eventuell.*zusammenhang/i,
  /vereinzelt.*beobacht/i, /nicht.*ausgeschlossen/i,
  /möglicherweise.*gelegentlich/i,
  /es.*fällt.*auf.*dass/i, /auffällig.*ist.*dass/i,
  /es.*scheint.*als/i, /es.*deutet.*darauf/i,
  /möglicherweise.*besteht/i, /ein.*möglicher/i,
  /gelegentlich.*zusammen/i, /ab.*und.*zu/i,
  // Additional weak hedging
  /in.*einigen.*fällen/i, /hier.*und.*da/i,
  /nicht.*ganz.*klar/i, /tendenziell/i,
  /gewisse.*hinweise/i, /ohne.*klar.*muster/i,
  /schwer.*einzuordnen/i, /unklar.*ob/i,
  // Vague weather/stress/fatigue without specifics
  /wetter.*könnte.*rolle/i, /wetterwechsel.*möglich/i,
  /stress.*scheint.*faktor/i, /stress.*spielt.*vielleicht/i,
  /erschöpfung.*könnte.*beitragen/i, /müdigkeit.*könnte.*rolle/i,
  /allgemein.*belastet/i, /generell.*mehr.*beschwerden/i,
  /insgesamt.*eher.*schlechter/i, /phasenweise.*stärker/i,
  // Non-actionable vague observations
  /es.*gibt.*hinweise/i, /zusammenhang.*möglich/i,
  /zusammenhang.*denkbar/i, /könnte.*eine.*rolle/i,
  /möglicherweise.*ein.*faktor/i, /scheint.*zusammen.*hängen/i,
  /nicht.*eindeutig.*zuordnen/i, /kein.*klares.*muster/i,
  /ohne.*erkennbar.*zusammenhang/i,
];

// ============================================================
// === FILTER FUNCTIONS ===
// ============================================================

export function isTrivialSequence(pattern: string, interpretation?: string): boolean {
  const normalized = pattern.replace(/\s+/g, ' ').trim();
  if (TRIVIAL_SEQUENCE_PATTERNS.some(rx => rx.test(normalized))) return true;
  const collapsed = normalized.toLowerCase().replace(/\s/g, '');
  if (GENERIC_PHASE_SEQUENCES.has(collapsed)) return true;
  if (interpretation && BANAL_INTERPRETATION_RX.some(rx => rx.test(interpretation))) return true;
  return false;
}

export function isBanalContent(text: string): boolean {
  return BANAL_CONTENT_RX.some(rx => rx.test(text)) || BANAL_INTERPRETATION_RX.some(rx => rx.test(text));
}

export function isGenericUncertainty(text: string): boolean {
  return GENERIC_UNCERTAINTY_RX.some(rx => rx.test(text));
}

export function isWeakPattern(description: string, title?: string): boolean {
  if (WEAK_DESCRIPTION_RX.some(rx => rx.test(description))) return true;
  const trimmed = description.replace(/\s+/g, ' ').trim();
  // Medication patterns get a lower length threshold (25) to avoid filtering real signals
  const isMed = MEDICATION_TITLE_RX.test(description) || (title && MEDICATION_TITLE_RX.test(title));
  const minLength = isMed ? 25 : 40;
  if (trimmed.length < minLength) return true;
  return false;
}

/** Medication-related title/description regex */
export const MEDICATION_TITLE_RX = /triptan|medikament|akutmedikament|übergebrauch|einnahme|vermeidung|zurückhalt|spät.*einn|abwart/i;
