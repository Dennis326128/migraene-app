/**
 * Safari Support Detection Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  isIOS, 
  isSafari, 
  isPWA, 
  isWebSpeechLikelyUnstable,
  getRecommendedVoiceMode,
  getSafariWarningMessage,
  SAFARI_SAFE_CONFIG
} from '../safariSupport';

describe('Safari Support Detection', () => {
  const originalNavigator = global.navigator;
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset navigator and window mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
    });
  });

  describe('isIOS', () => {
    it('should detect iPhone', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          maxTouchPoints: 5
        },
        writable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('should detect iPad', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
          maxTouchPoints: 5
        },
        writable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('should detect iPad with macOS UA (iPadOS 13+)', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)',
          maxTouchPoints: 5
        },
        writable: true,
      });
      expect(isIOS()).toBe(true);
    });

    it('should not detect desktop Mac', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)',
          maxTouchPoints: 0
        },
        writable: true,
      });
      expect(isIOS()).toBe(false);
    });

    it('should not detect Android', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G973F)',
          maxTouchPoints: 5
        },
        writable: true,
      });
      expect(isIOS()).toBe(false);
    });
  });

  describe('isSafari', () => {
    it('should detect Safari', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        },
        writable: true,
      });
      expect(isSafari()).toBe(true);
    });

    it('should not detect Chrome on iOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/87.0 Safari/604.1'
        },
        writable: true,
      });
      expect(isSafari()).toBe(false);
    });

    it('should not detect Firefox on iOS', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/29.0 Safari/605.1.15'
        },
        writable: true,
      });
      expect(isSafari()).toBe(false);
    });

    it('should detect macOS Safari', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.1 Safari/605.1.15'
        },
        writable: true,
      });
      expect(isSafari()).toBe(true);
    });
  });

  describe('isWebSpeechLikelyUnstable', () => {
    it('should return true for iOS Safari', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
          maxTouchPoints: 5
        },
        writable: true,
      });
      expect(isWebSpeechLikelyUnstable()).toBe(true);
    });

    it('should return false for Chrome on desktop', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          maxTouchPoints: 0
        },
        writable: true,
      });
      expect(isWebSpeechLikelyUnstable()).toBe(false);
    });
  });

  describe('SAFARI_SAFE_CONFIG', () => {
    it('should have correct defaults', () => {
      expect(SAFARI_SAFE_CONFIG.MAX_RESTARTS).toBe(3);
      expect(SAFARI_SAFE_CONFIG.RESTART_WINDOW_MS).toBe(20000);
      expect(SAFARI_SAFE_CONFIG.RESTART_DELAY_MS).toBe(400);
      expect(SAFARI_SAFE_CONFIG.PAUSE_THRESHOLD_MS).toBe(1500);
    });
  });

  describe('getRecommendedVoiceMode', () => {
    it('should recommend hold_to_talk for iOS Safari', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
          maxTouchPoints: 5
        },
        writable: true,
      });
      Object.defineProperty(global, 'window', {
        value: {
          SpeechRecognition: vi.fn(),
          matchMedia: () => ({ matches: false })
        },
        writable: true,
      });
      expect(getRecommendedVoiceMode()).toBe('hold_to_talk');
    });
  });
});
