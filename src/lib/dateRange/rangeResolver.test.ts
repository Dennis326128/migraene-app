import { describe, it, expect } from 'vitest';
import {
  getAvailablePresets,
  getDefaultPreset,
  validatePreset,
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

  it('shows only all + custom for 10 days', () => {
    const presets = getAvailablePresets(10);
    expect(presets.length).toBe(2);
    expect(presets[0].key).toBe('all');
    expect(presets[1].key).toBe('custom');
  });

  it('shows 1M for 35 days', () => {
    const keys = getAvailablePresets(35).map(p => p.key);
    expect(keys).toEqual(['all', '1m', 'custom']);
  });

  it('shows 1M and 3M for 100 days', () => {
    const keys = getAvailablePresets(100).map(p => p.key);
    expect(keys).toEqual(['all', '1m', '3m', 'custom']);
  });

  it('shows up to 6M for 200 days', () => {
    const keys = getAvailablePresets(200).map(p => p.key);
    expect(keys).toEqual(['all', '1m', '3m', '6m', 'custom']);
  });

  it('shows all presets for 400 days', () => {
    const keys = getAvailablePresets(400).map(p => p.key);
    expect(keys).toEqual(['all', '1m', '3m', '6m', '12m', 'custom']);
  });

  it('shows 6m at exactly 180, not 12m', () => {
    const keys = getAvailablePresets(180).map(p => p.key);
    expect(keys).toContain('6m');
    expect(keys).not.toContain('12m');
  });

  it('shows 12m at exactly 365', () => {
    const keys = getAvailablePresets(365).map(p => p.key);
    expect(keys).toContain('12m');
  });
});

describe('validatePreset', () => {
  it('keeps all and custom unchanged', () => {
    expect(validatePreset('all', 5)).toBe('all');
    expect(validatePreset('custom', 5)).toBe('custom');
  });

  it('falls back to default when preset not available', () => {
    // 50 days → default is 1m
    expect(validatePreset('3m', 50)).toBe('1m');
    // 100 days → default is 3m
    expect(validatePreset('12m', 100)).toBe('3m');
    // 10 days → default is all
    expect(validatePreset('1m', 10)).toBe('all');
  });

  it('keeps preset when available', () => {
    expect(validatePreset('1m', 30)).toBe('1m');
    expect(validatePreset('3m', 90)).toBe('3m');
  });
});
