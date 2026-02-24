import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAvailablePresets, getDefaultPreset, validatePreset, getDocumentationSpanDays } from './rangeResolver';

describe('getDefaultPreset', () => {
  it('returns 3m when documentationSpanDays >= 90', () => {
    expect(getDefaultPreset(100)).toBe('3m');
    expect(getDefaultPreset(90)).toBe('3m');
    expect(getDefaultPreset(365)).toBe('3m');
  });

  it('returns 1m when documentationSpanDays >= 30 but < 90', () => {
    expect(getDefaultPreset(35)).toBe('1m');
    expect(getDefaultPreset(30)).toBe('1m');
    expect(getDefaultPreset(89)).toBe('1m');
  });

  it('returns all when documentationSpanDays < 30', () => {
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

  it('shows 1M and 3M for 100 documented days', () => {
    const presets = getAvailablePresets(100);
    const keys = presets.map(p => p.key);
    expect(keys).toContain('1m');
    expect(keys).toContain('3m');
    expect(keys).not.toContain('6m');
    expect(keys).not.toContain('12m');
  });

  it('shows only Seit Beginn + Benutzerdefiniert for 10 days', () => {
    const presets = getAvailablePresets(10);
    expect(presets.length).toBe(2);
    expect(presets[0].key).toBe('all');
    expect(presets[1].key).toBe('custom');
  });

  it('shows all presets for 365+ days', () => {
    const presets = getAvailablePresets(400);
    const keys = presets.map(p => p.key);
    expect(keys).toEqual(['all', '1m', '3m', '6m', '12m', 'custom']);
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
