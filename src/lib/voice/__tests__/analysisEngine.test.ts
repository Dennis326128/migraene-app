import { describe, it, expect } from 'vitest';
import { validateAnalysisResult } from '../analysisTypes';
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
    meta: {
      range: { from: new Date('2025-01-01'), to: new Date('2025-01-07') },
      voiceEventCount: 0,
      painEntryCount: 0,
      medicationIntakeCount: 0,
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

// ============================================================
// === VALIDATION TESTS ===
// ============================================================

describe('validateAnalysisResult', () => {
  it('returns null for non-object', () => {
    expect(validateAnalysisResult(null)).toBeNull();
    expect(validateAnalysisResult('string')).toBeNull();
    expect(validateAnalysisResult(42)).toBeNull();
  });

  it('returns null for missing required fields', () => {
    expect(validateAnalysisResult({ summary: 'ok' })).toBeNull();
    expect(validateAnalysisResult({
      summary: 'ok',
      scope: {},
      possiblePatterns: [],
      // missing other arrays
    })).toBeNull();
  });

  it('accepts a valid minimal result', () => {
    const input = {
      summary: 'Kurze Zusammenfassung.',
      scope: { fromDate: '2025-01-01', toDate: '2025-01-07', totalDays: 7, daysAnalyzed: 7, voiceEventCount: 5, painEntryCount: 3, medicationIntakeCount: 1 },
      possiblePatterns: [],
      painContextFindings: [],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      recurringSequences: [],
      openQuestions: ['Zu wenig Daten für Schlafmuster'],
      confidenceNotes: ['Nur 7 Tage analysiert'],
    };
    const result = validateAnalysisResult(input);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Kurze Zusammenfassung.');
    expect(result!.openQuestions).toHaveLength(1);
  });

  it('validates a full result with patterns', () => {
    const input = {
      summary: 'Es zeigen sich mögliche Zusammenhänge.',
      scope: { fromDate: '2025-01-01', toDate: '2025-01-14', totalDays: 14, daysAnalyzed: 14, voiceEventCount: 20, painEntryCount: 8, medicationIntakeCount: 4 },
      possiblePatterns: [
        {
          patternType: 'trigger_candidate',
          title: 'Licht → Kopfschmerz',
          description: 'Mehrfach wurde Lichtexposition vor Schmerzbeginn erwähnt.',
          evidenceStrength: 'medium',
          occurrences: 3,
          examples: ['2025-01-03: Licht im Supermarkt, später Kopfdruck'],
          uncertaintyNotes: [{ reason: 'Nur 3 Beobachtungen', code: 'few_data_points' }],
        },
        {
          patternType: 'pem_pattern',
          title: 'Duschen → Erschöpfung',
          description: 'An 4 Tagen folgte auf Duschen eine ausgeprägte Erschöpfungsphase.',
          evidenceStrength: 'medium',
          occurrences: 4,
          examples: ['2025-01-05: geduscht → komplett platt'],
          uncertaintyNotes: [{ reason: 'Zeitliche Nähe, aber keine Bestätigung', code: 'unclear_causation' }],
        },
      ],
      painContextFindings: [
        { observation: 'Lichtreize treten häufig vor Schmerz auf', frequency: '3 von 8 Schmerztagen', examples: ['01-03', '01-07'], evidenceStrength: 'medium' },
      ],
      fatigueContextFindings: [
        { observation: 'Duschen geht Erschöpfung voraus', frequency: '4 von 6 ME/CFS-Tagen', examples: ['01-05', '01-09'], evidenceStrength: 'medium' },
      ],
      medicationContextFindings: [
        { observation: 'Triptan wird meist nach starkem Schmerz genommen', frequency: 'bei allen 4 Einnahmen', examples: ['01-03'], evidenceStrength: 'high' },
      ],
      recurringSequences: [
        { pattern: 'exertion → fatigue → rest', count: 3, llmInterpretation: 'Belastung-Erschöpfung-Ruhe-Zyklus beobachtet' },
      ],
      openQuestions: ['Schlafqualität nicht regelmäßig erfasst', 'Wettereinfluss unklar'],
      confidenceNotes: ['14 Tage Daten – Muster sind vorläufig', 'Nicht alle Tage dokumentiert'],
      meta: { model: 'gemini-2.5-flash', analyzedAt: '2025-01-15T10:00:00Z', promptTokenEstimate: 2000, analysisVersion: '1.0.0' },
    };

    const result = validateAnalysisResult(input);
    expect(result).not.toBeNull();
    expect(result!.possiblePatterns).toHaveLength(2);
    expect(result!.possiblePatterns[0].patternType).toBe('trigger_candidate');
    expect(result!.possiblePatterns[1].patternType).toBe('pem_pattern');
    expect(result!.painContextFindings).toHaveLength(1);
    expect(result!.fatigueContextFindings).toHaveLength(1);
    expect(result!.medicationContextFindings).toHaveLength(1);
    expect(result!.recurringSequences).toHaveLength(1);
    expect(result!.confidenceNotes).toHaveLength(2);
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
// === RESULT MAPPING TESTS ===
// ============================================================

describe('result structure integrity', () => {
  it('defaults missing fields gracefully', () => {
    const partial = {
      summary: 'Test',
      scope: {},
      possiblePatterns: [{ title: 'X' }],
      painContextFindings: [{ observation: 'Y' }],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      recurringSequences: [],
      openQuestions: [],
      confidenceNotes: [],
    };
    const result = validateAnalysisResult(partial);
    expect(result).not.toBeNull();
    expect(result!.possiblePatterns[0].evidenceStrength).toBe('low');
    expect(result!.possiblePatterns[0].uncertaintyNotes).toEqual([]);
    expect(result!.painContextFindings[0].evidenceStrength).toBe('low');
  });

  it('preserves uncertainty notes', () => {
    const input = {
      summary: 'Test',
      scope: {},
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
      painContextFindings: [],
      fatigueContextFindings: [],
      medicationContextFindings: [],
      openQuestions: [],
      confidenceNotes: ['Wenige Daten'],
    };
    const result = validateAnalysisResult(input);
    expect(result!.possiblePatterns[0].uncertaintyNotes).toHaveLength(2);
    expect(result!.possiblePatterns[0].uncertaintyNotes[0].code).toBe('few_data_points');
  });
});
