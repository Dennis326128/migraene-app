/**
 * Tests für Medication Update Voice Recognition
 */
import { describe, it, expect } from 'vitest';
import { analyzeVoiceTranscript } from '../voiceNlp';
import type { VoiceUserContext } from '@/types/voice.types';

const mockUserContext: VoiceUserContext = {
  userMeds: [
    { name: 'Topiramat' },
    { name: 'Metoprolol' },
    { name: 'Sumatriptan' },
    { name: 'Ibuprofen 400' },
    { name: 'Amitriptylin' },
  ],
  timezone: 'Europe/Berlin',
  language: 'de',
};

describe('Medication Update Intent Detection', () => {
  it('erkennt "Topiramat abgesetzt wegen Nebenwirkungen" als intolerance', () => {
    const result = analyzeVoiceTranscript(
      'Topiramat abgesetzt wegen Nebenwirkungen',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.intentConfidence).toBeGreaterThan(0.7);
    expect(result.medicationUpdate).toBeDefined();
    expect(result.medicationUpdate?.medicationName).toBe('Topiramat');
    expect(result.medicationUpdate?.action).toBe('intolerance');
    expect(result.medicationUpdate?.reason).toContain('nebenwirkung');
  });

  it('erkennt "Metoprolol nicht vertragen" als intolerance', () => {
    const result = analyzeVoiceTranscript(
      'Metoprolol nicht vertragen',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.medicationUpdate?.medicationName).toBe('Metoprolol');
    expect(result.medicationUpdate?.action).toBe('intolerance');
  });

  it('erkennt "Sumatriptan abgesetzt" als discontinued', () => {
    const result = analyzeVoiceTranscript(
      'Sumatriptan abgesetzt',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.medicationUpdate?.medicationName).toBe('Sumatriptan');
    expect(result.medicationUpdate?.action).toBe('discontinued');
  });

  it('erkennt "Amitriptylin angefangen" als started', () => {
    const result = analyzeVoiceTranscript(
      'Amitriptylin angefangen',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.medicationUpdate?.medicationName).toBe('Amitriptylin');
    expect(result.medicationUpdate?.action).toBe('started');
  });

  it('erkennt "vertrage Ibuprofen nicht" als intolerance', () => {
    const result = analyzeVoiceTranscript(
      'vertrage Ibuprofen nicht',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.medicationUpdate?.action).toBe('intolerance');
  });

  it('erkennt "Topiramat macht Schwindel" als intolerance', () => {
    const result = analyzeVoiceTranscript(
      'Topiramat macht Schwindel',
      mockUserContext
    );
    
    expect(result.intent).toBe('medication_update');
    expect(result.medicationUpdate?.medicationName).toBe('Topiramat');
    expect(result.medicationUpdate?.action).toBe('intolerance');
  });

  it('unterscheidet Schmerzeintrag von Medication Update', () => {
    const painResult = analyzeVoiceTranscript(
      'Migräne Stärke 7 habe Sumatriptan genommen',
      mockUserContext
    );
    
    expect(painResult.intent).toBe('pain_entry');
    expect(painResult.medicationUpdate).toBeUndefined();
  });

  it('unterscheidet Erinnerung von Medication Update', () => {
    const reminderResult = analyzeVoiceTranscript(
      'Erinnere mich morgen um 8 Uhr an Metoprolol',
      mockUserContext
    );
    
    expect(reminderResult.intent).toBe('reminder');
    expect(reminderResult.medicationUpdate).toBeUndefined();
  });

  it('erkennt allgemeine Notiz', () => {
    const noteResult = analyzeVoiceTranscript(
      'Heute war ein guter Tag ohne Beschwerden',
      mockUserContext
    );
    
    expect(noteResult.intent).toBe('note');
  });
});

describe('Medication Name Fuzzy Matching', () => {
  it('matched "Topi" zu "Topiramat"', () => {
    const result = analyzeVoiceTranscript(
      'Topi abgesetzt',
      mockUserContext
    );
    
    expect(result.medicationUpdate?.medicationName).toBe('Topiramat');
    expect(result.medicationUpdate?.medicationNameConfidence).toBeGreaterThan(0.7);
  });

  it('matched "Metop" zu "Metoprolol"', () => {
    const result = analyzeVoiceTranscript(
      'Metop nicht vertragen',
      mockUserContext
    );
    
    expect(result.medicationUpdate?.medicationName).toBe('Metoprolol');
  });
});
