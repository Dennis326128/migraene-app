import { describe, it, expect } from 'vitest';
import { evaluateReAnalyzeGate, REANALYZE_COOLDOWN_MINUTES } from '../analysisRateGate';

const V = '2.1.0';

describe('evaluateReAnalyzeGate', () => {
  it('allows when no existing report', () => {
    const r = evaluateReAnalyzeGate({ currentAnalysisVersion: V });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('no_existing_report');
  });

  it('blocks while inside cooldown', () => {
    const now = new Date('2026-05-19T12:00:00Z');
    const last = new Date(now.getTime() - 5 * 60_000).toISOString();
    const r = evaluateReAnalyzeGate({ lastCreatedAt: last, currentAnalysisVersion: V, now });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('cooldown_active');
    expect(r.waitMinutes).toBeGreaterThan(0);
  });

  it('allows after cooldown passed', () => {
    const now = new Date('2026-05-19T12:00:00Z');
    const last = new Date(now.getTime() - (REANALYZE_COOLDOWN_MINUTES + 1) * 60_000).toISOString();
    const r = evaluateReAnalyzeGate({ lastCreatedAt: last, currentAnalysisVersion: V, now });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('cooldown_passed');
  });

  it('version change overrides cooldown', () => {
    const r = evaluateReAnalyzeGate({
      lastCreatedAt: new Date().toISOString(),
      lastAnalysisVersion: '2.0.0',
      currentAnalysisVersion: V,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('version_changed');
  });

  it('data signature change overrides cooldown', () => {
    const r = evaluateReAnalyzeGate({
      lastCreatedAt: new Date().toISOString(),
      lastDataSignature: 'a',
      currentDataSignature: 'b',
      currentAnalysisVersion: V,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('data_changed');
  });

  it('manualOverride bypasses cooldown', () => {
    const r = evaluateReAnalyzeGate({
      lastCreatedAt: new Date().toISOString(),
      currentAnalysisVersion: V,
      manualOverride: true,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('manual_override_allowed');
  });
});
