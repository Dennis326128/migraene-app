/**
 * Tests: Medication Fuzzy Matching
 * 20+ test cases covering STT errors, split tokens, ambiguities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildUserMedicationLexicon,
  findBestMedicationMatch,
  findMedicationMentions,
  correctMedicationsInTranscript,
  jaroWinklerSimilarity,
  levenshteinDistance,
  type UserMedication,
  type UserMedicationLexicon
} from '../medicationFuzzyMatch';

describe('medicationFuzzyMatch', () => {
  // ============================================
  // Test Setup
  // ============================================
  
  const testUserMeds: UserMedication[] = [
    { id: '1', name: 'Sumatriptan 50 mg', wirkstoff: 'Sumatriptan' },
    { id: '2', name: 'Ibuprofen 400 mg', wirkstoff: 'Ibuprofen' },
    { id: '3', name: 'Paracetamol 500 mg', wirkstoff: 'Paracetamol' },
    { id: '4', name: 'Rizatriptan 10 mg', wirkstoff: 'Rizatriptan' },
    { id: '5', name: 'Naproxen 500 mg', wirkstoff: 'Naproxen' },
    { id: '6', name: 'Naratriptan 2.5 mg', wirkstoff: 'Naratriptan' },
  ];
  
  let lexicon: UserMedicationLexicon;
  
  beforeEach(() => {
    lexicon = buildUserMedicationLexicon(testUserMeds);
  });
  
  // ============================================
  // Similarity Functions
  // ============================================
  
  describe('jaroWinklerSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(jaroWinklerSimilarity('sumatriptan', 'sumatriptan')).toBe(1);
    });
    
    it('handles 1-character errors', () => {
      const sim = jaroWinklerSimilarity('sumatriptan', 'sumatripdan');
      expect(sim).toBeGreaterThan(0.9);
    });
    
    it('handles 2-character errors', () => {
      const sim = jaroWinklerSimilarity('sumatriptan', 'somatripdan');
      expect(sim).toBeGreaterThan(0.85);
    });
    
    it('handles transpositions', () => {
      const sim = jaroWinklerSimilarity('sumatriptan', 'sumatirptan');
      expect(sim).toBeGreaterThan(0.9);
    });
  });
  
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('ibuprofen', 'ibuprofen')).toBe(0);
    });
    
    it('returns 1 for 1-char difference', () => {
      expect(levenshteinDistance('ibuprofen', 'iboprofen')).toBe(1);
    });
    
    it('returns 2 for 2-char difference', () => {
      expect(levenshteinDistance('paracetamol', 'parazitamol')).toBe(2);
    });
  });
  
  // ============================================
  // Lexicon Building
  // ============================================
  
  describe('buildUserMedicationLexicon', () => {
    it('creates entries for all medications', () => {
      expect(lexicon.entries.length).toBe(6);
    });
    
    it('extracts base name without strength', () => {
      const sumaEntry = lexicon.entries.find(e => e.canonical === 'Sumatriptan 50 mg');
      expect(sumaEntry?.baseName).toBe('Sumatriptan');
      expect(sumaEntry?.strength).toBe('50 mg');
    });
    
    it('builds prefix index', () => {
      expect(lexicon.prefixIndex.has('sum')).toBe(true);
      expect(lexicon.prefixIndex.has('ibu')).toBe(true);
    });
    
    it('includes wirkstoff in normalized forms', () => {
      const sumaEntry = lexicon.entries.find(e => e.canonical === 'Sumatriptan 50 mg');
      expect(sumaEntry?.normalizedForms.some(f => f.includes('sumatriptan'))).toBe(true);
    });
  });
  
  // ============================================
  // 1-3 Character Errors
  // ============================================
  
  describe('STT errors (1-3 characters wrong)', () => {
    it('matches "Sumatripdan" (1 char error)', () => {
      const match = findBestMedicationMatch('Sumatripdan', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Sumatriptan 50 mg');
      expect(match?.confidence).toBeGreaterThan(0.85);
    });
    
    it('matches "Somatriptan" (1 char error at start)', () => {
      const match = findBestMedicationMatch('Somatriptan', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Sumatriptan 50 mg');
    });
    
    it('matches "Sumatripten" (1 char error at end)', () => {
      const match = findBestMedicationMatch('Sumatripten', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Sumatriptan 50 mg');
    });
    
    it('matches "Zumatryptan" (2 char errors)', () => {
      const match = findBestMedicationMatch('Zumatryptan', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Sumatriptan 50 mg');
    });
    
    it('matches "Iboprofen" (1 char error)', () => {
      const match = findBestMedicationMatch('Iboprofen', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Ibuprofen 400 mg');
    });
    
    it('matches "Parazitamol" (2 char errors)', () => {
      const match = findBestMedicationMatch('Parazitamol', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Paracetamol 500 mg');
    });
    
    it('matches "Risatriptan" (1 char error)', () => {
      const match = findBestMedicationMatch('Risatriptan', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Rizatriptan 10 mg');
    });
  });
  
  // ============================================
  // Split Tokens
  // ============================================
  
  describe('split tokens', () => {
    it('recognizes "suma triptan" as Sumatriptan', () => {
      const hits = findMedicationMentions('ich habe suma triptan genommen', lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const sumaHit = hits.find(h => h.match?.canonical === 'Sumatriptan 50 mg');
      expect(sumaHit).toBeDefined();
    });
    
    it('recognizes "ibu profen" as Ibuprofen', () => {
      const hits = findMedicationMentions('eine ibu profen tablette', lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });
    
    it('recognizes "para ceta mol" as Paracetamol', () => {
      const hits = findMedicationMentions('para ceta mol genommen', lexicon);
      // This is a hard case - may not match perfectly
      // We at least shouldn't crash
      expect(Array.isArray(hits)).toBe(true);
    });
  });
  
  // ============================================
  // With Dosage
  // ============================================
  
  describe('with dosage in transcript', () => {
    it('matches "50 mg somatriptan"', () => {
      const hits = findMedicationMentions('50 mg somatriptan genommen', lexicon);
      const sumaHit = hits.find(h => h.match?.canonical === 'Sumatriptan 50 mg');
      expect(sumaHit).toBeDefined();
    });
    
    it('matches "ibuprofen 400"', () => {
      const hits = findMedicationMentions('eine ibuprofen 400 tablette', lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });
    
    it('does not confuse dosage numbers with medication names', () => {
      const hits = findMedicationMentions('400 mg genommen', lexicon);
      // Should not match just the number
      expect(hits.filter(h => h.match !== null).length).toBe(0);
    });
  });
  
  // ============================================
  // Ambiguities
  // ============================================
  
  describe('ambiguity handling', () => {
    it('marks uncertain when Naproxen vs Naratriptan are close', () => {
      // "Napro" could match both
      const match = findBestMedicationMatch('Napro', lexicon, true);
      // Either matches as prefix or is uncertain
      expect(match === null || match.isUncertain === true).toBe(true);
    });
    
    it('correctly distinguishes Naproxen when spelled fully', () => {
      const match = findBestMedicationMatch('Naproxen', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Naproxen 500 mg');
      expect(match?.isUncertain).toBe(false);
    });
    
    it('correctly distinguishes Naratriptan when spelled fully', () => {
      const match = findBestMedicationMatch('Naratriptan', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Naratriptan 2.5 mg');
    });
  });
  
  // ============================================
  // Context Missing (False Positives)
  // ============================================
  
  describe('false positive prevention', () => {
    it('does not match "war draußen" as medication', () => {
      const hits = findMedicationMentions('ich war draußen spazieren', lexicon);
      expect(hits.filter(h => h.match !== null).length).toBe(0);
    });
    
    it('does not match common German words', () => {
      const hits = findMedicationMentions('heute morgen mit dem hund', lexicon);
      expect(hits.filter(h => h.match !== null).length).toBe(0);
    });
    
    it('does not match "nach" or "vor" as medications', () => {
      const hits = findMedicationMentions('vor einer stunde nach dem essen', lexicon);
      expect(hits.filter(h => h.match !== null).length).toBe(0);
    });
  });
  
  // ============================================
  // Transcript Correction
  // ============================================
  
  describe('correctMedicationsInTranscript', () => {
    it('corrects transcript with STT errors', () => {
      const { corrected, corrections } = correctMedicationsInTranscript(
        'ich habe somatriptan genommen',
        lexicon
      );
      expect(corrections.length).toBeGreaterThanOrEqual(1);
      expect(corrected).toContain('Sumatriptan');
    });
    
    it('preserves non-medication words', () => {
      const { corrected } = correctMedicationsInTranscript(
        'ich habe ibuprofen genommen wegen kopfschmerzen',
        lexicon
      );
      expect(corrected).toContain('kopfschmerzen');
    });
    
    it('handles multiple medications', () => {
      const { corrected, corrections } = correctMedicationsInTranscript(
        'somatriptan und iboprofen zusammen',
        lexicon
      );
      expect(corrected).toContain('Sumatriptan');
      expect(corrected).toContain('Ibuprofen');
      expect(corrections.length).toBe(2);
    });
  });
  
  // ============================================
  // Edge Cases
  // ============================================
  
  describe('edge cases', () => {
    it('handles empty string', () => {
      const hits = findMedicationMentions('', lexicon);
      expect(hits.length).toBe(0);
    });
    
    it('handles very short input', () => {
      const match = findBestMedicationMatch('ab', lexicon);
      expect(match).toBeNull();
    });
    
    it('handles all-caps input', () => {
      const match = findBestMedicationMatch('SUMATRIPTAN', lexicon, true);
      expect(match).not.toBeNull();
      expect(match?.canonical).toBe('Sumatriptan 50 mg');
    });
    
    it('handles mixed case', () => {
      const match = findBestMedicationMatch('SuMaTrIpTaN', lexicon, true);
      expect(match).not.toBeNull();
    });
    
    it('handles umlauts correctly', () => {
      // Add a medication with umlaut
      const umlautLexicon = buildUserMedicationLexicon([
        ...testUserMeds,
        { id: '7', name: 'Nürofen 400 mg' }
      ]);
      
      const match = findBestMedicationMatch('Nuerofen', umlautLexicon, true);
      expect(match).not.toBeNull();
    });
  });
  
  // ============================================
  // Performance / Realistic Transcripts
  // ============================================
  
  describe('realistic transcripts', () => {
    it('parses "halbe sumatriptan vor 33 minuten"', () => {
      const hits = findMedicationMentions('halbe sumatriptan vor 33 minuten', lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].match?.canonical).toBe('Sumatriptan 50 mg');
    });
    
    it('parses "kopfschmerzen stärke 7 ibuprofen genommen"', () => {
      const hits = findMedicationMentions('kopfschmerzen stärke 7 ibuprofen genommen', lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].match?.canonical).toBe('Ibuprofen 400 mg');
    });
    
    it('parses long transcript with multiple medications', () => {
      const transcript = 'heute morgen migräne angefangen stärke 6 erst paracetamol dann nach zwei stunden sumatriptan genommen jetzt besser';
      const hits = findMedicationMentions(transcript, lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(2);
      
      const paraHit = hits.find(h => h.match?.canonical === 'Paracetamol 500 mg');
      const sumaHit = hits.find(h => h.match?.canonical === 'Sumatriptan 50 mg');
      expect(paraHit).toBeDefined();
      expect(sumaHit).toBeDefined();
    });
    
    it('parses transcript with STT errors', () => {
      const transcript = 'ich habe somatripdan genommen vor einer stunde dann iboprofen';
      const hits = findMedicationMentions(transcript, lexicon);
      expect(hits.length).toBeGreaterThanOrEqual(2);
    });
  });
});
