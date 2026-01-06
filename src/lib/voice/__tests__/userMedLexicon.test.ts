/**
 * Test: User Medication Lexicon
 */

import { describe, it, expect } from 'vitest';
import { buildUserMedLexicon, correctWithLexicon, applyLexiconCorrections } from '../userMedLexicon';

describe('userMedLexicon', () => {
  describe('buildUserMedLexicon', () => {
    it('builds lexicon from user medications', () => {
      const lexicon = buildUserMedLexicon([
        { name: 'Sumatriptan 50 mg' },
        { name: 'Ibuprofen 400 mg' },
      ]);
      
      expect(lexicon.medications.length).toBe(2);
      expect(lexicon.prefixMap.size).toBeGreaterThan(0);
    });
    
    it('generates variants without strength suffix', () => {
      const lexicon = buildUserMedLexicon([{ name: 'Sumatriptan 50 mg' }]);
      const med = lexicon.medications[0];
      
      expect(med.variants).toContain('sumatriptan');
      expect(med.variants.some(v => v.includes('50'))).toBe(false);
    });
  });
  
  describe('correctWithLexicon', () => {
    const lexicon = buildUserMedLexicon([
      { name: 'Sumatriptan 50 mg' },
      { name: 'Ibuprofen 400 mg' },
    ]);
    
    it('corrects known prefixes', () => {
      expect(correctWithLexicon('suma', lexicon)).toBe('Sumatriptan 50 mg');
      expect(correctWithLexicon('ibu', lexicon)).toBe('Ibuprofen 400 mg');
    });
    
    it('returns null for unknown words', () => {
      expect(correctWithLexicon('aspirin', lexicon)).toBe(null);
    });
    
    it('returns null for ambiguous prefixes', () => {
      // Two meds starting with same prefix would be ambiguous
      const ambiguousLexicon = buildUserMedLexicon([
        { name: 'Test Medikament A' },
        { name: 'Test Medikament B' },
      ]);
      expect(correctWithLexicon('test', ambiguousLexicon)).toBe(null);
    });
  });
  
  describe('applyLexiconCorrections', () => {
    const lexicon = buildUserMedLexicon([
      { name: 'Sumatriptan 50 mg' },
    ]);
    
    it('corrects medications in transcript', () => {
      const result = applyLexiconCorrections('Ich habe suma genommen', lexicon);
      expect(result.corrected).toContain('Sumatriptan');
      expect(result.corrections.length).toBe(1);
    });
    
    it('does not modify unknown words', () => {
      const result = applyLexiconCorrections('Tagebuch öffnen', lexicon);
      expect(result.corrected).toBe('Tagebuch öffnen');
      expect(result.corrections.length).toBe(0);
    });
  });
});
