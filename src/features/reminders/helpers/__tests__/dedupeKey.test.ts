import { describe, it, expect } from 'vitest';
import {
  normalizeMedName,
  roundToMinute,
  buildDedupeCanonical,
  computeDedupeKey,
  deduplicateReminders,
} from '../dedupeKey';

describe('normalizeMedName', () => {
  it('trims and lowercases', () => {
    expect(normalizeMedName('  Eliquis  ')).toBe('eliquis');
  });
  it('collapses whitespace', () => {
    expect(normalizeMedName('Ibu  Profen  400')).toBe('ibu profen 400');
  });
  it('handles identical names with different casing', () => {
    expect(normalizeMedName('AJOVY')).toBe(normalizeMedName('ajovy'));
  });
});

describe('roundToMinute', () => {
  it('rounds seconds to zero', () => {
    const result = roundToMinute('2025-03-15T09:00:31');
    expect(result).toBe('2025-03-15T09:00');
  });
  it('preserves exact minutes', () => {
    const result = roundToMinute('2025-03-15T14:30:00');
    expect(result).toBe('2025-03-15T14:30');
  });
});

describe('buildDedupeCanonical', () => {
  it('produces same canonical for identical one-time reminders', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Ibuprofen 400',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: '  Ibuprofen  400 ',
      date_time: '2025-03-15T09:00:31',
      repeat: 'none',
    });
    expect(a).toBe(b);
  });

  it('produces different canonical for different medications', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Ibuprofen',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: 'Paracetamol',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    expect(a).not.toBe(b);
  });

  it('produces different canonical for different times', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Ibuprofen',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: 'Ibuprofen',
      date_time: '2025-03-15T10:00:00',
      repeat: 'none',
    });
    expect(a).not.toBe(b);
  });

  it('uses medication_id when provided', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Ibuprofen',
      medication_id: 'med-123',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: 'Different Name',
      medication_id: 'med-123',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    expect(a).toBe(b);
  });

  it('handles recurring reminders correctly', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Medikamente (Morgens)',
      date_time: '2025-03-15T08:00:00',
      repeat: 'daily',
      time_of_day: 'morning',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: 'Medikamente (Morgens)',
      date_time: '2025-03-16T08:00:00', // different date
      repeat: 'daily',
      time_of_day: 'morning',
    });
    expect(a).toBe(b);
  });

  it('differentiates recurring with different repeat types', () => {
    const a = buildDedupeCanonical({
      type: 'medication',
      title: 'Test',
      date_time: '2025-03-15T08:00:00',
      repeat: 'daily',
    });
    const b = buildDedupeCanonical({
      type: 'medication',
      title: 'Test',
      date_time: '2025-03-15T08:00:00',
      repeat: 'weekly',
    });
    expect(a).not.toBe(b);
  });
});

describe('computeDedupeKey', () => {
  it('returns consistent MD5 hash', async () => {
    const key1 = await computeDedupeKey({
      type: 'medication',
      title: 'Ibuprofen',
      date_time: '2025-03-15T09:00:00',
      repeat: 'none',
    });
    const key2 = await computeDedupeKey({
      type: 'medication',
      title: ' Ibuprofen ',
      date_time: '2025-03-15T09:00:45',
      repeat: 'none',
    });
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('deduplicateReminders', () => {
  it('returns single entry when no duplicates', () => {
    const input = [
      { id: '1', dedupe_key: 'a', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
      { id: '2', dedupe_key: 'b', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
    ];
    expect(deduplicateReminders(input)).toHaveLength(2);
  });

  it('picks canonical from duplicates (prefer enabled + latest)', () => {
    const input = [
      { id: '1', dedupe_key: 'a', notification_enabled: false, updated_at: '2025-01-01', status: 'pending' },
      { id: '2', dedupe_key: 'a', notification_enabled: true, updated_at: '2025-01-02', status: 'pending' },
      { id: '3', dedupe_key: 'a', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
    ];
    const result = deduplicateReminders(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2'); // enabled + latest
  });

  it('prefers pending status', () => {
    const input = [
      { id: '1', dedupe_key: 'a', notification_enabled: true, updated_at: '2025-01-03', status: 'done' },
      { id: '2', dedupe_key: 'a', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
    ];
    const result = deduplicateReminders(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2'); // pending preferred
  });

  it('falls back to id when no dedupe_key', () => {
    const input = [
      { id: '1', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
      { id: '2', notification_enabled: true, updated_at: '2025-01-01', status: 'pending' },
    ];
    expect(deduplicateReminders(input)).toHaveLength(2);
  });
});
