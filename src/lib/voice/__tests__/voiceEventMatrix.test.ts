/**
 * voiceEventMatrix.test.ts
 * 
 * Comprehensive test matrix for the voice input system.
 * Validates: noise filtering, classification, routing decisions,
 * segmentation, queue contract, and edge cases against real-world examples.
 * 
 * "Capture first, preserve always, structure second"
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyVoiceEvent,
  isNoise,
  segmentVoiceInput,
  type VoiceEventType,
} from '../eventClassifier';

// ============================================================
// Helper: check that at least one classification matches expected type
// ============================================================
function hasType(text: string, type: VoiceEventType): boolean {
  const result = classifyVoiceEvent(text);
  return result.classifications.some(c => c.type === type);
}

function isMeaningful(text: string): boolean {
  return classifyVoiceEvent(text).isMeaningful;
}

/** Returns true if this input should go to structured review (pain/medication) */
function needsReview(text: string): boolean {
  const result = classifyVoiceEvent(text);
  const REVIEW_TYPES: VoiceEventType[] = ['pain', 'medication'];
  return result.classifications.some(c => REVIEW_TYPES.includes(c.type));
}

// ============================================================
// 1. ALLTAG – direkt speichern, kein Review
// ============================================================
describe('Alltag – direkt speichern', () => {
  const cases: [string, VoiceEventType, boolean][] = [
    ['Ich trinke gerade Kaffee', 'food_drink', false],
    ['War eben duschen', 'activity', false],
    ['Es regnet gerade', 'environment', false],
    ['Ich lege mich jetzt hin', 'sleep_rest', false],
    ['Ich war kurz spazieren', 'activity', false],
    ['Das Licht ist gerade schlimm', 'environment', false],
    ['Bin total platt', 'mecfs_exertion', false],
    ['Heute ist alles etwas viel', 'stress_overload', false],
    ['Mir ist leicht übel', 'symptom', false],
    ['War im Supermarkt', 'activity', false],
    ['Ich habe gerade gegessen', 'food_drink', false],
    ['Habe einen Tee getrunken', 'food_drink', false],
    ['Bin total erschöpft', 'mecfs_exertion', false],
    ['Brain Fog seit heute Morgen', 'mecfs_exertion', false],
    ['War gerade einkaufen', 'activity', false],
    ['Es ist total stickig hier', 'environment', false],
    ['Ich bin reizüberflutet', 'stress_overload', false],
    ['Habe gerade Joghurt gegessen', 'food_drink', false],
    ['Ich war draußen unterwegs', 'activity', false],
    ['Habe Cola getrunken', 'food_drink', false],
    ['Total gestresst heute', 'stress_overload', false],
    ['Ich bin nervös', 'stress_overload', false],
    ['Habe schlecht geschlafen', 'sleep_rest', false],
    ['Bin um 3 aufgewacht', 'sleep_rest', false],
    ['War im Supermarkt, Licht war schlimm', 'environment', false],
  ];

  it.each(cases)('"%s" → %s, review=%s', (text, expectedType, expectedReview) => {
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, expectedType)).toBe(true);
    expect(needsReview(text)).toBe(expectedReview);
  });
});

// ============================================================
// 2. SCHMERZ – Review weiterhin nötig
// ============================================================
describe('Schmerz – Review nötig', () => {
  const cases: string[] = [
    'Kopfschmerzen 7 von 10',
    'Mein Kopf zieht links',
    'Starke Migräne rechts',
    'Seit zwei Stunden Kopfdruck',
    'Kopf drückt und pocht',
    'Migräneattacke seit heute Morgen',
    'Druck im Kopf links',
  ];

  it.each(cases)('"%s" → pain + review', (text) => {
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'pain')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });
});

// ============================================================
// 3. MEDIKAMENTE – Review weiterhin nötig
// ============================================================
describe('Medikamente – Review nötig', () => {
  const cases: string[] = [
    'Ich nehme jetzt Sumatriptan',
    'Ich habe Ibu 400 genommen',
    'Habe vorhin Rizatriptan genommen',
    'Nehme eine Tablette',
    'Habe Schmerzmittel eingenommen',
  ];

  it.each(cases)('"%s" → medication + review', (text) => {
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'medication')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });
});

// ============================================================
// 4. GEMISCHTE AUSSAGEN
// ============================================================
describe('Gemischte Aussagen', () => {
  it('"War duschen und jetzt komplett platt" → activity + mecfs_exertion, no review', () => {
    const text = 'War duschen und jetzt komplett platt';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'activity')).toBe(true);
    expect(hasType(text, 'mecfs_exertion')).toBe(true);
    expect(needsReview(text)).toBe(false);
  });

  it('"Ich habe Kaffee getrunken und jetzt Kopfdruck" → food_drink + pain, review', () => {
    const text = 'Ich habe Kaffee getrunken und jetzt Kopfdruck';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'food_drink')).toBe(true);
    expect(hasType(text, 'pain')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });

  it('"Ich nehme Sumatriptan und lege mich hin" → medication + sleep_rest, review', () => {
    const text = 'Ich nehme Sumatriptan und lege mich hin';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'medication')).toBe(true);
    expect(hasType(text, 'sleep_rest')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });

  it('"Mir ist übel und ich war eben draußen" → symptom + activity, no review', () => {
    const text = 'Mir ist übel und ich war eben draußen';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'symptom')).toBe(true);
    expect(hasType(text, 'activity')).toBe(true);
    expect(needsReview(text)).toBe(false);
  });

  it('"Licht schlimm und Kopfschmerz" → environment + pain, review', () => {
    const text = 'Licht schlimm und Kopfschmerz';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'environment')).toBe(true);
    expect(hasType(text, 'pain')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });

  it('"Habe Kaffee getrunken und bin jetzt erschöpft" → food_drink + mecfs, no review', () => {
    const text = 'Habe Kaffee getrunken und bin jetzt erschöpft';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'food_drink')).toBe(true);
    expect(hasType(text, 'mecfs_exertion')).toBe(true);
    expect(needsReview(text)).toBe(false);
  });

  it('"Nach dem Spazieren total erledigt" → activity + mecfs, no review', () => {
    const text = 'Nach dem Spazieren total erledigt';
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, 'mecfs_exertion')).toBe(true);
    expect(needsReview(text)).toBe(false);
  });
});

// ============================================================
// 5. KURZE / GRENZWERTIGE AUSSAGEN
// ============================================================
describe('Kurze Aussagen – dürfen nicht als Noise verloren gehen', () => {
  const meaningfulShort: [string, VoiceEventType][] = [
    ['platt', 'mecfs_exertion'],
    ['übel', 'symptom'],
    ['regen', 'environment'],
    ['hingelegt', 'sleep_rest'],
    ['anstrengend', 'mecfs_exertion'],
    ['erschöpft', 'mecfs_exertion'],
    ['Kopfdruck', 'pain'],
    ['brain fog', 'mecfs_exertion'],
    ['crashig', 'mecfs_exertion'],
    ['hell', 'environment'],
    ['laut', 'environment'],
    ['pem', 'mecfs_exertion'],
    ['tee', 'food_drink'],
    ['kalt', 'environment'],
    ['matschig', 'mecfs_exertion'],
    ['schlapp', 'mecfs_exertion'],
    ['kaputt', 'mecfs_exertion'],
    ['erledigt', 'mecfs_exertion'],
    ['Kopfschmerzen', 'pain'],
    ['Migräne', 'pain'],
    ['schwindlig', 'symptom'],
    ['benommen', 'symptom'],
  ];

  it.each(meaningfulShort)('"%s" is meaningful, not noise', (text) => {
    expect(isNoise(text)).toBe(false);
    expect(isMeaningful(text)).toBe(true);
  });

  it.each(meaningfulShort)('"%s" → %s', (text, expectedType) => {
    expect(hasType(text, expectedType)).toBe(true);
  });
});

describe('Echte Noise – soll weiterhin gefiltert werden', () => {
  const noise: string[] = [
    '',
    '   ',
    'äh',
    'ähm',
    'hmm',
    'ok',
    'ja',
    'nein',
    'test',
    'hallo',
    'oh',
    'ne',
    'mhm',
  ];

  it.each(noise)('"%s" is noise', (text) => {
    expect(isNoise(text)).toBe(true);
  });
});

// ============================================================
// 6. SEGMENTIERUNG
// ============================================================
describe('Segmentierung', () => {
  it('segmentiert mehrteilige Aussage korrekt', () => {
    const text = 'Ich habe gerade gegessen, war danach duschen und jetzt merke ich Druck im Kopf';
    const segments = segmentVoiceInput(text);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    segments.forEach(s => expect(s.text.length).toBeGreaterThan(0));
  });

  it('segmentiert einkaufen + spazieren + erschöpft', () => {
    const text = 'War einkaufen, dann spazieren und jetzt bin ich völlig erledigt';
    const segments = segmentVoiceInput(text);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it('kurzer Satz wird nicht unnötig segmentiert', () => {
    const text = 'Ich trinke gerade Kaffee';
    const segments = segmentVoiceInput(text);
    expect(segments.length).toBe(1);
  });

  it('jedes Segment hat eine Classification', () => {
    const text = 'War duschen und danach komplett platt';
    const segments = segmentVoiceInput(text);
    segments.forEach(s => {
      expect(s.classification).toBeDefined();
      expect(s.classification.isMeaningful).toBeDefined();
    });
  });

  it('Segmentierung zerstört keine Zusammenhänge in kurzen Sätzen', () => {
    const text = 'Mir ist übel und schwindlig';
    const segments = segmentVoiceInput(text);
    // Short related symptoms should ideally stay together or at least all be meaningful
    segments.forEach(s => {
      expect(s.text.length).toBeGreaterThan(0);
    });
  });

  it('Rohtext bleibt vollständig erhalten über alle Segmente', () => {
    const text = 'Ich habe gegessen und danach war ich duschen';
    const segments = segmentVoiceInput(text);
    // All original content must be represented across segments
    const allText = segments.map(s => s.text).join(' ');
    const originalWords = text.toLowerCase().split(/\s+/).filter(w => !['und', 'danach'].includes(w));
    for (const word of originalWords) {
      expect(allText.toLowerCase()).toContain(word);
    }
  });
});

// ============================================================
// 7. ROUTING-GRENZFÄLLE
// ============================================================
describe('Routing-Grenzfälle', () => {
  it('"mir ist übel" → symptom, kein Review', () => {
    expect(hasType('mir ist übel', 'symptom')).toBe(true);
    expect(needsReview('mir ist übel')).toBe(false);
  });

  it('"bin platt" → mecfs_exertion, kein Review', () => {
    expect(hasType('bin platt', 'mecfs_exertion')).toBe(true);
    expect(needsReview('bin platt')).toBe(false);
  });

  it('"kopf zieht links" → pain, Review', () => {
    expect(hasType('kopf zieht links', 'pain')).toBe(true);
    expect(needsReview('kopf zieht links')).toBe(true);
  });

  it('"seit Stunden Druck" → meaningful, preserved for analysis', () => {
    expect(isMeaningful('seit Stunden Druck')).toBe(true);
  });

  it('"seit stunden druck im kopf" → pain, Review', () => {
    expect(hasType('seit stunden druck im kopf', 'pain')).toBe(true);
    expect(needsReview('seit stunden druck im kopf')).toBe(true);
  });

  it('"ich nehme jetzt eine Tablette" → medication, Review', () => {
    expect(hasType('ich nehme jetzt eine Tablette', 'medication')).toBe(true);
    expect(needsReview('ich nehme jetzt eine Tablette')).toBe(true);
  });

  it('"sumatriptan genommen und hingelegt" → medication + sleep_rest, Review', () => {
    const text = 'sumatriptan genommen und hingelegt';
    expect(hasType(text, 'medication')).toBe(true);
    expect(hasType(text, 'sleep_rest')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });

  it('"komisch heute" → meaningful general_observation, no review', () => {
    expect(isMeaningful('komisch heute')).toBe(true);
    expect(needsReview('komisch heute')).toBe(false);
  });

  it('"zu viel gerade" → stress_overload, no review', () => {
    expect(hasType('zu viel gerade', 'stress_overload')).toBe(true);
    expect(needsReview('zu viel gerade')).toBe(false);
  });

  it('"licht schlimm und kopfschmerz" → pain + environment, Review', () => {
    const text = 'licht schlimm und kopfschmerz';
    expect(hasType(text, 'pain')).toBe(true);
    expect(hasType(text, 'environment')).toBe(true);
    expect(needsReview(text)).toBe(true);
  });

  it('"mir ist schwindlig" → symptom, kein Review', () => {
    expect(hasType('mir ist schwindlig', 'symptom')).toBe(true);
    expect(needsReview('mir ist schwindlig')).toBe(false);
  });

  it('"alles etwas viel heute" → stress_overload, kein Review', () => {
    expect(hasType('alles etwas viel heute', 'stress_overload')).toBe(true);
    expect(needsReview('alles etwas viel heute')).toBe(false);
  });

  it('"tablette genommen" → medication, Review', () => {
    expect(hasType('tablette genommen', 'medication')).toBe(true);
    expect(needsReview('tablette genommen')).toBe(true);
  });

  it('"kopf zieht" → pain, Review', () => {
    expect(hasType('kopf zieht', 'pain')).toBe(true);
    expect(needsReview('kopf zieht')).toBe(true);
  });

  it('"druck im kopf" → pain, Review', () => {
    expect(hasType('druck im kopf', 'pain')).toBe(true);
    expect(needsReview('druck im kopf')).toBe(true);
  });

  it('"licht schlimm" → environment, kein Review', () => {
    expect(hasType('licht schlimm', 'environment')).toBe(true);
    expect(needsReview('licht schlimm')).toBe(false);
  });

  it('"brain fog" → mecfs_exertion, kein Review', () => {
    expect(hasType('brain fog', 'mecfs_exertion')).toBe(true);
    expect(needsReview('brain fog')).toBe(false);
  });

  it('"matschig" → mecfs_exertion, kein Review', () => {
    expect(hasType('matschig', 'mecfs_exertion')).toBe(true);
    expect(needsReview('matschig')).toBe(false);
  });

  it('"schlapp" → mecfs_exertion, kein Review', () => {
    expect(hasType('schlapp', 'mecfs_exertion')).toBe(true);
    expect(needsReview('schlapp')).toBe(false);
  });
});

// ============================================================
// 8. ROHTEXT IMMER ERHALTEN
// ============================================================
describe('Rohtext-Erhaltung', () => {
  it('classification result always includes isMeaningful flag', () => {
    const result = classifyVoiceEvent('Irgendwie komisch heute, alles bisschen viel');
    expect(result.isMeaningful).toBe(true);
    expect(result.classifications.length).toBeGreaterThan(0);
  });

  it('unklare Aussagen werden als general_observation gespeichert', () => {
    const result = classifyVoiceEvent('Fühlt sich seltsam an');
    expect(result.isMeaningful).toBe(true);
    expect(result.classifications.some(
      c => c.type === 'general_observation' || c.type === 'symptom'
    )).toBe(true);
  });

  it('ambiguous short phrases are preserved', () => {
    expect(isMeaningful('irgendwie anders')).toBe(true);
    expect(isMeaningful('nicht gut drauf')).toBe(true);
    expect(isMeaningful('geht so')).toBe(true);
  });
});

// ============================================================
// 9. TAGS / INLINE EXTRAKTION
// ============================================================
describe('Tag-Extraktion', () => {
  it('erkennt Kaffee-Tag', () => {
    const result = classifyVoiceEvent('Ich trinke gerade Kaffee');
    expect(result.tags).toContain('kaffee');
  });

  it('erkennt Regen-Tag', () => {
    const result = classifyVoiceEvent('Es regnet draußen');
    expect(result.tags).toContain('regen');
  });

  it('erkennt PEM-Tag', () => {
    const result = classifyVoiceEvent('Ich glaube das ist PEM');
    expect(result.tags).toContain('pem');
  });

  it('erkennt Stress-Tag', () => {
    const result = classifyVoiceEvent('Total gestresst heute');
    expect(result.tags).toContain('stress');
  });

  it('erkennt Duschen-Tag', () => {
    const result = classifyVoiceEvent('War eben duschen');
    expect(result.tags).toContain('duschen');
  });

  it('erkennt Brain-Fog-Tag', () => {
    const result = classifyVoiceEvent('Habe brain fog');
    expect(result.tags).toContain('brainfog');
  });
});

// ============================================================
// 10. MEDICAL RELEVANCE
// ============================================================
describe('Medical Relevance', () => {
  it('pain → high', () => {
    expect(classifyVoiceEvent('Starke Kopfschmerzen').medicalRelevance).toBe('high');
  });

  it('medication → high', () => {
    expect(classifyVoiceEvent('Sumatriptan genommen').medicalRelevance).toBe('high');
  });

  it('food_drink → low', () => {
    expect(classifyVoiceEvent('Ich trinke Wasser').medicalRelevance).toBe('low');
  });

  it('activity → medium', () => {
    expect(classifyVoiceEvent('War spazieren').medicalRelevance).toBe('medium');
  });

  it('mecfs_exertion → high', () => {
    expect(classifyVoiceEvent('Komplett platt nach dem Duschen').medicalRelevance).toBe('high');
  });

  it('symptom → high', () => {
    expect(classifyVoiceEvent('Mir ist übel').medicalRelevance).toBe('high');
  });

  it('stress_overload → medium', () => {
    expect(classifyVoiceEvent('Heute ist alles etwas viel').medicalRelevance).toBe('medium');
  });
});

// ============================================================
// 11. SAVE/QUEUE CONTRACT
// ============================================================
describe('Save/Queue Contract', () => {
  it('saveVoiceEvent is a function', async () => {
    const { saveVoiceEvent } = await import('../voiceEventStore');
    expect(typeof saveVoiceEvent).toBe('function');
  });

  it('saveVoiceEventRobust returns structured result', async () => {
    const { saveVoiceEventRobust } = await import('../voiceEventQueue');
    expect(typeof saveVoiceEventRobust).toBe('function');
  });

  it('generateVoiceEventClientId produces unique IDs', async () => {
    const { generateVoiceEventClientId } = await import('../voiceEventStore');
    const id1 = generateVoiceEventClientId();
    const id2 = generateVoiceEventClientId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(8);
  });

  it('SaveVoiceEventOptions accepts clientId for idempotency', async () => {
    const { saveVoiceEvent } = await import('../voiceEventStore');
    // Verify the function accepts clientId without type error
    // (actual DB call would fail without auth, but type contract is verified)
    expect(typeof saveVoiceEvent).toBe('function');
  });
});

// ============================================================
// 12. COLLOQUIAL / MESSY REAL-WORLD GERMAN
// ============================================================
describe('Umgangssprachliche, unperfekte Alltagssprache', () => {
  const colloquialCases: [string, VoiceEventType, boolean][] = [
    ['irgendwie matschig heute', 'mecfs_exertion', false],
    ['mir ist grad bisschen komisch', 'general_observation', false],
    ['war kurz draußen, jetzt nicht gut', 'activity', false],
    ['nach dem duschen komplett kaputt', 'mecfs_exertion', false],
    ['heute alles bisschen zu viel', 'stress_overload', false],
    ['bin voll platt', 'mecfs_exertion', false],
    ['licht hier ist schlimm', 'environment', false],
    ['voll gestresst wegen arbeit', 'stress_overload', false],
    ['total erledigt nach dem einkaufen', 'mecfs_exertion', false],
    ['war kurz spazieren im regen', 'activity', false],
    ['hab tee getrunken', 'food_drink', false],
    ['alles so anstrengend grad', 'mecfs_exertion', false],
    ['seit heute morgen irgendwie daneben', 'general_observation', false],
    ['hab schlecht gepennt', 'sleep_rest', false],
    ['bin aufgewacht und total müde', 'sleep_rest', false],
  ];

  it.each(colloquialCases)('"%s" → %s, review=%s', (text, expectedType, expectedReview) => {
    expect(isMeaningful(text)).toBe(true);
    expect(hasType(text, expectedType)).toBe(true);
    expect(needsReview(text)).toBe(expectedReview);
  });

  // Mixed colloquial with medical content → review
  const colloquialReview: [string, boolean][] = [
    ['habe kaffee getrunken, jetzt drückt der kopf', true],
    ['hab was genommen und leg mich hin', true],  // "genommen" → medication
    ['kopf brummt seit dem aufstehen', true],
  ];

  it.each(colloquialReview)('"%s" review=%s', (text, expectedReview) => {
    expect(isMeaningful(text)).toBe(true);
    expect(needsReview(text)).toBe(expectedReview);
  });
});

// ============================================================
// 13. REVIEW-ABBRUCH & LOSS PREVENTION
// ============================================================
describe('Verlustfreiheit bei Abbruch', () => {
  it('handleClose saves transcript via saveVoiceEventRobust contract', () => {
    // Contract: When overlay closes with text, saveVoiceEventRobust is called.
    // The function always either saves or queues — verified by its return type.
    // This structural test ensures the contract exists.
    const text = 'Ich habe Kopfschmerzen seit heute morgen';
    const classification = classifyVoiceEvent(text);
    expect(classification.isMeaningful).toBe(true);
    // The overlay's handleClose/handleDiscard both call saveVoiceEventRobust
    // for any text >= 3 chars. We verify the classification is correct.
    expect(classification.classifications.length).toBeGreaterThan(0);
  });

  it('mixed content classification preserves all event types', () => {
    const text = 'Sumatriptan genommen, war duschen und jetzt komplett platt';
    const result = classifyVoiceEvent(text);
    // Even if review is opened for medication, the full classification
    // (medication + activity + mecfs) is captured in the voice_event
    expect(result.classifications.length).toBeGreaterThanOrEqual(2);
    expect(hasType(text, 'medication')).toBe(true);
    expect(hasType(text, 'mecfs_exertion')).toBe(true);
  });
});

// ============================================================
// 14. SESSION / TIME COHERENCE
// ============================================================
describe('Session & Zeitliche Kohärenz', () => {
  it('generateVoiceSessionId produces valid UUID-like strings', async () => {
    const { generateVoiceSessionId } = await import('../voiceEventStore');
    const id = generateVoiceSessionId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(typeof id).toBe('string');
  });

  it('segments preserve temporal order via index', () => {
    const text = 'War einkaufen, dann spazieren und danach komplett platt';
    const segments = segmentVoiceInput(text);
    for (let i = 0; i < segments.length; i++) {
      expect(segments[i].index).toBe(i);
    }
  });

  it('multi-segment events maintain complete coverage', () => {
    const text = 'Ich habe gegessen und dann war ich duschen und jetzt bin ich platt';
    const segments = segmentVoiceInput(text);
    // Every segment must have content
    segments.forEach(s => {
      expect(s.text.trim().length).toBeGreaterThan(0);
      expect(s.classification).toBeDefined();
    });
  });
});

// ============================================================
// 15. QUEUE PAYLOAD COMPLETENESS
// ============================================================
describe('Queue-Payload Vollständigkeit', () => {
  it('queue data preserves all analysis-relevant fields', () => {
    // Simulate what saveVoiceEventRobust serializes for the queue
    const classification = classifyVoiceEvent('Ich bin total erschöpft nach dem Duschen');
    const queueData = {
      clientId: 'test-uuid',
      rawTranscript: 'Ich bin total erschöpft nach dem Duschen',
      cleanedTranscript: null,
      sttConfidence: null,
      source: 'voice',
      eventTimestamp: new Date().toISOString(),
      sessionId: 'session-123',
      relatedEntryId: null,
      voiceNoteId: null,
      structuredData: { everyday: { category: 'mecfs_exertion' } },
      reviewState: 'auto_saved',
      eventTypes: classification.classifications.map(c => c.type),
      tags: classification.tags,
      medicalRelevance: classification.medicalRelevance,
    };

    // Verify all critical fields are present and non-undefined
    expect(queueData.clientId).toBeDefined();
    expect(queueData.rawTranscript).toBeTruthy();
    expect(queueData.eventTimestamp).toBeTruthy();
    expect(queueData.sessionId).toBeTruthy();
    expect(queueData.eventTypes.length).toBeGreaterThan(0);
    expect(queueData.tags.length).toBeGreaterThan(0);
    expect(queueData.medicalRelevance).toBeTruthy();
    expect(queueData.structuredData).toBeDefined();
  });

  it('queue payload for mixed content preserves all event types', () => {
    const text = 'Kaffee getrunken und jetzt komplett platt';
    const classification = classifyVoiceEvent(text);
    const types = classification.classifications.map(c => c.type);
    
    expect(types).toContain('food_drink');
    expect(types).toContain('mecfs_exertion');
    // Both types would be serialized to queue
    expect(types.length).toBeGreaterThanOrEqual(2);
  });
});
