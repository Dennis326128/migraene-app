import { describe, it, expect } from 'vitest';
import { getNextOccurrence } from '../completeReminder';
import { addDays, addWeeks, addMonths } from 'date-fns';

describe('getNextOccurrence', () => {
  const baseDate = new Date('2024-03-15T10:00:00');

  it('adds 1 day for daily repeat', () => {
    const next = getNextOccurrence(baseDate, 'daily');
    const expected = addDays(baseDate, 1);
    expect(next.getTime()).toBe(expected.getTime());
  });

  it('adds 1 week for weekly repeat', () => {
    const next = getNextOccurrence(baseDate, 'weekly');
    const expected = addWeeks(baseDate, 1);
    expect(next.getTime()).toBe(expected.getTime());
  });

  it('adds 1 month for monthly repeat', () => {
    const next = getNextOccurrence(baseDate, 'monthly');
    const expected = addMonths(baseDate, 1);
    expect(next.getTime()).toBe(expected.getTime());
  });

  it('preserves time when adding days', () => {
    const dateWithTime = new Date('2024-03-15T14:30:00');
    const next = getNextOccurrence(dateWithTime, 'daily');
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });

  it('preserves time when adding weeks', () => {
    const dateWithTime = new Date('2024-03-15T09:15:00');
    const next = getNextOccurrence(dateWithTime, 'weekly');
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(15);
  });

  it('preserves time when adding months', () => {
    const dateWithTime = new Date('2024-03-15T20:00:00');
    const next = getNextOccurrence(dateWithTime, 'monthly');
    expect(next.getHours()).toBe(20);
    expect(next.getMinutes()).toBe(0);
  });

  it('handles month-end edge case for monthly', () => {
    // Jan 31 + 1 month should be Feb 29 in leap year (2024) or Feb 28
    const jan31 = new Date('2024-01-31T10:00:00');
    const next = getNextOccurrence(jan31, 'monthly');
    // date-fns handles this by returning Feb 29 for leap year
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBeLessThanOrEqual(29);
  });

  it('handles year boundary for daily', () => {
    const dec31 = new Date('2024-12-31T10:00:00');
    const next = getNextOccurrence(dec31, 'daily');
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getDate()).toBe(1);
  });

  it('handles year boundary for monthly', () => {
    const dec15 = new Date('2024-12-15T10:00:00');
    const next = getNextOccurrence(dec15, 'monthly');
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getDate()).toBe(15);
  });
});
