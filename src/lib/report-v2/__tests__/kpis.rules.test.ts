import { describe, it, expect } from 'vitest';
import { computeMeCfsMax, computeMohRiskFlag, isHeadacheDay, isTreatmentDay, isDocumentedDay } from '../definitions';

describe('isDocumentedDay', () => {
  it('returns true when hasAnyEntry is true', () => {
    expect(isDocumentedDay({ hasAnyEntry: true })).toBe(true);
  });

  it('returns true even when all symptoms are none', () => {
    expect(isDocumentedDay({ hasAnyEntry: true, allSymptomsSetToNone: true })).toBe(true);
  });

  it('returns false when no entry', () => {
    expect(isDocumentedDay({ hasAnyEntry: false })).toBe(false);
  });
});

describe('isHeadacheDay', () => {
  it('true for painMax > 0', () => {
    expect(isHeadacheDay(3)).toBe(true);
  });

  it('false for painMax = 0', () => {
    expect(isHeadacheDay(0)).toBe(false);
  });

  it('false for null', () => {
    expect(isHeadacheDay(null)).toBe(false);
  });
});

describe('isTreatmentDay', () => {
  it('true when acuteMedUsed', () => {
    expect(isTreatmentDay(true)).toBe(true);
  });

  it('false when not used', () => {
    expect(isTreatmentDay(false)).toBe(false);
  });
});

describe('computeMeCfsMax', () => {
  it('returns null for empty array', () => {
    expect(computeMeCfsMax([])).toBeNull();
  });

  it('returns null for all-null array', () => {
    expect(computeMeCfsMax([null, undefined, null])).toBeNull();
  });

  it('returns none for [none]', () => {
    expect(computeMeCfsMax(['none'])).toBe('none');
  });

  it('returns severe for mixed levels', () => {
    expect(computeMeCfsMax(['mild', 'severe', 'moderate'])).toBe('severe');
  });

  it('returns moderate for [none, moderate, mild]', () => {
    expect(computeMeCfsMax(['none', 'moderate', 'mild'])).toBe('moderate');
  });

  it('ignores null values', () => {
    expect(computeMeCfsMax([null, 'mild', null])).toBe('mild');
  });
});

describe('computeMohRiskFlag', () => {
  it('returns none for low usage', () => {
    expect(computeMohRiskFlag({ triptanDays: 2, acuteMedDays: 5, headacheDays: 10 }, 30)).toBe('none');
  });

  it('returns possible for triptanDays >= 8', () => {
    expect(computeMohRiskFlag({ triptanDays: 8, acuteMedDays: 5, headacheDays: 10 }, 30)).toBe('possible');
  });

  it('returns possible for acuteMedDays >= 12', () => {
    expect(computeMohRiskFlag({ triptanDays: 2, acuteMedDays: 12, headacheDays: 10 }, 30)).toBe('possible');
  });

  it('returns likely for triptanDays >= 10', () => {
    expect(computeMohRiskFlag({ triptanDays: 10, acuteMedDays: 5, headacheDays: 10 }, 30)).toBe('likely');
  });

  it('returns likely for acuteMedDays >= 15', () => {
    expect(computeMohRiskFlag({ triptanDays: 2, acuteMedDays: 15, headacheDays: 10 }, 30)).toBe('likely');
  });

  it('likely takes precedence over possible', () => {
    expect(computeMohRiskFlag({ triptanDays: 10, acuteMedDays: 12, headacheDays: 20 }, 30)).toBe('likely');
  });
});
