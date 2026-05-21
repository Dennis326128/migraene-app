import { describe, it, expect } from 'vitest';
import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  getEvidenceBadgeVariant,
  extractOpenQuestions,
} from '../normalizeAnalysisFindings';

describe('normalizeAnalysisFindings', () => {
  it('returns [] for empty input', () => {
    expect(normalizeAnalysisFindings(null)).toEqual([]);
    expect(normalizeAnalysisFindings({})).toEqual([]);
  });

  it('prefers llm_expanded_findings over deterministic', () => {
    const findings = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'l1', category: 'weather', title: 'Druckabfall', summary: 'Hinweis', evidence_level: 'moderate', source_basis: 'aggregated_daily_data' },
        ],
        findings: [
          { id: 'd1', category: 'weather', title: 'Druckabfall', plain_language_summary: 'Det' },
        ],
      },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].source).toBe('llm_expanded');
    expect(findings[0].section).toBe('weather');
  });

  it('falls back to legacy when no analysisV21', () => {
    const findings = normalizeAnalysisFindings({
      possiblePatterns: [{ title: 'X', description: 'Y', evidenceStrength: 'medium' }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].source).toBe('legacy');
  });

  it('doctorShare filter drops red_flag llm findings', () => {
    const f = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'r1', category: 'red_flag', title: 'Warnzeichen', summary: 's' },
          { id: 'w1', category: 'weather', title: 'Druck', summary: 'd' },
        ],
      },
    }, { doctorShare: true });
    expect(f.map(x => x.category)).toEqual(['weather']);
  });

  it('groupFindingsBySection promotes high/moderate to strongest mirror', () => {
    const f = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'a', category: 'weather', title: 'A', summary: 's', evidence_level: 'high' },
          { id: 'b', category: 'sleep', title: 'B', summary: 's', evidence_level: 'low' },
        ],
      },
    });
    const g = groupFindingsBySection(f);
    expect(g.strongest.some(x => x.id === 'a' || x.title === 'A')).toBe(true);
    expect(g.weaker.some(x => x.title === 'B')).toBe(true);
  });

  it('getEvidenceBadgeVariant returns gap for insufficient', () => {
    expect(getEvidenceBadgeVariant('insufficient').tone).toBe('gap');
    expect(getEvidenceBadgeVariant('high').tone).toBe('strong');
  });

  it('high/moderate findings go to strongest only (no topical duplicate)', () => {
    const f = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'a', category: 'weather', title: 'Druck', summary: 's', evidence_level: 'high' },
        ],
      },
    });
    const g = groupFindingsBySection(f);
    expect(g.strongest.map(x => x.id)).toEqual(['a']);
    expect(g.weather).toEqual([]);
  });

  it('data_quality category never lands in open_questions', () => {
    const f = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'dq', category: 'data_quality', title: 'Wenig Schlafdaten', summary: 's',
            doctor_discussion_points: ['Schlaf öfter dokumentieren'] },
          { id: 'w', category: 'weather', title: 'Druck', summary: 's', evidence_level: 'moderate',
            doctor_discussion_points: ['Wetterempfindlichkeit besprechen'] },
        ],
      },
    });
    const oq = extractOpenQuestions(f);
    expect(oq).toContain('Wetterempfindlichkeit besprechen');
    expect(oq).not.toContain('Schlaf öfter dokumentieren');
  });

  it('deduplicates LLM + deterministic finding with same category+title', () => {
    const f = normalizeAnalysisFindings({
      analysisV21: {
        llm_expanded_findings: [
          { id: 'l1', category: 'weather', title: 'Druckabfall', summary: 'A', evidence_level: 'moderate' },
        ],
        findings: [
          { id: 'd1', category: 'weather', title: 'Druckabfall', plain_language_summary: 'B' },
        ],
      },
    });
    expect(f).toHaveLength(1);
    expect(f[0].source).toBe('llm_expanded');
  });
});
