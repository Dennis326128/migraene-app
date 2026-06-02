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

  it('never truncates inside a date or after an abbreviation', () => {
    const summary =
      'Im Zeitraum 02.05.2026 bis 31.05.2026 war die Schmerzlast sehr hoch. ' +
      'Die Schmerzlast blieb in der zweiten Hälfte des Zeitraums ähnlich wie in der ersten Hälfte (Schmerztage 12/14 vs. 11/14). ' +
      'Triptane wurden in der zweiten Hälfte seltener dokumentiert. ' +
      'Weitere Beobachtungen folgen.';
    const out = buildAiPdfSummary({
      summary,
      possiblePatterns: [{ title: 't', description: 'd', evidenceStrength: 'low' }],
      scope: { daysAnalyzed: 30 },
    })!;
    // No dangling date fragments
    expect(out.summary).not.toMatch(/\d+\.\s+\d+\.\s*$/);
    expect(out.summary).not.toMatch(/\d+\.\s+\d+\.\s+\d+\.\s*$/);
    // No abbreviation tails
    expect(out.summary).not.toMatch(/\bvs\.\s*$/i);
    expect(out.summary).not.toMatch(/\bbzw\.\s*$/i);
    // No fragment like "12/14 vs."
    expect(out.summary).not.toMatch(/\d+\/\d+\s+vs\.\s*$/i);
    // Date spacing stays compact: must contain "02.05.2026", never "2. 5. 2026"
    expect(out.summary).not.toMatch(/\b\d\.\s\d\.\s\d{4}\b/);
    // Must end on a sentence terminator
    expect(out.summary.trim()).toMatch(/[.!?]$/);
  });

  it('uses a safe fallback when no full sentence fits', () => {
    const out = buildAiPdfSummary({
      summary: 'Vergleich 12/14 vs.',
      possiblePatterns: [{ title: 't', description: 'd', evidenceStrength: 'low' }],
      scope: { daysAnalyzed: 30 },
    })!;
    expect(out.summary).toContain('30-Tage-Zeitraum');
    expect(out.summary.trim()).toMatch(/[.!?]$/);
  });

  it('drops fragmented highlight lines instead of rendering them', () => {
    const out = buildAiPdfSummary({
      summary: 'Kurzfazit.',
      possiblePatterns: [
        { title: 'Schmerzlast bleibt ähnlich', description: 'Schmerztage 12/14 vs.', evidenceStrength: 'high' },
        { title: 'Solide Beobachtung', description: 'Hohe Belastung dokumentiert.', evidenceStrength: 'high' },
      ],
    })!;
    const fragHighlight = out.highlights.find((h) => h.title.includes('Schmerzlast'));
    expect(fragHighlight?.line ?? '').toBe('');
    const okHighlight = out.highlights.find((h) => h.title.includes('Solide'));
    expect(okHighlight?.line).toContain('Hohe Belastung');
  });

  it('deduplicates burden topic so ME/CFS keeps its highlight slot', () => {
    const responseJson = {
      summary: 'Kurzfazit.',
      scope: { daysAnalyzed: 30 },
      analysisV21: {
        schema_version: '2.1',
        period: { from: '2026-05-02', to: '2026-05-31' },
        data_basis: { documented_days: 30, pain_days: 28, mecfs_energy_days: 14 },
        llm_expanded_findings: [
          { id: 'burden.high', category: 'burden', title: 'Sehr hohe Schmerzlast im gesamten Zeitraum', summary: 'Hohe Belastung dokumentiert.', evidence_level: 'high' },
          { id: 'medication_trend.acute_use', category: 'medication_trend', title: 'Triptan-Einnahmen seltener', summary: 'Akutmedikation rückläufig.', evidence_level: 'high' },
          { id: 'course_trend.pain_burden', category: 'course_trend', title: 'Schmerzlast bleibt ähnlich', summary: 'Schmerzlast stabil.', evidence_level: 'high' },
          { id: 'mecfs_energy_trend.signals', category: 'mecfs_energy_trend', title: 'ME/CFS- und Energie-Signale', summary: 'Regelmäßige Energieeinbrüche.', evidence_level: 'high' },
        ],
        findings: [],
      },
    };
    const out = buildAiPdfSummary(responseJson)!;
    const titles = out.highlights.map((h) => h.title);
    expect(titles).toHaveLength(3);
    expect(titles.some((t) => /Sehr hohe Schmerzlast/i.test(t))).toBe(true);
    expect(titles.some((t) => /Schmerzlast bleibt/i.test(t))).toBe(false);
    expect(titles.some((t) => /Triptan|Akutmedikation/i.test(t))).toBe(true);
    expect(titles.some((t) => /ME\/CFS|Energie/i.test(t))).toBe(true);
  });
});
