import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDateLabel, formatRelativeDateTimeLabel } from '../dateUtils';

/**
 * We mock berlinDateFromUTC to control "now" deterministically.
 * This ensures tests are independent of the machine's timezone.
 */
vi.mock('@/lib/tz', () => ({
  berlinDateFromUTC: vi.fn(),
}));

import { berlinDateFromUTC } from '@/lib/tz';
const mockedBerlinDate = vi.mocked(berlinDateFromUTC);

function setBerlinNow(year: number, month: number, day: number, hour = 12, min = 0) {
  // month is 1-indexed here for readability
  mockedBerlinDate.mockReturnValue(new Date(year, month - 1, day, hour, min, 0));
}

describe('formatRelativeDateLabel', () => {
  beforeEach(() => {
    setBerlinNow(2026, 2, 26, 14, 30); // 2026-02-26 14:30 Berlin
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1) Today → "Heute"
  it('returns "Heute" for today\'s date', () => {
    expect(formatRelativeDateLabel('2026-02-26')).toBe('Heute');
  });

  // 2) Yesterday → "Gestern"
  it('returns "Gestern" for yesterday', () => {
    expect(formatRelativeDateLabel('2026-02-25')).toBe('Gestern');
  });

  // 3) Day before yesterday → formatted date, NOT "Gestern"
  it('returns formatted date for 2 days ago', () => {
    const result = formatRelativeDateLabel('2026-02-24');
    expect(result).not.toBe('Gestern');
    expect(result).not.toBe('Heute');
    expect(result).toContain('24.02.');
  });

  // 4) Tomorrow → "Morgen"
  it('returns "Morgen" for tomorrow', () => {
    expect(formatRelativeDateLabel('2026-02-27')).toBe('Morgen');
  });

  // 5) Berlin midnight edge: 00:01 Berlin on Feb 26 — still "today" is Feb 26
  it('handles Berlin just after midnight correctly', () => {
    setBerlinNow(2026, 2, 26, 0, 1); // 00:01 Berlin
    expect(formatRelativeDateLabel('2026-02-26')).toBe('Heute');
    expect(formatRelativeDateLabel('2026-02-25')).toBe('Gestern');
  });

  // 6) Berlin 23:59 on Feb 26 — still Feb 26
  it('handles Berlin just before midnight correctly', () => {
    setBerlinNow(2026, 2, 26, 23, 59);
    expect(formatRelativeDateLabel('2026-02-26')).toBe('Heute');
    expect(formatRelativeDateLabel('2026-02-25')).toBe('Gestern');
  });

  // 7) DST transition: March 29, 2026 (CET→CEST, clocks spring forward)
  it('handles DST spring-forward correctly', () => {
    setBerlinNow(2026, 3, 29, 3, 0); // After spring-forward
    expect(formatRelativeDateLabel('2026-03-29')).toBe('Heute');
    expect(formatRelativeDateLabel('2026-03-28')).toBe('Gestern');
  });

  // 8) DST transition: Oct 25, 2026 (CEST→CET, clocks fall back)
  it('handles DST fall-back correctly', () => {
    setBerlinNow(2026, 10, 25, 2, 30); // During fall-back window
    expect(formatRelativeDateLabel('2026-10-25')).toBe('Heute');
    expect(formatRelativeDateLabel('2026-10-24')).toBe('Gestern');
  });

  // 9) Invalid input → "—"
  it('returns "—" for invalid date string', () => {
    expect(formatRelativeDateLabel('not-a-date')).toBe('—');
  });

  // 10) Empty/null input → "—"
  it('returns "—" for empty string', () => {
    expect(formatRelativeDateLabel('')).toBe('—');
  });

  // 11) Different year → includes year in output
  it('includes year when date is in a different year', () => {
    const result = formatRelativeDateLabel('2025-06-15');
    expect(result).toContain('2025');
  });

  // 12) Same year, far away → no year shown
  it('does not include year for same year', () => {
    const result = formatRelativeDateLabel('2026-01-10');
    expect(result).not.toContain('2026');
  });
});

describe('formatRelativeDateTimeLabel', () => {
  beforeEach(() => {
    setBerlinNow(2026, 2, 26, 14, 30);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "Heute, 07:26" for today with time', () => {
    expect(formatRelativeDateTimeLabel('2026-02-26', '07:26')).toBe('Heute, 07:26');
  });

  it('returns "Gestern, 14:30" for yesterday with time', () => {
    expect(formatRelativeDateTimeLabel('2026-02-25', '14:30:00')).toBe('Gestern, 14:30');
  });

  it('returns date-only when time is null', () => {
    expect(formatRelativeDateTimeLabel('2026-02-26', null)).toBe('Heute');
  });

  it('returns "—" when date is null', () => {
    expect(formatRelativeDateTimeLabel(null, '07:26')).toBe('—');
  });
});
