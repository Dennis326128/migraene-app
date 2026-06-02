import { describe, it, expect } from 'vitest';
import {
  gateDecision,
  isCacheStaleByAge,
  berlinDayStart,
  berlinDayEnd,
  FREE_PATTERN_ANALYSIS_LIMIT,
} from '../analysisGate';

const baseInput = {
  hasConsent: true,
  aiEnabled: true,
  isUnlimited: false,
  usageCount: 0,
  limit: FREE_PATTERN_ANALYSIS_LIMIT,
  cooldownRemaining: 0,
  hasCache: false,
  isStale: false,
};

describe('gateDecision', () => {
  it('blocks when consent missing', () => {
    expect(gateDecision({ ...baseInput, hasConsent: false }).action).toBe('block_consent');
  });
  it('blocks when AI disabled', () => {
    expect(gateDecision({ ...baseInput, aiEnabled: false }).action).toBe('block_ai_disabled');
  });
  it('allows new at 0/3', () => {
    expect(gateDecision(baseInput).action).toBe('allow_new');
  });
  it('blocks quota at limit (free)', () => {
    expect(gateDecision({ ...baseInput, usageCount: FREE_PATTERN_ANALYSIS_LIMIT }).action).toBe('block_quota');
  });
  it('unlimited bypasses quota', () => {
    expect(gateDecision({ ...baseInput, usageCount: 99, isUnlimited: true }).action).toBe('allow_new');
  });
  it('blocks cooldown when active (free)', () => {
    expect(gateDecision({ ...baseInput, cooldownRemaining: 120 }).action).toBe('block_cooldown');
  });
  it('unlimited bypasses cooldown', () => {
    expect(gateDecision({ ...baseInput, cooldownRemaining: 120, isUnlimited: true }).action).toBe('allow_new');
  });
  it('fresh cache → no_action_needed', () => {
    expect(gateDecision({ ...baseInput, hasCache: true, isStale: false }).action).toBe('no_action_needed');
  });
  it('stale cache + slot free → allow_refresh', () => {
    expect(gateDecision({ ...baseInput, hasCache: true, isStale: true }).action).toBe('allow_refresh');
  });
  it('stale cache + quota exceeded → block_quota (cache still shown by UI)', () => {
    const d = gateDecision({ ...baseInput, hasCache: true, isStale: true, usageCount: FREE_PATTERN_ANALYSIS_LIMIT });
    expect(d.action).toBe('block_quota');
  });
});

describe('isCacheStaleByAge', () => {
  it('fresh: 1 day old → not stale', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(isCacheStaleByAge(oneDayAgo)).toBe(false);
  });
  it('15 days old → stale', () => {
    const fifteen = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
    expect(isCacheStaleByAge(fifteen)).toBe(true);
  });
  it('null → stale', () => {
    expect(isCacheStaleByAge(null)).toBe(true);
  });
});

describe('berlinDayStart / berlinDayEnd', () => {
  it('berlinDayStart returns a valid date', () => {
    const d = berlinDayStart('2026-06-15');
    expect(Number.isFinite(d.getTime())).toBe(true);
  });
  it('berlinDayEnd is after berlinDayStart for same date', () => {
    const s = berlinDayStart('2026-06-15');
    const e = berlinDayEnd('2026-06-15');
    expect(e.getTime()).toBeGreaterThan(s.getTime());
    // ~24h minus 1ms
    expect(e.getTime() - s.getTime()).toBeGreaterThan(23 * 3600 * 1000);
    expect(e.getTime() - s.getTime()).toBeLessThan(25 * 3600 * 1000);
  });
  it('CEST (June) — Berlin midnight = UTC 22:00 prior day', () => {
    const d = berlinDayStart('2026-06-15');
    expect(d.toISOString()).toBe('2026-06-14T22:00:00.000Z');
  });
  it('CET (January) — Berlin midnight = UTC 23:00 prior day', () => {
    const d = berlinDayStart('2026-01-15');
    expect(d.toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });
});
