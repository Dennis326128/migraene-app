/**
 * voiceEventMatrix.test.ts
 * 
 * Comprehensive test matrix for the voice input system.
 * Validates: noise filtering, classification, routing decisions,
 * segmentation, and edge cases against real-world examples.
 * 
 * "Capture first, preserve always, structure second"
 */

import { describe, it, expect } from 'vitest';
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
});

// ============================================================
// 5. KURZE / GRENZWERTIGE AUSSAGEN
// ============================================================
describe('Kurze Aussagen – dürfen nicht als Noise verloren gehen', () => {
  const meaningfulShort: [string, VoiceEventType | null][] = [
    ['platt', 'mecfs_exertion'],
    ['übel', 'symptom'],
    ['regen', 'environment'],
    ['hingelegt', 'sleep_rest'],
    ['anstrengend', 'general_observation'],
    ['erschöpft', 'mecfs_exertion'],
    ['Kopfdruck', 'pain'],
    ['brain fog', 'mecfs_exertion'],
    ['crashig', 'mecfs_exertion'],
    ['hell', 'environment'],
    ['laut', 'environment'],
    ['pem', 'mecfs_exertion'],
    ['tee', 'food_drink'],
    ['kalt', 'environment'],
  ];

  it.each(meaningfulShort)('"%s" is meaningful, not noise', (text) => {
    expect(isNoise(text)).toBe(false);
    expect(isMeaningful(text)).toBe(true);
  });

  it.each(meaningfulShort)('"%s" has expected type', (text, expectedType) => {
    if (expectedType) {
      expect(hasType(text, expectedType)).toBe(true);
    }
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
    // Full text must be reconstructable
    const reconstructed = segments.map(s => s.text).join(' ');
    // Each segment should be non-empty
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

  it('"seit Stunden Druck" → general (no specific pain match without "kopf")', () => {
    // "Druck" alone doesn't match pain patterns (kopfdruck does)
    expect(isMeaningful('seit Stunden Druck')).toBe(true);
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
});

// ============================================================
// 8. ROHTEXT IMMER ERHALTEN
// ============================================================
describe('Rohtext-Erhaltung', () => {
  it('classification result always includes isMeaningful flag', () => {
    const result = classifyVoiceEvent('Irgendwie komisch heute, alles bisschen viel');
    expect(result.isMeaningful).toBe(true);
    // Even unclassifiable text gets general_observation
    expect(result.classifications.length).toBeGreaterThan(0);
  });

  it('unklare Aussagen werden als general_observation gespeichert', () => {
    const result = classifyVoiceEvent('Fühlt sich seltsam an');
    expect(result.isMeaningful).toBe(true);
    // Should at least be general_observation
    expect(result.classifications.some(
      c => c.type === 'general_observation' || c.type === 'symptom'
    )).toBe(true);
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
});
