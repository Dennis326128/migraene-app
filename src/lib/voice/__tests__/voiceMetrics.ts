/**
 * Voice Quality Metrics – Scoring + CI gate logic
 * 
 * Measures:
 * - Slot accuracy (pain, meds, time)
 * - Notes quality (noise rate, emptiness correctness)
 * - K6 false positive rate
 */

import type { GoldenCase } from './voiceGoldenDataset';
import type { VoiceParseResult } from '../simpleVoiceParser';

// ============================================
// Types
// ============================================

export interface CaseResult {
  id: string;
  classTag: string;
  passed: boolean;
  failures: string[];
  result: VoiceParseResult;
}

export interface MetricsReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  
  painAccuracy: number;       // % of cases where pain matches expected
  medHitRate: number;         // % of cases where all expected meds found
  timeAccuracy: number;       // % of cases where time kind matches
  k6FalsePositives: number;   // Count of K6 cases incorrectly classified
  notesNoiseRate: number;     // % of cases with forbidden tokens in notes
  notesEmptinessRate: number; // % of mustBeEmpty cases that are indeed empty
  
  byClass: Record<string, { total: number; passed: number; passRate: number }>;
  failedCases: CaseResult[];
}

// Forbidden tokens in notes (noise)
const FORBIDDEN_NOTE_TOKENS = [
  'ich habe', 'ich hab', 'genommen', 'eingenommen', 'geschluckt',
  'schmerzstärke', 'schmerzstaerke', 'schmerzlautstärke',
  'tablette', 'tabletten', 'kapsel',
];

// ============================================
// Evaluation Functions
// ============================================

export function evaluateCase(tc: GoldenCase, result: VoiceParseResult): CaseResult {
  const failures: string[] = [];
  const { expected } = tc;
  
  // 1. Pain check
  if (expected.pain.value !== undefined) {
    if (expected.pain.value === null) {
      if (result.pain_intensity.value !== null) {
        failures.push(`Pain: expected null, got ${result.pain_intensity.value}`);
      }
    } else {
      if (result.pain_intensity.value !== expected.pain.value) {
        failures.push(`Pain: expected ${expected.pain.value}, got ${result.pain_intensity.value}`);
      }
    }
  }
  
  // 2. Entry type check
  if (result.entry_type !== expected.entry_type) {
    failures.push(`EntryType: expected ${expected.entry_type}, got ${result.entry_type}`);
  }
  
  // 3. Medication check
  if (expected.medications !== undefined) {
    for (const expectedMed of expected.medications) {
      const found = result.medications.some(m => 
        m.name.toLowerCase().includes(expectedMed.toLowerCase())
      );
      if (!found) {
        failures.push(`Med: expected "${expectedMed}" not found in [${result.medications.map(m => m.name).join(', ')}]`);
      }
    }
    if (expected.medications.length === 0 && result.medications.length > 0) {
      failures.push(`Med: expected no meds, got [${result.medications.map(m => m.name).join(', ')}]`);
    }
  }
  
  // 4. Time check
  if (expected.time) {
    if (expected.time.kind && result.time.kind !== expected.time.kind) {
      failures.push(`Time.kind: expected ${expected.time.kind}, got ${result.time.kind}`);
    }
    if (expected.time.relative_minutes !== undefined && result.time.relative_minutes !== expected.time.relative_minutes) {
      failures.push(`Time.minutes: expected ${expected.time.relative_minutes}, got ${result.time.relative_minutes}`);
    }
  }
  
  // 5. Notes checks
  const { notes } = expected;
  const noteText = result.note;
  
  if (notes.mustBeEmpty && noteText.trim() !== '') {
    failures.push(`Notes: expected empty, got "${noteText}"`);
  }
  if (notes.canBeEmpty === false && noteText.trim() === '') {
    failures.push(`Notes: expected non-empty, got empty`);
  }
  if (notes.mustContain) {
    for (const token of notes.mustContain) {
      if (!noteText.toLowerCase().includes(token.toLowerCase())) {
        failures.push(`Notes: must contain "${token}", got "${noteText}"`);
      }
    }
  }
  if (notes.mustNotContain) {
    for (const token of notes.mustNotContain) {
      if (noteText.toLowerCase().includes(token.toLowerCase())) {
        failures.push(`Notes: must NOT contain "${token}", got "${noteText}"`);
      }
    }
  }
  
  return {
    id: tc.id,
    classTag: tc.classTag,
    passed: failures.length === 0,
    failures,
    result,
  };
}

export function computeMetrics(results: CaseResult[]): MetricsReport {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  
  // By-class breakdown
  const byClass: Record<string, { total: number; passed: number; passRate: number }> = {};
  for (const r of results) {
    if (!byClass[r.classTag]) byClass[r.classTag] = { total: 0, passed: 0, passRate: 0 };
    byClass[r.classTag].total++;
    if (r.passed) byClass[r.classTag].passed++;
  }
  for (const key of Object.keys(byClass)) {
    byClass[key].passRate = byClass[key].total > 0 ? byClass[key].passed / byClass[key].total : 0;
  }
  
  // Pain accuracy
  const painCases = results.filter(r => r.failures.some(f => f.startsWith('Pain:')));
  const painAccuracy = total > 0 ? 1 - painCases.length / total : 1;
  
  // Med hit rate
  const medCases = results.filter(r => r.failures.some(f => f.startsWith('Med:')));
  const medHitRate = total > 0 ? 1 - medCases.length / total : 1;
  
  // Time accuracy
  const timeCases = results.filter(r => r.failures.some(f => f.startsWith('Time')));
  const timeAccuracy = total > 0 ? 1 - timeCases.length / total : 1;
  
  // K6 false positives
  const k6Results = results.filter(r => r.classTag === 'K6');
  const k6FalsePositives = k6Results.filter(r => 
    r.result.pain_intensity.value !== null || r.result.entry_type !== 'context_entry'
  ).length;
  
  // Notes noise rate
  const notesWithNoise = results.filter(r => {
    const note = r.result.note.toLowerCase();
    return FORBIDDEN_NOTE_TOKENS.some(t => note.includes(t));
  });
  const notesNoiseRate = total > 0 ? notesWithNoise.length / total : 0;
  
  // Notes emptiness correctness
  const mustBeEmptyCases = results.filter(r => {
    const tc = r as any; // We track via failures
    return r.failures.some(f => f.includes('expected empty'));
  });
  const emptyCheckCases = results.filter(r => r.failures.some(f => f.includes('Notes: expected empty')));
  const notesEmptinessRate = mustBeEmptyCases.length > 0 
    ? 1 - emptyCheckCases.length / total 
    : 1;
  
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total > 0 ? passed / total : 0,
    painAccuracy,
    medHitRate,
    timeAccuracy,
    k6FalsePositives,
    notesNoiseRate,
    notesEmptinessRate,
    byClass,
    failedCases: results.filter(r => !r.passed),
  };
}

// ============================================
// CI Gate Thresholds
// ============================================

export interface CIGateConfig {
  minPainAccuracy: number;      // e.g. 0.90
  minMedHitRate: number;        // e.g. 0.85
  maxK6FalsePositives: number;  // e.g. 0
  maxNotesNoiseRate: number;    // e.g. 0.05
  minOverallPassRate: number;   // e.g. 0.85
}

export const DEFAULT_CI_GATES: CIGateConfig = {
  minPainAccuracy: 0.90,
  minMedHitRate: 0.85,
  maxK6FalsePositives: 0,
  maxNotesNoiseRate: 0.05,
  minOverallPassRate: 0.85,
};

export function checkCIGates(metrics: MetricsReport, gates: CIGateConfig = DEFAULT_CI_GATES): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  
  if (metrics.painAccuracy < gates.minPainAccuracy) {
    violations.push(`Pain accuracy ${(metrics.painAccuracy * 100).toFixed(1)}% < ${(gates.minPainAccuracy * 100)}% threshold`);
  }
  if (metrics.medHitRate < gates.minMedHitRate) {
    violations.push(`Med hit rate ${(metrics.medHitRate * 100).toFixed(1)}% < ${(gates.minMedHitRate * 100)}% threshold`);
  }
  if (metrics.k6FalsePositives > gates.maxK6FalsePositives) {
    violations.push(`K6 false positives: ${metrics.k6FalsePositives} > ${gates.maxK6FalsePositives} threshold`);
  }
  if (metrics.notesNoiseRate > gates.maxNotesNoiseRate) {
    violations.push(`Notes noise rate ${(metrics.notesNoiseRate * 100).toFixed(1)}% > ${(gates.maxNotesNoiseRate * 100)}% threshold`);
  }
  if (metrics.passRate < gates.minOverallPassRate) {
    violations.push(`Overall pass rate ${(metrics.passRate * 100).toFixed(1)}% < ${(gates.minOverallPassRate * 100)}% threshold`);
  }
  
  return { passed: violations.length === 0, violations };
}
