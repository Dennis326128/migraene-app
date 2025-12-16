/**
 * STT Provider Abstraction Layer
 * Enables swapping between Browser/Native/Backend STT providers
 */

export interface SttProviderCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string, confidence?: number) => void;
  onError?: (error: string) => void;
  onStateChange?: (isRecording: boolean) => void;
}

export interface SttProviderConfig {
  language?: string;
  continuous?: boolean;
}

export interface SttProvider {
  readonly isSupported: boolean;
  readonly isRecording: boolean;
  start(callbacks: SttProviderCallbacks): Promise<void>;
  stop(): void;
  cancel(): void;
}

/**
 * Browser Web Speech API Provider
 */
export class BrowserSttProvider implements SttProvider {
  private recognition: any = null;
  private callbacks: SttProviderCallbacks = {};
  private _isRecording = false;
  private finalTranscript = '';
  private config: SttProviderConfig;

  constructor(config: SttProviderConfig = {}) {
    this.config = {
      language: config.language || 'de-DE',
      continuous: config.continuous ?? true,
    };
  }

  get isSupported(): boolean {
    return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  async start(callbacks: SttProviderCallbacks): Promise<void> {
    if (!this.isSupported) {
      callbacks.onError?.('Spracheingabe wird in diesem Browser nicht unterstützt.');
      return;
    }

    this.callbacks = callbacks;
    this.finalTranscript = '';

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.lang = this.config.language;
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this._isRecording = true;
      this.callbacks.onStateChange?.(true);
      console.log('[BrowserSttProvider] Started');
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          this.finalTranscript += transcript;
          const confidence = result[0].confidence || 0.8;
          console.log(`[BrowserSttProvider] Final: "${transcript}" (${confidence.toFixed(2)})`);
          this.callbacks.onFinal?.(transcript, confidence);
        } else {
          interimTranscript += transcript;
          this.callbacks.onInterim?.(interimTranscript);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('[BrowserSttProvider] Error:', event.error);
      
      let errorMessage: string;
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'Keine Sprache erkannt.';
          break;
        case 'audio-capture':
          errorMessage = 'Mikrofon nicht verfügbar.';
          break;
        case 'not-allowed':
          errorMessage = 'Mikrofon-Zugriff verweigert.';
          break;
        case 'network':
          errorMessage = 'Netzwerkfehler.';
          break;
        case 'aborted':
          // User cancelled - not an error
          return;
        default:
          errorMessage = `Spracherkennungsfehler: ${event.error}`;
      }
      
      this.callbacks.onError?.(errorMessage);
    };

    this.recognition.onend = () => {
      this._isRecording = false;
      this.callbacks.onStateChange?.(false);
      console.log('[BrowserSttProvider] Ended');
    };

    try {
      this.recognition.start();
    } catch (error) {
      console.error('[BrowserSttProvider] Start failed:', error);
      this.callbacks.onError?.('Spracherkennung konnte nicht gestartet werden.');
    }
  }

  stop(): void {
    if (this.recognition && this._isRecording) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('[BrowserSttProvider] Stop error:', error);
      }
    }
  }

  cancel(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (error) {
        console.warn('[BrowserSttProvider] Cancel error:', error);
      }
      this._isRecording = false;
      this.callbacks.onStateChange?.(false);
    }
  }
}

/**
 * Factory function to create the appropriate STT provider
 * Currently returns BrowserSttProvider, later can return NativeProvider
 */
export function createSttProvider(config?: SttProviderConfig): SttProvider {
  // Future: detect platform and return appropriate provider
  // if (Capacitor.isNativePlatform()) return new NativeSttProvider(config);
  return new BrowserSttProvider(config);
}

/**
 * Check if any STT is available
 */
export function isSttAvailable(): boolean {
  const provider = createSttProvider();
  return provider.isSupported;
}
