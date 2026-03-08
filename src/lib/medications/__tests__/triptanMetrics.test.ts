/**
 * Tests for central triptan metrics SSOT
 */
import { describe, it, expect } from 'vitest';
import { computeTriptanMetrics, normalizeTriptanPer30 } from '../triptanMetrics';

describe('computeTriptanMetrics', () => {
  it('counts multiple triptan intakes on same day', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg', 'Rizatriptan 10mg'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(2);
    expect(result.triptanDays).toBe(1);
  });

  it('counts multiple days with one intake each', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg'] },
      { selected_date: '2025-01-16', medications: ['Sumatriptan 50mg'] },
      { selected_date: '2025-01-17', medications: ['Sumatriptan 50mg'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(3);
    expect(result.triptanDays).toBe(3);
  });

  it('does not count non-triptan medications', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Ibuprofen 400', 'Paracetamol 500'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(0);
    expect(result.triptanDays).toBe(0);
  });

  it('recognizes trade names (Imigran, Maxalt, Ascotop)', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Imigran 50mg'] },
      { selected_date: '2025-01-16', medications: ['Maxalt 10mg'] },
      { selected_date: '2025-01-17', medications: ['Ascotop 2.5mg'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(3);
    expect(result.triptanDays).toBe(3);
  });

  it('handles mixed triptan and non-triptan in same entry', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg', 'Ibuprofen 400'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(1);
    expect(result.triptanDays).toBe(1);
  });

  it('handles entries without medications', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: [] },
      { selected_date: '2025-01-16', medications: null },
      { selected_date: '2025-01-17' },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(0);
    expect(result.triptanDays).toBe(0);
  });

  it('handles multiple entries on same day correctly', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg'] },
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.triptanIntakes).toBe(2);
    expect(result.triptanDays).toBe(1); // same day
  });

  it('provides per-medication breakdown', () => {
    const entries = [
      { selected_date: '2025-01-15', medications: ['Sumatriptan 50mg'] },
      { selected_date: '2025-01-16', medications: ['Rizatriptan 10mg'] },
      { selected_date: '2025-01-17', medications: ['Sumatriptan 50mg'] },
    ];
    const result = computeTriptanMetrics(entries);
    expect(result.byMedication.get('Sumatriptan 50mg')?.intakes).toBe(2);
    expect(result.byMedication.get('Rizatriptan 10mg')?.intakes).toBe(1);
  });
});

describe('normalizeTriptanPer30', () => {
  it('normalizes to 30 days', () => {
    const result = normalizeTriptanPer30({ triptanDays: 10, triptanIntakes: 15 }, 90);
    expect(result.triptanDaysPer30).toBeCloseTo(3.3, 1);
    expect(result.triptanIntakesPer30).toBe(5);
  });

  it('handles zero days in range', () => {
    const result = normalizeTriptanPer30({ triptanDays: 5, triptanIntakes: 10 }, 0);
    expect(result.triptanDaysPer30).toBe(0);
    expect(result.triptanIntakesPer30).toBe(0);
  });
});
