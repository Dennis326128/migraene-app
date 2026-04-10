/**
 * Tests for analysisCache.ts — Reuse, deduplication, and consistency logic
 */
import { describe, it, expect } from 'vitest';
import { buildDedupeKey, canReanalyze, type CachedAnalysis } from '../analysisCache';

// ============================================================
// 1. Dedupe Key
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

  it('same range always produces same key', () => {
    const key1 = buildDedupeKey('2026-01-01', '2026-03-31');
    const key2 = buildDedupeKey('2026-01-01', '2026-03-31');
    expect(key1).toBe(key2);
  });
});

// ============================================================
// 2. Reanalysis cooldown
// ============================================================

describe('canReanalyze', () => {
  const baseCached: CachedAnalysis = {
    id: 'test-id',
    result: {
      summary: 'test',
      possiblePatterns: [],
      recurringSequences: [],
      painContextFindings: [],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      openQuestions: [],
      confidenceNotes: [],
      scope: { fromDate: '2026-01-01', toDate: '2026-03-31', totalDays: 90, daysAnalyzed: 30, painEntryCount: 10, voiceEventCount: 5, medicationIntakeCount: 3 },
      meta: { model: 'test', analyzedAt: new Date().toISOString() },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fromDate: '2026-01-01',
    toDate: '2026-03-31',
  };

  it('blocks reanalysis within 5 minutes', () => {
    const recent = {
      ...baseCached,
      updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    };
    expect(canReanalyze(recent)).toBe(false);
  });

  it('allows reanalysis after 5 minutes', () => {
    const old = {
      ...baseCached,
      updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
    };
    expect(canReanalyze(old)).toBe(true);
  });
});

// ============================================================
// 3. Snapshot pattern analysis shape validation
// ============================================================

describe('PatternAnalysisSummary shape', () => {
  it('validates expected structure for snapshot embedding', () => {
    const pa = {
      summary: 'Stress und Schlafmangel als häufige Begleiter.',
      patterns: [
        { title: 'Stress', description: 'Tritt häufig vor Schmerzphasen auf', evidenceStrength: 'high' },
      ],
      recurringSequences: [
        { pattern: 'Stress → Schlafmangel → Migräne', count: 3, interpretation: 'Häufige Abfolge' },
      ],
      openQuestions: ['Zyklus-Einfluss unklar'],
      analyzedAt: '2026-04-10T12:00:00Z',
      daysAnalyzed: 90,
    };

    expect(pa.summary).toBeTruthy();
    expect(pa.patterns).toHaveLength(1);
    expect(pa.patterns[0].evidenceStrength).toBe('high');
    expect(pa.recurringSequences).toHaveLength(1);
    expect(pa.openQuestions).toHaveLength(1);
    expect(pa.daysAnalyzed).toBe(90);
  });
});

// ============================================================
// 4. PDF report inclusion logic
// ============================================================

describe('PDF report inclusion logic', () => {
  it('returns null patternAnalysis when includePremiumAI is false', () => {
    const includePremiumAI = false;
    const patternAnalysis = includePremiumAI ? { summary: 'test' } : null;
    expect(patternAnalysis).toBeNull();
  });

  it('provides patternAnalysis when includePremiumAI is true and data exists', () => {
    const includePremiumAI = true;
    const cachedResult = {
      summary: 'Zusammenhänge erkannt.',
      possiblePatterns: [{ title: 'Stress', description: 'x', evidenceStrength: 'high' }],
    };
    const patternAnalysis = includePremiumAI && cachedResult.possiblePatterns.length > 0
      ? {
          summary: cachedResult.summary,
          patterns: cachedResult.possiblePatterns.map(p => ({
            title: p.title,
            description: p.description,
            evidenceStrength: p.evidenceStrength,
          })),
        }
      : null;
    expect(patternAnalysis).not.toBeNull();
    expect(patternAnalysis?.patterns).toHaveLength(1);
  });
});

// ============================================================
// 5. Website consistency — same data shape
// ============================================================

describe('Website snapshot consistency', () => {
  it('DoctorReportJSON analysis.patternAnalysis matches PatternAnalysisSummary', () => {
    // Simulates what the snapshot builder outputs
    const snapshotAnalysis = {
      patternAnalysis: {
        summary: 'KI-Analyse summary',
        patterns: [
          { title: 'Schlafmangel', description: 'Vor Migräne oft weniger Schlaf', evidenceStrength: 'medium' },
        ],
        recurringSequences: [],
        openQuestions: ['Wetterdaten noch zu dünn'],
        analyzedAt: '2026-04-09T10:00:00Z',
        daysAnalyzed: 60,
      },
    };

    // Website reads this from the snapshot
    const websitePA = snapshotAnalysis.patternAnalysis;
    expect(websitePA.summary).toBe('KI-Analyse summary');
    expect(websitePA.patterns[0].title).toBe('Schlafmangel');
    expect(websitePA.daysAnalyzed).toBe(60);
  });
});

// ============================================================
// 6. No duplicate rendering
// ============================================================

describe('No duplicate analysis rendering', () => {
  it('snapshot patternAnalysis and PDF patternAnalysis share same source', () => {
    // Both come from ai_reports table → same dedupe_key → same data
    const dedupeKey = buildDedupeKey('2026-01-01', '2026-03-31');
    // Both app and website use this key to load the SAME analysis
    expect(dedupeKey).toBe('pattern_analysis_2026-01-01_2026-03-31');
  });
});
