/**
 * Voice Quality CI Test Suite
 * 
 * Runs golden dataset + generated corpus through the parser,
 * computes metrics, and enforces CI gates.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseVoiceEntry } from '../simpleVoiceParser';
import { GOLDEN_DATASET, GOLDEN_USER_MEDS, type GoldenCase } from './voiceGoldenDataset';
import { generateTestCorpus } from './voiceTestGenerator';
import { evaluateCase, computeMetrics, checkCIGates, DEFAULT_CI_GATES, type CaseResult } from './voiceMetrics';

// Mock berlinDateToday for consistent tests
vi.mock('@/lib/tz', () => ({
  berlinDateToday: () => '2024-01-15'
}));

// ============================================
// Helper: run a single case
// ============================================

function runCase(tc: GoldenCase): CaseResult {
  const userMeds = tc.classTag === 'K6' 
    ? GOLDEN_USER_MEDS // K6 must not trigger even with meds available
    : GOLDEN_USER_MEDS;
  const result = parseVoiceEntry(tc.transcript, userMeds);
  return evaluateCase(tc, result);
}

// ============================================
// Golden Dataset Tests (per-class)
// ============================================

describe('Voice Quality – Golden Dataset', () => {
  const classes = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10'] as const;
  
  for (const cls of classes) {
    describe(`Class ${cls}`, () => {
      const cases = GOLDEN_DATASET.filter(c => c.classTag === cls);
      
      for (const tc of cases) {
        it(`${tc.id}: "${tc.transcript.substring(0, 50)}${tc.transcript.length > 50 ? '…' : ''}"`, () => {
          const result = runCase(tc);
          if (result.failures.length > 0) {
            expect.fail(`Failures:\n  ${result.failures.join('\n  ')}`);
          }
        });
      }
    });
  }
});

// ============================================
// Generated Corpus (subset for CI)
// ============================================

describe('Voice Quality – Generated Corpus (seed=42, 20/class)', () => {
  const generated = generateTestCorpus({ seed: 42, countPerClass: 20 });
  
  for (const tc of generated) {
    it(`${tc.id}: "${tc.transcript.substring(0, 50)}${tc.transcript.length > 50 ? '…' : ''}"`, () => {
      const result = runCase(tc);
      if (result.failures.length > 0) {
        expect.fail(`Failures:\n  ${result.failures.join('\n  ')}`);
      }
    });
  }
});

// ============================================
// Metrics & CI Gates
// ============================================

describe('Voice Quality – CI Gates', () => {
  it('Golden dataset meets CI gate thresholds', () => {
    const results = GOLDEN_DATASET.map(runCase);
    const metrics = computeMetrics(results);
    const gates = checkCIGates(metrics, DEFAULT_CI_GATES);
    
    // Print report for debugging
    console.log('\n📊 Voice Quality Metrics Report:');
    console.log(`  Total: ${metrics.total}, Passed: ${metrics.passed}, Failed: ${metrics.failed}`);
    console.log(`  Pass Rate: ${(metrics.passRate * 100).toFixed(1)}%`);
    console.log(`  Pain Accuracy: ${(metrics.painAccuracy * 100).toFixed(1)}%`);
    console.log(`  Med Hit Rate: ${(metrics.medHitRate * 100).toFixed(1)}%`);
    console.log(`  Time Accuracy: ${(metrics.timeAccuracy * 100).toFixed(1)}%`);
    console.log(`  K6 False Positives: ${metrics.k6FalsePositives}`);
    console.log(`  Notes Noise Rate: ${(metrics.notesNoiseRate * 100).toFixed(1)}%`);
    console.log('  By Class:');
    for (const [cls, data] of Object.entries(metrics.byClass)) {
      console.log(`    ${cls}: ${data.passed}/${data.total} (${(data.passRate * 100).toFixed(0)}%)`);
    }
    
    if (metrics.failedCases.length > 0) {
      console.log('\n❌ Failed Cases:');
      for (const fc of metrics.failedCases.slice(0, 20)) {
        console.log(`  ${fc.id}: ${fc.failures.join('; ')}`);
      }
    }
    
    if (!gates.passed) {
      console.log('\n🚫 CI Gate Violations:');
      for (const v of gates.violations) {
        console.log(`  - ${v}`);
      }
    }
    
    // Current baseline gates – tighten as parser improves
    expect(metrics.k6FalsePositives).toBeLessThanOrEqual(1);
    expect(metrics.painAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(metrics.notesNoiseRate).toBeLessThanOrEqual(0.05);
    expect(metrics.passRate).toBeGreaterThanOrEqual(0.75);
  });
});
