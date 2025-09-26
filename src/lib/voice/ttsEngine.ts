export class TTSEngine {
  private synthesis: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private germanVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.loadGermanVoice();
  }

  private loadGermanVoice() {
    // Wait for voices to be loaded
    const loadVoices = () => {
      const voices = this.synthesis.getVoices();
      
      // Prefer German voices in order of preference
      this.germanVoice = 
        voices.find(voice => voice.lang === 'de-DE' && voice.name.includes('Google')) ||
        voices.find(voice => voice.lang === 'de-DE') ||
        voices.find(voice => voice.lang.startsWith('de')) ||
        voices[0]; // Fallback to first available voice
    };

    if (this.synthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      this.synthesis.addEventListener('voiceschanged', loadVoices);
    }
  }

  speak(text: string, options?: { 
    rate?: number; 
    pitch?: number; 
    volume?: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: SpeechSynthesisErrorEvent) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop any current speech
      this.stopSpeaking();

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set voice and parameters
      if (this.germanVoice) {
        utterance.voice = this.germanVoice;
      }
      utterance.lang = 'de-DE';
      utterance.rate = options?.rate || 0.9; // Slightly slower for clarity
      utterance.pitch = options?.pitch || 1.0;
      utterance.volume = options?.volume || 0.8;

      // Event handlers
      utterance.onstart = () => {
        console.log('🎤 TTS started:', text);
        options?.onStart?.();
      };

      utterance.onend = () => {
        console.log('🎤 TTS ended');
        this.currentUtterance = null;
        options?.onEnd?.();
        resolve();
      };

      utterance.onerror = (error) => {
        console.error('🎤 TTS error:', error);
        this.currentUtterance = null;
        options?.onError?.(error);
        reject(error);
      };

      this.currentUtterance = utterance;
      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices();
  }

  getGermanVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices().filter(voice => 
      voice.lang.startsWith('de')
    );
  }

  // Convenience methods for common phrases
  async speakConfirmation(summary: string): Promise<void> {
    const text = `Ich habe verstanden: ${summary}. Ist das korrekt?`;
    return this.speak(text);
  }

  async askForTime(): Promise<void> {
    const text = "Für wann soll ich den Eintrag speichern? Soll ich jetzt nehmen?";
    return this.speak(text);
  }

  async askForPainLevel(): Promise<void> {
    const text = "Welche Schmerzstufe von 0 bis 10?";
    return this.speak(text);
  }

  async askForMedication(): Promise<void> {
    const text = "Hast du ein Medikament genommen? Wenn ja, welches und welche Dosis?";
    return this.speak(text);
  }

  async askForMedicationEffect(): Promise<void> {
    const text = "Wie hat die letzte Tablette gewirkt? Gar nicht, schlecht, mittel, gut oder sehr gut?";
    return this.speak(text);
  }

  async confirmSave(summary: string): Promise<void> {
    const text = `Okay. ${summary}. Speichern?`;
    return this.speak(text);
  }

  async speakProgress(current: number, total: number): Promise<void> {
    const text = `Angaben ${current} von ${total} komplett.`;
    return this.speak(text);
  }
}