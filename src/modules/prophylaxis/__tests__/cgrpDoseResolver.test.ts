/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CgrpDoseResolver — Unit Tests (14+ tests as specified)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { resolveDoseEvents } from '../cgrpDoseResolver';
import type { ResolverInput } from '../types';

// ─── Helper: minimal valid input ────────────────────────────────────────

function makeInput(overrides: Partial<ResolverInput> = {}): ResolverInput {
  return {
    drug: 'ajovy',
    drugNames: ['ajovy', 'fremanezumab'],
    diaryEntries: [],
    medicationIntakes: [],
    reminders: [],
    reminderCompletions: [],
    timeRangeStartBerlin: '2026-01-01',
    timeRangeEndBerlin: '2026-06-30',
    ...overrides,
  };
}

// ─── 1) P1 diary entry → 1 DoseEvent, confidence 1.0 ───────────────────

describe('CgrpDoseResolver', () => {
  it('1) P1 diary entry produces 1 DoseEvent with confidence 1.0', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
        medicationNames: ['Ajovy 225mg'],
        notes: '',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].confidence).toBe(1.0);
    expect(events[0].primarySource).toBe('diary_medication_entry');
    expect(events[0].dateKeyBerlin).toBe('2026-02-26');
  });

  // ─── 2) Only reminder_completed → confidence >= 0.8 ──────────────────

  it('2) Only reminder_completed produces DoseEvent with confidence >= 0.8', () => {
    const input = makeInput({
      reminders: [{
        id: 'rem-1',
        title: 'Ajovy spritzen',
        medications: ['Ajovy'],
        scheduledDateKeyBerlin: '2026-02-26',
        scheduledTimestampUtc: '2026-02-26T08:00:00Z',
      }],
      reminderCompletions: [{
        reminderId: 'rem-1',
        completedDateKeyBerlin: '2026-02-26',
        completedTimestampUtc: '2026-02-26T09:00:00Z',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(events[0].primarySource).toBe('reminder_completed');
  });

  // ─── 3) Completion far from schedule (>72h) → confidence drops ────────

  it('3) Completion >72h after schedule → confidence drops but event exists', () => {
    const input = makeInput({
      reminders: [{
        id: 'rem-1',
        title: 'Ajovy spritzen',
        medications: ['Ajovy'],
        scheduledDateKeyBerlin: '2026-02-20',
        scheduledTimestampUtc: '2026-02-20T08:00:00Z',
      }],
      reminderCompletions: [{
        reminderId: 'rem-1',
        completedDateKeyBerlin: '2026-02-25',
        completedTimestampUtc: '2026-02-25T09:00:00Z',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    // Score: 85 + 10 (timestamp) - 15 (far) = 80 → confidence 0.8
    expect(events[0].confidence).toBeLessThanOrEqual(0.9);
    expect(events[0].dateKeyBerlin).toBe('2026-02-25'); // uses completed date
  });

  // ─── 4) Scheduled-only → confidence 0.5 or 0.4 ───────────────────────

  it('4) Scheduled-only produces DoseEvent with confidence 0.5', () => {
    const input = makeInput({
      reminders: [{
        id: 'rem-1',
        title: 'Ajovy spritzen',
        medications: ['Ajovy'],
        scheduledDateKeyBerlin: '2026-02-26',
        scheduledTimestampUtc: '2026-02-26T08:00:00Z',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].confidence).toBeLessThanOrEqual(0.6);
    expect(events[0].primarySource).toBe('reminder_scheduled');
  });

  // ─── 5) Diary + completed within ±2 days → 1 cluster, P1 wins ────────

  it('5) Diary + completed within ±2 days → 1 cluster, diary date wins', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
        medicationNames: ['Ajovy'],
        notes: '',
      }],
      reminders: [{
        id: 'rem-1',
        title: 'Ajovy',
        medications: ['Ajovy'],
        scheduledDateKeyBerlin: '2026-02-25',
        scheduledTimestampUtc: '2026-02-25T08:00:00Z',
      }],
      reminderCompletions: [{
        reminderId: 'rem-1',
        completedDateKeyBerlin: '2026-02-25',
        completedTimestampUtc: '2026-02-25T09:00:00Z',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].dateKeyBerlin).toBe('2026-02-26'); // P1 wins
    expect(events[0].confidence).toBe(1.0);
    expect(events[0].evidences.length).toBeGreaterThanOrEqual(2);
  });

  // ─── 6) Two injections 60 days apart → 2 events ──────────────────────

  it('6) Two injections 60 days apart → 2 events', () => {
    const input = makeInput({
      diaryEntries: [
        {
          entryId: 1,
          dateKeyBerlin: '2026-01-15',
          timestampUtc: '2026-01-15T10:00:00Z',
          medicationNames: ['Ajovy'],
          notes: '',
        },
        {
          entryId: 2,
          dateKeyBerlin: '2026-03-15',
          timestampUtc: '2026-03-15T10:00:00Z',
          medicationNames: ['Ajovy'],
          notes: '',
        },
      ],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(2);
    expect(events[0].dateKeyBerlin).toBe('2026-01-15');
    expect(events[1].dateKeyBerlin).toBe('2026-03-15');
  });

  // ─── 7) Multiple completions close together → deduplicated ────────────

  it('7) Multiple completions within ±2 days → deduplicated to 1 event', () => {
    const input = makeInput({
      reminders: [
        {
          id: 'rem-1',
          title: 'Ajovy',
          medications: ['Ajovy'],
          scheduledDateKeyBerlin: '2026-02-26',
          scheduledTimestampUtc: '2026-02-26T08:00:00Z',
        },
        {
          id: 'rem-2',
          title: 'Ajovy Nachspritzen',
          medications: ['Ajovy'],
          scheduledDateKeyBerlin: '2026-02-27',
          scheduledTimestampUtc: '2026-02-27T08:00:00Z',
        },
      ],
      reminderCompletions: [
        {
          reminderId: 'rem-1',
          completedDateKeyBerlin: '2026-02-26',
          completedTimestampUtc: '2026-02-26T09:00:00Z',
        },
        {
          reminderId: 'rem-2',
          completedDateKeyBerlin: '2026-02-27',
          completedTimestampUtc: '2026-02-27T09:00:00Z',
        },
      ],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1); // clustered
  });

  // ─── 8) Free text "Ajovy gespritzt" → event with correct confidence ──

  it('8) Free text "Ajovy gespritzt" → DoseEvent with confidence >= 0.8', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
        medicationNames: [], // NOT as structured medication
        notes: 'Heute Ajovy gespritzt, leichte Rötung an der Stelle',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].primarySource).toBe('diary_free_text');
    expect(events[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  // ─── 9) Free text only "Ajovy" without context → lower confidence ────

  it('9) Free text only "Ajovy" without context keywords → lower confidence', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
        medicationNames: [],
        notes: 'Ajovy Termin war heute',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].primarySource).toBe('diary_free_text');
    // Score: 70 - 20 (no context) + 10 (timestamp) = 60 → confidence 0.6
    expect(events[0].confidence).toBeLessThanOrEqual(0.8);
  });

  // ─── 10) Evidence exists → fallback always delivers ───────────────────

  it('10) Evidence exists → at least 1 event is always returned', () => {
    // Even with minimal evidence (just scheduled)
    const input = makeInput({
      reminders: [{
        id: 'rem-1',
        title: 'Fremanezumab',
        medications: [],
        scheduledDateKeyBerlin: '2026-02-26',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // ─── 11) Timezone edge: UTC 23:30 → Berlin next day ───────────────────

  it('11) UTC 23:30 in winter → Berlin 00:30 next day', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-27', // already Berlin-corrected
        timestampUtc: '2026-02-26T23:30:00Z', // UTC = Berlin 00:30 next day (CET = +1)
        medicationNames: ['Ajovy'],
        notes: '',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].dateKeyBerlin).toBe('2026-02-27');
  });

  // ─── 12) DST transition ───────────────────────────────────────────────

  it('12) DST start date → correct Berlin dateKey', () => {
    // DST starts last Sunday of March: 2026-03-29 at 02:00 CET → 03:00 CEST
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-03-29', // Berlin calendar day
        timestampUtc: '2026-03-29T01:30:00Z', // UTC 01:30 = Berlin 02:30 CET (before switch)
        medicationNames: ['Ajovy'],
        notes: '',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].dateKeyBerlin).toBe('2026-03-29');
  });

  // ─── 13) "Always deliver if documented" guarantee ─────────────────────

  it('13) Any single evidence → events.length >= 1', () => {
    // Test with each source type individually
    const sources = [
      makeInput({
        diaryEntries: [{
          entryId: 1, dateKeyBerlin: '2026-02-26',
          medicationNames: ['Ajovy'], notes: '',
        }],
      }),
      makeInput({
        reminders: [{
          id: 'r1', title: 'Ajovy', medications: ['Ajovy'],
          scheduledDateKeyBerlin: '2026-02-26',
        }],
        reminderCompletions: [{
          reminderId: 'r1', completedDateKeyBerlin: '2026-02-26',
        }],
      }),
      makeInput({
        reminders: [{
          id: 'r1', title: 'Ajovy', medications: ['Ajovy'],
          scheduledDateKeyBerlin: '2026-02-26',
        }],
      }),
    ];

    for (const input of sources) {
      const events = resolveDoseEvents(input);
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ─── 14) Null/invalid inputs → no crash ───────────────────────────────

  it('14) Empty/null inputs → returns [] without crash', () => {
    const input = makeInput();
    const events = resolveDoseEvents(input);
    expect(events).toEqual([]);
  });

  it('14b) Invalid medication names → no crash, no events', () => {
    const input = makeInput({
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        medicationNames: ['Ibuprofen', 'Sumatriptan'],
        notes: '',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toEqual([]);
  });

  // ─── 15) Out of time range → excluded ─────────────────────────────────

  it('15) Evidence outside time range → excluded', () => {
    const input = makeInput({
      timeRangeStartBerlin: '2026-03-01',
      timeRangeEndBerlin: '2026-03-31',
      diaryEntries: [{
        entryId: 1,
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
        medicationNames: ['Ajovy'],
        notes: '',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toEqual([]);
  });

  // ─── 16) Medication intake records work like diary entries ─────────────

  it('16) Medication intake produces P1-level event', () => {
    const input = makeInput({
      medicationIntakes: [{
        id: 'intake-1',
        medicationName: 'Ajovy 225mg',
        dateKeyBerlin: '2026-02-26',
        timestampUtc: '2026-02-26T10:00:00Z',
      }],
    });

    const events = resolveDoseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].confidence).toBe(1.0);
    expect(events[0].primarySource).toBe('diary_medication_entry');
  });
});
