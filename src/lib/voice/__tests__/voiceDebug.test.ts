/**
 * Targeted debug test for K6-06 and K9-07 failures
 */
import { describe, it, expect, vi } from 'vitest';
import { parseVoiceEntry } from '../simpleVoiceParser';
import { GOLDEN_USER_MEDS } from './voiceGoldenDataset';

vi.mock('@/lib/tz', () => ({
  berlinDateToday: () => '2024-01-15'
}));

describe('Debug K6-06 and K9-07', () => {
  it('K6-06: "Trigger: wenig geschlafen und Stress im Büro"', () => {
    const result = parseVoiceEntry('Trigger: wenig geschlafen und Stress im Büro', GOLDEN_USER_MEDS);
    console.log('K6-06 result:', JSON.stringify({
      entry_type: result.entry_type,
      confidence: result.confidence,
      pain: result.pain_intensity,
      meds: result.medications.map(m => ({ name: m.name, confidence: m.confidence, matchType: m.matched_user_med })),
      note: result.note,
    }, null, 2));
    expect(result.entry_type).toBe('context_entry');
  });

  it('K9-07: "also äh wenig geschlafen und dann Stress"', () => {
    const result = parseVoiceEntry('also äh wenig geschlafen und dann Stress', GOLDEN_USER_MEDS);
    console.log('K9-07 result:', JSON.stringify({
      entry_type: result.entry_type,
      confidence: result.confidence,
      pain: result.pain_intensity,
      meds: result.medications.map(m => ({ name: m.name, confidence: m.confidence, matchType: m.matched_user_med })),
      note: result.note,
    }, null, 2));
    expect(result.entry_type).toBe('context_entry');
  });

  it('K10-18: "keine Tablette heute"', () => {
    const result = parseVoiceEntry('keine Tablette heute', GOLDEN_USER_MEDS);
    console.log('K10-18 result:', JSON.stringify({
      entry_type: result.entry_type,
      pain: result.pain_intensity,
      meds: result.medications.map(m => m.name),
      note: result.note,
    }, null, 2));
    expect(result.entry_type).toBe('context_entry');
  });

  it('K10-13: "kein Triptan genommen"', () => {
    const result = parseVoiceEntry('kein Triptan genommen', GOLDEN_USER_MEDS);
    console.log('K10-13 result:', JSON.stringify({
      entry_type: result.entry_type,
      pain: result.pain_intensity,
      meds: result.medications.map(m => ({ name: m.name, confidence: m.confidence })),
      note: result.note,
    }, null, 2));
    expect(result.medications.length).toBe(0);
  });

  it('K6-10: "leicht übel"', () => {
    const result = parseVoiceEntry('leicht übel', GOLDEN_USER_MEDS);
    console.log('K6-10 result:', JSON.stringify({
      entry_type: result.entry_type,
      pain: result.pain_intensity,
      note: result.note,
    }, null, 2));
    expect(result.note.length).toBeGreaterThan(0);
  });

  it('K2-16: "Schmerzstärke fünf"', () => {
    const result = parseVoiceEntry('Schmerzstärke fünf', GOLDEN_USER_MEDS);
    console.log('K2-16 result:', JSON.stringify({
      pain: result.pain_intensity,
      note: result.note,
    }, null, 2));
    expect(result.pain_intensity.value).toBe(5);
  });
});
