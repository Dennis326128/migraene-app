/**
 * Tests for analysisContext.ts – temporal context layer for LLM analysis.
 *
 * Validates:
 * - Timeline construction from mixed data sources
 * - Day grouping and summaries
 * - Phase block detection
 * - Context windows around pain/fatigue/medication events
 * - Multi-day pattern reconstruction
 */
import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  buildDayContexts,
  detectPhaseBlocks,
  buildContextWindow,
  buildAnalysisContext,
  type TimelineItem,
} from '../analysisContext';
import type {
  VoiceEventForAnalysis,
  PainEntryForAnalysis,
  MedicationIntakeForAnalysis,
  FullAnalysisDataset,
  AnalysisTimeRange,
} from '../analysisAccess';

// ============================================================
// === HELPERS ===
// ============================================================

function makeVoice(overrides: Partial<VoiceEventForAnalysis>): VoiceEventForAnalysis {
  return {
    id: 've-1',
    raw_transcript: 'test',
    cleaned_transcript: null,
    event_timestamp: '2025-03-20T10:00:00Z',
    event_types: [],
    event_subtypes: [],
    tags: [],
    confidence: 0.9,
    stt_confidence: 0.9,
    medical_relevance: 'none',
    review_state: 'auto_saved',
    parsing_status: 'classified',
    structured_data: null,
    segments: null,
    session_id: 'sess-1',
    related_entry_id: null,
    voice_note_id: null,
    source: 'microphone',
    created_at: '2025-03-20T10:00:00Z',
    ...overrides,
  };
}

function makePain(overrides: Partial<PainEntryForAnalysis>): PainEntryForAnalysis {
  return {
    id: 1,
    selected_date: '2025-03-20',
    selected_time: '14:00',
    pain_level: '5',
    medications: null,
    medication_ids: null,
    notes: null,
    pain_locations: null,
    aura_type: 'keine',
    me_cfs_severity_level: 'none',
    entry_kind: 'pain',
    voice_note_id: null,
    timestamp_created: '2025-03-20T14:00:00Z',
    ...overrides,
  };
}

function makeIntake(overrides: Partial<MedicationIntakeForAnalysis>): MedicationIntakeForAnalysis {
  return {
    id: 'mi-1',
    medication_name: 'Sumatriptan',
    medication_id: null,
    entry_id: 1,
    taken_date: '2025-03-20',
    taken_time: '15:00',
    dose_quarters: 4,
    ...overrides,
  };
}

function makeDataset(
  voiceEvents: VoiceEventForAnalysis[] = [],
  painEntries: PainEntryForAnalysis[] = [],
  medicationIntakes: MedicationIntakeForAnalysis[] = [],
): FullAnalysisDataset {
  const range: AnalysisTimeRange = {
    from: new Date('2025-03-19T00:00:00Z'),
    to: new Date('2025-03-22T23:59:59Z'),
  };
  const linked = voiceEvents.filter(v => v.related_entry_id !== null).length;
  return {
    voiceEvents,
    painEntries,
    medicationIntakes,
    meta: {
      range,
      voiceEventCount: voiceEvents.length,
      painEntryCount: painEntries.length,
      medicationIntakeCount: medicationIntakes.length,
      linkedVoiceEventCount: linked,
      unlinkedVoiceEventCount: voiceEvents.length - linked,
    },
  };
}

// ============================================================
// === TIMELINE CONSTRUCTION ===
// ============================================================

describe('buildTimeline', () => {
  it('merges voice events, pain entries, and intakes into chronological order', () => {
    const ds = makeDataset(
      [makeVoice({ id: 'v1', event_timestamp: '2025-03-20T10:00:00Z', raw_transcript: 'Kaffee getrunken' })],
      [makePain({ id: 2, selected_date: '2025-03-20', selected_time: '14:00', pain_level: '7' })],
      [makeIntake({ id: 'mi1', taken_date: '2025-03-20', taken_time: '15:00' })],
    );
    const tl = buildTimeline(ds);

    expect(tl).toHaveLength(3);
    expect(tl[0].kind).toBe('voice');
    expect(tl[1].kind).toBe('pain_entry');
    expect(tl[2].kind).toBe('med_intake');
  });

  it('preserves raw_transcript as displayText for voice events', () => {
    const ds = makeDataset([makeVoice({ raw_transcript: 'bin platt nach dem duschen' })]);
    const tl = buildTimeline(ds);
    expect(tl[0].displayText).toBe('bin platt nach dem duschen');
  });

  it('extracts semantic tags from voice event types and tags', () => {
    const ds = makeDataset([makeVoice({
      event_types: ['mecfs_state', 'activity'],
      tags: ['pem'],
      medical_relevance: 'high',
    })]);
    const tl = buildTimeline(ds);
    expect(tl[0].semanticTags).toContain('mecfs_state');
    expect(tl[0].semanticTags).toContain('pem');
    expect(tl[0].semanticTags).toContain('relevance:high');
  });

  it('marks pain entries with severe_pain when NRS >= 7', () => {
    const ds = makeDataset([], [makePain({ pain_level: '8' })]);
    const tl = buildTimeline(ds);
    expect(tl[0].semanticTags).toContain('severe_pain');
  });
});

// ============================================================
// === DAY GROUPING ===
// ============================================================

describe('buildDayContexts', () => {
  it('groups items by calendar date', () => {
    const ds = makeDataset(
      [
        makeVoice({ id: 'v1', event_timestamp: '2025-03-20T09:00:00Z' }),
        makeVoice({ id: 'v2', event_timestamp: '2025-03-21T10:00:00Z' }),
      ],
      [makePain({ id: 1, selected_date: '2025-03-20' })],
    );
    const tl = buildTimeline(ds);
    const days = buildDayContexts(tl);

    expect(days).toHaveLength(2);
    expect(days[0].date).toBe('2025-03-20');
    expect(days[0].items).toHaveLength(2);
    expect(days[1].date).toBe('2025-03-21');
    expect(days[1].items).toHaveLength(1);
  });

  it('computes maxPainLevel per day', () => {
    const ds = makeDataset([], [
      makePain({ id: 1, selected_date: '2025-03-20', pain_level: '3' }),
      makePain({ id: 2, selected_date: '2025-03-20', pain_level: 'stark' }),
    ]);
    const days = buildDayContexts(buildTimeline(ds));
    expect(days[0].maxPainLevel).toBe(7); // stark = 7
  });

  it('detects ME/CFS signals in day summary', () => {
    const ds = makeDataset([makeVoice({
      event_types: ['mecfs_state'],
      structured_data: { mecfsSignals: { state: 'platt', severity: 'severe', pemSuggested: true } },
    })]);
    const days = buildDayContexts(buildTimeline(ds));
    expect(days[0].hasMecfsSignals).toBe(true);
  });
});

// ============================================================
// === PHASE BLOCKS ===
// ============================================================

describe('detectPhaseBlocks', () => {
  it('groups consecutive items with same phase', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'voice', timestamp: '2025-03-20T08:00:00Z', date: '2025-03-20', time: '08:00', displayText: 'geduscht', semanticTags: [], linkedIds: [], source: { type: 'voice', data: makeVoice({ event_types: ['activity'] }) } },
      { id: '2', kind: 'voice', timestamp: '2025-03-20T08:30:00Z', date: '2025-03-20', time: '08:30', displayText: 'einkaufen', semanticTags: [], linkedIds: [], source: { type: 'voice', data: makeVoice({ event_types: ['activity'] }) } },
      { id: '3', kind: 'voice', timestamp: '2025-03-20T10:00:00Z', date: '2025-03-20', time: '10:00', displayText: 'komplett platt', semanticTags: ['mecfs_state'], linkedIds: [], source: { type: 'voice', data: makeVoice({ event_types: ['mecfs_state'] }) } },
    ];

    const blocks = detectPhaseBlocks(items);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].state).toBe('exertion');
    expect(blocks[0].items).toHaveLength(2);
    expect(blocks[1].state).toBe('fatigue');
  });

  it('returns single block when all items share a phase', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'voice', timestamp: 'T1', date: 'd', time: null, displayText: '', semanticTags: ['pain'], linkedIds: [], source: { type: 'voice', data: makeVoice({ event_types: [] }) } },
      { id: '2', kind: 'voice', timestamp: 'T2', date: 'd', time: null, displayText: '', semanticTags: ['severe_pain'], linkedIds: [], source: { type: 'voice', data: makeVoice({ event_types: [] }) } },
    ];
    expect(detectPhaseBlocks(items)).toHaveLength(1);
  });
});

// ============================================================
// === CONTEXT WINDOWS ===
// ============================================================

describe('buildContextWindow', () => {
  it('collects preceding and following items within window', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'voice', timestamp: '2025-03-20T08:00:00Z', date: '2025-03-20', time: '08:00', displayText: 'Kaffee', semanticTags: ['food_drink'], linkedIds: [], source: { type: 'voice', data: makeVoice({}) } },
      { id: '2', kind: 'voice', timestamp: '2025-03-20T10:00:00Z', date: '2025-03-20', time: '10:00', displayText: 'draußen', semanticTags: ['activity'], linkedIds: [], source: { type: 'voice', data: makeVoice({}) } },
      { id: '3', kind: 'pain_entry', timestamp: '2025-03-20T14:00:00Z', date: '2025-03-20', time: '14:00', displayText: 'Migräne', semanticTags: ['pain', 'severe_pain'], linkedIds: [], source: { type: 'pain_entry', data: makePain({}) } },
      { id: '4', kind: 'med_intake', timestamp: '2025-03-20T15:00:00Z', date: '2025-03-20', time: '15:00', displayText: 'Sumatriptan', semanticTags: ['medication'], linkedIds: [], source: { type: 'med_intake', data: makeIntake({}) } },
      { id: '5', kind: 'voice', timestamp: '2025-03-21T08:00:00Z', date: '2025-03-21', time: '08:00', displayText: 'nächster Tag', semanticTags: [], linkedIds: [], source: { type: 'voice', data: makeVoice({}) } },
    ];

    const focal = items[2]; // pain at 14:00
    const window = buildContextWindow(focal, items, 6);

    expect(window.preceding).toHaveLength(2); // coffee at 08:00, draußen at 10:00
    expect(window.following).toHaveLength(1); // Sumatriptan at 15:00 (next day is >6h away)
    expect(window.preceding[0].displayText).toBe('Kaffee');
  });

  it('excludes items outside the time window', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'voice', timestamp: '2025-03-19T08:00:00Z', date: '2025-03-19', time: '08:00', displayText: 'yesterday', semanticTags: [], linkedIds: [], source: { type: 'voice', data: makeVoice({}) } },
      { id: '2', kind: 'pain_entry', timestamp: '2025-03-20T14:00:00Z', date: '2025-03-20', time: '14:00', displayText: 'pain', semanticTags: ['pain'], linkedIds: [], source: { type: 'pain_entry', data: makePain({}) } },
    ];
    const window = buildContextWindow(items[1], items, 6);
    expect(window.preceding).toHaveLength(0); // >24h away
  });
});

// ============================================================
// === FULL ANALYSIS CONTEXT ===
// ============================================================

describe('buildAnalysisContext', () => {
  it('builds complete context from mixed dataset', () => {
    const ds = makeDataset(
      [
        makeVoice({ id: 'v1', event_timestamp: '2025-03-20T08:00:00Z', raw_transcript: 'Kaffee getrunken', event_types: ['food_drink'] }),
        makeVoice({ id: 'v2', event_timestamp: '2025-03-20T10:00:00Z', raw_transcript: 'Licht im Supermarkt schlimm', event_types: ['environment'] }),
        makeVoice({ id: 'v3', event_timestamp: '2025-03-20T16:00:00Z', raw_transcript: 'hingelegt', event_types: ['sleep_rest'] }),
      ],
      [makePain({ id: 1, selected_date: '2025-03-20', selected_time: '14:00', pain_level: '7', medications: ['Sumatriptan'] })],
      [makeIntake({ id: 'mi1', taken_date: '2025-03-20', taken_time: '14:30' })],
    );

    const ctx = buildAnalysisContext(ds, 6);

    expect(ctx.timeline).toHaveLength(5);
    expect(ctx.days).toHaveLength(1);
    expect(ctx.days[0].maxPainLevel).toBe(7);
    expect(ctx.days[0].hasMedication).toBe(true);
    expect(ctx.painWindows.length).toBeGreaterThan(0);
    expect(ctx.medicationWindows).toHaveLength(1);
    expect(ctx.meta.totalItems).toBe(5);
    expect(ctx.meta.daysWithPain).toBe(1);
  });
});

// ============================================================
// === REALISTIC MULTI-DAY SCENARIOS ===
// ============================================================

describe('Multi-day migraine scenario', () => {
  it('reconstructs a 2-day migraine sequence', () => {
    const ds = makeDataset(
      [
        // Day 1: trigger chain
        makeVoice({ id: 'v1', event_timestamp: '2025-03-20T08:00:00Z', raw_transcript: 'Kaffee getrunken', event_types: ['food_drink'] }),
        makeVoice({ id: 'v2', event_timestamp: '2025-03-20T10:30:00Z', raw_transcript: 'Licht im Supermarkt schlimm', event_types: ['environment'] }),
        makeVoice({ id: 'v3', event_timestamp: '2025-03-20T13:00:00Z', raw_transcript: 'Kopfdruck', event_types: ['symptom'] }),
        makeVoice({ id: 'v4', event_timestamp: '2025-03-20T16:00:00Z', raw_transcript: 'hingelegt', event_types: ['sleep_rest'] }),
        // Day 2: recovery
        makeVoice({ id: 'v5', event_timestamp: '2025-03-21T09:00:00Z', raw_transcript: 'etwas besser heute', event_types: ['wellbeing'] }),
      ],
      [
        makePain({ id: 1, selected_date: '2025-03-20', selected_time: '14:00', pain_level: '8', medications: ['Sumatriptan'], pain_locations: ['rechts'] }),
      ],
      [
        makeIntake({ id: 'mi1', taken_date: '2025-03-20', taken_time: '14:30' }),
      ],
    );

    const ctx = buildAnalysisContext(ds, 6);

    // Day structure
    expect(ctx.days).toHaveLength(2);
    expect(ctx.days[0].date).toBe('2025-03-20');
    expect(ctx.days[0].maxPainLevel).toBe(8);
    expect(ctx.days[0].items).toHaveLength(6); // 4 voice + 1 pain + 1 intake
    expect(ctx.days[1].date).toBe('2025-03-21');

    // Pain window includes preceding triggers
    expect(ctx.painWindows.length).toBeGreaterThan(0);
    const pw = ctx.painWindows[0];
    expect(pw.preceding.length).toBeGreaterThanOrEqual(2); // coffee + light
    expect(pw.following.length).toBeGreaterThanOrEqual(1); // sumatriptan or hingelegt

    // Phase blocks: food → environment → observation → pain → medication → rest
    const phases = ctx.days[0].phases;
    expect(phases.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Multi-day ME/CFS scenario', () => {
  it('reconstructs PEM pattern across 2 days', () => {
    const ds = makeDataset([
      // Day 1
      makeVoice({ id: 'v1', event_timestamp: '2025-03-20T10:00:00Z', raw_transcript: 'geduscht', event_types: ['activity'] }),
      makeVoice({ id: 'v2', event_timestamp: '2025-03-20T10:30:00Z', raw_transcript: 'komplett platt', event_types: ['mecfs_state'], tags: ['pem'], structured_data: { mecfsSignals: { state: 'platt', severity: 'severe', pemSuggested: true } } }),
      makeVoice({ id: 'v3', event_timestamp: '2025-03-20T11:00:00Z', raw_transcript: 'brain fog', event_types: ['mecfs_state'] }),
      makeVoice({ id: 'v4', event_timestamp: '2025-03-20T12:00:00Z', raw_transcript: 'hingelegt', event_types: ['sleep_rest'] }),
      // Day 2
      makeVoice({ id: 'v5', event_timestamp: '2025-03-21T09:00:00Z', raw_transcript: 'morgens brain fog', event_types: ['mecfs_state'] }),
      makeVoice({ id: 'v6', event_timestamp: '2025-03-21T11:00:00Z', raw_transcript: 'kurzer Spaziergang', event_types: ['activity'] }),
      makeVoice({ id: 'v7', event_timestamp: '2025-03-21T13:00:00Z', raw_transcript: 'danach matschig', event_types: ['mecfs_state'] }),
      makeVoice({ id: 'v8', event_timestamp: '2025-03-21T15:00:00Z', raw_transcript: 'Kopfdruck', event_types: ['symptom'] }),
    ]);

    const ctx = buildAnalysisContext(ds);

    // Both days have ME/CFS signals
    expect(ctx.days).toHaveLength(2);
    expect(ctx.days[0].hasMecfsSignals).toBe(true);
    expect(ctx.days[1].hasMecfsSignals).toBe(true);
    expect(ctx.meta.daysWithMecfs).toBe(2);

    // Fatigue windows exist
    expect(ctx.fatigueWindows.length).toBeGreaterThanOrEqual(3);

    // Day 1 phases: exertion → fatigue → rest
    const d1Phases = ctx.days[0].phases;
    expect(d1Phases[0].state).toBe('exertion'); // duschen
    expect(d1Phases[1].state).toBe('fatigue');  // platt + brainfog
    expect(d1Phases[d1Phases.length - 1].state).toBe('rest'); // hingelegt
  });
});

describe('Medication context scenario', () => {
  it('medication window includes preceding pain and following rest', () => {
    const ds = makeDataset(
      [
        makeVoice({ id: 'v1', event_timestamp: '2025-03-20T12:00:00Z', raw_transcript: 'Kopf zieht links', event_types: ['symptom'] }),
        makeVoice({ id: 'v3', event_timestamp: '2025-03-20T15:00:00Z', raw_transcript: 'hingelegt', event_types: ['sleep_rest'] }),
      ],
      [makePain({ id: 1, selected_date: '2025-03-20', selected_time: '13:00', pain_level: '6' })],
      [makeIntake({ id: 'mi1', taken_date: '2025-03-20', taken_time: '13:30' })],
    );

    const ctx = buildAnalysisContext(ds, 6);

    expect(ctx.medicationWindows).toHaveLength(1);
    const mw = ctx.medicationWindows[0];
    expect(mw.preceding.length).toBeGreaterThanOrEqual(1); // Kopf zieht
    expect(mw.following.length).toBeGreaterThanOrEqual(1); // hingelegt
  });
});
