/**
 * Voice Pipeline Type Definitions
 * Zentrale Typen für Voice-Erkennung und -Analyse
 */

export type VoiceIntent = 'pain_entry' | 'reminder' | 'note' | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface VoiceMed {
  name: string;
  confidence: number; // 0–1
  confidenceLevel?: ConfidenceLevel;
}

export interface VoicePainEntry {
  painLevel?: number;
  painLevelConfidence?: number;
  medications?: VoiceMed[];
  occurredAt?: string; // ISO timestamp
  occurredAtConfidence?: number;
  notes?: string;
}

export interface VoiceReminder {
  type?: 'medication' | 'appointment';
  title?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  timeOfDay?: 'morning' | 'noon' | 'evening' | 'night';
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  medications?: VoiceMed[];
  notes?: string;
}

export interface VoiceAnalysisResult {
  intent: VoiceIntent;
  intentConfidence: number;
  painEntry?: VoicePainEntry;
  reminder?: VoiceReminder;
  rawTranscript: string;
  sttConfidence?: number;
}

export interface VoiceUserContext {
  userMeds: Array<{ name: string }>;
  timezone?: string;
  language?: string;
}

export interface STTResponse {
  transcript: string;
  confidence: number; // 0–1
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
}

export interface STTRequest {
  audioBlob?: Blob;
  fallbackTranscript?: string;
  language?: string;
}
