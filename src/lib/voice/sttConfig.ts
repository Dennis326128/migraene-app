/**
 * STT Configuration & Types
 * Zentrale Konfiguration für Speech-to-Text
 */

export type SttMode = 'browser_only' | 'provider';
export type SttProvider = 'none' | 'openai' | 'deepgram' | 'assemblyai';

export interface SttResult {
  transcript: string;
  source: 'browser' | 'provider';
  confidence: number; // 0–1
  error?: 'NO_TRANSCRIPT' | 'BROWSER_NOT_SUPPORTED' | 'PROVIDER_ERROR';
}

export interface SttConfig {
  mode: SttMode;
  provider: SttProvider;
  language: string;
}

/**
 * Get STT configuration from environment or defaults
 */
export function getSttConfig(): SttConfig {
  // Default: browser_only mode (kostenlos)
  const mode: SttMode = import.meta.env.VITE_STT_MODE === 'provider' ? 'provider' : 'browser_only';
  const provider: SttProvider = (import.meta.env.VITE_STT_PROVIDER as SttProvider) || 'none';
  const language = import.meta.env.VITE_STT_LANGUAGE || 'de-DE';

  return {
    mode,
    provider,
    language,
  };
}

/**
 * Check if browser supports Web Speech API
 */
export function isBrowserSttSupported(): boolean {
  return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
}
