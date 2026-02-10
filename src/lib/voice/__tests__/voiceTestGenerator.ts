/**
 * Voice Test Generator – Deterministic variation generator for voice parser tests
 * 
 * Generates systematic combinations from linguistic building blocks.
 * Seeded for reproducibility. Used for extended test suites.
 */

import type { GoldenCase, GoldenExpected, PatternClass } from './voiceGoldenDataset';

// ============================================
// Building Blocks
// ============================================

const SUBJECT_PHRASES = ['ich habe', 'ich hab', 'gerade habe ich', 'habe', 'hab'];
const BOOSTERS = ['sehr', 'extrem', 'richtig', 'ziemlich', ''];
const INTENSITY_WORDS: Array<{ word: string; pain: number }> = [
  { word: 'starke', pain: 7 },
  { word: 'leichte', pain: 3 },
  { word: 'mittelstarke', pain: 5 },
  { word: 'heftige', pain: 7 },
  { word: 'schlimme', pain: 7 },
];
const PAIN_NOUNS = ['Schmerzen', 'Kopfschmerzen', 'Migräne', 'Kopfweh'];
const TIME_PHRASES: Array<{ phrase: string; kind: 'relative' | 'absolute'; minutes?: number }> = [
  { phrase: 'vor 10 Minuten', kind: 'relative', minutes: 10 },
  { phrase: 'vor 30 Minuten', kind: 'relative', minutes: 30 },
  { phrase: 'seit 2 Stunden', kind: 'relative', minutes: 120 },
  { phrase: 'vor einer Stunde', kind: 'relative', minutes: 60 },
  { phrase: 'heute Morgen', kind: 'absolute' },
  { phrase: 'gestern Abend', kind: 'absolute' },
];
const FILLERS = ['also', 'äh', 'hm', 'und', ''];

const STT_PAIN_MUTATIONS: Array<{ mutated: string; original: string }> = [
  { mutated: 'gekoppelschmerzen', original: 'Kopfschmerzen' },
  { mutated: 'kopfschmerzn', original: 'Kopfschmerzen' },
  { mutated: 'Schmerzlautstärke', original: 'Schmerzstärke' },
  { mutated: 'schmerzstrecke', original: 'Schmerzstärke' },
  { mutated: 'schnellstärke', original: 'Schmerzstärke' },
  { mutated: 'migrene', original: 'Migräne' },
  { mutated: 'migrane', original: 'Migräne' },
];

// ============================================
// Seeded RNG (simple LCG)
// ============================================

function createRng(seed: number) {
  let state = seed;
  return {
    next(): number {
      state = (state * 1664525 + 1013904223) & 0x7fffffff;
      return state / 0x7fffffff;
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
    shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }
  };
}

// ============================================
// Generator Functions
// ============================================

/** Generate K1 variations: descriptor without number */
function generateK1(rng: ReturnType<typeof createRng>, count: number): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (let i = 0; i < count; i++) {
    const booster = rng.pick(BOOSTERS);
    const intensity = rng.pick(INTENSITY_WORDS);
    const noun = rng.pick(PAIN_NOUNS);
    const filler = rng.pick(FILLERS);
    
    const parts = [filler, booster, intensity.word, noun].filter(Boolean);
    const transcript = parts.join(' ');
    
    // Adjust pain for booster
    let expectedPain = intensity.pain;
    if (booster === 'sehr' || booster === 'extrem' || booster === 'richtig') {
      if (intensity.pain >= 7) expectedPain = 9;
    }
    
    cases.push({
      id: `GEN-K1-${i + 1}`,
      classTag: 'K1',
      transcript,
      expected: {
        pain: { value: expectedPain, isEstimated: true },
        entry_type: 'new_entry',
        notes: { mustBeEmpty: true }
      }
    });
  }
  return cases;
}

/** Generate K4 variations: full everyday sentences */
function generateK4(rng: ReturnType<typeof createRng>, count: number): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (let i = 0; i < count; i++) {
    const subject = rng.pick(SUBJECT_PHRASES);
    const booster = rng.pick(BOOSTERS);
    const intensity = rng.pick(INTENSITY_WORDS);
    const noun = rng.pick(PAIN_NOUNS);
    
    const parts = [subject, booster, intensity.word, noun].filter(Boolean);
    const transcript = parts.join(' ');
    
    let expectedPain = intensity.pain;
    if (booster === 'sehr' || booster === 'extrem' || booster === 'richtig') {
      if (intensity.pain >= 7) expectedPain = 9;
    }
    
    cases.push({
      id: `GEN-K4-${i + 1}`,
      classTag: 'K4',
      transcript,
      expected: {
        pain: { value: expectedPain, isEstimated: true },
        entry_type: 'new_entry',
        notes: { mustBeEmpty: true, mustNotContain: ['ich habe', 'ich hab', 'habe'] }
      }
    });
  }
  return cases;
}

/** Generate K7 variations: STT errors in pain context */
function generateK7(rng: ReturnType<typeof createRng>, count: number): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (let i = 0; i < count; i++) {
    const mutation = rng.pick(STT_PAIN_MUTATIONS);
    const booster = rng.pick(BOOSTERS);
    const intensity = rng.pick(INTENSITY_WORDS);
    
    // Some cases: "Schmerzstrecke 5", some: "sehr starke gekoppelschmerzen"
    const useDescriptor = rng.next() > 0.5;
    
    if (useDescriptor) {
      const parts = [booster, intensity.word, mutation.mutated].filter(Boolean);
      const transcript = parts.join(' ');
      
      let expectedPain = intensity.pain;
      if (booster === 'sehr' || booster === 'extrem') {
        if (intensity.pain >= 7) expectedPain = 9;
      }
      
      cases.push({
        id: `GEN-K7-${i + 1}`,
        classTag: 'K7',
        transcript,
        expected: {
          pain: { value: expectedPain, isEstimated: true },
          entry_type: 'new_entry',
          notes: { mustBeEmpty: true }
        }
      });
    } else {
      const painNum = Math.floor(rng.next() * 10) + 1;
      const transcript = `${mutation.mutated} ${painNum}`;
      
      cases.push({
        id: `GEN-K7-${i + 1}`,
        classTag: 'K7',
        transcript,
        expected: {
          pain: { value: painNum > 10 ? 10 : painNum },
          entry_type: 'new_entry',
          notes: { mustBeEmpty: true }
        }
      });
    }
  }
  return cases;
}

// ============================================
// Main Generator
// ============================================

export interface GeneratorOptions {
  seed?: number;
  countPerClass?: number;
}

export function generateTestCorpus(options: GeneratorOptions = {}): GoldenCase[] {
  const { seed = 42, countPerClass = 20 } = options;
  const rng = createRng(seed);
  
  return [
    ...generateK1(rng, countPerClass),
    ...generateK4(rng, countPerClass),
    ...generateK7(rng, countPerClass),
  ];
}
