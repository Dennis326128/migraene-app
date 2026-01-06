/**
 * Voice Intent Scoring & NLP Tests
 * Tests for improved intent classification and entity extraction
 */

import { describe, it, expect } from 'vitest';
import { scoreIntents, getTopIntents } from '../intentScoring';
import { normalizeTranscript, hasAddMedicationVerb, hasPainKeywords, hasAnalyticsKeywords, hasDosagePattern, extractMedNameNearDosage } from '../normalizeTranscript';

// ============================================
// Normalization Tests
// ============================================

describe('normalizeTranscript', () => {
  it('normalizes umlauts correctly', () => {
    const result = normalizeTranscript('Füge Medikament hinzü');
    expect(result.normalized).toBe('fuege medikament hinzue');
  });

  it('normalizes ASR errors for medications', () => {
    const result = normalizeTranscript('somatriptan 50 m g');
    expect(result.normalized).toContain('sumatriptan');
    expect(result.normalized).toContain('mg');
  });

  it('preserves tokens correctly', () => {
    const result = normalizeTranscript('Ibuprofen 400 mg genommen');
    expect(result.tokens).toContain('ibuprofen');
    expect(result.tokens).toContain('400');
    expect(result.tokens).toContain('mg');
  });
});

describe('hasAddMedicationVerb', () => {
  it('detects "fuege X hinzu" pattern', () => {
    expect(hasAddMedicationVerb('fuege ibuprofen hinzu')).toBe(true);
  });

  it('detects "anlegen" pattern', () => {
    expect(hasAddMedicationVerb('medikament anlegen')).toBe(true);
  });

  it('detects "lege X an" pattern', () => {
    expect(hasAddMedicationVerb('lege sumatriptan an')).toBe(true);
  });

  it('detects "neues medikament" pattern', () => {
    expect(hasAddMedicationVerb('neues medikament aspirin')).toBe(true);
  });

  it('returns false for pain entries', () => {
    expect(hasAddMedicationVerb('kopfschmerz staerke 7')).toBe(false);
  });
});

describe('hasPainKeywords', () => {
  it('detects schmerz', () => {
    expect(hasPainKeywords('kopfschmerz staerke 5')).toBe(true);
  });

  it('detects migraene (normalized)', () => {
    expect(hasPainKeywords('migraene attacke')).toBe(true);
  });

  it('detects pain level context', () => {
    expect(hasPainKeywords('staerke 7 heute morgen')).toBe(true);
  });

  it('returns false for medication-only text', () => {
    expect(hasPainKeywords('fuege ibuprofen hinzu')).toBe(false);
  });
});

describe('hasAnalyticsKeywords', () => {
  it('detects "wie viele" pattern', () => {
    expect(hasAnalyticsKeywords('wie viele tage')).toBe(true);
  });

  it('detects "durchschnitt" pattern', () => {
    expect(hasAnalyticsKeywords('durchschnittliche staerke')).toBe(true);
  });

  it('detects "schmerzfrei" pattern', () => {
    expect(hasAnalyticsKeywords('schmerzfreie tage')).toBe(true);
  });

  it('detects "letzte 30 tage" pattern', () => {
    expect(hasAnalyticsKeywords('in den letzten 30 tagen')).toBe(true);
  });
});

describe('hasDosagePattern', () => {
  it('detects "500 mg" pattern', () => {
    expect(hasDosagePattern('ibuprofen 500 mg')).toBe(true);
  });

  it('detects "400mg" (no space) pattern', () => {
    expect(hasDosagePattern('ibuprofen 400mg')).toBe(true);
  });

  it('detects milligramm spelling', () => {
    expect(hasDosagePattern('50 milligramm sumatriptan')).toBe(true);
  });
});

describe('extractMedNameNearDosage', () => {
  it('extracts name before dosage', () => {
    const result = extractMedNameNearDosage('sumatriptan 50 mg');
    expect(result).toBe('sumatriptan');
  });

  it('extracts name with spaces before dosage', () => {
    const result = extractMedNameNearDosage('ibuprofen akut 400 mg');
    expect(result).toBe('ibuprofen akut');
  });
});

// ============================================
// Intent Scoring Tests
// ============================================

describe('scoreIntents', () => {
  describe('add_medication intent', () => {
    it('scores high for "Füge Aspirin 500 mg hinzu"', () => {
      const result = scoreIntents('Füge Aspirin 500 mg hinzu');
      expect(result.intent).toBe('add_medication');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('scores high for "Lege Ibuprofen 400mg an"', () => {
      const result = scoreIntents('Lege Ibuprofen 400mg an');
      expect(result.intent).toBe('add_medication');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('scores high for "Erstelle Sumatriptan 50 Milligramm"', () => {
      const result = scoreIntents('Erstelle Sumatriptan 50 Milligramm');
      expect(result.intent).toBe('add_medication');
    });

    it('scores high for "neues medikament rizatriptan"', () => {
      const result = scoreIntents('neues medikament rizatriptan');
      expect(result.intent).toBe('add_medication');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('scores high for "füge ein medikament hinzu" (no name)', () => {
      const result = scoreIntents('füge ein medikament hinzu');
      expect(result.intent).toBe('add_medication');
    });
  });

  describe('pain_entry intent', () => {
    it('scores high for "Ich hatte heute Migräne Stärke 7"', () => {
      const result = scoreIntents('Ich hatte heute Migräne Stärke 7');
      expect(result.intent).toBe('pain_entry');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('scores high for "Kopfschmerz level 5"', () => {
      const result = scoreIntents('Kopfschmerz level 5');
      expect(result.intent).toBe('pain_entry');
    });

    it('scores high for "starke Migräne seit heute morgen"', () => {
      const result = scoreIntents('starke Migräne seit heute morgen');
      expect(result.intent).toBe('pain_entry');
    });

    it('scores high for "Sumatriptan genommen vor 2 Stunden"', () => {
      const result = scoreIntents('Sumatriptan genommen vor 2 Stunden');
      expect(result.intent).toBe('pain_entry');
    });
  });

  describe('analytics_query intent', () => {
    it('scores high for "Wie viele schmerzfreie Tage hatte ich in den letzten 30 Tagen?"', () => {
      const result = scoreIntents('Wie viele schmerzfreie Tage hatte ich in den letzten 30 Tagen?');
      expect(result.intent).toBe('analytics_query');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('scores high for "Wie viele Tage ohne Kopfschmerzen letzten Monat?"', () => {
      const result = scoreIntents('Wie viele Tage ohne Kopfschmerzen letzten Monat?');
      expect(result.intent).toBe('analytics_query');
    });

    it('scores high for "durchschnittliche Schmerzstärke letzte Woche"', () => {
      const result = scoreIntents('durchschnittliche Schmerzstärke letzte Woche');
      expect(result.intent).toBe('analytics_query');
    });

    it('scores high for "wie oft Triptan letzten Monat"', () => {
      const result = scoreIntents('wie oft Triptan letzten Monat');
      expect(result.intent).toBe('analytics_query');
    });
  });

  describe('medication_update intent', () => {
    it('scores high for "Aspirin abgesetzt"', () => {
      const result = scoreIntents('Aspirin abgesetzt');
      expect(result.intent).toBe('medication_update');
    });

    it('scores high for "vertrage Ibuprofen nicht mehr"', () => {
      const result = scoreIntents('vertrage Ibuprofen nicht mehr');
      expect(result.intent).toBe('medication_update');
    });

    it('scores high for "Sumatriptan Nebenwirkung Übelkeit"', () => {
      const result = scoreIntents('Sumatriptan Nebenwirkung Übelkeit');
      expect(result.intent).toBe('medication_update');
    });
  });

  describe('reminder intent', () => {
    it('scores high for "Erinnere mich morgen um 8 an Ibuprofen"', () => {
      const result = scoreIntents('Erinnere mich morgen um 8 an Ibuprofen');
      expect(result.intent).toBe('reminder');
    });

    it('scores high for "Termin beim Neurologen nächste Woche"', () => {
      const result = scoreIntents('Termin beim Neurologen nächste Woche');
      expect(result.intent).toBe('reminder');
    });
  });

  describe('navigation intent', () => {
    it('scores high for "Tagebuch öffnen"', () => {
      const result = scoreIntents('Tagebuch öffnen');
      expect(result.intent).toBe('navigation');
    });

    it('scores high for "zeig mir die Einstellungen"', () => {
      const result = scoreIntents('zeig mir die Einstellungen');
      expect(result.intent).toBe('navigation');
    });
  });

  describe('intent disambiguation', () => {
    it('prefers add_medication over pain_entry when add-verb is present', () => {
      // "füge X hinzu" should NOT be interpreted as pain entry even if X sounds like it could be
      const result = scoreIntents('Füge Paracetamol 500 mg hinzu');
      expect(result.intent).toBe('add_medication');
    });

    it('prefers pain_entry when schmerz context is dominant', () => {
      // Multiple pain keywords should win over a weak add-signal
      const result = scoreIntents('Starke Kopfschmerzen Migräne Attacke Stärke 8');
      expect(result.intent).toBe('pain_entry');
    });

    it('prefers analytics when question words and time range present', () => {
      const result = scoreIntents('Wie viele Einträge hatte ich in den letzten 7 Tagen?');
      expect(result.intent).toBe('analytics_query');
    });
  });
});

describe('getTopIntents', () => {
  it('returns top 3 intents sorted by score', () => {
    const result = scoreIntents('Ibuprofen 400 mg bei Kopfschmerzen');
    const top = getTopIntents(result.scores, 3);
    
    expect(top.length).toBe(3);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
    expect(top[1].score).toBeGreaterThanOrEqual(top[2].score);
  });
});
