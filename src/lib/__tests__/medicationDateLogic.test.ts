/**
 * Regression tests for medication date logic.
 * 
 * Root cause of the regression: todayStr() used UTC via .toISOString().split('T')[0],
 * which returns the wrong calendar day between midnight and 2am Berlin time.
 * Fix: todayStr() now uses berlinDateToday() as SSOT.
 *
 * Why CalendarDays instead of 24h-Diff:
 * Medical day counting must match the user's real calendar. A 23h difference
 * spanning midnight is 2 calendar days, not 0.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { todayStr, yesterdayStr } from '../dateRange/rangeResolver';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';

// Mock berlinDateToday to control "now"
vi.mock('@/lib/tz', () => ({
  berlinDateFromUTC: vi.fn(),
  berlinDateToday: vi.fn(),
  berlinDateYesterday: vi.fn(),
}));

import { berlinDateToday } from '@/lib/tz';

function setBerlinToday(dateStr: string) {
  vi.mocked(berlinDateToday).mockReturnValue(dateStr);
}

// Inline display logic from MedicationHistoryView for unit testing
function formatIntakeDisplay(localDate: string, localTime: string, todayDate: string): string {
  const diff = differenceInCalendarDays(
    new Date(todayDate + 'T12:00:00'),
    new Date(localDate + 'T12:00:00')
  );
  if (diff === 0) return `Heute – ${localTime}`;
  if (diff === 1) return `Gestern – ${localTime}`;
  const d = new Date(localDate + 'T12:00:00');
  const formatted = format(d, 'EEEE, d. MMMM yyyy', { locale: de });
  return `${formatted} – ${localTime}`;
}

describe('todayStr() — Berlin timezone SSOT', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns Berlin date, not UTC', () => {
    setBerlinToday('2026-02-27');
    expect(todayStr()).toBe('2026-02-27');
  });

  it('returns correct date during summer time (UTC+2)', () => {
    setBerlinToday('2026-07-15');
    expect(todayStr()).toBe('2026-07-15');
  });

  it('returns correct date at DST transition (spring forward)', () => {
    setBerlinToday('2026-03-29');
    expect(todayStr()).toBe('2026-03-29');
  });
});

describe('yesterdayStr() — Berlin timezone SSOT', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the day before Berlin today', () => {
    setBerlinToday('2026-02-27');
    expect(yesterdayStr()).toBe('2026-02-26');
  });

  it('handles month boundary', () => {
    setBerlinToday('2026-03-01');
    expect(yesterdayStr()).toBe('2026-02-28');
  });

  it('handles year boundary', () => {
    setBerlinToday('2026-01-01');
    expect(yesterdayStr()).toBe('2025-12-31');
  });

  it('handles DST spring-forward boundary', () => {
    setBerlinToday('2026-03-29');
    expect(yesterdayStr()).toBe('2026-03-28');
  });
});

describe('MedicationHistoryView date display logic', () => {
  it('shows "Heute – HH:MM" for today', () => {
    expect(formatIntakeDisplay('2026-02-26', '07:30', '2026-02-26')).toBe('Heute – 07:30');
  });

  it('shows "Gestern – HH:MM" for yesterday', () => {
    expect(formatIntakeDisplay('2026-02-25', '20:54', '2026-02-26')).toBe('Gestern – 20:54');
  });

  it('shows full date for 2+ days ago', () => {
    const result = formatIntakeDisplay('2026-02-24', '21:10', '2026-02-26');
    expect(result).toContain('2026');
    expect(result).toContain('21:10');
    expect(result).not.toContain('Heute');
    expect(result).not.toContain('Gestern');
  });

  it('boundary: entry at 00:00 is correctly included on that day', () => {
    expect(formatIntakeDisplay('2026-02-26', '00:00', '2026-02-26')).toBe('Heute – 00:00');
  });

  it('boundary: entry at 23:59 is correctly included on that day', () => {
    expect(formatIntakeDisplay('2026-02-26', '23:59', '2026-02-26')).toBe('Heute – 23:59');
  });

  it('future entry is not labeled Heute or Gestern', () => {
    const result = formatIntakeDisplay('2026-02-27', '00:10', '2026-02-26');
    expect(result).not.toContain('Heute');
    expect(result).not.toContain('Gestern');
  });
});

describe('Rolling range calculation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('7d range includes today and 6 days before', () => {
    setBerlinToday('2026-02-26');
    const today = todayStr();
    const from7d = format(subDays(new Date(today + 'T12:00:00'), 6), 'yyyy-MM-dd');
    expect(from7d).toBe('2026-02-20');
    expect(today).toBe('2026-02-26');
  });

  it('30d range includes today and 29 days before', () => {
    setBerlinToday('2026-02-26');
    const today = todayStr();
    const from30d = format(subDays(new Date(today + 'T12:00:00'), 29), 'yyyy-MM-dd');
    expect(from30d).toBe('2026-01-28');
  });
});
