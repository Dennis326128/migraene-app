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

  it('handles leap year Feb 29', () => {
    expect(addBerlinDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addBerlinDays('2024-02-29', 1)).toBe('2024-03-01');
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

  // ─── DST regression tests ───────────────────────────────────────────────

  it('returns exactly 1 across DST spring-forward boundary (March 2026)', () => {
    // Germany DST starts last Sunday of March → 2026-03-29
    expect(diffBerlinDays('2026-03-28', '2026-03-29')).toBe(1);
    expect(diffBerlinDays('2026-03-29', '2026-03-30')).toBe(1);
  });

  it('returns exactly 1 across DST fall-back boundary (October 2026)', () => {
    // Germany DST ends last Sunday of October → 2026-10-25
    expect(diffBerlinDays('2026-10-24', '2026-10-25')).toBe(1);
    expect(diffBerlinDays('2026-10-25', '2026-10-26')).toBe(1);
  });

  it('handles large spans across multiple DST transitions', () => {
    expect(diffBerlinDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(diffBerlinDays('2024-01-01', '2024-12-31')).toBe(365); // leap year
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

describe('dateKey validation', () => {
  it('throws on invalid day for month', () => {
    expect(() => addBerlinDays('2026-02-30', 0)).toThrow();
  });

  it('throws on invalid month', () => {
    expect(() => addBerlinDays('2026-13-01', 0)).toThrow();
  });

  it('throws on non-date string', () => {
    expect(() => addBerlinDays('not-a-date', 0)).toThrow();
  });

  it('throws on Feb 29 in non-leap year', () => {
    expect(() => diffBerlinDays('2026-02-29', '2026-03-01')).toThrow();
  });

  it('accepts Feb 29 in leap year', () => {
    expect(diffBerlinDays('2024-02-29', '2024-03-01')).toBe(1);
  });
});
