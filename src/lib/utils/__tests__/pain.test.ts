/**
 * SSOT Regression Tests for pain level normalization and day-grouping logic.
 * 
 * These tests exist to prevent the "5/10 bug" from recurring:
 * every entry was shown with the same pain level because a non-SSOT
 * normalization was used or a mapping constant was applied uniformly.
 */
import { describe, it, expect } from 'vitest';
import { normalizePainLevel, normalizePainLevelStrict, mapTextLevelToScore, formatPainDisplay } from '../pain';
import type { PainDisplay } from '../pain';

// ─── normalizePainLevel (returns number, 0 for invalid) ────────────

describe('normalizePainLevel (SSOT, returns number)', () => {
  it('handles numeric inputs', () => {
    expect(normalizePainLevel(0)).toBe(0);
    expect(normalizePainLevel(5)).toBe(5);
    expect(normalizePainLevel(10)).toBe(10);
  });

  it('clamps out-of-range numbers', () => {
    expect(normalizePainLevel(-3)).toBe(0);
    expect(normalizePainLevel(15)).toBe(10);
  });

  it('maps German text labels consistently', () => {
    expect(normalizePainLevel('leicht')).toBe(2);
    expect(normalizePainLevel('mittel')).toBe(5);
    expect(normalizePainLevel('stark')).toBe(7);
    expect(normalizePainLevel('sehr_stark')).toBe(9);
  });

  it('parses numeric strings', () => {
    expect(normalizePainLevel('3')).toBe(3);
    expect(normalizePainLevel('8')).toBe(8);
  });

  it('returns 0 for empty/unknown (safe for aggregation)', () => {
    expect(normalizePainLevel('')).toBe(0);
    expect(normalizePainLevel('unknown')).toBe(0);
  });
});

// ─── normalizePainLevelStrict (returns number | null) ──────────────

describe('normalizePainLevelStrict (SSOT, returns number | null)', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizePainLevelStrict(null)).toBeNull();
    expect(normalizePainLevelStrict(undefined)).toBeNull();
    expect(normalizePainLevelStrict('')).toBeNull();
    expect(normalizePainLevelStrict('-')).toBeNull();
  });

  it('returns null for out-of-range numbers', () => {
    expect(normalizePainLevelStrict(-1)).toBeNull();
    expect(normalizePainLevelStrict(11)).toBeNull();
  });

  it('returns null for unknown text', () => {
    expect(normalizePainLevelStrict('unknown')).toBeNull();
    expect(normalizePainLevelStrict('extreme')).toBeNull();
  });

  it('maps German text labels consistently with normalizePainLevel', () => {
    expect(normalizePainLevelStrict('leicht')).toBe(2);
    expect(normalizePainLevelStrict('mittel')).toBe(5);
    expect(normalizePainLevelStrict('stark')).toBe(7);
    expect(normalizePainLevelStrict('sehr_stark')).toBe(9);
    expect(normalizePainLevelStrict('sehr stark')).toBe(9);
  });

  it('handles "keine" as 0 (not null)', () => {
    expect(normalizePainLevelStrict('keine')).toBe(0);
  });

  it('parses numeric strings 0-10', () => {
    expect(normalizePainLevelStrict('0')).toBe(0);
    expect(normalizePainLevelStrict('5')).toBe(5);
    expect(normalizePainLevelStrict('10')).toBe(10);
  });

  it('rejects out-of-range numeric strings', () => {
    expect(normalizePainLevelStrict('11')).toBeNull();
    expect(normalizePainLevelStrict('-1')).toBeNull();
    expect(normalizePainLevelStrict('100')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(normalizePainLevelStrict('  5  ')).toBe(5);
    expect(normalizePainLevelStrict(' mittel ')).toBe(5);
  });

  it('handles case-insensitivity', () => {
    expect(normalizePainLevelStrict('Stark')).toBe(7);
    expect(normalizePainLevelStrict('MITTEL')).toBe(5);
    expect(normalizePainLevelStrict('Sehr Stark')).toBe(9);
  });
});

// ─── Regression: 5/10 bug prevention ──────────────────────────────

describe('5/10 bug regression prevention', () => {
  it('different entries produce different pain scores', () => {
    const entries = [
      { pain_level: '3' },
      { pain_level: 'leicht' },
      { pain_level: '8' },
      { pain_level: 'stark' },
      { pain_level: 'mittel' },
    ];
    
    const scores = entries.map(e => normalizePainLevel(e.pain_level));
    expect(scores).toEqual([3, 2, 8, 7, 5]);
    
    // Key assertion: not all the same value
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('maxPain calculation picks correct maximum per day', () => {
    const dayEntries = [
      { pain_level: '3' },
      { pain_level: '7' },
      { pain_level: '2' },
    ];
    
    const maxPain = Math.max(...dayEntries.map(e => normalizePainLevel(e.pain_level)));
    expect(maxPain).toBe(7);
  });

  it('maxPain with mixed text and numeric values', () => {
    const dayEntries = [
      { pain_level: 'leicht' },   // → 2
      { pain_level: 'stark' },    // → 7
      { pain_level: '4' },        // → 4
    ];
    
    const maxPain = Math.max(...dayEntries.map(e => normalizePainLevel(e.pain_level)));
    expect(maxPain).toBe(7);
  });

  it('empty/null pain_level does not produce false positive', () => {
    expect(normalizePainLevel('')).toBe(0);
    expect(normalizePainLevelStrict(null)).toBeNull();
    expect(normalizePainLevelStrict(undefined)).toBeNull();
  });
});

// ─── Day grouping helper test ─────────────────────────────────────

describe('Day grouping logic (simulated)', () => {
  it('groups entries by selected_date correctly', () => {
    const entries = [
      { id: '1', selected_date: '2025-03-20', pain_level: '3' },
      { id: '2', selected_date: '2025-03-20', pain_level: '7' },
      { id: '3', selected_date: '2025-03-21', pain_level: '5' },
      { id: '4', selected_date: '2025-03-19', pain_level: '2' },
    ];

    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      const date = entry.selected_date;
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(entry);
    }

    expect(grouped.size).toBe(3);
    expect(grouped.get('2025-03-20')!.length).toBe(2);
    expect(grouped.get('2025-03-21')!.length).toBe(1);
    expect(grouped.get('2025-03-19')!.length).toBe(1);

    // Max pain per day
    const maxPainByDay = new Map<string, number>();
    for (const [date, dayEntries] of grouped) {
      maxPainByDay.set(
        date,
        Math.max(...dayEntries.map(e => normalizePainLevel(e.pain_level)))
      );
    }

    expect(maxPainByDay.get('2025-03-20')).toBe(7);
    expect(maxPainByDay.get('2025-03-21')).toBe(5);
    expect(maxPainByDay.get('2025-03-19')).toBe(2);
  });

  it('sorts days descending', () => {
    const dates = ['2025-03-19', '2025-03-21', '2025-03-20'];
    dates.sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(['2025-03-21', '2025-03-20', '2025-03-19']);
  });

  it('falls back to timestamp_created date part', () => {
    const entry = { timestamp_created: '2025-03-20T14:30:00Z', selected_date: null };
    const date = entry.selected_date || entry.timestamp_created?.split('T')[0];
    expect(date).toBe('2025-03-20');
});

// ─── formatPainDisplay (UI display helper) ────────────

describe('formatPainDisplay', () => {
  it('formats numeric values correctly', () => {
    expect(formatPainDisplay('7')).toMatchObject({ score: 7, numeric: '7/10', label: 'Stark', category: 'stark' });
    expect(formatPainDisplay('2')).toMatchObject({ score: 2, numeric: '2/10', label: 'Leicht', category: 'leicht' });
    expect(formatPainDisplay('5')).toMatchObject({ score: 5, numeric: '5/10', label: 'Mittel', category: 'mittel' });
    expect(formatPainDisplay('9')).toMatchObject({ score: 9, numeric: '9/10', label: 'Sehr stark', category: 'sehr_stark' });
    expect(formatPainDisplay('0')).toMatchObject({ score: 0, numeric: '0/10', label: 'Keine Schmerzen', category: 'none' });
  });

  it('formats legacy text values via SSOT', () => {
    expect(formatPainDisplay('leicht')).toMatchObject({ score: 2, numeric: '2/10', label: 'Leicht' });
    expect(formatPainDisplay('mittel')).toMatchObject({ score: 5, numeric: '5/10', label: 'Mittel' });
    expect(formatPainDisplay('stark')).toMatchObject({ score: 7, numeric: '7/10', label: 'Stark' });
    expect(formatPainDisplay('sehr_stark')).toMatchObject({ score: 9, numeric: '9/10', label: 'Sehr stark' });
  });

  it('handles null/undefined/empty gracefully', () => {
    expect(formatPainDisplay(null)).toMatchObject({ score: null, numeric: '–', label: 'Keine Angabe', category: 'unknown' });
    expect(formatPainDisplay(undefined)).toMatchObject({ score: null, numeric: '–', label: 'Keine Angabe' });
    expect(formatPainDisplay('')).toMatchObject({ score: null, numeric: '–', label: 'Keine Angabe' });
    expect(formatPainDisplay('-')).toMatchObject({ score: null, numeric: '–', label: 'Keine Angabe' });
  });

  it('handles keine as 0', () => {
    expect(formatPainDisplay('keine')).toMatchObject({ score: 0, numeric: '0/10', label: 'Keine Schmerzen' });
  });

  it('ensures different entries get different displays', () => {
    const displays = ['2', '5', '7', '9'].map(v => formatPainDisplay(v));
    const scores = displays.map(d => d.score);
    expect(new Set(scores).size).toBe(4);
  });
});
});
