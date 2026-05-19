import { describe, it, expect } from 'vitest';
import { getDoctorShareSafeAnalysis } from '../doctorShareSafe';

describe('getDoctorShareSafeAnalysis', () => {
  it('returns null when no analysisV21', () => {
    expect(getDoctorShareSafeAnalysis({ possiblePatterns: [] })).toBeNull();
    expect(getDoctorShareSafeAnalysis(null)).toBeNull();
  });

  it('strips private/debug keys', () => {
    const safe = getDoctorShareSafeAnalysis({
      analysisV21: {
        _preAnalysis: { secret: 1 },
        _legacy: { x: 1 },
        _debug: 'noo',
        transcripts: ['private'],
        audio_url: 'https://...',
        data_basis: { documented_days: 10 },
        clinical_caution: { no_diagnosis: true },
        section_map: {},
        findings: [
          { id: 'a', category: 'weather', title: 'A', plain_language_summary: 's', should_show_in_doctor_share: true },
          { id: 'b', category: 'weather', title: 'B', plain_language_summary: 's', should_show_in_doctor_share: false },
        ],
        llm_expanded_findings: [
          { id: 'l1', category: 'red_flag', title: 'R', summary: 'r' },
          { id: 'l2', category: 'weather', title: 'W', summary: 'w' },
        ],
      },
    });
    expect(safe).not.toBeNull();
    const v21 = safe!.analysisV21 as any;
    expect(v21._preAnalysis).toBeUndefined();
    expect(v21._legacy).toBeUndefined();
    expect(v21._debug).toBeUndefined();
    expect(v21.transcripts).toBeUndefined();
    expect(v21.audio_url).toBeUndefined();
    expect(v21.findings.map((f: any) => f.id)).toEqual(['a']);
    expect(v21.llm_expanded_findings.map((f: any) => f.id)).toEqual(['l2']);
  });
});
