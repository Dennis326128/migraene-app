import { describe, it, expect } from 'vitest';
import { generateAnalysisReportText } from '../generateAnalysisReportText';

const v21Input = {
  summary: 'Kurze Einordnung.',
  analysisV21: {
    schema_version: '2.1',
    data_basis: { documented_days: 90, pain_days: 60, mecfs_energy_days: 40 },
    clinical_caution: { emergency_disclaimer: 'Keine Diagnose. Bei Warnzeichen Arzt aufsuchen.' },
    llm_expanded_findings: [
      { id: 'b1', category: 'burden', title: 'Sehr hoher Anteil an Schmerztagen', summary: 'Hohe Belastung.', evidence_level: 'high' },
      { id: 'c1', category: 'chronification', title: 'Potenzielles Chronifizierungsrisiko', summary: 'Liegt in einem Bereich, der ärztlich geprüft werden sollte.', evidence_level: 'high' },
      { id: 'm1', category: 'medication_use', title: 'Triptan-Zurückhaltung', summary: 'Triptan-Einnahme zurückhaltend.', evidence_level: 'moderate' },
      { id: 'm2', category: 'medication_use', title: 'Häufige Akutmedikation', summary: 'Mehrfache Akutmedikation.', evidence_level: 'moderate' },
      { id: 'm3', category: 'medication_effect', title: 'Wirkung unklar', summary: 'Wirkung dokumentieren.', evidence_level: 'low' },
      { id: 'm4', category: 'medication_use', title: 'Diazepam Einzelfall', summary: 'Einmalig.', evidence_level: 'low' },
      { id: 'w1', category: 'weather', title: 'Druckabfall', summary: 'Druckabfälle korrelieren mit Schmerztagen.', evidence_level: 'moderate',
        doctor_discussion_points: ['Wetterempfindlichkeit besprechen'] },
      { id: 'i1', category: 'interaction', title: 'Gewitter und Schmerzlinderung', summary: 'Einzelfall.', evidence_level: 'low' },
      { id: 'me1', category: 'mecfs_energy_pem', title: 'ME/CFS Signal A', summary: 'Erst.', evidence_level: 'moderate' },
      { id: 'me2', category: 'mecfs_energy_pem', title: 'ME/CFS Signal A', summary: 'Doppelt.', evidence_level: 'moderate' },
      { id: 'dq1', category: 'data_quality', title: 'Wetterdaten unvollständig', summary: 'Nur 45/90 Tage.', evidence_level: 'moderate' },
      { id: 'rf', category: 'red_flag', title: 'Plötzlich neue Aura', summary: 'Neuauftretende Aura beobachtet.' },
    ],
    findings: [],
  },
};

describe('generateAnalysisReportText', () => {
  it('returns empty for invalid input', () => {
    expect(generateAnalysisReportText(null)).toBe('');
    expect(generateAnalysisReportText(undefined)).toBe('');
  });

  it('builds V2.2 report with mandatory headings', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).toMatch(/^KI-Analyse – keine Diagnose/);
    expect(txt).toContain('1. Kurzfazit');
    expect(txt).toContain('Wichtigste Hinweise');
    expect(txt).toContain('Grenzen der Analyse');
  });

  it('caps Wichtigste Hinweise to max 3 entries', () => {
    const txt = generateAnalysisReportText(v21Input);
    const start = txt.indexOf('Wichtigste Hinweise');
    const rest = txt.slice(start);
    const nextHeading = rest.search(/\n\d+\. /);
    const section = nextHeading > 0 ? rest.slice(0, nextHeading) : rest;
    const bullets = (section.match(/\n• /g) ?? []).length;
    expect(bullets).toBeLessThanOrEqual(3);
  });

  it('does not duplicate ME/CFS findings', () => {
    const txt = generateAnalysisReportText(v21Input);
    const occ = (txt.match(/ME\/CFS Signal A/g) ?? []).length;
    expect(occ).toBeLessThanOrEqual(1);
  });

  it('does not include weak-evidence interaction (Gewitter Einzelfall) in the report', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).not.toContain('Gewitter und Schmerzlinderung');
  });

  it('uses the calm standard text under Grenzen der Analyse — never "Keine Auffälligkeiten"', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).not.toContain('Keine Auffälligkeiten oder Datenlücken dokumentiert.');
    expect(txt).toContain('Diese Analyse ersetzt keine ärztliche Beurteilung');
  });

  it('does not render red_flag findings (filtered by curation)', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).not.toContain('Plötzlich neue Aura');
  });

  it('does not include long technical category names', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).not.toContain('mecfs_energy_pem');
    expect(txt).not.toContain('medication_use');
    expect(txt).not.toContain('llm_expanded_findings');
  });

  it('emits no per-finding "Für Arztgespräch:" lines (only consolidated Offene Fragen)', () => {
    const txt = generateAnalysisReportText(v21Input);
    expect(txt).not.toContain('Für Arztgespräch:');
  });

  it('does not emit empty "Keine Auffälligkeiten" placeholders for missing sections', () => {
    const txt = generateAnalysisReportText({
      summary: 'Nur Burden.',
      analysisV21: {
        schema_version: '2.1',
        llm_expanded_findings: [
          { id: 'b1', category: 'burden', title: 'Belastung hoch', summary: 'Viele Schmerztage.', evidence_level: 'high' },
        ],
        findings: [],
      },
    });
    expect(txt).not.toContain('Keine Auffälligkeiten oder Datenlücken dokumentiert.');
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
