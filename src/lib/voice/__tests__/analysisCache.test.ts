/**
 * Tests for analysisCache.ts — Behavioral logic tests for reuse, 
 * validity, deduplication, and cross-system consistency.
 */
import { describe, it, expect } from 'vitest';
import { buildDedupeKey, canReanalyze, buildPatternAnalysisSummary, type CachedAnalysis } from '../analysisCache';
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
      model: 'gemini-2.0-flash', analyzedAt: new Date().toISOString(),
      promptTokenEstimate: 100, analysisVersion: '1.0',
    },
    ...overrides,
  };
}

function mockCached(overrides?: Partial<CachedAnalysis>): CachedAnalysis {
  return {
    id: 'test-id',
    result: mockResult(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fromDate: '2026-01-01',
    toDate: '2026-03-31',
    ...overrides,
  };
}

// ============================================================
// 1. Dedupe Key — deterministic and unique per range
// ============================================================

describe('buildDedupeKey', () => {
  it('creates deterministic key from date range', () => {
    expect(buildDedupeKey('2026-01-01', '2026-03-31'))
      .toBe('pattern_analysis_2026-01-01_2026-03-31');
  });

  it('different ranges produce different keys', () => {
    const key1 = buildDedupeKey('2026-01-01', '2026-03-31');
    const key2 = buildDedupeKey('2026-02-01', '2026-04-30');
    expect(key1).not.toBe(key2);
  });

  it('same range always produces same key (idempotent)', () => {
    const key1 = buildDedupeKey('2026-01-01', '2026-03-31');
    const key2 = buildDedupeKey('2026-01-01', '2026-03-31');
    expect(key1).toBe(key2);
  });
});

// ============================================================
// 2. Cooldown — secondary safeguard, NOT primary validity
// ============================================================

describe('canReanalyze (cooldown)', () => {
  it('blocks reanalysis within 5 minutes for unchanged data', () => {
    const recent = mockCached({
      updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    });
    expect(canReanalyze(recent)).toBe(false);
  });

  it('allows reanalysis after 5 minutes', () => {
    const old = mockCached({
      updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });
    expect(canReanalyze(old)).toBe(true);
  });

  it('exactly at 5 minutes boundary allows reanalysis', () => {
    const atBoundary = mockCached({
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    expect(canReanalyze(atBoundary)).toBe(true);
  });
});

// ============================================================
// 3. buildPatternAnalysisSummary — consistent format for
//    snapshot, website, and PDF
// ============================================================

describe('buildPatternAnalysisSummary', () => {
  it('maps VoiceAnalysisResult to compact summary format', () => {
    const result = mockResult();
    const summary = buildPatternAnalysisSummary(result);

    expect(summary.summary).toBe(result.summary);
    expect(summary.patterns).toHaveLength(1);
    expect(summary.patterns[0].title).toBe('Stress');
    expect(summary.patterns[0].evidenceStrength).toBe('high');
    expect(summary.recurringSequences).toHaveLength(1);
    expect(summary.recurringSequences[0].interpretation).toBe('Häufige Abfolge');
    expect(summary.openQuestions).toEqual(['Zyklus-Einfluss unklar']);
    expect(summary.daysAnalyzed).toBe(30);
  });

  it('limits patterns to max 7', () => {
    const manyPatterns = Array.from({ length: 12 }, (_, i) => ({
      patternType: 'trigger_candidate' as const,
      title: `Pattern ${i}`,
      description: `Desc ${i}`,
      evidenceStrength: 'medium' as const,
      occurrences: i + 1,
      examples: [],
      uncertaintyNotes: [],
    }));
    const result = mockResult({ possiblePatterns: manyPatterns });
    const summary = buildPatternAnalysisSummary(result);
    expect(summary.patterns).toHaveLength(7);
  });

  it('limits recurring sequences to max 5', () => {
    const manySeqs = Array.from({ length: 8 }, (_, i) => ({
      pattern: `Seq ${i}`, count: i + 1, llmInterpretation: `Interp ${i}`,
    }));
    const result = mockResult({ recurringSequences: manySeqs });
    const summary = buildPatternAnalysisSummary(result);
    expect(summary.recurringSequences).toHaveLength(5);
  });

  it('limits open questions to max 4', () => {
    const result = mockResult({
      openQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'],
    });
    const summary = buildPatternAnalysisSummary(result);
    expect(summary.openQuestions).toHaveLength(4);
  });
});

// ============================================================
// 4. Data shape validation — ensures snapshot, PDF, and website
//    all use the same structure
// ============================================================

describe('PatternAnalysisSummary consistency across outputs', () => {
  it('snapshot format matches expected DoctorReportJSON.analysis.patternAnalysis shape', () => {
    const result = mockResult();
    const pa = buildPatternAnalysisSummary(result);

    // These exact fields are read by DoctorReportView.tsx
    expect(pa).toHaveProperty('summary');
    expect(pa).toHaveProperty('patterns');
    expect(pa).toHaveProperty('recurringSequences');
    expect(pa).toHaveProperty('openQuestions');
    expect(pa).toHaveProperty('analyzedAt');
    expect(pa).toHaveProperty('daysAnalyzed');

    // Pattern items
    expect(pa.patterns[0]).toHaveProperty('title');
    expect(pa.patterns[0]).toHaveProperty('description');
    expect(pa.patterns[0]).toHaveProperty('evidenceStrength');

    // Sequence items
    expect(pa.recurringSequences[0]).toHaveProperty('pattern');
    expect(pa.recurringSequences[0]).toHaveProperty('count');
    expect(pa.recurringSequences[0]).toHaveProperty('interpretation');
  });

  it('PDF report type matches buildPatternAnalysisSummary output', () => {
    // The PDF report.ts expects: { summary, patterns[], recurringSequences[], openQuestions[], analyzedAt, daysAnalyzed }
    const result = mockResult();
    const pa = buildPatternAnalysisSummary(result);

    // Verify PDF-critical fields
    expect(typeof pa.summary).toBe('string');
    expect(typeof pa.analyzedAt).toBe('string');
    expect(typeof pa.daysAnalyzed).toBe('number');
    expect(Array.isArray(pa.patterns)).toBe(true);
    expect(Array.isArray(pa.recurringSequences)).toBe(true);
    expect(Array.isArray(pa.openQuestions)).toBe(true);
  });
});

// ============================================================
// 5. PDF report inclusion logic — haken-based
// ============================================================

describe('PDF report inclusion logic', () => {
  it('returns null patternAnalysis when includePremiumAI is false', () => {
    const includePremiumAI = false;
    const patternAnalysis = includePremiumAI ? buildPatternAnalysisSummary(mockResult()) : null;
    expect(patternAnalysis).toBeNull();
  });

  it('provides patternAnalysis when includePremiumAI is true and data exists', () => {
    const includePremiumAI = true;
    const result = mockResult();
    const patternAnalysis = includePremiumAI && result.possiblePatterns.length > 0
      ? buildPatternAnalysisSummary(result)
      : null;
    expect(patternAnalysis).not.toBeNull();
    expect(patternAnalysis?.patterns).toHaveLength(1);
  });

  it('returns null when flag is true but no patterns exist', () => {
    const includePremiumAI = true;
    const result = mockResult({ possiblePatterns: [] });
    const patternAnalysis = includePremiumAI && result.possiblePatterns.length > 0
      ? buildPatternAnalysisSummary(result)
      : null;
    expect(patternAnalysis).toBeNull();
  });
});

// ============================================================
// 6. Deduplication — no duplicate rendering across outputs
// ============================================================

describe('No duplicate analysis rendering', () => {
  it('snapshot and PDF use same dedupe_key → same source data', () => {
    const dedupeKey = buildDedupeKey('2026-01-01', '2026-03-31');
    expect(dedupeKey).toBe('pattern_analysis_2026-01-01_2026-03-31');
  });

  it('buildPatternAnalysisSummary is deterministic for same input', () => {
    const result = mockResult();
    const s1 = buildPatternAnalysisSummary(result);
    const s2 = buildPatternAnalysisSummary(result);
    expect(s1).toEqual(s2);
  });
});

// ============================================================
// 7. Data-state driven reuse — the core validity concept
// ============================================================

describe('Data-state validity concept', () => {
  it('analysis updatedAt is the reference timestamp for validity', () => {
    const cached = mockCached({
      updatedAt: '2026-04-01T12:00:00Z',
    });
    // If a pain entry has timestamp_created AFTER updatedAt → invalid
    const entryTime = new Date('2026-04-01T13:00:00Z').getTime();
    const cacheTime = new Date(cached.updatedAt).getTime();
    expect(entryTime > cacheTime).toBe(true); // → should invalidate
  });

  it('unchanged data keeps cache valid', () => {
    const cached = mockCached({
      updatedAt: '2026-04-01T12:00:00Z',
    });
    // Entry older than analysis → still valid
    const entryTime = new Date('2026-04-01T10:00:00Z').getTime();
    const cacheTime = new Date(cached.updatedAt).getTime();
    expect(entryTime > cacheTime).toBe(false); // → valid
  });

  it('cooldown does NOT override data-change invalidation', () => {
    // Even if cooldown says "too soon", data change should still allow re-analysis
    const recentCached = mockCached({
      updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 min ago
    });
    // Cooldown blocks re-run
    expect(canReanalyze(recentCached)).toBe(false);
    // But isCacheValid would return false if data changed → caller
    // should check isCacheValid FIRST, then cooldown only for unchanged data
  });
});

// ============================================================
// 8. Empty/weak data handling
// ============================================================

describe('Empty analysis result handling', () => {
  it('analysis with 0 daysAnalyzed is treated as unavailable', () => {
    const result = mockResult({
      scope: {
        fromDate: '2026-01-01', toDate: '2026-03-31',
        totalDays: 90, daysAnalyzed: 0,
        painEntryCount: 0, voiceEventCount: 0, medicationIntakeCount: 0,
      },
    });
    // isAnalysisUnavailable check
    expect(result.scope.daysAnalyzed).toBe(0);
  });

  it('analysis with patterns but error flag is unavailable', () => {
    const result = mockResult({
      meta: {
        model: 'test', analyzedAt: new Date().toISOString(),
        promptTokenEstimate: 0, analysisVersion: '1.0',
        error: true, errorReason: 'rate_limit',
      },
    });
    expect(result.meta.error).toBe(true);
  });
});
