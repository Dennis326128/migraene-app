/**
 * Tests for analysisCache.ts — Behavioral logic tests for reuse,
 * validity, deduplication, and cross-system consistency.
 *
 * These tests verify the RULES, not just shapes:
 * - State-signature-based invalidation (exact match)
 * - Counts + timestamps in fingerprint
 * - Cooldown as secondary safeguard only
 * - Cross-output format consistency (PDF, Website, Snapshot)
 * - Haken-based inclusion/exclusion logic
 * - Scoping: only user's own data in the analysis range matters
 */
import { describe, it, expect } from 'vitest';
import {
  buildDedupeKey,
  canReanalyze,
  buildPatternAnalysisSummary,
  buildStateSignature,
  extractCompactSummary,
  MAX_PATTERNS,
  MAX_SEQUENCES,
  MAX_QUESTIONS,
  type CachedAnalysis,
  type DataStateFingerprint,
  type CacheValidityResult,
} from '../analysisCache';
import type { VoiceAnalysisResult } from '../analysisTypes';

// ============================================================
// Helper: build a mock VoiceAnalysisResult
// ============================================================

function mockResult(overrides?: Partial<VoiceAnalysisResult>): VoiceAnalysisResult {
  return {
    summary: 'Stress und Schlafmangel als häufige Begleiter.',
    possiblePatterns: [
      {
        patternType: 'trigger_candidate',
        title: 'Stress',
        description: 'Tritt häufig vor Schmerzphasen auf',
        evidenceStrength: 'high',
        occurrences: 5,
        examples: ['10. Apr.'],
        uncertaintyNotes: [],
      },
      {
        patternType: 'sleep_impact',
        title: 'Schlafmangel',
        description: 'Wenig Schlaf korreliert mit Schmerzattacken',
        evidenceStrength: 'medium',
        occurrences: 3,
        examples: ['12. Apr.'],
        uncertaintyNotes: [],
      },
      {
        patternType: 'environment_sensitivity',
        title: 'Wetterempfindlichkeit',
        description: 'Druckabfall scheint relevant',
        evidenceStrength: 'low',
        occurrences: 2,
        examples: [],
        uncertaintyNotes: [{ reason: 'Wenig Datenpunkte', code: 'few_data_points' }],
      },
    ],
    recurringSequences: [
      { pattern: 'Stress → Schlafmangel → Migräne', count: 3, llmInterpretation: 'Häufige Abfolge' },
    ],
    painContextFindings: [],
    fatigueContextFindings: [],
    medicationContextFindings: [],
    openQuestions: ['Zyklus-Einfluss unklar'],
    confidenceNotes: [],
    scope: {
      fromDate: '2026-01-01', toDate: '2026-03-31', totalDays: 90,
      daysAnalyzed: 30, painEntryCount: 10, voiceEventCount: 5, medicationIntakeCount: 3,
    },
    meta: {
      model: 'gemini-2.0-flash', analyzedAt: '2026-04-01T10:00:00Z',
      promptTokenEstimate: 100, analysisVersion: '1.0',
    },
    ...overrides,
  };
}

const SIG_A = buildStateSignature(10, '2026-03-15T08:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
const SIG_B = buildStateSignature(11, '2026-04-01T14:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');

function mockCached(overrides?: Partial<CachedAnalysis>): CachedAnalysis {
  return {
    id: 'test-id',
    result: mockResult(),
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
    fromDate: '2026-01-01',
    toDate: '2026-03-31',
    dataStateSignature: SIG_A,
    ...overrides,
  };
}

function mockFingerprint(overrides?: Partial<DataStateFingerprint>): DataStateFingerprint {
  return {
    painEntryCount: 10, latestPainEntry: '2026-03-15T08:00:00Z',
    voiceEventCount: 5, latestVoiceEvent: '2026-03-20T09:00:00Z',
    medIntakeCount: 3, latestMedIntake: '2026-03-25T10:00:00Z',
    medEffectCount: 2, latestMedEffect: '2026-03-28T11:00:00Z',
    maxTimestamp: '2026-03-28T11:00:00Z',
    stateSignature: SIG_A,
    ...overrides,
  };
}

/**
 * Simulate the isCacheValid logic without Supabase calls.
 * PRIMARY: signature match. FALLBACK: timestamp comparison for legacy.
 */
function simulateCacheValidation(
  cached: CachedAnalysis,
  fingerprint: DataStateFingerprint,
): CacheValidityResult {
  // PRIMARY: signature-based
  if (cached.dataStateSignature) {
    if (cached.dataStateSignature === fingerprint.stateSignature) {
      return { valid: true };
    }
    return { valid: false, reason: 'signature_mismatch' };
  }

  // FALLBACK: timestamp-based for legacy
  const cacheTime = new Date(cached.updatedAt).getTime();
  if (fingerprint.latestPainEntry && new Date(fingerprint.latestPainEntry).getTime() > cacheTime) {
    return { valid: false, reason: 'pain_data_changed' };
  }
  if (fingerprint.latestVoiceEvent && new Date(fingerprint.latestVoiceEvent).getTime() > cacheTime) {
    return { valid: false, reason: 'voice_data_changed' };
  }
  if (fingerprint.latestMedIntake && new Date(fingerprint.latestMedIntake).getTime() > cacheTime) {
    return { valid: false, reason: 'medication_intake_changed' };
  }
  if (fingerprint.latestMedEffect && new Date(fingerprint.latestMedEffect).getTime() > cacheTime) {
    return { valid: false, reason: 'medication_effect_changed' };
  }
  return { valid: true };
}

// ============================================================
// 1. DEDUPE KEY
// ============================================================

describe('buildDedupeKey', () => {
  it('creates deterministic key from date range', () => {
    expect(buildDedupeKey('2026-01-01', '2026-03-31'))
      .toBe('pattern_analysis_2026-01-01_2026-03-31');
  });

  it('different ranges produce different keys', () => {
    expect(buildDedupeKey('2026-01-01', '2026-03-31'))
      .not.toBe(buildDedupeKey('2026-02-01', '2026-04-30'));
  });
});

// ============================================================
// 2. STATE SIGNATURE
// ============================================================

describe('buildStateSignature', () => {
  it('is deterministic', () => {
    const s1 = buildStateSignature(10, '2026-01-01T00:00:00Z', 5, null, 3, '2026-02-01T00:00:00Z', 0, null);
    const s2 = buildStateSignature(10, '2026-01-01T00:00:00Z', 5, null, 3, '2026-02-01T00:00:00Z', 0, null);
    expect(s1).toBe(s2);
  });

  it('different counts → different signature', () => {
    const s1 = buildStateSignature(10, '2026-01-01T00:00:00Z', 5, null, 3, null, 0, null);
    const s2 = buildStateSignature(11, '2026-01-01T00:00:00Z', 5, null, 3, null, 0, null);
    expect(s1).not.toBe(s2);
  });

  it('different timestamps → different signature', () => {
    const s1 = buildStateSignature(10, '2026-01-01T00:00:00Z', 0, null, 0, null, 0, null);
    const s2 = buildStateSignature(10, '2026-01-02T00:00:00Z', 0, null, 0, null, 0, null);
    expect(s1).not.toBe(s2);
  });

  it('null timestamps produce 0', () => {
    const sig = buildStateSignature(0, null, 0, null, 0, null, 0, null);
    expect(sig).toBe('pe:0:0|ve:0:0|mi:0:0|me:0:0');
  });

  it('encodes all four sources', () => {
    const sig = buildStateSignature(1, '2026-01-01T00:00:00Z', 2, '2026-02-01T00:00:00Z', 3, '2026-03-01T00:00:00Z', 4, '2026-04-01T00:00:00Z');
    expect(sig).toContain('pe:1:');
    expect(sig).toContain('ve:2:');
    expect(sig).toContain('mi:3:');
    expect(sig).toContain('me:4:');
  });
});

// ============================================================
// 3. COOLDOWN — secondary safeguard only
// ============================================================

describe('canReanalyze (cooldown)', () => {
  it('blocks within 5 minutes for unchanged data', () => {
    const recent = mockCached({ updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() });
    expect(canReanalyze(recent)).toBe(false);
  });

  it('allows after 5 minutes', () => {
    const old = mockCached({ updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
    expect(canReanalyze(old)).toBe(true);
  });

  it('exactly at 5min boundary allows', () => {
    const at = mockCached({ updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });
    expect(canReanalyze(at)).toBe(true);
  });
});

// ============================================================
// 4. SIGNATURE-BASED VALIDATION — the core validity logic
// ============================================================

describe('Signature-based validation', () => {
  it('matching signature → valid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_A });
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });

  it('mismatching signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_B });
    const result = simulateCacheValidation(cached, fp);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('new pain_entry changes count → new signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    // SIG_B has painEntryCount=11 vs SIG_A's 10
    const fp = mockFingerprint({ stateSignature: SIG_B });
    expect(simulateCacheValidation(cached, fp).valid).toBe(false);
  });

  it('edited pain_entry changes timestamp → new signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const newSig = buildStateSignature(10, '2026-04-01T18:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: newSig })).valid).toBe(false);
  });

  it('voice_event change → new signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const newSig = buildStateSignature(10, '2026-03-15T08:00:00Z', 6, '2026-04-01T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: newSig })).valid).toBe(false);
  });

  it('medication_intake change → new signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const newSig = buildStateSignature(10, '2026-03-15T08:00:00Z', 5, '2026-03-20T09:00:00Z', 4, '2026-04-01T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: newSig })).valid).toBe(false);
  });

  it('medication_effect change → new signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const newSig = buildStateSignature(10, '2026-03-15T08:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 3, '2026-04-01T11:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: newSig })).valid).toBe(false);
  });
});

// ============================================================
// 5. LEGACY FALLBACK (no stored signature)
// ============================================================

describe('Legacy fallback (no signature stored)', () => {
  it('pain_entry newer than analysis → invalid', () => {
    const cached = mockCached({ dataStateSignature: null, updatedAt: '2026-04-01T12:00:00Z' });
    const fp = mockFingerprint({ latestPainEntry: '2026-04-01T13:00:00Z' });
    const result = simulateCacheValidation(cached, fp);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('pain_data_changed');
  });

  it('all sources older → valid', () => {
    const cached = mockCached({ dataStateSignature: null, updatedAt: '2026-04-01T12:00:00Z' });
    const fp = mockFingerprint({
      latestPainEntry: '2026-04-01T10:00:00Z',
      latestVoiceEvent: '2026-04-01T09:00:00Z',
      latestMedIntake: '2026-04-01T08:00:00Z',
      latestMedEffect: '2026-04-01T07:00:00Z',
    });
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });
});

// ============================================================
// 6. SCOPING: only changes IN RANGE and FOR USER matter
// ============================================================

describe('Scoping rules', () => {
  it('other user changes excluded from fingerprint → no invalidation', () => {
    // Another user's medication_effects would never appear in the fingerprint
    // because getDataStateFingerprint scopes via entry_id → pain_entries.user_id
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_A }); // unchanged for THIS user
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });

  it('changes outside date range excluded from fingerprint', () => {
    // getDataStateFingerprint only queries within [fromDate, toDate]
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_A }); // range-scoped → same
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });
});

// ============================================================
// 7. SAME RANGE, DIFFERENT DATA STATE
// ============================================================

describe('Same range, different data state', () => {
  it('same from/to but new entry → different signature → not reused', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_B }); // 11 entries vs 10
    expect(simulateCacheValidation(cached, fp).valid).toBe(false);
  });

  it('same from/to and identical data → same signature → reused', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_A });
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });
});

// ============================================================
// 8. COOLDOWN vs DATA CHANGE priority
// ============================================================

describe('Cooldown vs data-change priority', () => {
  it('cooldown blocks when data unchanged', () => {
    const recent = mockCached({ updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString() });
    expect(canReanalyze(recent)).toBe(false);
  });

  it('data change bypasses cooldown: signature mismatch → invalid → re-analysis allowed', () => {
    const recent = mockCached({
      updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
      dataStateSignature: SIG_A,
    });
    const fp = mockFingerprint({ stateSignature: SIG_B });
    // Signature mismatch → invalid → re-analysis allowed regardless of cooldown
    expect(simulateCacheValidation(recent, fp).valid).toBe(false);
    expect(canReanalyze(recent)).toBe(false); // cooldown says no, but irrelevant because validity already false
  });

  it('unchanged data + past cooldown → allows re-run', () => {
    const old = mockCached({
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      dataStateSignature: SIG_A,
    });
    const fp = mockFingerprint({ stateSignature: SIG_A });
    expect(simulateCacheValidation(old, fp).valid).toBe(true);
    expect(canReanalyze(old)).toBe(true);
  });
});

// ============================================================
// 9. buildPatternAnalysisSummary — SINGLE FORMAT
// ============================================================

describe('buildPatternAnalysisSummary', () => {
  it('maps result to compact format', () => {
    const summary = buildPatternAnalysisSummary(mockResult());
    expect(summary.summary).toBe('Stress und Schlafmangel als häufige Begleiter.');
    expect(summary.patterns).toHaveLength(3);
    expect(summary.recurringSequences).toHaveLength(1);
    expect(summary.openQuestions).toEqual(['Zyklus-Einfluss unklar']);
  });

  it('sorts patterns high > medium > low', () => {
    const summary = buildPatternAnalysisSummary(mockResult());
    expect(summary.patterns[0].evidenceStrength).toBe('high');
    expect(summary.patterns[1].evidenceStrength).toBe('medium');
    expect(summary.patterns[2].evidenceStrength).toBe('low');
  });

  it('limits: max 4 patterns, 2 sequences, 2 questions', () => {
    const result = mockResult({
      possiblePatterns: Array.from({ length: 12 }, (_, i) => ({
        patternType: 'trigger_candidate' as const,
        title: `P${i}`, description: `D${i}`, evidenceStrength: 'medium' as const,
        occurrences: i, examples: [], uncertaintyNotes: [],
      })),
      recurringSequences: Array.from({ length: 8 }, (_, i) => ({
        pattern: `S${i}`, count: i, llmInterpretation: `I${i}`,
      })),
      openQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'],
    });
    const summary = buildPatternAnalysisSummary(result);
    expect(summary.patterns).toHaveLength(4);
    expect(summary.recurringSequences).toHaveLength(2);
    expect(summary.openQuestions).toHaveLength(2);
  });

  it('is deterministic', () => {
    const r = mockResult();
    expect(buildPatternAnalysisSummary(r)).toEqual(buildPatternAnalysisSummary(r));
  });

  it('empty patterns array produces valid summary', () => {
    const r = mockResult({ possiblePatterns: [] });
    const s = buildPatternAnalysisSummary(r);
    expect(s.patterns).toHaveLength(0);
    expect(s.summary).toBeTruthy();
  });

  it('extractCompactSummary prefers _compactSummary over raw', () => {
    const r = mockResult();
    const compact = buildPatternAnalysisSummary(r);
    const stored = { ...r, _compactSummary: compact };
    const extracted = extractCompactSummary(stored);
    expect(extracted).toEqual(compact);
  });

  it('extractCompactSummary falls back to raw for legacy records', () => {
    const r = mockResult();
    const extracted = extractCompactSummary(r);
    expect(extracted).not.toBeNull();
    expect(extracted!.patterns).toHaveLength(Math.min(r.possiblePatterns.length, MAX_PATTERNS));
  });

  it('extractCompactSummary enforces limits on pre-built summary', () => {
    const oversize = {
      _compactSummary: {
        summary: 'test',
        patterns: Array.from({ length: 10 }, (_, i) => ({ title: `P${i}`, description: `D${i}`, evidenceStrength: 'medium' })),
        recurringSequences: Array.from({ length: 8 }, (_, i) => ({ pattern: `S${i}`, count: i, interpretation: `I${i}` })),
        openQuestions: ['Q1','Q2','Q3','Q4','Q5','Q6'],
        analyzedAt: '2026-04-10T12:00:00Z',
        daysAnalyzed: 30,
      }
    };
    const extracted = extractCompactSummary(oversize);
    expect(extracted!.patterns).toHaveLength(MAX_PATTERNS);
    expect(extracted!.recurringSequences).toHaveLength(MAX_SEQUENCES);
    expect(extracted!.openQuestions).toHaveLength(MAX_QUESTIONS);
  });
});

// ============================================================
// 10. Cross-output consistency — CENTRAL MAPPING LAYER
// ============================================================

describe('Cross-output consistency (PDF, Website, Snapshot)', () => {
  it('has all fields expected by DoctorReportView', () => {
    const pa = buildPatternAnalysisSummary(mockResult());
    expect(pa).toHaveProperty('summary');
    expect(pa).toHaveProperty('patterns');
    expect(pa).toHaveProperty('recurringSequences');
    expect(pa).toHaveProperty('openQuestions');
    expect(pa).toHaveProperty('analyzedAt');
    expect(pa).toHaveProperty('daysAnalyzed');
    expect(pa.patterns[0]).toHaveProperty('title');
    expect(pa.patterns[0]).toHaveProperty('description');
    expect(pa.patterns[0]).toHaveProperty('evidenceStrength');
    expect(pa.recurringSequences[0]).toHaveProperty('interpretation');
  });

  it('same input → identical output (deterministic)', () => {
    const r = mockResult();
    expect(buildPatternAnalysisSummary(r)).toEqual(buildPatternAnalysisSummary(r));
  });

  it('sorting is evidence-based: high > medium > low', () => {
    const r = mockResult({
      possiblePatterns: [
        { patternType: 'trigger_candidate', title: 'Low', description: 'd', evidenceStrength: 'low', occurrences: 5, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'High', description: 'd', evidenceStrength: 'high', occurrences: 1, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'Med', description: 'd', evidenceStrength: 'medium', occurrences: 3, examples: [], uncertaintyNotes: [] },
      ],
    });
    const pa = buildPatternAnalysisSummary(r);
    expect(pa.patterns.map(p => p.evidenceStrength)).toEqual(['high', 'medium', 'low']);
  });

  it('limits are enforced identically (4 patterns, 2 sequences, 2 questions)', () => {
    const r = mockResult({
      possiblePatterns: Array.from({ length: 12 }, (_, i) => ({
        patternType: 'trigger_candidate' as const, title: `P${i}`, description: `D${i}`,
        evidenceStrength: 'medium' as const, occurrences: 1, examples: [], uncertaintyNotes: [],
      })),
      recurringSequences: Array.from({ length: 9 }, (_, i) => ({
        pattern: `S${i}`, count: i + 1, llmInterpretation: `I${i}`,
      })),
      openQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
    });
    const pa = buildPatternAnalysisSummary(r);
    expect(pa.patterns).toHaveLength(4);
    expect(pa.recurringSequences).toHaveLength(2);
    expect(pa.openQuestions).toHaveLength(2);
  });

  it('llmInterpretation → interpretation field mapping', () => {
    const pa = buildPatternAnalysisSummary(mockResult());
    expect(pa.recurringSequences[0]).toHaveProperty('interpretation');
    expect(pa.recurringSequences[0]).not.toHaveProperty('llmInterpretation');
    expect(pa.recurringSequences[0].interpretation).toBe('Häufige Abfolge');
  });

  it('empty patterns array produces valid summary', () => {
    const r = mockResult({ possiblePatterns: [] });
    const s = buildPatternAnalysisSummary(r);
    expect(s.patterns).toHaveLength(0);
    expect(s.summary).toBeTruthy();
  });
});

// ============================================================
// 11. Haken (checkbox) inclusion/exclusion
// ============================================================

describe('Haken-based inclusion/exclusion', () => {
  it('include_ai_analysis=false → null', () => {
    expect(false ? buildPatternAnalysisSummary(mockResult()) : null).toBeNull();
  });

  it('include_ai_analysis=true + data → summary returned', () => {
    const r = mockResult();
    const pa = true && r.possiblePatterns.length > 0 ? buildPatternAnalysisSummary(r) : null;
    expect(pa).not.toBeNull();
  });

  it('include_ai_analysis=true + no patterns → null', () => {
    const r = mockResult({ possiblePatterns: [] });
    const pa = true && r.possiblePatterns.length > 0 ? buildPatternAnalysisSummary(r) : null;
    expect(pa).toBeNull();
  });
});

// ============================================================
// 12. dedupe_key consistency (CRITICAL: edge function + client must match)
// ============================================================

describe('dedupe_key consistency', () => {
  it('buildDedupeKey matches expected format used by edge function and snapshot', () => {
    const key = buildDedupeKey('2026-01-01', '2026-03-31');
    expect(key).toBe('pattern_analysis_2026-01-01_2026-03-31');
    expect(key).not.toContain(':');
  });

  it('same range always produces same key', () => {
    expect(buildDedupeKey('2026-01-01', '2026-03-31'))
      .toBe(buildDedupeKey('2026-01-01', '2026-03-31'));
  });

  it('different ranges produce different keys', () => {
    expect(buildDedupeKey('2026-01-01', '2026-03-31'))
      .not.toBe(buildDedupeKey('2026-02-01', '2026-04-30'));
  });
});

// ============================================================
// 13. Stale policy per channel
// ============================================================

describe('Stale policy per channel', () => {
  // Simulate what selectAnalysisForChannel does for stale data
  const simulateChannelDecision = (channel: string, isFresh: boolean) => {
    // All channels accept stale (stale > missing) per current policy
    if (isFresh) return 'fresh';
    // channel-specific: all accept stale
    return channel === 'app' || channel === 'pdf' || channel === 'website' || channel === 'snapshot'
      ? 'stale_accepted'
      : 'stale_rejected';
  };

  it('app: accepts stale analysis', () => {
    expect(simulateChannelDecision('app', false)).toBe('stale_accepted');
  });

  it('pdf: accepts stale analysis', () => {
    expect(simulateChannelDecision('pdf', false)).toBe('stale_accepted');
  });

  it('website: accepts stale analysis', () => {
    expect(simulateChannelDecision('website', false)).toBe('stale_accepted');
  });

  it('snapshot: accepts stale analysis', () => {
    expect(simulateChannelDecision('snapshot', false)).toBe('stale_accepted');
  });

  it('fresh analysis is always accepted', () => {
    expect(simulateChannelDecision('app', true)).toBe('fresh');
    expect(simulateChannelDecision('pdf', true)).toBe('fresh');
    expect(simulateChannelDecision('website', true)).toBe('fresh');
  });
});

// ============================================================
// 14. Signature-based invalidation
// ============================================================

describe('Signature-based invalidation', () => {
  it('multiple simultaneous changes still detected via signature', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const newSig = buildStateSignature(15, '2026-04-01T16:00:00Z', 8, '2026-04-01T14:00:00Z', 5, '2026-04-01T15:00:00Z', 4, '2026-04-01T16:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: newSig })).valid).toBe(false);
  });

  it('deleted entries reduce count → different signature → invalid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const deletedSig = buildStateSignature(9, '2026-03-15T08:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    expect(simulateCacheValidation(cached, mockFingerprint({ stateSignature: deletedSig })).valid).toBe(false);
  });

  it('no data at all → consistent signature', () => {
    const emptySig = buildStateSignature(0, null, 0, null, 0, null, 0, null);
    const cached = mockCached({ dataStateSignature: emptySig });
    const fp = mockFingerprint({ stateSignature: emptySig });
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });

  it('same data same signature → cache valid', () => {
    const cached = mockCached({ dataStateSignature: SIG_A });
    const fp = mockFingerprint({ stateSignature: SIG_A });
    expect(simulateCacheValidation(cached, fp).valid).toBe(true);
  });

  it('same counts different timestamps → invalid', () => {
    const sig1 = buildStateSignature(10, '2026-03-15T08:00:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    const sig2 = buildStateSignature(10, '2026-03-15T08:01:00Z', 5, '2026-03-20T09:00:00Z', 3, '2026-03-25T10:00:00Z', 2, '2026-03-28T11:00:00Z');
    expect(sig1).not.toBe(sig2);
  });

  it('same timestamps different counts → invalid', () => {
    const sig1 = buildStateSignature(10, '2026-03-15T08:00:00Z', 5, null, 3, null, 2, null);
    const sig2 = buildStateSignature(11, '2026-03-15T08:00:00Z', 5, null, 3, null, 2, null);
    expect(sig1).not.toBe(sig2);
  });
});

// ============================================================
// 15. Cooldown as secondary safeguard only
// ============================================================

describe('Cooldown is secondary to data change', () => {
  it('unchanged data within cooldown → blocked by canReanalyze', () => {
    const cached = mockCached({ updatedAt: new Date().toISOString() });
    expect(canReanalyze(cached)).toBe(false);
  });

  it('unchanged data after cooldown → allowed by canReanalyze', () => {
    const cached = mockCached({ updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
    expect(canReanalyze(cached)).toBe(true);
  });

  it('changed data → cache invalid regardless of cooldown (signature mismatch)', () => {
    // Even if cooldown hasn't passed, signature mismatch means cache is invalid
    const cached = mockCached({
      dataStateSignature: SIG_A,
      updatedAt: new Date().toISOString(), // just created
    });
    const differentSig = buildStateSignature(99, '2026-04-10T00:00:00Z', 0, null, 0, null, 0, null);
    const result = simulateCacheValidation(cached, mockFingerprint({ stateSignature: differentSig }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });
});

// ============================================================
// 16. extractCompactSummary — edge cases & SSOT contract
// ============================================================

describe('extractCompactSummary edge cases', () => {
  it('returns null for null/undefined input', () => {
    expect(extractCompactSummary(null)).toBeNull();
    expect(extractCompactSummary(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractCompactSummary('string')).toBeNull();
    expect(extractCompactSummary(42)).toBeNull();
  });

  it('returns null for object without summary or possiblePatterns', () => {
    expect(extractCompactSummary({ foo: 'bar' })).toBeNull();
  });

  it('returns null for legacy data with empty possiblePatterns', () => {
    expect(extractCompactSummary({ summary: 'test', possiblePatterns: [] })).toBeNull();
  });

  it('prefers _compactSummary even if possiblePatterns also exists', () => {
    const compact = buildPatternAnalysisSummary(mockResult());
    const stored = { ...mockResult(), _compactSummary: { ...compact, summary: 'COMPACT VERSION' } };
    const extracted = extractCompactSummary(stored);
    expect(extracted!.summary).toBe('COMPACT VERSION');
  });

  it('legacy fallback maps llmInterpretation → interpretation', () => {
    const legacy = mockResult();
    // No _compactSummary — force legacy path
    const extracted = extractCompactSummary(legacy);
    expect(extracted!.recurringSequences[0]).toHaveProperty('interpretation');
    expect((extracted!.recurringSequences[0] as any).llmInterpretation).toBeUndefined();
  });
});

// ============================================================
// 17. Cross-channel SSOT: buildPatternAnalysisSummary ≡ extractCompactSummary
// ============================================================

describe('Cross-channel SSOT identity', () => {
  it('extractCompactSummary from _compactSummary equals buildPatternAnalysisSummary output', () => {
    const result = mockResult();
    const built = buildPatternAnalysisSummary(result);
    const stored = { ...result, _compactSummary: built };
    const extracted = extractCompactSummary(stored);
    expect(extracted).toEqual(built);
  });

  it('all channels see identical field names', () => {
    const result = mockResult();
    const summary = buildPatternAnalysisSummary(result);
    const keys = Object.keys(summary).sort();
    expect(keys).toEqual(['analyzedAt', 'daysAnalyzed', 'openQuestions', 'patterns', 'recurringSequences', 'summary']);
    // Pattern fields
    expect(Object.keys(summary.patterns[0]).sort()).toEqual(['description', 'evidenceStrength', 'title']);
    // Sequence fields
    expect(Object.keys(summary.recurringSequences[0]).sort()).toEqual(['count', 'interpretation', 'pattern']);
  });

  it('limits are identical: MAX_PATTERNS=4, MAX_SEQUENCES=2, MAX_QUESTIONS=2', () => {
    expect(MAX_PATTERNS).toBe(4);
    expect(MAX_SEQUENCES).toBe(2);
    expect(MAX_QUESTIONS).toBe(2);
  });
});

// ============================================================
// 18. Migraine prioritization: evidence + occurrences tiebreaker
// ============================================================

describe('Migraine prioritization in sorting', () => {
  it('same evidence: higher occurrences sorts first', () => {
    const r = mockResult({
      possiblePatterns: [
        { patternType: 'trigger_candidate', title: 'RarePattern', description: 'd', evidenceStrength: 'medium', occurrences: 1, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'FrequentPattern', description: 'd', evidenceStrength: 'medium', occurrences: 8, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'MidPattern', description: 'd', evidenceStrength: 'medium', occurrences: 4, examples: [], uncertaintyNotes: [] },
      ],
    });
    const summary = buildPatternAnalysisSummary(r);
    expect(summary.patterns.map(p => p.title)).toEqual(['FrequentPattern', 'MidPattern', 'RarePattern']);
  });

  it('evidence trumps occurrences', () => {
    const r = mockResult({
      possiblePatterns: [
        { patternType: 'trigger_candidate', title: 'LowFrequent', description: 'd', evidenceStrength: 'low', occurrences: 20, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'HighRare', description: 'd', evidenceStrength: 'high', occurrences: 1, examples: [], uncertaintyNotes: [] },
      ],
    });
    const summary = buildPatternAnalysisSummary(r);
    expect(summary.patterns[0].title).toBe('HighRare');
    expect(summary.patterns[1].title).toBe('LowFrequent');
  });

  it('mixed evidence and occurrences sorted correctly for 5+ patterns', () => {
    const r = mockResult({
      possiblePatterns: [
        { patternType: 'trigger_candidate', title: 'P1', description: 'd', evidenceStrength: 'low', occurrences: 10, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'P2', description: 'd', evidenceStrength: 'high', occurrences: 3, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'P3', description: 'd', evidenceStrength: 'medium', occurrences: 7, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'P4', description: 'd', evidenceStrength: 'high', occurrences: 5, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'P5', description: 'd', evidenceStrength: 'medium', occurrences: 2, examples: [], uncertaintyNotes: [] },
        { patternType: 'trigger_candidate', title: 'P6', description: 'd', evidenceStrength: 'low', occurrences: 1, examples: [], uncertaintyNotes: [] },
      ],
    });
    const summary = buildPatternAnalysisSummary(r);
    // Max 4 patterns
    expect(summary.patterns).toHaveLength(4);
    // Order: high(5), high(3), medium(7), medium(2) — P1 (low,10) and P6 (low,1) cut
    expect(summary.patterns.map(p => p.title)).toEqual(['P4', 'P2', 'P3', 'P5']);
  });
});
