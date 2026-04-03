/**
 * Feature-Flags für schrittweise Aktivierung neuer Funktionen.
 */
export const FEATURE_FLAGS = {
  /** Neues Voice-Parser-System (parseVoiceEntry.ts) anstelle von simpleVoiceParser.ts */
  USE_NEW_VOICE_PARSER: true,
} as const;
