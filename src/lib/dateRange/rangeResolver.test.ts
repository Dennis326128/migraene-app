import { describe, it, expect } from 'vitest';
import {
  getAvailablePresets,
  getDefaultPreset,
  validatePreset,
  computeConsecutiveDocumentedDays,
} from './rangeResolver';

describe('getDefaultPreset', () => {
  it('returns 3m when consecutiveDocumentedDays >= 90', () => {
    expect(getDefaultPreset(100)).toBe('3m');
    expect(getDefaultPreset(90)).toBe('3m');
    expect(getDefaultPreset(365)).toBe('3m');
  });

  it('returns 1m when consecutiveDocumentedDays >= 30 but < 90', () => {
    expect(getDefaultPreset(35)).toBe('1m');
    expect(getDefaultPreset(30)).toBe('1m');
    expect(getDefaultPreset(89)).toBe('1m');
  });

  it('returns all when consecutiveDocumentedDays < 30', () => {
    expect(getDefaultPreset(10)).toBe('all');
    expect(getDefaultPreset(0)).toBe('all');
    expect(getDefaultPreset(29)).toBe('all');
  });
});

describe('getAvailablePresets', () => {
  it('always includes Seit Beginn and Benutzerdefiniert', () => {
    const presets = getAvailablePresets(0);
    expect(presets[0].key).toBe('all');
    expect(presets[presets.length - 1].key).toBe('custom');
  });

  it('shows 1M and 3M for 100 consecutive days', () => {
    const presets = getAvailablePresets(100);
    const keys = presets.map(p => p.key);
    expect(keys).toContain('1m');
    expect(keys).toContain('3m');
    expect(keys).not.toContain('6m');
    expect(keys).not.toContain('12m');
  });

  it('does NOT show 12m for 200 consecutive days', () => {
    const presets = getAvailablePresets(200);
    const keys = presets.map(p => p.key);
    expect(keys).toContain('6m');
    expect(keys).not.toContain('12m');
  });

  it('shows only Seit Beginn + Benutzerdefiniert for 10 days', () => {
    const presets = getAvailablePresets(10);
    expect(presets.length).toBe(2);
    expect(presets[0].key).toBe('all');
    expect(presets[1].key).toBe('custom');
  });

  it('shows all presets for 365+ consecutive days', () => {
    const presets = getAvailablePresets(400);
    const keys = presets.map(p => p.key);
    expect(keys).toEqual(['all', '1m', '3m', '6m', '12m', 'custom']);
  });

  it('shows 6m at exactly 180, not 12m', () => {
    const presets = getAvailablePresets(180);
    const keys = presets.map(p => p.key);
    expect(keys).toContain('6m');
    expect(keys).not.toContain('12m');
  });

  it('shows 12m at exactly 365', () => {
    const presets = getAvailablePresets(365);
    const keys = presets.map(p => p.key);
    expect(keys).toContain('12m');
  });
});

describe('validatePreset', () => {
  it('keeps all and custom unchanged', () => {
    expect(validatePreset('all', 5)).toBe('all');
    expect(validatePreset('custom', 5)).toBe('custom');
  });

  it('falls back to all when preset not available', () => {
    expect(validatePreset('3m', 50)).toBe('all');
    expect(validatePreset('12m', 100)).toBe('all');
  });

  it('keeps preset when available', () => {
    expect(validatePreset('1m', 30)).toBe('1m');
    expect(validatePreset('3m', 90)).toBe('3m');
  });
});

describe('computeConsecutiveDocumentedDays', () => {
  it('returns 0 for empty set', () => {
    expect(computeConsecutiveDocumentedDays(new Set(), null)).toBe(0);
  });

  it('counts gap-free days backwards from lastDocDate', () => {
    const dates = new Set([
      '2026-02-20',
      '2026-02-21',
      '2026-02-22',
      '2026-02-23',
      '2026-02-24',
    ]);
    expect(computeConsecutiveDocumentedDays(dates, '2026-02-24')).toBe(5);
  });

  it('stops at first gap', () => {
    const dates = new Set([
      '2026-02-20',
      // gap: 2026-02-21 missing
      '2026-02-22',
      '2026-02-23',
      '2026-02-24',
    ]);
    expect(computeConsecutiveDocumentedDays(dates, '2026-02-24')).toBe(3);
  });

  it('returns 1 for single documented day', () => {
    const dates = new Set(['2026-02-24']);
    expect(computeConsecutiveDocumentedDays(dates, '2026-02-24')).toBe(1);
  });

  it('handles large gap-free streak', () => {
    const dates = new Set<string>();
    const start = new Date('2025-01-01T00:00:00');
    for (let i = 0; i < 400; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.add(d.toISOString().split('T')[0]);
    }
    const sorted = Array.from(dates).sort();
    const last = sorted[sorted.length - 1];
    expect(computeConsecutiveDocumentedDays(dates, last)).toBe(400);
  });
});
