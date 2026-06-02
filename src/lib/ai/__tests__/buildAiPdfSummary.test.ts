import { describe, it, expect } from 'vitest';
import { buildAiPdfSummary } from '../buildAiPdfSummary';

const v21Fixture = {
  summary: 'LLM-Kurzfazit Text.',
  scope: { daysAnalyzed: 90 },
  meta: { analyzedAt: '2026-01-15T10:00:00Z' },
  analysisV21: {
    schema_version: '2.1',
    period: { from: '2025-10-17', to: '2026-01-15' },
    data_basis: { documented_days: 80, pain_days: 55, mecfs_energy_days: 20 },
    llm_expanded_findings: [
      { id: 'b1', category: 'burden', title: 'Sehr hoher Anteil an Schmerztagen', summary: 'Hohe Belastung.', evidence_level: 'high' },
      { id: 'c1', category: 'chronification', title: 'Chronifizierungsrisiko', summary: 'Sollte ärztlich geprüft werden.', evidence_level: 'high' },
      { id: 'm1', category: 'medication_use', title: 'Triptan-Einnahme', summary: 'Hinweis auf häufige Einnahmen.', evidence_level: 'moderate' },
      { id: 'w1', category: 'weather', title: 'Druckabfall', summary: 'Korrelation Druckabfall.', evidence_level: 'low' },
    ],
    findings: [],
  },
};

const legacyFixture = {
  summary: 'Legacy Kurzfazit.',
  possiblePatterns: [
    { title: 'Schlafmangel', description: 'Häufig vor Schmerztagen.', evidenceStrength: 'high' },
    { title: 'Wetter', description: 'Schwacher Hinweis.', evidenceStrength: 'low' },
  ],
  openQuestions: ['Schlafhygiene?', 'Trigger-Tagebuch?'],
  meta: { analyzedAt: '2026-01-10T09:00:00Z' },
  scope: { daysAnalyzed: 30 },
};

describe('buildAiPdfSummary', () => {
  it('returns null for invalid input', () => {
    expect(buildAiPdfSummary(null)).toBeNull();
    expect(buildAiPdfSummary({})).toBeNull();
  });

  it('builds a compact V2.1 summary with ≤3 highlights and ≤4 questions', () => {
    const out = buildAiPdfSummary(v21Fixture)!;
    expect(out).not.toBeNull();
    expect(out.summary.length).toBeGreaterThan(0);
    expect(out.highlights.length).toBeLessThanOrEqual(3);
    expect(out.openQuestions.length).toBeLessThanOrEqual(4);
    expect(out.daysAnalyzed).toBe(90);
  });

  it('omits long sections — no expandable details, no "Was noch unklar" labels', () => {
    const out = buildAiPdfSummary(v21Fixture)!;
    const all = JSON.stringify(out);
    expect(all).not.toMatch(/Details anzeigen/i);
    expect(all).not.toMatch(/Was noch unklar/i);
    expect(all).not.toContain('llm_expanded_findings');
  });

  it('falls back to legacy possiblePatterns when no analysisV21', () => {
    const out = buildAiPdfSummary(legacyFixture)!;
    expect(out).not.toBeNull();
    expect(out.summary).toContain('Legacy');
    expect(out.highlights[0].title).toBe('Schlafmangel');
    expect(out.openQuestions).toContain('Schlafhygiene?');
  });

  it('caps summary to ~4 sentences / 480 chars', () => {
    const longSummary = 'Satz A. Satz B. Satz C. Satz D. Satz E. Satz F. ' + 'X'.repeat(600);
    const out = buildAiPdfSummary({
      summary: longSummary,
      possiblePatterns: [{ title: 't', description: 'd', evidenceStrength: 'low' }],
    })!;
    expect(out.summary.length).toBeLessThanOrEqual(480);
  });
});
