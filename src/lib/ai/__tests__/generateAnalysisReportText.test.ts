import { describe, it, expect } from 'vitest';
import { generateAnalysisReportText } from '../generateAnalysisReportText';

const v21Input = {
  summary: 'Kurze Einordnung.',
  analysisV21: {
    schema_version: '2.1',
    clinical_caution: { emergency_disclaimer: 'Keine Diagnose. Bei Warnzeichen Arzt aufsuchen.' },
    llm_expanded_findings: [
      { id: 'w1', category: 'weather', title: 'Druckabfall', summary: 'Druckabfälle korrelieren mit Schmerztagen.', evidence_level: 'moderate',
        doctor_discussion_points: ['Wetterempfindlichkeit besprechen'] },
      { id: 'w2', category: 'weather', title: 'Druckabfall', summary: 'Druckabfälle korrelieren mit Schmerztagen.', evidence_level: 'moderate' },
      { id: 'm1', category: 'medication_effect', title: 'Triptan-Wirkung', summary: 'Wirkt in 70% innerhalb 2h.', evidence_level: 'low' },
      { id: 'dq', category: 'data_quality', title: 'Wenig Schlafdaten', summary: 'Nur 30% der Tage haben Schlafangaben.',
        doctor_discussion_points: ['Schlaf öfter dokumentieren'], recommended_tracking_next: ['Schlafdauer'] },
      { id: 'rf', category: 'red_flag', title: 'Plötzlich neue Aura', summary: 'Neuauftretende Aura beobachtet.' },
    ],
    findings: [],
  },
};

describe('generateAnalysisReportText', () => {
  it('returns empty for invalid input', () => {
    expect(generateAnalysisReportText(null)).toBe('');
    expect(generateAnalysisReportText({})).toBe('');
  });

  it('builds V2.1 report with mandatory headings', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).toMatch(/^KI-Analyse – keine Diagnose/);
    expect(txt).toContain('1. Kurzfazit');
    expect(txt).toContain('Wichtigste Hinweise');
    expect(txt).toContain('Datenqualität');
    expect(txt).toContain('Offene Fragen für Ärzt:innen');
    expect(txt).toContain('Grenzen der Analyse');
  });

  it('does not duplicate weather finding across strongest and topical sections', () => {
    const txt = generateAnalysisReportText(v21Input);
    const occurrences = (txt.match(/Druckabfall/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('puts doctor_discussion_points in open questions, never data_quality ones', () => {
    const txt = generateAnalysisReportText(v21Input);
    const oqIdx = txt.indexOf('Offene Fragen für Ärzt:innen');
    expect(oqIdx).toBeGreaterThan(0);
    const oqSection = txt.slice(oqIdx);
    expect(oqSection).toContain('Wetterempfindlichkeit besprechen');
    expect(oqSection).not.toContain('Schlaf öfter dokumentieren');
  });

  it('places red_flag finding under Grenzen der Analyse', () => {
    const txt = generateAnalysisReportText(v21Input);
    const limitsIdx = txt.indexOf('Grenzen der Analyse');
    expect(limitsIdx).toBeGreaterThan(0);
    expect(txt.slice(limitsIdx)).toContain('Plötzlich neue Aura');
  });

  it('falls back to legacy renderer for non-V2.1 input', () => {
    const txt = generateAnalysisReportText({
      summary: 'Legacy.',
      scope: { daysAnalyzed: 30 },
      possiblePatterns: [{ title: 'Schlaf', description: 'Unregelmäßig', evidenceStrength: 'medium' }],
    });
    expect(txt).toContain('Mögliche Migräne-Zusammenhänge');
    expect(txt).toContain('Schlaf');
    expect(txt).not.toContain('KI-Analyse – keine Diagnose');
  });
});
