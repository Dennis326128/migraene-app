import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeReminderLabel, msUntilNextMidnight } from '../relativeReminderLabel';

/**
 * Mock berlinDateFromUTC so tests are independent of machine timezone.
 * When `now` is explicitly passed to formatRelativeReminderLabel, the mock is bypassed.
 */
vi.mock('@/lib/tz', () => ({
  berlinDateFromUTC: vi.fn(() => new Date(2026, 2, 1, 14, 0, 0)), // default: 2026-03-01 14:00
}));

describe('formatRelativeReminderLabel', () => {
  const now = (y: number, m: number, d: number, h = 12, min = 0) =>
    new Date(y, m - 1, d, h, min, 0);

  // --- Day diff tests ---

  it('returns "Heute" for same calendar day', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 17, 0),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.label).toBe('Heute');
    expect(result.isToday).toBe(true);
    expect(result.dayDiff).toBe(0);
  });

  it('returns "Morgen" for next calendar day', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 27, 11, 10),
      now(2026, 2, 26, 23, 50),
    );
    expect(result.label).toBe('Morgen');
    expect(result.dayDiff).toBe(1);
    expect(result.subLabel).toBeNull();
  });

  it('returns "Übermorgen" for 2 days away', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 28, 9, 0),
      now(2026, 2, 26),
    );
    expect(result.label).toBe('Übermorgen');
    expect(result.dayDiff).toBe(2);
  });

  it('returns "In N Tagen" for N >= 3', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 2, 9, 11, 10),
      now(2026, 2, 26),
    );
    expect(result.label).toBe('In 11 Tagen');
    expect(result.dayDiff).toBe(11);
  });

  it('returns "Vergangen" for past events', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 24, 10, 0),
      now(2026, 2, 26),
    );
    expect(result.label).toBe('Vergangen');
    expect(result.dayDiff).toBe(-2);
  });

  // --- Today sub-label tests ---

  it('shows "Jetzt" when event is in the past today', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 10, 0),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.label).toBe('Heute');
    expect(result.subLabel).toBe('Jetzt');
  });

  it('shows "In X Min" when < 60 min away', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 14, 45),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.label).toBe('Heute');
    expect(result.subLabel).toBe('In 45 Min');
  });

  it('shows "In 1 Min" for 1 minute away', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 14, 5),
      now(2026, 2, 26, 14, 4),
    );
    expect(result.subLabel).toBe('In 1 Min');
  });

  it('shows "In X Std" for >= 60 min away', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 17, 0),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.label).toBe('Heute');
    expect(result.subLabel).toBe('In 3 Std');
  });

  it('shows "In X Std Y Min" for < 3h with remainder', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 15, 20),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.subLabel).toBe('In 1 Std 20 Min');
  });

  it('omits minutes for >= 3h', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 18, 30),
      now(2026, 2, 26, 14, 0),
    );
    expect(result.subLabel).toBe('In 4 Std');
  });

  // --- Midnight edge cases ---

  it('23:59 today → event tomorrow 00:10 = "Morgen"', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 27, 0, 10),
      now(2026, 2, 26, 23, 59),
    );
    expect(result.label).toBe('Morgen');
  });

  it('00:01 today → event today 23:50 = "Heute"', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 1, 26, 23, 50),
      now(2026, 2, 26, 0, 1),
    );
    expect(result.label).toBe('Heute');
  });

  // --- DST edge cases ---

  it('handles DST spring-forward (March 29 2026)', () => {
    // CET → CEST: clocks jump from 02:00 to 03:00
    const result = formatRelativeReminderLabel(
      new Date(2026, 2, 29, 10, 0), // March 29
      new Date(2026, 2, 29, 3, 0),  // After spring-forward
    );
    expect(result.label).toBe('Heute');
    expect(result.dayDiff).toBe(0);
  });

  it('handles DST fall-back (Oct 25 2026)', () => {
    const result = formatRelativeReminderLabel(
      new Date(2026, 9, 26, 10, 0),
      new Date(2026, 9, 25, 2, 30),
    );
    expect(result.label).toBe('Morgen');
  });
});

describe('msUntilNextMidnight', () => {
  it('returns correct ms from 23:59 to midnight', () => {
    const now = new Date(2026, 1, 26, 23, 59, 0);
    const ms = msUntilNextMidnight(now);
    expect(ms).toBe(60_000); // 1 minute
  });

  it('returns ~24h from 00:00:01', () => {
    const now = new Date(2026, 1, 26, 0, 0, 1);
    const ms = msUntilNextMidnight(now);
    // Should be close to 24h minus 1 second
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('never returns 0 or negative', () => {
    const now = new Date(2026, 1, 27, 0, 0, 0);
    const ms = msUntilNextMidnight(now);
    expect(ms).toBeGreaterThanOrEqual(1000);
  });
});
