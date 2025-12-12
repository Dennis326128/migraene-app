/**
 * SpeechProvider
 * Abstraction layer for speech-to-text functionality
 * Currently supports: Web Speech API (browser)
 * Future: Native iOS/Android, Cloud providers
 */

import type { 
  SpeechProviderInterface, 
  SpeechProviderConfig, 
  SpeechResult,
  SpeechProviderType 
} from '../types/draft.types';

/**
 * Check if Web Speech API is supported
 */
export function isWebSpeechSupported(): boolean {
  return !!(
    typeof window !== 'undefined' && 
    (window.SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

/**
 * Get the current speech provider type based on environment
 */
export function getCurrentProviderType(): SpeechProviderType {
  if (isWebSpeechSupported()) {
    return 'web_speech';
  }
  return 'none';
}

/**
 * Create a speech provider instance
 */
export function createSpeechProvider(
  config: Partial<SpeechProviderConfig> = {}
): SpeechProviderInterface {
  const fullConfig: SpeechProviderConfig = {
    type: config.type || getCurrentProviderType(),
    language: config.language || 'de-DE',
    continuous: config.continuous ?? true,
  };

  switch (fullConfig.type) {
    case 'web_speech':
      return new WebSpeechProvider(fullConfig);
    case 'none':
    default:
      return new NoopSpeechProvider();
  }
}

/**
 * Web Speech API Provider
 */
class WebSpeechProvider implements SpeechProviderInterface {
  private recognition: any = null;
  private config: SpeechProviderConfig;
  private resultCallback: ((result: SpeechResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private endCallback: (() => void) | null = null;

  constructor(config: SpeechProviderConfig) {
    this.config = config;
  }

  isSupported(): boolean {
    return isWebSpeechSupported();
  }

  async start(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Speech API is not supported in this browser');
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();
    
    this.recognition.lang = this.config.language;
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      if (!this.resultCallback) return;

      const results = event.results;
      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence || 0.9;
        const isFinal = result.isFinal;

        this.resultCallback({
          transcript,
          confidence,
          isFinal,
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      if (this.errorCallback) {
        this.errorCallback(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    this.recognition.onend = () => {
      if (this.endCallback) {
        this.endCallback();
      }
    };

    try {
      this.recognition.start();
    } catch (error) {
      throw new Error(`Failed to start speech recognition: ${error}`);
    }
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  onResult(callback: (result: SpeechResult) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }
}

/**
 * No-op provider for unsupported environments
 */
class NoopSpeechProvider implements SpeechProviderInterface {
  isSupported(): boolean {
    return false;
  }

  async start(): Promise<void> {
    throw new Error('Speech recognition is not supported');
  }

  stop(): void {
    // No-op
  }

  onResult(_callback: (result: SpeechResult) => void): void {
    // No-op
  }

  onError(_callback: (error: Error) => void): void {
    // No-op
  }

  onEnd(_callback: () => void): void {
    // No-op
  }
}
