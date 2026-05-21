import { describe, it, expect } from 'vitest';
import { ANALYSIS_PROGRESS_STAGES } from '../AnalysisProgressLoader';

describe('AnalysisProgressLoader stages', () => {
  it('has 5 ordered German stages', () => {
    expect(ANALYSIS_PROGRESS_STAGES).toHaveLength(5);
    expect(ANALYSIS_PROGRESS_STAGES[0]).toContain('vorbereitet');
    expect(ANALYSIS_PROGRESS_STAGES[ANALYSIS_PROGRESS_STAGES.length - 1]).toContain('gespeichert');
  });

  it('never exposes a percentage value (no "%" in any stage label)', () => {
    for (const s of ANALYSIS_PROGRESS_STAGES) {
      expect(s).not.toMatch(/%/);
    }
  });
});
