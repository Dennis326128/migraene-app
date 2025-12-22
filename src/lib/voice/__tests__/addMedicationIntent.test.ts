/**
 * Unit tests for ADD_MEDICATION intent classification and parsing
 */

import { describe, it, expect } from 'vitest';
import { isAddMedicationTrigger, parseAddMedicationCommand } from '../germanParser';
import { analyzeVoiceTranscript } from '../voiceNlp';
import type { VoiceUserContext } from '@/types/voice.types';

const emptyContext: VoiceUserContext = {
  userMeds: [],
};

describe('isAddMedicationTrigger', () => {
  it('matches "füge ... hinzu" pattern', () => {
    expect(isAddMedicationTrigger('füge ein medikament testmedikament hinzu')).toBe(true);
    expect(isAddMedicationTrigger('ich füge sumatriptan 50 mg hinzu')).toBe(true);
  });

  it('matches "lege ... an" pattern', () => {
    expect(isAddMedicationTrigger('lege sumatriptan an')).toBe(true);
    expect(isAddMedicationTrigger('leg ein neues medikament an')).toBe(true);
  });

  it('matches "neues medikament" pattern', () => {
    expect(isAddMedicationTrigger('neues medikament ibuprofen 400mg')).toBe(true);
  });

  it('does NOT match pain entry sentences', () => {
    // These should still return true for trigger, but intent classification should handle priority
    expect(isAddMedicationTrigger('schmerzstärke 8 sumatriptan genommen')).toBe(false);
    expect(isAddMedicationTrigger('vor 10 minuten kopfschmerz 7')).toBe(false);
  });
});

describe('parseAddMedicationCommand', () => {
  it('extracts name and strength from "füge testmedikament 20 mg hinzu"', () => {
    const result = parseAddMedicationCommand('ich füge ein medikament testmedikament hinzu mit 20 milligramm');
    expect(result).not.toBeNull();
    expect(result?.displayName).toMatch(/testmedikament/i);
    expect(result?.strengthValue).toBe(20);
    expect(result?.strengthUnit).toBe('mg');
  });

  it('extracts name and strength from "füge sumatriptan 50 mg hinzu"', () => {
    const result = parseAddMedicationCommand('füge sumatriptan 50 mg hinzu');
    expect(result).not.toBeNull();
    expect(result?.name).toContain('sumatriptan');
    expect(result?.strengthValue).toBe(50);
    expect(result?.strengthUnit).toBe('mg');
  });

  it('extracts name without strength from "neues medikament xyz"', () => {
    const result = parseAddMedicationCommand('neues medikament xyz');
    expect(result).not.toBeNull();
    expect(result?.displayName).toMatch(/xyz/i);
    expect(result?.strengthValue).toBeUndefined();
  });

  it('returns null for non-add-medication text', () => {
    const result = parseAddMedicationCommand('schmerzstärke 8 sumatriptan genommen');
    expect(result).toBeNull();
  });
});

describe('Intent Classification - ADD_MEDICATION vs PAIN_ENTRY', () => {
  it('classifies "füge medikament X hinzu" as add_medication', () => {
    const result = analyzeVoiceTranscript(
      'füge ein medikament testmedikament hinzu mit 20 milligramm',
      emptyContext
    );
    expect(result.intent).toBe('add_medication');
  });

  it('classifies "füge sumatriptan 50 mg hinzu" as add_medication', () => {
    const result = analyzeVoiceTranscript(
      'füge sumatriptan 50 mg hinzu',
      emptyContext
    );
    expect(result.intent).toBe('add_medication');
  });

  it('classifies "lege ibuprofen 400 an" as add_medication', () => {
    const result = analyzeVoiceTranscript(
      'lege ibuprofen 400 mg an',
      emptyContext
    );
    expect(result.intent).toBe('add_medication');
  });

  it('classifies "neues medikament aspirin" as add_medication', () => {
    const result = analyzeVoiceTranscript(
      'neues medikament aspirin',
      emptyContext
    );
    expect(result.intent).toBe('add_medication');
  });

  // Pain entry should still work
  it('classifies "vor zehn minuten schmerzstärke 8 sumatriptan" as pain_entry', () => {
    const result = analyzeVoiceTranscript(
      'vor zehn minuten schmerzstärke 8 sumatriptan',
      emptyContext
    );
    expect(result.intent).toBe('pain_entry');
  });

  it('classifies "schmerzstärke 8" as pain_entry', () => {
    const result = analyzeVoiceTranscript(
      'schmerzstärke 8',
      emptyContext
    );
    expect(result.intent).toBe('pain_entry');
  });

  it('classifies "kopfschmerz seit 2 stunden" as pain_entry', () => {
    const result = analyzeVoiceTranscript(
      'kopfschmerz seit 2 stunden',
      emptyContext
    );
    expect(result.intent).toBe('pain_entry');
  });

  it('classifies "sumatriptan genommen" as pain_entry (medication intake)', () => {
    const result = analyzeVoiceTranscript(
      'sumatriptan genommen',
      emptyContext
    );
    expect(result.intent).toBe('pain_entry');
  });
});

describe('ADD_MEDICATION payload extraction', () => {
  it('returns addMedication payload with correct data', () => {
    const result = analyzeVoiceTranscript(
      'füge sumatriptan 100 mg hinzu',
      emptyContext
    );
    expect(result.intent).toBe('add_medication');
    expect(result.addMedication).toBeDefined();
    expect(result.addMedication?.name).toContain('sumatriptan');
    expect(result.addMedication?.strengthValue).toBe(100);
    expect(result.addMedication?.strengthUnit).toBe('mg');
  });
});
