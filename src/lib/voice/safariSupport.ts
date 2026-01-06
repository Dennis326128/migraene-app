/**
 * Safari Support Detection
 * 
 * Detects iOS/Safari environments where WebSpeech API is unreliable
 * and provides fallback recommendations.
 */

/**
 * Detect if running on iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  const ua = navigator.userAgent;
  
  // Modern iPad detection (iPadOS 13+ reports as Mac)
  const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  
  // Standard iOS detection
  const isIOSDevice = /iPhone|iPad|iPod/i.test(ua);
  
  return isIOSDevice || isIPad;
}

/**
 * Detect if running in Safari browser (not Chrome/Firefox iOS wrapper)
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  const ua = navigator.userAgent;
  
  // Safari on iOS/macOS
  const isSafariBrowser = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg/i.test(ua);
  
  return isSafariBrowser;
}

/**
 * Detect if running as PWA (standalone mode)
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check display-mode media query
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // iOS Safari specific
  const isIOSStandalone = (navigator as any).standalone === true;
  
  return isStandalone || isIOSStandalone;
}

/**
 * Detect if WebSpeech API is likely to be unstable
 * 
 * Returns true for:
 * - iOS Safari (known issues with audio session, onend loops)
 * - iOS PWA (even more unstable)
 * - Any Safari with touch (iPad/iPhone)
 */
export function isWebSpeechLikelyUnstable(): boolean {
  // iOS Safari is notoriously unstable with WebSpeech
  if (isIOS() && isSafari()) {
    return true;
  }
  
  // iOS PWA is even more problematic
  if (isIOS() && isPWA()) {
    return true;
  }
  
  return false;
}

/**
 * Get recommended voice input mode for current browser
 */
export type VoiceInputMode = 'standard' | 'hold_to_talk' | 'dictation_only';

export function getRecommendedVoiceMode(): VoiceInputMode {
  if (!isWebSpeechSupported()) {
    return 'dictation_only';
  }
  
  if (isWebSpeechLikelyUnstable()) {
    // Safari users should use hold-to-talk to avoid restart loops
    return 'hold_to_talk';
  }
  
  return 'standard';
}

/**
 * Check if browser supports WebSpeech API
 */
function isWebSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/**
 * Get Safari-specific warning message
 */
export function getSafariWarningMessage(): string | null {
  if (!isWebSpeechLikelyUnstable()) {
    return null;
  }
  
  if (isPWA()) {
    return 'Safari PWA: Spracherkennung kann instabil sein. Nutze den Diktier-Modus für beste Ergebnisse.';
  }
  
  if (isIOS()) {
    return 'iOS Safari: Bei Problemen nutze "Gedrückt halten" oder den Diktier-Modus.';
  }
  
  return null;
}

/**
 * Configuration for Safari Safe Mode
 */
export const SAFARI_SAFE_CONFIG = {
  // Max auto-restarts within time window
  MAX_RESTARTS: 3,
  // Time window in ms (20 seconds)
  RESTART_WINDOW_MS: 20000,
  // Auto-restart delay in ms
  RESTART_DELAY_MS: 400,
  // Pause detection threshold in ms
  PAUSE_THRESHOLD_MS: 1500,
  // How often to check for pause (ms)
  PAUSE_CHECK_INTERVAL_MS: 500,
} as const;
