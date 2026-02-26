/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Integration Tests — Data Source Mapper + Day Features + Text Generator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { mapToResolverInput } from '../dataSourceMapper';
import { buildProphylaxisDayFeatures } from '../dayFeatures';
import { resolveDoseEvents } from '../cgrpDoseResolver';
import { computeProphylaxisAnalysis } from '../prePostAnalysis';
import { generateProphylaxisTextBlock, buildProphylaxisPdfData } from '../textGenerator';
import type { RawPainEntry, RawReminder, RawReminderCompletion } from '../dataSourceMapper';

// ─── Fixtures ───────────────────────────────────────────────────────────

const makeEntry = (id: number, date: string, meds: string[], painLevel: string, notes?: string): RawPainEntry => ({
  id,
  medications: meds,
  selected_date: date,
  selected_time: '10:00',
  timestamp_created: `${date}T10:00:00Z`,
  notes: notes || null,
  pain_level: painLevel,
});

const makeReminder = (id: string, title: string, meds: string[], dateTime: string): RawReminder => ({
  id,
  title,
  medications: meds,
  date_time: dateTime,
  status: 'done',
  type: 'medication',
});

const makeCompletion = (reminderId: string, takenAt: string): RawReminderCompletion => ({
  id: `comp-${reminderId}`,
  reminder_id: reminderId,
  medication_name: 'Ajovy',
  scheduled_at: takenAt,
  taken_at: takenAt,
});

// ─── Data Source Mapper ─────────────────────────────────────────────────

describe('mapToResolverInput', () => {
  it('maps pain entries to diary records correctly', () => {
    const input = mapToResolverInput({
      drug: 'ajovy',
      painEntries: [
        makeEntry(1, '2026-01-15', ['Ajovy 225mg', 'Ibuprofen'], '5'),
        makeEntry(2, '2026-01-16', ['Ibuprofen'], '3'),
      ],
      medicationIntakes: [],
      reminders: [],
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-01-01',
      timeRangeEndBerlin: '2026-02-28',
    });

    expect(input.drug).toBe('ajovy');
    expect(input.drugNames).toContain('ajovy');
    expect(input.drugNames).toContain('fremanezumab');
    expect(input.diaryEntries).toHaveLength(2);
    expect(input.diaryEntries[0].dateKeyBerlin).toBe('2026-01-15');
    expect(input.diaryEntries[0].medicationNames).toContain('Ajovy 225mg');
  });

  it('maps reminders and completions', () => {
    const input = mapToResolverInput({
      drug: 'ajovy',
      painEntries: [],
      medicationIntakes: [],
      reminders: [makeReminder('r1', 'Ajovy Injektion', ['Ajovy'], '2026-01-20T10:00:00Z')],
      reminderCompletions: [makeCompletion('r1', '2026-01-20T11:00:00Z')],
      timeRangeStartBerlin: '2026-01-01',
      timeRangeEndBerlin: '2026-02-28',
    });

    expect(input.reminders).toHaveLength(1);
    expect(input.reminderCompletions).toHaveLength(1);
    expect(input.reminderCompletions[0].completedDateKeyBerlin).toBe('2026-01-20');
  });

  it('filters non-medication reminders', () => {
    const input = mapToResolverInput({
      drug: 'ajovy',
      painEntries: [],
      medicationIntakes: [],
      reminders: [{
        id: 'r1', title: 'Arzttermin', medications: [], date_time: '2026-01-20T10:00:00Z',
        status: 'pending', type: 'appointment',
      }],
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-01-01',
      timeRangeEndBerlin: '2026-02-28',
    });

    expect(input.reminders).toHaveLength(0);
  });
});

// ─── Day Features ───────────────────────────────────────────────────────

describe('buildProphylaxisDayFeatures', () => {
  it('marks entries as documented (even pain_level none)', () => {
    const features = buildProphylaxisDayFeatures({
      painEntries: [
        makeEntry(1, '2026-01-15', [], 'none'),
        makeEntry(2, '2026-01-16', ['Ibuprofen'], '5'),
      ],
      rangeStartBerlin: '2026-01-01',
      rangeEndBerlin: '2026-01-31',
    });

    expect(features.get('2026-01-15')?.documented).toBe(true);
    expect(features.get('2026-01-15')?.hadHeadache).toBe(false);
    expect(features.get('2026-01-16')?.documented).toBe(true);
    expect(features.get('2026-01-16')?.hadHeadache).toBe(true);
    expect(features.get('2026-01-16')?.painMax).toBe(5);
  });

  it('merges multiple entries per day (max pain)', () => {
    const features = buildProphylaxisDayFeatures({
      painEntries: [
        makeEntry(1, '2026-01-15', ['Ibuprofen'], '3'),
        makeEntry(2, '2026-01-15', ['Sumatriptan'], '7'),
      ],
      rangeStartBerlin: '2026-01-01',
      rangeEndBerlin: '2026-01-31',
    });

    const day = features.get('2026-01-15')!;
    expect(day.painMax).toBe(7);
    expect(day.acuteMedCount).toBe(2);
  });

  it('excludes prophylaxis meds from acute med count', () => {
    const features = buildProphylaxisDayFeatures({
      painEntries: [
        makeEntry(1, '2026-01-15', ['Ajovy 225mg', 'Ibuprofen'], '5'),
      ],
      rangeStartBerlin: '2026-01-01',
      rangeEndBerlin: '2026-01-31',
    });

    const day = features.get('2026-01-15')!;
    expect(day.acuteMedCount).toBe(1); // only Ibuprofen
    expect(day.acuteMedTaken).toBe(true);
  });

  it('filters entries outside range', () => {
    const features = buildProphylaxisDayFeatures({
      painEntries: [
        makeEntry(1, '2025-12-31', ['Ibuprofen'], '5'),
        makeEntry(2, '2026-01-15', ['Ibuprofen'], '3'),
      ],
      rangeStartBerlin: '2026-01-01',
      rangeEndBerlin: '2026-01-31',
    });

    expect(features.has('2025-12-31')).toBe(false);
    expect(features.has('2026-01-15')).toBe(true);
  });
});

// ─── End-to-End: Mapper → Resolver → DayFeatures → Analysis → Text ─────

describe('E2E: High confidence scenario (diary entry)', () => {
  const entries: RawPainEntry[] = [
    // Pre-window: headache days
    makeEntry(1, '2026-02-19', ['Ibuprofen'], '7'),
    makeEntry(2, '2026-02-20', ['Sumatriptan'], '8'),
    makeEntry(3, '2026-02-21', ['Ibuprofen'], '6'),
    makeEntry(4, '2026-02-22', [], 'none'),
    makeEntry(5, '2026-02-23', ['Ibuprofen'], '5'),
    makeEntry(6, '2026-02-24', [], '4'),
    makeEntry(7, '2026-02-25', ['Sumatriptan'], '7'),
    // Injection day
    makeEntry(8, '2026-02-26', ['Ajovy 225mg'], 'none'),
    // Post-window: fewer headaches
    makeEntry(9, '2026-02-27', [], 'none'),
    makeEntry(10, '2026-02-28', [], '3'),
    makeEntry(11, '2026-03-01', [], 'none'),
    makeEntry(12, '2026-03-02', [], 'none'),
    makeEntry(13, '2026-03-03', ['Ibuprofen'], '4'),
    makeEntry(14, '2026-03-04', [], 'none'),
    makeEntry(15, '2026-03-05', [], 'none'),
  ];

  it('produces correct analysis with improvement signal', () => {
    const resolverInput = mapToResolverInput({
      drug: 'ajovy',
      painEntries: entries,
      medicationIntakes: [],
      reminders: [],
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-02-01',
      timeRangeEndBerlin: '2026-03-31',
    });

    const doseEvents = resolveDoseEvents(resolverInput);
    expect(doseEvents).toHaveLength(1);
    expect(doseEvents[0].confidence).toBe(1.0);
    expect(doseEvents[0].primarySource).toBe('diary_medication_entry');
    expect(doseEvents[0].dateKeyBerlin).toBe('2026-02-26');

    const dayFeatures = buildProphylaxisDayFeatures({
      painEntries: entries,
      rangeStartBerlin: '2026-02-01',
      rangeEndBerlin: '2026-03-31',
    });

    const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);

    expect(analysis.evidenceSummary.countDoseEvents).toBe(1);
    expect(analysis.evidenceSummary.bestConfidence).toBe(1.0);
    expect(analysis.comparisons).toHaveLength(1);

    const comp = analysis.comparisons[0];
    // Pre: 6/7 headache days (all documented, 6 with headache)
    expect(comp.pre.documentedDays).toBe(7);
    expect(comp.pre.headacheDays).toBe(6);
    // Post: 2/7 headache days
    expect(comp.post.documentedDays).toBe(7);
    expect(comp.post.headacheDays).toBe(2);
    // Delta should be negative (improvement)
    expect(comp.delta.headacheRate).toBeLessThan(0);
  });

  it('generates truthful text with improvement signal', () => {
    const resolverInput = mapToResolverInput({
      drug: 'ajovy',
      painEntries: entries,
      medicationIntakes: [],
      reminders: [],
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-02-01',
      timeRangeEndBerlin: '2026-03-31',
    });

    const doseEvents = resolveDoseEvents(resolverInput);
    const dayFeatures = buildProphylaxisDayFeatures({
      painEntries: entries,
      rangeStartBerlin: '2026-02-01',
      rangeEndBerlin: '2026-03-31',
    });
    const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);
    const textBlock = generateProphylaxisTextBlock(analysis, 'Ajovy');

    expect(textBlock.title).toBe('Prophylaxe (Ajovy)');
    expect(textBlock.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(textBlock.paragraphs.some(p => p.includes('Besserung'))).toBe(true);
    expect(textBlock.paragraphs.some(p => p.includes('Tagebuch'))).toBe(true);
    expect(textBlock.warnings).toHaveLength(0);

    // PDF data
    const pdfData = buildProphylaxisPdfData(analysis, 'Ajovy');
    expect(pdfData).not.toBeNull();
    expect(pdfData!.injectionRows).toHaveLength(1);
    expect(pdfData!.injectionRows[0].confidence).toBe('hoch');
    expect(pdfData!.prePostRows.length).toBeGreaterThan(0);
  });
});

describe('E2E: Low confidence scenario (scheduled-only)', () => {
  const entries: RawPainEntry[] = [
    // Some diary entries but NO ajovy in meds
    makeEntry(1, '2026-02-19', ['Ibuprofen'], '5'),
    makeEntry(2, '2026-02-20', [], '4'),
    makeEntry(3, '2026-02-27', [], '3'),
    makeEntry(4, '2026-02-28', [], 'none'),
  ];

  const reminders: RawReminder[] = [
    makeReminder('r1', 'Ajovy Spritze', ['Ajovy'], '2026-02-23T10:00:00Z'),
  ];

  it('produces low confidence dose event with warning', () => {
    const resolverInput = mapToResolverInput({
      drug: 'ajovy',
      painEntries: entries,
      medicationIntakes: [],
      reminders,
      reminderCompletions: [], // NOT completed
      timeRangeStartBerlin: '2026-02-01',
      timeRangeEndBerlin: '2026-03-31',
    });

    const doseEvents = resolveDoseEvents(resolverInput);
    expect(doseEvents).toHaveLength(1);
    expect(doseEvents[0].primarySource).toBe('reminder_scheduled');
    expect(doseEvents[0].confidence).toBeLessThanOrEqual(0.6);

    const dayFeatures = buildProphylaxisDayFeatures({
      painEntries: entries,
      rangeStartBerlin: '2026-02-01',
      rangeEndBerlin: '2026-03-31',
    });

    const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);
    const textBlock = generateProphylaxisTextBlock(analysis, 'Ajovy');

    // Must have low-confidence warning
    expect(textBlock.warnings.some(w => w.includes('geschätzt') || w.includes('nicht bestätigt'))).toBe(true);
    // Must NOT make strong claims
    expect(textBlock.paragraphs.every(p => !p.startsWith('Es zeigt sich'))).toBe(true);
  });

  it('PDF data includes low-confidence note', () => {
    const resolverInput = mapToResolverInput({
      drug: 'ajovy',
      painEntries: entries,
      medicationIntakes: [],
      reminders,
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-02-01',
      timeRangeEndBerlin: '2026-03-31',
    });

    const doseEvents = resolveDoseEvents(resolverInput);
    const dayFeatures = buildProphylaxisDayFeatures({
      painEntries: entries,
      rangeStartBerlin: '2026-02-01',
      rangeEndBerlin: '2026-03-31',
    });
    const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);
    const pdfData = buildProphylaxisPdfData(analysis, 'Ajovy');

    expect(pdfData).not.toBeNull();
    expect(pdfData!.notes.some(n => n.includes('geschätzt'))).toBe(true);
    expect(pdfData!.injectionRows[0].confidence).not.toBe('hoch');
  });
});

describe('E2E: No evidence at all', () => {
  it('returns empty analysis with correct text', () => {
    const resolverInput = mapToResolverInput({
      drug: 'ajovy',
      painEntries: [makeEntry(1, '2026-02-15', ['Ibuprofen'], '5')],
      medicationIntakes: [],
      reminders: [],
      reminderCompletions: [],
      timeRangeStartBerlin: '2026-02-01',
      timeRangeEndBerlin: '2026-02-28',
    });

    const doseEvents = resolveDoseEvents(resolverInput);
    expect(doseEvents).toHaveLength(0);

    const dayFeatures = buildProphylaxisDayFeatures({
      painEntries: [makeEntry(1, '2026-02-15', ['Ibuprofen'], '5')],
      rangeStartBerlin: '2026-02-01',
      rangeEndBerlin: '2026-02-28',
    });

    const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);
    const textBlock = generateProphylaxisTextBlock(analysis, 'Ajovy');

    expect(textBlock.paragraphs[0]).toContain('Keine dokumentierten');
    expect(textBlock.injectionSummaries).toHaveLength(0);

    const pdfData = buildProphylaxisPdfData(analysis, 'Ajovy');
    expect(pdfData).toBeNull();
  });
});
