/**
 * Query Repair Tests
 */

import { describe, it, expect } from 'vitest';
import { findMedicationMatch, repairQuery, isIncompleteQuery } from '../queryRepair';

describe('findMedicationMatch', () => {
  it('should match exact medication names', () => {
    const result = findMedicationMatch('triptan');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('Triptan');
    expect(result?.confidence).toBe(1.0);
  });

  it('should fuzzy match Triplan -> Triptan', () => {
    const result = findMedicationMatch('Triplan');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('Triptan');
    expect(result?.confidence).toBeGreaterThan(0.7);
  });

  it('should fuzzy match Tryptan -> Triptan', () => {
    const result = findMedicationMatch('tryptan');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('Triptan');
  });

  it('should match ibuprofen variants', () => {
    const result = findMedicationMatch('iboprofen');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('Ibuprofen');
  });

  it('should match paracetamol variants', () => {
    const result = findMedicationMatch('parazitamol');
    expect(result).not.toBeNull();
    expect(result?.match).toBe('Paracetamol');
  });

  it('should return null for non-medication words', () => {
    const result = findMedicationMatch('gestern');
    expect(result).toBeNull();
  });

  it('should return null for short words', () => {
    const result = findMedicationMatch('ab');
    expect(result).toBeNull();
  });
});

describe('repairQuery', () => {
  it('should repair Triplan to Triptan', () => {
    const result = repairQuery('wie viele Triplan in den letzten 30 Tagen');
    expect(result.isRepaired).toBe(true);
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].original).toBe('Triplan');
    expect(result.corrections[0].corrected).toBe('Triptan');
  });

  it('should suggest complete query for incomplete input', () => {
    const result = repairQuery('wie viele triptan');
    expect(result.suggestedQuery).not.toBeNull();
    expect(result.suggestedQuery).toContain('Triptan');
  });

  it('should not repair already correct queries', () => {
    const result = repairQuery('wie viele schmerzfreie Tage in den letzten 30 Tagen');
    expect(result.isRepaired).toBe(false);
    expect(result.corrections).toHaveLength(0);
  });

  it('should provide suggested query for pain-free days', () => {
    const result = repairQuery('schmerzfreie tage');
    expect(result.suggestedQuery).toContain('schmerzfreie Tage');
  });
});

describe('isIncompleteQuery', () => {
  it('should detect incomplete triptan query', () => {
    expect(isIncompleteQuery('triptan')).toBe(true);
    expect(isIncompleteQuery('wie viele triptan')).toBe(true);
  });

  it('should not flag complete queries', () => {
    expect(isIncompleteQuery('wie viele triptan in den letzten 30 Tagen genommen')).toBe(false);
  });
});
