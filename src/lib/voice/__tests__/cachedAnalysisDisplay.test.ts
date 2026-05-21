import { describe, it, expect } from 'vitest';
import { decideCachedAnalysisDisplay } from '../cachedAnalysisDisplay';

describe('decideCachedAnalysisDisplay', () => {
  it('returns empty when no result is cached', () => {
    expect(
      decideCachedAnalysisDisplay({ hasResult: false, staleReason: null, showFallbackAnalysis: false }),
    ).toBe('empty');
  });

  it('renders fresh report directly', () => {
    expect(
      decideCachedAnalysisDisplay({ hasResult: true, staleReason: null, showFallbackAnalysis: false }),
    ).toBe('render_full');
  });

  it('version_mismatch still renders directly (range matches)', () => {
    expect(
      decideCachedAnalysisDisplay({
        hasResult: true,
        staleReason: 'version_mismatch',
        showFallbackAnalysis: false,
      }),
    ).toBe('render_full');
  });

  it('data_changed still renders directly (range matches)', () => {
    expect(
      decideCachedAnalysisDisplay({
        hasResult: true,
        staleReason: 'data_changed',
        showFallbackAnalysis: false,
      }),
    ).toBe('render_full');
  });

  it('range_mismatch without opt-in shows preview only (no full analysis)', () => {
    expect(
      decideCachedAnalysisDisplay({
        hasResult: true,
        staleReason: 'range_mismatch',
        showFallbackAnalysis: false,
      }),
    ).toBe('range_mismatch_preview');
  });

  it('range_mismatch with opt-in renders full analysis (with badge)', () => {
    expect(
      decideCachedAnalysisDisplay({
        hasResult: true,
        staleReason: 'range_mismatch',
        showFallbackAnalysis: true,
      }),
    ).toBe('range_mismatch_full');
  });
});
