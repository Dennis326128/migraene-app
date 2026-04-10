import { describe, it, expect } from 'vitest';
import { validateAnalysisResult, isAnalysisUnavailable } from '../analysisTypes';
import { estimateTokens } from '../analysisEngine';
import { buildAnalysisContext, serializeForLLM } from '../analysisContext';
import type { FullAnalysisDataset } from '../analysisAccess';

// ============================================================
// === HELPERS ===
// ============================================================

function makeDataset(overrides?: Partial<FullAnalysisDataset>): FullAnalysisDataset {
  return {
    voiceEvents: [],
    painEntries: [],
    medicationIntakes: [],
    contextNotes: [],
    meta: {
      range: { from: new Date('2025-01-01'), to: new Date('2025-01-07') },
      voiceEventCount: 0,
      painEntryCount: 0,
      medicationIntakeCount: 0,
      contextNoteCount: 0,
      linkedVoiceEventCount: 0,
      unlinkedVoiceEventCount: 0,
    },
    ...overrides,
  };
}

function makeVoiceEvent(id: string, transcript: string, timestamp: string, opts?: {
  event_types?: string[];
  tags?: string[];
  review_state?: string;
  structured_data?: Record<string, unknown>;
}) {
  return {
    id,
    raw_transcript: transcript,
    cleaned_transcript: null,
    event_timestamp: timestamp,
    event_types: opts?.event_types ?? ['everyday'],
    event_subtypes: [],
    tags: opts?.tags ?? [],
    confidence: 0.8,
    stt_confidence: 0.9,
    medical_relevance: 'medium',
    review_state: opts?.review_state ?? 'auto_saved',
    parsing_status: 'complete',
    structured_data: opts?.structured_data ?? null,
    segments: null,
    session_id: null,
    related_entry_id: null,
    voice_note_id: null,
    source: 'voice',
    created_at: timestamp,
  };
}

function makePainEntry(id: number, date: string, painLevel: string, opts?: {
  time?: string;
  medications?: string[];
  me_cfs_severity_level?: string;
  notes?: string;
}) {
  return {
    id,
    selected_date: date,
    selected_time: opts?.time ?? '10:00:00',
    pain_level: painLevel,
    medications: opts?.medications ?? null,
    medication_ids: null,
    notes: opts?.notes ?? null,
    pain_locations: ['rechts'],
    aura_type: 'keine',
    me_cfs_severity_level: opts?.me_cfs_severity_level ?? 'none',
    entry_kind: 'migraine',
    voice_note_id: null,
    timestamp_created: `${date}T${opts?.time ?? '10:00:00'}`,
  };
}

function makeMedIntake(id: string, date: string, name: string, entryId: number, time?: string) {
  return {
    id,
    medication_name: name,
    medication_id: null,
    entry_id: entryId,
    taken_date: date,
    taken_time: time ?? '10:30:00',
    dose_quarters: 4,
  };
}

function makeMinimalValidResult(overrides?: Record<string, unknown>) {
  return {
    summary: 'Kurze Zusammenfassung der Beobachtungen.',
    scope: { fromDate: '2025-01-01', toDate: '2025-01-07', totalDays: 7, daysAnalyzed: 7, voiceEventCount: 5, painEntryCount: 3, medicationIntakeCount: 1 },
    possiblePatterns: [],
    painContextFindings: [],
    fatigueContextFindings: [],
    medicationContextFindings: [],
    recurringSequences: [],
    openQuestions: ['Zu wenig Daten für Schlafmuster'],
    confidenceNotes: ['Nur 7 Tage analysiert'],
    ...overrides,
  };
}

// ============================================================
// === VALIDATION TESTS ===
// ============================================================

describe('validateAnalysisResult', () => {
  it('returns null for non-object', () => {
    expect(validateAnalysisResult(null)).toBeNull();
    expect(validateAnalysisResult('string')).toBeNull();
    expect(validateAnalysisResult(42)).toBeNull();
    expect(validateAnalysisResult(undefined)).toBeNull();
  });

  it('returns null for missing required fields', () => {
    expect(validateAnalysisResult({ summary: 'ok' })).toBeNull();
    expect(validateAnalysisResult({
      summary: 'ok',
      scope: {},
      possiblePatterns: [],
    })).toBeNull();
  });

  it('returns null for too-short summary', () => {
    expect(validateAnalysisResult(makeMinimalValidResult({ summary: 'ab' }))).toBeNull();
    expect(validateAnalysisResult(makeMinimalValidResult({ summary: '' }))).toBeNull();
  });

  it('accepts a valid minimal result', () => {
    const result = validateAnalysisResult(makeMinimalValidResult());
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Kurze Zusammenfassung der Beobachtungen.');
    expect(result!.openQuestions).toHaveLength(1);
  });

  it('filters out empty/broken patterns', () => {
    const input = makeMinimalValidResult({
      possiblePatterns: [
        { title: '', description: '' },  // should be filtered
        { title: 'Valid', description: 'OK', patternType: 'trigger_candidate', evidenceStrength: 'medium', occurrences: 2, examples: [], uncertaintyNotes: [] },
        null,  // should be filtered
        42,    // should be filtered
      ],
    });
    const result = validateAnalysisResult(input);
    expect(result).not.toBeNull();
    expect(result!.possiblePatterns).toHaveLength(1);
    expect(result!.possiblePatterns[0].title).toBe('Valid');
  });

  it('sanitizes invalid evidenceStrength to low', () => {
    const input = makeMinimalValidResult({
      possiblePatterns: [{
        title: 'Test', description: 'Desc',
        evidenceStrength: 'super_high',  // invalid
        patternType: 'unknown_type',     // invalid
        occurrences: -5,                  // invalid
        examples: [42, null, 'valid'],   // mixed
        uncertaintyNotes: [{ reason: 'Test', code: 'invalid_code' }],
      }],
    });
    const result = validateAnalysisResult(input);
    expect(result!.possiblePatterns[0].evidenceStrength).toBe('low');
    expect(result!.possiblePatterns[0].patternType).toBe('other');
    expect(result!.possiblePatterns[0].occurrences).toBe(1); // -5 -> 1
    expect(result!.possiblePatterns[0].examples).toEqual(['valid']);
    expect(result!.possiblePatterns[0].uncertaintyNotes[0].code).toBe('incomplete_data'); // fallback code
  });

  it('filters empty context findings', () => {
    const input = makeMinimalValidResult({
      painContextFindings: [
        { observation: '', frequency: 'often', examples: [], evidenceStrength: 'high' },  // empty obs -> filtered
        { observation: 'Valid finding', frequency: 'sometimes', examples: ['ex1'], evidenceStrength: 'medium' },
      ],
    });
    const result = validateAnalysisResult(input);
    expect(result!.painContextFindings).toHaveLength(1);
    expect(result!.painContextFindings[0].observation).toBe('Valid finding');
  });

  it('sanitizes scope fields', () => {
    const input = makeMinimalValidResult({
      scope: { fromDate: 123, toDate: null, totalDays: 'seven' },
    });
    const result = validateAnalysisResult(input);
    expect(result!.scope.fromDate).toBe('');
    expect(result!.scope.toDate).toBe('');
    expect(result!.scope.totalDays).toBe(0);
  });

  it('validates a full result with patterns', () => {
    const input = makeMinimalValidResult({
      possiblePatterns: [
        {
          patternType: 'trigger_candidate',
          title: 'Licht → Kopfschmerz',
          description: 'Mehrfach wurde Lichtexposition vor Schmerzbeginn erwähnt.',
          evidenceStrength: 'medium',
          occurrences: 3,
          examples: ['2025-01-03: Licht im Supermarkt'],
          uncertaintyNotes: [{ reason: 'Nur 3 Beobachtungen', code: 'few_data_points' }],
        },
        {
          patternType: 'pem_pattern',
          title: 'Duschen → Erschöpfung',
          description: 'An 4 Tagen folgte auf Duschen eine ausgeprägte Erschöpfungsphase.',
          evidenceStrength: 'medium',
          occurrences: 4,
          examples: ['2025-01-05: geduscht → komplett platt'],
          uncertaintyNotes: [{ reason: 'Keine Bestätigung', code: 'unclear_causation' }],
        },
      ],
      painContextFindings: [
        { observation: 'Lichtreize vor Schmerz', frequency: '3 von 8 Tagen', examples: ['01-03'], evidenceStrength: 'medium' },
      ],
      fatigueContextFindings: [
        { observation: 'Duschen vor Erschöpfung', frequency: '4 von 6 Tagen', examples: ['01-05'], evidenceStrength: 'medium' },
      ],
      medicationContextFindings: [
        { observation: 'Triptan nach starkem Schmerz', frequency: 'bei allen 4 Einnahmen', examples: ['01-03'], evidenceStrength: 'high' },
      ],
      recurringSequences: [
        { pattern: 'exertion → fatigue → rest', count: 3, llmInterpretation: 'Belastung-Erschöpfung-Ruhe' },
      ],
      meta: { model: 'gemini-2.5-flash', analyzedAt: '2025-01-15T10:00:00Z', promptTokenEstimate: 2000, analysisVersion: '1.0.0' },
    });

    const result = validateAnalysisResult(input);
    expect(result).not.toBeNull();
    expect(result!.possiblePatterns).toHaveLength(2);
    expect(result!.possiblePatterns[0].patternType).toBe('trigger_candidate');
    expect(result!.possiblePatterns[1].patternType).toBe('pem_pattern');
    expect(result!.painContextFindings).toHaveLength(1);
    expect(result!.fatigueContextFindings).toHaveLength(1);
    expect(result!.medicationContextFindings).toHaveLength(1);
    expect(result!.recurringSequences).toHaveLength(1);
    expect(result!.confidenceNotes).toHaveLength(1);
  });

  it('preserves uncertainty notes', () => {
    const input = makeMinimalValidResult({
      possiblePatterns: [{
        patternType: 'trigger_candidate',
        title: 'Kaffee → Kopf',
        description: 'Beschreibung',
        evidenceStrength: 'low',
        occurrences: 2,
        examples: [],
        uncertaintyNotes: [
          { reason: 'Nur 2 Beobachtungen', code: 'few_data_points' },
          { reason: 'Zeitlicher Abstand variiert stark', code: 'ambiguous_timing' },
        ],
      }],
    });
    const result = validateAnalysisResult(input);
    expect(result!.possiblePatterns[0].uncertaintyNotes).toHaveLength(2);
    expect(result!.possiblePatterns[0].uncertaintyNotes[0].code).toBe('few_data_points');
  });

  it('filters broken uncertainty notes', () => {
    const input = makeMinimalValidResult({
      possiblePatterns: [{
        patternType: 'other',
        title: 'Test',
        description: 'Desc',
        evidenceStrength: 'low',
        occurrences: 1,
        examples: [],
        uncertaintyNotes: [
          { reason: '', code: 'few_data_points' },       // empty reason -> filtered
          { reason: 'Valid', code: 'few_data_points' },   // kept
          42,                                              // filtered
          null,                                            // filtered
        ],
      }],
    });
    const result = validateAnalysisResult(input);
    expect(result!.possiblePatterns[0].uncertaintyNotes).toHaveLength(1);
  });

  it('filters recurring sequences with empty pattern', () => {
    const input = makeMinimalValidResult({
      recurringSequences: [
        { pattern: '', count: 2, llmInterpretation: 'x' },
        { pattern: 'valid → seq', count: 3, llmInterpretation: 'interpretation' },
      ],
    });
    const result = validateAnalysisResult(input);
    expect(result!.recurringSequences).toHaveLength(1);
    expect(result!.recurringSequences[0].pattern).toBe('valid → seq');
  });
});

// ============================================================
// === isAnalysisUnavailable ===
// ============================================================

describe('isAnalysisUnavailable', () => {
  it('detects error placeholder', () => {
    const result = validateAnalysisResult(makeMinimalValidResult({
      meta: { model: 'none', analyzedAt: '2025-01-01', promptTokenEstimate: 0, analysisVersion: '1.0.0', error: true, errorReason: 'test' },
    }));
    expect(result).not.toBeNull();
    expect(isAnalysisUnavailable(result!)).toBe(true);
  });

  it('detects zero daysAnalyzed', () => {
    const result = validateAnalysisResult(makeMinimalValidResult({
      scope: { fromDate: '2025-01-01', toDate: '2025-01-07', totalDays: 7, daysAnalyzed: 0, voiceEventCount: 0, painEntryCount: 0, medicationIntakeCount: 0 },
    }));
    expect(result).not.toBeNull();
    expect(isAnalysisUnavailable(result!)).toBe(true);
  });

  it('returns false for real analysis', () => {
    const result = validateAnalysisResult(makeMinimalValidResult());
    expect(result).not.toBeNull();
    expect(isAnalysisUnavailable(result!)).toBe(false);
  });
});

// ============================================================
// === TOKEN ESTIMATION ===
// ============================================================

describe('estimateTokens', () => {
  it('estimates roughly 1 token per 4 chars', () => {
    expect(estimateTokens('1234')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ============================================================
// === PROMPT CONSTRUCTION TESTS ===
// ============================================================

describe('prompt construction (serializeForLLM)', () => {
  it('includes pain context windows in serialized output', () => {
    const dataset = makeDataset({
      voiceEvents: [
        makeVoiceEvent('v1', 'Kaffee getrunken', '2025-01-05T08:00:00', { event_types: ['food_drink'] }),
        makeVoiceEvent('v2', 'Licht im Büro schlimm', '2025-01-05T09:00:00', { event_types: ['environment'] }),
      ],
      painEntries: [
        makePainEntry(1, '2025-01-05', 'stark', { time: '11:00:00' }),
      ],
      meta: {
        range: { from: new Date('2025-01-01'), to: new Date('2025-01-07') },
        voiceEventCount: 2, painEntryCount: 1, medicationIntakeCount: 0,
        linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 2,
      },
    });

    const ctx = buildAnalysisContext(dataset);
    const serialized = serializeForLLM(ctx);

    expect(serialized).toContain('Kaffee getrunken');
    expect(serialized).toContain('Licht im Büro schlimm');
    expect(serialized).toContain('Schmerz-Kontextfenster');
    expect(serialized).toContain('Vorher');
  });

  it('includes ME/CFS signals in serialized output', () => {
    const dataset = makeDataset({
      voiceEvents: [
        makeVoiceEvent('v1', 'War eben duschen', '2025-01-05T09:00:00', { event_types: ['activity'] }),
        makeVoiceEvent('v2', 'Komplett platt jetzt', '2025-01-05T09:30:00', {
          event_types: ['mecfs_exertion'],
          tags: ['mecfs_state'],
          structured_data: { mecfsSignals: { state: 'erschöpft', severity: 'severe' } },
        }),
      ],
      meta: {
        range: { from: new Date('2025-01-01'), to: new Date('2025-01-07') },
        voiceEventCount: 2, painEntryCount: 0, medicationIntakeCount: 0,
        linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 2,
      },
    });

    const ctx = buildAnalysisContext(dataset);
    const serialized = serializeForLLM(ctx);

    expect(serialized).toContain('ME/CFS-Signale vorhanden');
    expect(serialized).toContain('War eben duschen');
    expect(serialized).toContain('Komplett platt jetzt');
  });

  it('includes medication context in serialized output', () => {
    const dataset = makeDataset({
      painEntries: [makePainEntry(1, '2025-01-05', 'stark', { time: '10:00:00', medications: ['Sumatriptan'] })],
      medicationIntakes: [makeMedIntake('m1', '2025-01-05', 'Sumatriptan', 1, '10:30:00')],
      meta: {
        range: { from: new Date('2025-01-01'), to: new Date('2025-01-07') },
        voiceEventCount: 0, painEntryCount: 1, medicationIntakeCount: 1,
        linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 0,
      },
    });

    const ctx = buildAnalysisContext(dataset);
    const serialized = serializeForLLM(ctx);

    expect(serialized).toContain('Sumatriptan');
    expect(serialized).toContain('Medikation eingenommen');
  });

  it('produces multi-day context for LLM', () => {
    const dataset = makeDataset({
      voiceEvents: [
        makeVoiceEvent('v1', 'Schlecht geschlafen', '2025-01-05T07:00:00', { event_types: ['sleep_rest'] }),
        makeVoiceEvent('v2', 'Termin beim Arzt', '2025-01-05T14:00:00', { event_types: ['activity'] }),
        makeVoiceEvent('v3', 'Abends erschöpft', '2025-01-05T20:00:00', { event_types: ['mecfs_exertion'], tags: ['mecfs_state'], structured_data: { mecfsSignals: {} } }),
        makeVoiceEvent('v4', 'Brain Fog seit heute Morgen', '2025-01-06T09:00:00', { event_types: ['mecfs_exertion'], tags: ['mecfs_state'], structured_data: { mecfsSignals: {} } }),
        makeVoiceEvent('v5', 'Kurzer Spaziergang', '2025-01-06T11:00:00', { event_types: ['activity'] }),
        makeVoiceEvent('v6', 'Danach matschig', '2025-01-06T11:30:00', { event_types: ['mecfs_exertion'], tags: ['mecfs_state'], structured_data: { mecfsSignals: {} } }),
      ],
      painEntries: [
        makePainEntry(1, '2025-01-06', 'mittel', { time: '15:00:00', notes: 'Kopfdruck' }),
      ],
      meta: {
        range: { from: new Date('2025-01-05'), to: new Date('2025-01-06') },
        voiceEventCount: 6, painEntryCount: 1, medicationIntakeCount: 0,
        linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 6,
      },
    });

    const ctx = buildAnalysisContext(dataset);
    expect(ctx.meta.totalDays).toBe(2);
    expect(ctx.days).toHaveLength(2);

    const serialized = serializeForLLM(ctx);
    expect(serialized).toContain('2025-01-05');
    expect(serialized).toContain('2025-01-06');
    expect(serialized).toContain('Schlecht geschlafen');
    expect(serialized).toContain('Brain Fog seit heute Morgen');
    expect(serialized).toContain('Phasen:');
  });
});

// ============================================================
// === EDGE FUNCTION ERROR RESPONSE HANDLING ===
// ============================================================

describe('unavailable result handling', () => {
  it('validates an unavailable/error result from edge function', () => {
    const errorResponse = {
      summary: 'Die Analyse konnte nicht durchgeführt werden: Timeout',
      possiblePatterns: [],
      painContextFindings: [],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      recurringSequences: [],
      openQuestions: [],
      confidenceNotes: ['Timeout'],
      scope: { fromDate: '2025-01-01', toDate: '2025-01-07', totalDays: 7, daysAnalyzed: 0, voiceEventCount: 5, painEntryCount: 3, medicationIntakeCount: 1 },
      meta: { model: 'none', analyzedAt: '2025-01-15T10:00:00Z', promptTokenEstimate: 0, analysisVersion: '1.0.0', error: true, errorReason: 'Timeout' },
    };

    const result = validateAnalysisResult(errorResponse);
    expect(result).not.toBeNull();
    expect(isAnalysisUnavailable(result!)).toBe(true);
    expect(result!.meta.error).toBe(true);
    expect(result!.meta.errorReason).toBe('Timeout');
  });

  it('validates thin-data result', () => {
    const thinResult = {
      summary: 'Die Analyse konnte nicht durchgeführt werden: Zu wenig Daten.',
      possiblePatterns: [],
      painContextFindings: [],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      recurringSequences: [],
      openQuestions: [],
      confidenceNotes: ['Zu wenig Daten für eine sinnvolle Analyse.'],
      scope: { fromDate: '2025-01-01', toDate: '2025-01-07', totalDays: 7, daysAnalyzed: 0, voiceEventCount: 0, painEntryCount: 0, medicationIntakeCount: 0 },
      meta: { model: 'none', analyzedAt: '2025-01-15', promptTokenEstimate: 0, analysisVersion: '1.0.0', error: true, errorReason: 'insufficient_data' },
    };

    const result = validateAnalysisResult(thinResult);
    expect(result).not.toBeNull();
    expect(isAnalysisUnavailable(result!)).toBe(true);
  });
});

// ============================================================
// === CONTEXT SIZE TESTS ===
// ============================================================

describe('context size handling', () => {
  it('estimateTokens handles large texts', () => {
    const largeText = 'a'.repeat(120_000);
    expect(estimateTokens(largeText)).toBe(30_000);
  });

  it('serialized output grows with more events', () => {
    const smallDataset = makeDataset({
      voiceEvents: [makeVoiceEvent('v1', 'Eintrag 1', '2025-01-05T08:00:00')],
      meta: { range: { from: new Date('2025-01-05'), to: new Date('2025-01-05') }, voiceEventCount: 1, painEntryCount: 0, medicationIntakeCount: 0, contextNoteCount: 0, linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 1 },
    });

    const largeVoiceEvents = Array.from({ length: 50 }, (_, i) =>
      makeVoiceEvent(`v${i}`, `Eintrag Nummer ${i} mit mehr Text drin`, `2025-01-05T${String(8 + (i % 12)).padStart(2, '0')}:00:00`)
    );
    const largeDataset = makeDataset({
      voiceEvents: largeVoiceEvents,
      meta: { range: { from: new Date('2025-01-05'), to: new Date('2025-01-05') }, voiceEventCount: 50, painEntryCount: 0, medicationIntakeCount: 0, contextNoteCount: 0, linkedVoiceEventCount: 0, unlinkedVoiceEventCount: 50 },
    });

    const smallSerialized = serializeForLLM(buildAnalysisContext(smallDataset));
    const largeSerialized = serializeForLLM(buildAnalysisContext(largeDataset));

    expect(largeSerialized.length).toBeGreaterThan(smallSerialized.length);
  });
});
