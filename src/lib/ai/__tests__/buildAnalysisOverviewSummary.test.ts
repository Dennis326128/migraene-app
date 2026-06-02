import { describe, it, expect } from 'vitest';
import { buildAnalysisOverviewSummary } from '../buildAnalysisOverviewSummary';
import type { NormalizedAnalysisFinding } from '../normalizeAnalysisFindings';

function f(o: Partial<NormalizedAnalysisFinding> & { id: string; category: string }): NormalizedAnalysisFinding {
  return {
    id: o.id,
    category: o.category,
    section: o.section ?? 'strongest',
    title: o.title ?? 'T',
    summary: o.summary ?? 'S',
    evidenceLevel: o.evidenceLevel ?? 'low',
    limitations: o.limitations ?? [],
    recommendedTrackingNext: o.recommendedTrackingNext ?? [],
    doctorDiscussionPoints: o.doctorDiscussionPoints ?? [],
    source: 'deterministic',
    shouldShowInDoctorShare: true,
  };
}

const responseJson = {
  analysisV21: {
    period: { from: '2026-04-27', to: '2026-05-26' },
    data_basis: { pain_days: 29, documented_days: 30, mecfs_energy_days: 12, weather_days: 30 },
  },
};

describe('buildAnalysisOverviewSummary', () => {
  it('returns null when analysisV21 is missing', () => {
    expect(buildAnalysisOverviewSummary({ responseJson: {}, findings: [] })).toBeNull();
  });

  it('builds a short summary covering Schmerzlast, Triptan, ME/CFS und Doku', () => {
    const findings: NormalizedAnalysisFinding[] = [
      f({ id: 'course_trend.pain_burden', category: 'course_trend', title: 'Schmerzlast bleibt ähnlich' }),
      f({ id: 'medication_trend.acute_use', category: 'medication_trend', title: 'Triptan-Einnahmen seltener, Schmerzlast unverändert' }),
      f({ id: 'mecfs_energy_trend.signals', category: 'mecfs_energy_trend', title: 'ME/CFS-/Energiesignale zuletzt seltener' }),
      f({ id: 'weather.assoc', category: 'weather', evidenceLevel: 'low' }),
      f({ id: 'data_quality.diary_coverage', category: 'data_quality', title: 'Dokumentationsfazit', evidenceLevel: 'moderate' }),
    ];
    const txt = buildAnalysisOverviewSummary({ responseJson, findings })!;
    expect(txt).toBeTruthy();
    expect(txt).toMatch(/29 von 30/);
    expect(txt).toMatch(/sehr hoch/);
    expect(txt).toMatch(/Triptan/);
    expect(txt).toMatch(/ME\/CFS/);
    expect(txt).toMatch(/Dokumentation/i);
    expect(txt).not.toMatch(/Wirkungsbewertungen zu Medikamenten wurden/i);
    expect(txt).not.toMatch(/Wetter/);
    // no diagnostic / harsh wording
    expect(txt).not.toMatch(/chronische Migräne/i);
    expect(txt).not.toMatch(/Diagnose/i);
    expect(txt).not.toMatch(/fehlende schmerzfreie/i);
    // cap to ≤4 sentences
    const sentences = txt.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    expect(sentences.length).toBeLessThanOrEqual(4);
    expect(sentences.length).toBeGreaterThanOrEqual(3);
  });

  it('omits sections that have no corresponding findings', () => {
    const noMecfsResponse = {
      analysisV21: {
        period: { from: '2026-04-27', to: '2026-05-26' },
        data_basis: { pain_days: 29, documented_days: 30, mecfs_energy_days: 0, weather_days: 30 },
      },
    };
    const txt = buildAnalysisOverviewSummary({ responseJson: noMecfsResponse, findings: [] })!;
    expect(txt).toMatch(/29 von 30/);
    expect(txt).not.toMatch(/Triptan/);
    expect(txt).not.toMatch(/ME\/CFS/);
  });
});
