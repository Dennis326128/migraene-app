/**
 * Tests for day-grouping helpers and the 5/10 regression bug.
 */
import { describe, it, expect } from 'vitest';
import { groupEntriesByDay, computeDayStats, getEntryDate, type EntryLike } from '../dayGrouping';

// ─── getEntryDate ─────────────────────────────────────────────────

describe('getEntryDate', () => {
  it('prefers selected_date over timestamp_created', () => {
    expect(getEntryDate({
      id: '1', pain_level: '5',
      selected_date: '2025-03-20',
      timestamp_created: '2025-03-19T23:30:00Z',
    })).toBe('2025-03-20');
  });

  it('falls back to timestamp_created date part', () => {
    expect(getEntryDate({
      id: '1', pain_level: '5',
      selected_date: null,
      timestamp_created: '2025-03-20T14:30:00Z',
    })).toBe('2025-03-20');
  });

  it('returns null when both are missing', () => {
    expect(getEntryDate({ id: '1', pain_level: '5' })).toBeNull();
  });
});

// ─── computeDayStats ──────────────────────────────────────────────

describe('computeDayStats', () => {
  it('finds maxPain across mixed formats', () => {
    const entries: EntryLike[] = [
      { id: '1', pain_level: 'leicht', selected_date: '2025-01-01' },   // → 2
      { id: '2', pain_level: 'stark', selected_date: '2025-01-01' },    // → 7
      { id: '3', pain_level: '4', selected_date: '2025-01-01' },        // → 4
    ];
    const { maxPain } = computeDayStats(entries);
    expect(maxPain).toBe(7);
  });

  it('returns 0 for empty/unknown pain_level', () => {
    const entries: EntryLike[] = [
      { id: '1', pain_level: '', selected_date: '2025-01-01' },
    ];
    const { maxPain } = computeDayStats(entries);
    expect(maxPain).toBe(0);
  });

  it('detects medication presence', () => {
    const entries: EntryLike[] = [
      { id: '1', pain_level: '3', medications: ['Ibuprofen'] },
      { id: '2', pain_level: '5', medications: [] },
    ];
    expect(computeDayStats(entries).hasMedication).toBe(true);
  });

  it('detects no medication', () => {
    const entries: EntryLike[] = [
      { id: '1', pain_level: '3', medications: [] },
    ];
    expect(computeDayStats(entries).hasMedication).toBe(false);
  });
});

// ─── groupEntriesByDay ────────────────────────────────────────────

describe('groupEntriesByDay', () => {
  const testEntries: EntryLike[] = [
    { id: '1', selected_date: '2025-03-20', selected_time: '14:00', pain_level: '3' },
    { id: '2', selected_date: '2025-03-20', selected_time: '08:00', pain_level: '7' },
    { id: '3', selected_date: '2025-03-21', selected_time: '10:00', pain_level: '5' },
    { id: '4', selected_date: '2025-03-19', selected_time: '12:00', pain_level: '2' },
  ];

  it('groups entries by date', () => {
    const groups = groupEntriesByDay(testEntries);
    expect(groups).toHaveLength(3);
  });

  it('sorts days descending', () => {
    const groups = groupEntriesByDay(testEntries);
    expect(groups.map(g => g.date)).toEqual(['2025-03-21', '2025-03-20', '2025-03-19']);
  });

  it('sorts entries within a day by time ascending', () => {
    const groups = groupEntriesByDay(testEntries);
    const march20 = groups.find(g => g.date === '2025-03-20')!;
    expect(march20.entries[0].selected_time).toBe('08:00');
    expect(march20.entries[1].selected_time).toBe('14:00');
  });

  it('computes maxPain per day correctly', () => {
    const groups = groupEntriesByDay(testEntries);
    const march20 = groups.find(g => g.date === '2025-03-20')!;
    expect(march20.maxPain).toBe(7);
    expect(groups.find(g => g.date === '2025-03-21')!.maxPain).toBe(5);
    expect(groups.find(g => g.date === '2025-03-19')!.maxPain).toBe(2);
  });

  it('skips entries without any date', () => {
    const entries: EntryLike[] = [
      { id: '1', pain_level: '5' }, // no date at all
      { id: '2', selected_date: '2025-03-20', pain_level: '3' },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entryCount).toBe(1);
  });
});

// ─── 5/10 REGRESSION TEST ─────────────────────────────────────────

describe('5/10 bug regression: each entry must keep its own pain_level', () => {
  it('different entries within a day retain individual pain scores', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-03-20', selected_time: '08:00', pain_level: '2' },
      { id: '2', selected_date: '2025-03-20', selected_time: '12:00', pain_level: '5' },
      { id: '3', selected_date: '2025-03-20', selected_time: '18:00', pain_level: '8' },
    ];

    const groups = groupEntriesByDay(entries);
    const day = groups[0];

    // maxPain should be the actual maximum, not a default
    expect(day.maxPain).toBe(8);

    // Each entry retains its own pain_level — NOT the maxPain
    expect(day.entries[0].pain_level).toBe('2');
    expect(day.entries[1].pain_level).toBe('5');
    expect(day.entries[2].pain_level).toBe('8');
  });

  it('mixed text and numeric entries produce different scores', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-03-20', pain_level: 'leicht' },   // → 2
      { id: '2', selected_date: '2025-03-20', pain_level: 'stark' },    // → 7
      { id: '3', selected_date: '2025-03-20', pain_level: '4' },        // → 4
      { id: '4', selected_date: '2025-03-20', pain_level: 'sehr_stark' }, // → 9
    ];

    const groups = groupEntriesByDay(entries);
    // maxPain must be 9 (from sehr_stark), not 5 (the old bug default)
    expect(groups[0].maxPain).toBe(9);

    // Individual entries must NOT be modified
    const painValues = groups[0].entries.map(e => e.pain_level);
    const uniqueValues = new Set(painValues);
    expect(uniqueValues.size).toBe(4); // all different
  });

  it('day with only empty/null pain_level has maxPain 0', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-03-20', pain_level: '' },
      { id: '2', selected_date: '2025-03-20', pain_level: '' },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups[0].maxPain).toBe(0);
  });

  it('handles medication day with low pain', () => {
    const entries: EntryLike[] = [
      { id: '1', selected_date: '2025-03-20', pain_level: '1', medications: ['Ibuprofen'] },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups[0].maxPain).toBe(1);
    expect(groups[0].hasMedication).toBe(true);
  });
});
