/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DateKey Helpers — Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  berlinDateKeyFromUtc,
  berlinTimeLabelFromUtc,
  addBerlinDays,
  diffBerlinDays,
  isInRange,
} from '../dateKeyHelpers';

describe('berlinDateKeyFromUtc', () => {
  it('converts UTC noon to Berlin date', () => {
    expect(berlinDateKeyFromUtc('2026-02-26T12:00:00Z')).toBe('2026-02-26');
  });

  it('converts UTC 23:30 in CET to next Berlin day', () => {
    // UTC 23:30 = Berlin 00:30 next day (CET = UTC+1)
    expect(berlinDateKeyFromUtc('2026-02-26T23:30:00Z')).toBe('2026-02-27');
  });

  it('handles Date objects', () => {
    const d = new Date('2026-02-26T10:00:00Z');
    expect(berlinDateKeyFromUtc(d)).toBe('2026-02-26');
  });

  it('throws on invalid date', () => {
    expect(() => berlinDateKeyFromUtc('invalid')).toThrow();
  });
});

describe('berlinTimeLabelFromUtc', () => {
  it('converts UTC time to Berlin HH:mm', () => {
    // UTC 10:00 = Berlin 11:00 (CET)
    const result = berlinTimeLabelFromUtc('2026-02-26T10:00:00Z');
    expect(result).toBe('11:00');
  });

  it('returns empty on invalid date', () => {
    expect(berlinTimeLabelFromUtc('invalid')).toBe('');
  });
});

describe('addBerlinDays', () => {
  it('adds days correctly', () => {
    expect(addBerlinDays('2026-02-26', 1)).toBe('2026-02-27');
    expect(addBerlinDays('2026-02-26', 7)).toBe('2026-03-05');
    expect(addBerlinDays('2026-02-26', -1)).toBe('2026-02-25');
  });

  it('handles month boundaries', () => {
    expect(addBerlinDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addBerlinDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles year boundaries', () => {
    expect(addBerlinDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('diffBerlinDays', () => {
  it('returns positive for later date', () => {
    expect(diffBerlinDays('2026-02-26', '2026-02-28')).toBe(2);
  });

  it('returns negative for earlier date', () => {
    expect(diffBerlinDays('2026-02-28', '2026-02-26')).toBe(-2);
  });

  it('returns 0 for same date', () => {
    expect(diffBerlinDays('2026-02-26', '2026-02-26')).toBe(0);
  });
});

describe('isInRange', () => {
  it('returns true for dates within range', () => {
    expect(isInRange('2026-02-15', '2026-02-01', '2026-02-28')).toBe(true);
  });

  it('returns true for boundary dates', () => {
    expect(isInRange('2026-02-01', '2026-02-01', '2026-02-28')).toBe(true);
    expect(isInRange('2026-02-28', '2026-02-01', '2026-02-28')).toBe(true);
  });

  it('returns false for out-of-range dates', () => {
    expect(isInRange('2026-03-01', '2026-02-01', '2026-02-28')).toBe(false);
  });
});
