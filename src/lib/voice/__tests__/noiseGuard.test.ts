/**
 * Test: Noise Guard
 */

import { describe, it, expect } from 'vitest';
import { checkNoiseGuard, getNoiseMessage } from '../noiseGuard';

describe('noiseGuard', () => {
  describe('checkNoiseGuard', () => {
    it('filters empty input', () => {
      expect(checkNoiseGuard('').isNoise).toBe(true);
      expect(checkNoiseGuard('  ').isNoise).toBe(true);
    });
    
    it('filters single stopwords', () => {
      expect(checkNoiseGuard('ok').isNoise).toBe(true);
      expect(checkNoiseGuard('ja').isNoise).toBe(true);
      expect(checkNoiseGuard('äh').isNoise).toBe(true);
      expect(checkNoiseGuard('ähm').isNoise).toBe(true);
    });
    
    it('filters sentences with only stopwords', () => {
      expect(checkNoiseGuard('ja ok also').isNoise).toBe(true);
      expect(checkNoiseGuard('äh ähm').isNoise).toBe(true);
    });
    
    it('detects ambiguous numbers (0-10)', () => {
      const result7 = checkNoiseGuard('7');
      expect(result7.isNoise).toBe(false);
      expect(result7.isAmbiguousNumber).toBe(true);
      expect(result7.disambiguationQuestion).toContain('7');
      
      const result5 = checkNoiseGuard('5');
      expect(result5.isAmbiguousNumber).toBe(true);
    });
    
    it('does NOT filter valid commands', () => {
      expect(checkNoiseGuard('Migräne Stärke 7').isNoise).toBe(false);
      expect(checkNoiseGuard('Füge Ibuprofen hinzu').isNoise).toBe(false);
      expect(checkNoiseGuard('Tagebuch öffnen').isNoise).toBe(false);
    });
    
    it('does NOT mark numbers with context as ambiguous', () => {
      const result = checkNoiseGuard('Stärke 7');
      expect(result.isAmbiguousNumber).toBe(false);
    });
  });
  
  describe('getNoiseMessage', () => {
    it('returns disambiguation question for ambiguous numbers', () => {
      const result = checkNoiseGuard('7');
      const message = getNoiseMessage(result);
      expect(message).toContain('7');
    });
    
    it('returns generic retry message for noise', () => {
      const result = checkNoiseGuard('ok');
      const message = getNoiseMessage(result);
      expect(message).toContain('verstanden');
    });
  });
});
