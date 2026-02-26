import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeDateRange } from './dateRange';

// Mock berlinDateToday so todayStr()/yesterdayStr() are deterministic
vi.mock('@/lib/tz', () => ({
  berlinDateFromUTC: vi.fn(),
  berlinDateToday: vi.fn(() => '2026-02-14'),
  berlinDateYesterday: vi.fn(),
}));

describe('computeDateRange', () => {
  // berlinDateToday returns '2026-02-14', so yesterdayStr() = '2026-02-13'
  // computeDateRange presets end at yesterday (effectiveEnd).

  it('1m = exactly 30 days, ending yesterday', () => {
    const { from, to } = computeDateRange('1m');
    expect(to).toBe('2026-02-13'); // yesterday = effectiveEnd
    expect(from).toBe('2026-01-15'); // 30 days: Jan 15 – Feb 13
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) + 1;
    expect(diff).toBe(30);
  });

  it('3m = exactly 90 days', () => {
    const { from, to } = computeDateRange('3m');
    expect(to).toBe('2026-02-13');
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) + 1;
    expect(diff).toBe(90);
  });

  it('6m = exactly 180 days', () => {
    const { from, to } = computeDateRange('6m');
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) + 1;
    expect(diff).toBe(180);
  });

  it('12m = exactly 365 days', () => {
    const { from, to } = computeDateRange('12m');
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) + 1;
    expect(diff).toBe(365);
  });

  it('custom returns provided dates', () => {
    const { from, to } = computeDateRange('custom', {
      customFrom: '2025-01-01',
      customTo: '2025-06-30',
    });
    expect(from).toBe('2025-01-01');
    expect(to).toBe('2025-06-30');
  });

  it('all uses firstEntryDate when provided', () => {
    const { from, to } = computeDateRange('all', { firstEntryDate: '2024-05-01' });
    expect(from).toBe('2024-05-01');
    expect(to).toBe('2026-02-13'); // yesterday
  });
});
