/**
 * Voice Timing Config Tests
 * Tests for migraine-friendly adaptive auto-stop logic
 */

import { describe, it, expect } from 'vitest';
import {
  VOICE_MIGRAINE_PROFILE,
  CONTINUATION_PATTERNS,
  endsWithContinuationPattern,
  calculateWps,
  getAdaptiveSilenceThreshold,
  canAutoStop,
  isTranscriptSufficient
} from '../voiceTimingConfig';

describe('voiceTimingConfig', () => {
  describe('VOICE_MIGRAINE_PROFILE', () => {
    it('should have reasonable default values', () => {
      expect(VOICE_MIGRAINE_PROFILE.baseSilenceMs).toBeGreaterThanOrEqual(2000);
      expect(VOICE_MIGRAINE_PROFILE.slowSpeechSilenceMs).toBeGreaterThan(VOICE_MIGRAINE_PROFILE.baseSilenceMs);
      expect(VOICE_MIGRAINE_PROFILE.minRecordMs).toBeGreaterThanOrEqual(2000);
      expect(VOICE_MIGRAINE_PROFILE.hardTimeoutMs).toBeGreaterThanOrEqual(45000);
      expect(VOICE_MIGRAINE_PROFILE.continuationBoostMs).toBeGreaterThan(0);
    });
  });

  describe('endsWithContinuationPattern', () => {
    it('should detect German conjunctions at end', () => {
      expect(endsWithContinuationPattern('Kopfschmerzen und')).toBe(true);
      expect(endsWithContinuationPattern('Migräne aber')).toBe(true);
      expect(endsWithContinuationPattern('Stärke 7 weil')).toBe(true);
      expect(endsWithContinuationPattern('genommen dann')).toBe(true);
      expect(endsWithContinuationPattern('außerdem')).toBe(true);
    });

    it('should detect hesitation fillers', () => {
      expect(endsWithContinuationPattern('Kopfschmerzen äh')).toBe(true);
      expect(endsWithContinuationPattern('und dann ähm')).toBe(true);
      expect(endsWithContinuationPattern('also hm')).toBe(true);
    });

    it('should detect incomplete numeric patterns', () => {
      expect(endsWithContinuationPattern('Schmerzstärke')).toBe(true);
      expect(endsWithContinuationPattern('Intensität')).toBe(true);
      expect(endsWithContinuationPattern('vor')).toBe(true);
      expect(endsWithContinuationPattern('seit')).toBe(true);
      expect(endsWithContinuationPattern('um')).toBe(true);
      expect(endsWithContinuationPattern('Ibuprofen 400')).toBe(true); // Ends with number
    });

    it('should return false for complete sentences', () => {
      expect(endsWithContinuationPattern('Stärke 7 von 10')).toBe(false);
      expect(endsWithContinuationPattern('Ibuprofen 400 mg genommen')).toBe(false);
      expect(endsWithContinuationPattern('vor 30 Minuten')).toBe(false);
      expect(endsWithContinuationPattern('Migräne angefangen')).toBe(false);
    });
  });

  describe('calculateWps', () => {
    it('should calculate words per second correctly', () => {
      expect(calculateWps('eins zwei drei', 3000)).toBeCloseTo(1.0, 1);
      expect(calculateWps('eins zwei drei vier fünf sechs', 3000)).toBeCloseTo(2.0, 1);
      expect(calculateWps('eins', 2000)).toBeCloseTo(0.5, 1);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateWps('test', 0)).toBe(0);
      expect(calculateWps('test', -100)).toBe(0);
    });

    it('should handle empty strings', () => {
      expect(calculateWps('', 1000)).toBe(0);
      expect(calculateWps('   ', 1000)).toBe(0);
    });
  });

  describe('getAdaptiveSilenceThreshold', () => {
    it('should return base threshold for normal speech', () => {
      // Normal speech: 2 words per second
      const text = 'Kopfschmerzen Stärke sieben von zehn Ibuprofen genommen';
      const duration = 3000; // 3 seconds for ~7 words = ~2.3 wps
      const threshold = getAdaptiveSilenceThreshold(text, duration);
      expect(threshold).toBe(VOICE_MIGRAINE_PROFILE.baseSilenceMs);
    });

    it('should return higher threshold for slow speech', () => {
      // Slow speech: 0.5 words per second
      const text = 'Kopfschmerzen';
      const duration = 4000; // 4 seconds for 1 word = 0.25 wps
      const threshold = getAdaptiveSilenceThreshold(text, duration);
      expect(threshold).toBe(VOICE_MIGRAINE_PROFILE.slowSpeechSilenceMs);
    });

    it('should add continuation boost when sentence incomplete', () => {
      const text = 'Stärke sieben und';
      const duration = 2000; // Fast enough to not be slow speech
      const threshold = getAdaptiveSilenceThreshold(text, duration);
      expect(threshold).toBe(VOICE_MIGRAINE_PROFILE.baseSilenceMs + VOICE_MIGRAINE_PROFILE.continuationBoostMs);
    });

    it('should combine slow speech and continuation boost', () => {
      const text = 'Schmerzstärke'; // Incomplete pattern + slow speech
      const duration = 5000; // Very slow
      const threshold = getAdaptiveSilenceThreshold(text, duration);
      expect(threshold).toBe(VOICE_MIGRAINE_PROFILE.slowSpeechSilenceMs + VOICE_MIGRAINE_PROFILE.continuationBoostMs);
    });
  });

  describe('canAutoStop', () => {
    it('should require minimum recording duration', () => {
      const { minRecordMs } = VOICE_MIGRAINE_PROFILE;
      expect(canAutoStop('Kopfschmerzen Stärke 7', minRecordMs - 100)).toBe(false);
      expect(canAutoStop('Kopfschmerzen Stärke 7', minRecordMs + 100)).toBe(true);
    });

    it('should require minimum word count', () => {
      const { minRecordMs } = VOICE_MIGRAINE_PROFILE;
      expect(canAutoStop('Kopfschmerzen', minRecordMs + 1000)).toBe(false); // 1 word
      expect(canAutoStop('Kopfschmerzen Stärke', minRecordMs + 1000)).toBe(true); // 2 words
    });

    it('should return false for empty text', () => {
      expect(canAutoStop('', 10000)).toBe(false);
      expect(canAutoStop('   ', 10000)).toBe(false);
    });
  });

  describe('isTranscriptSufficient', () => {
    it('should require minimum characters or words', () => {
      expect(isTranscriptSufficient('ab')).toBe(false); // Too short
      expect(isTranscriptSufficient('Kopfschmerzen')).toBe(true); // Long enough
      expect(isTranscriptSufficient('Ja nein')).toBe(true); // 2 words
    });
  });

  describe('Real-world test cases', () => {
    /**
     * Test case 1: Slow speech with pauses
     * "Seit … (Pause) … 30 Minuten … (Pause) … Stärke 7 … (Pause) … Ibuprofen"
     * Should NOT auto-stop after 2s, should wait for final pause
     */
    it('should handle slow speech with pauses', () => {
      // After first word "Seit" - should not auto-stop (incomplete + slow)
      expect(canAutoStop('Seit', 2000)).toBe(false); // Not enough words
      expect(endsWithContinuationPattern('Seit')).toBe(true); // Incomplete

      // After "Seit 30 Minuten" - still incomplete feeling
      const afterMinutes = 'Seit 30 Minuten';
      const thresholdAfterMinutes = getAdaptiveSilenceThreshold(afterMinutes, 8000); // Slow speech
      expect(thresholdAfterMinutes).toBeGreaterThan(VOICE_MIGRAINE_PROFILE.baseSilenceMs);

      // Full sentence should allow normal threshold
      const fullSentence = 'Seit 30 Minuten Stärke 7 Ibuprofen';
      expect(endsWithContinuationPattern(fullSentence)).toBe(false);
    });

    /**
     * Test case 2: Normal speech - should auto-stop after ~2.5s silence
     */
    it('should handle normal speech pace', () => {
      const text = 'Kopfschmerzen Stärke 7 von 10 Ibuprofen genommen';
      const duration = 5000; // ~8 words in 5s = 1.6 wps (normal)
      const threshold = getAdaptiveSilenceThreshold(text, duration);
      expect(threshold).toBe(VOICE_MIGRAINE_PROFILE.baseSilenceMs);
      expect(canAutoStop(text, duration)).toBe(true);
    });

    /**
     * Test case 3: Thinking pauses ("äh", "und dann")
     * Should delay auto-stop
     */
    it('should delay auto-stop for thinking pauses', () => {
      const withHesitation = 'Kopfschmerzen und äh';
      expect(endsWithContinuationPattern(withHesitation)).toBe(true);
      const threshold = getAdaptiveSilenceThreshold(withHesitation, 4000);
      expect(threshold).toBeGreaterThanOrEqual(VOICE_MIGRAINE_PROFILE.baseSilenceMs + VOICE_MIGRAINE_PROFILE.continuationBoostMs);
    });

    /**
     * Test case 5: Hard timeout scenario
     * User forgets to stop - should end after max 60s
     */
    it('should have a reasonable hard timeout', () => {
      expect(VOICE_MIGRAINE_PROFILE.hardTimeoutMs).toBeLessThanOrEqual(60000);
      expect(VOICE_MIGRAINE_PROFILE.hardTimeoutMs).toBeGreaterThanOrEqual(45000);
    });
  });
});
