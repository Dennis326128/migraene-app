/**
 * Voice Analytics & Logging
 * Structured logging for debugging and quality improvement
 * 
 * Features:
 * - Captures routing decisions with confidence scores
 * - Stores minimal data for debugging (no full transcripts in production)
 * - Dev mode: detailed console logging
 * - Optional DB persistence for error cases
 */

import { supabase } from '@/integrations/supabase/client';
import type { IntentScores, ScoredIntent } from './intentScoring';
import type { VoiceRouterResult } from './voiceIntentRouter';

// ============================================
// Types
// ============================================

export interface VoiceLogEntry {
  timestamp: string;
  source: 'stt' | 'dictation_fallback' | 'typed';
  transcriptLength: number;
  transcriptPreview: string; // First 50 chars, redacted
  sttConfidence?: number;
  chosenIntent: string;
  topIntents: Array<{ intent: string; score: number }>;
  finalActionType: 'navigate' | 'analytics' | 'mutation' | 'note' | 'unknown';
  outcome: 'success' | 'error' | 'canceled' | 'undo' | 'pending';
  latencyMs: number;
  features: string[];
  error?: string;
}

export interface VoiceLoggerOptions {
  enableDbLogging?: boolean;
  onlyLogErrors?: boolean;
  devMode?: boolean;
}

// ============================================
// Logger State
// ============================================

let currentLogEntry: Partial<VoiceLogEntry> | null = null;
let startTime: number = 0;

const options: VoiceLoggerOptions = {
  enableDbLogging: false, // Default: don't persist
  onlyLogErrors: true,    // Only persist error cases
  devMode: import.meta.env.DEV,
};

// ============================================
// Public API
// ============================================

/**
 * Start logging a new voice interaction
 */
export function voiceLogStart(source: VoiceLogEntry['source'] = 'stt'): void {
  startTime = performance.now();
  currentLogEntry = {
    timestamp: new Date().toISOString(),
    source,
    outcome: 'pending',
  };
}

/**
 * Set transcript info (redacted for privacy)
 */
export function voiceLogTranscript(transcript: string, sttConfidence?: number): void {
  if (!currentLogEntry) return;
  
  currentLogEntry.transcriptLength = transcript.length;
  currentLogEntry.transcriptPreview = redactTranscript(transcript, 50);
  currentLogEntry.sttConfidence = sttConfidence;
}

/**
 * Log intent classification results
 */
export function voiceLogIntent(
  chosenIntent: ScoredIntent,
  topIntents: Array<{ intent: string; score: number }>,
  features: string[]
): void {
  if (!currentLogEntry) return;
  
  currentLogEntry.chosenIntent = chosenIntent;
  currentLogEntry.topIntents = topIntents.slice(0, 3);
  currentLogEntry.features = features;
}

/**
 * Log the final routing result
 */
export function voiceLogRouterResult(result: VoiceRouterResult): void {
  if (!currentLogEntry) return;
  
  currentLogEntry.chosenIntent = result.type;
  currentLogEntry.finalActionType = categorizeAction(result.type);
}

/**
 * Complete the log with outcome
 */
export function voiceLogComplete(outcome: VoiceLogEntry['outcome'], error?: string): void {
  if (!currentLogEntry) return;
  
  currentLogEntry.outcome = outcome;
  currentLogEntry.latencyMs = Math.round(performance.now() - startTime);
  
  if (error) {
    currentLogEntry.error = error;
  }
  
  const entry = currentLogEntry as VoiceLogEntry;
  
  // Console logging in dev mode
  if (options.devMode) {
    logToConsole(entry);
  }
  
  // DB persistence for errors (if enabled)
  if (options.enableDbLogging && (!options.onlyLogErrors || outcome === 'error')) {
    persistLog(entry).catch(console.error);
  }
  
  currentLogEntry = null;
}

/**
 * Quick log for simple events
 */
export function voiceLogEvent(event: string, data?: Record<string, unknown>): void {
  if (options.devMode) {
    console.log(`[VOICE] ${event}`, data || '');
  }
}

/**
 * Get current log entry for debugging
 */
export function voiceLogGetCurrent(): Partial<VoiceLogEntry> | null {
  return currentLogEntry ? { ...currentLogEntry } : null;
}

/**
 * Generate a copyable debug JSON
 */
export function voiceLogGetDebugJson(): string {
  const entry = currentLogEntry || {};
  return JSON.stringify({
    ...entry,
    latencyMs: Math.round(performance.now() - startTime),
    timestamp: new Date().toISOString(),
  }, null, 2);
}

// ============================================
// Configuration
// ============================================

export function configureVoiceLogger(newOptions: Partial<VoiceLoggerOptions>): void {
  Object.assign(options, newOptions);
}

// ============================================
// Internal Helpers
// ============================================

function redactTranscript(transcript: string, maxLength: number): string {
  if (!transcript) return '';
  const truncated = transcript.slice(0, maxLength);
  return truncated.length < transcript.length ? `${truncated}...` : truncated;
}

function categorizeAction(intentType: string): VoiceLogEntry['finalActionType'] {
  if (intentType.startsWith('navigate_')) return 'navigate';
  if (intentType === 'analytics_query') return 'analytics';
  if (intentType === 'create_note') return 'note';
  if (intentType === 'unknown') return 'unknown';
  return 'mutation';
}

function logToConsole(entry: VoiceLogEntry): void {
  const icon = entry.outcome === 'success' ? '✅' : entry.outcome === 'error' ? '❌' : '⏳';
  
  console.groupCollapsed(
    `%c[VOICE] ${icon} ${entry.chosenIntent} (${Math.round((entry.topIntents?.[0]?.score || 0) * 100)}%)`,
    'color: #8b5cf6; font-weight: bold;'
  );
  
  console.log('Transcript:', entry.transcriptPreview);
  console.log('Top intents:', entry.topIntents);
  console.log('Features:', entry.features);
  console.log('Action type:', entry.finalActionType);
  console.log('Outcome:', entry.outcome);
  console.log('Latency:', entry.latencyMs, 'ms');
  
  if (entry.error) {
    console.error('Error:', entry.error);
  }
  
  console.groupEnd();
}

async function persistLog(entry: VoiceLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Store in voice_entries_debug table
    await supabase.from('voice_entries_debug').insert({
      user_id: user.id,
      source_text: entry.transcriptPreview, // Only preview, not full transcript
      parsed_json: {
        chosenIntent: entry.chosenIntent,
        topIntents: entry.topIntents,
        features: entry.features,
        finalActionType: entry.finalActionType,
        outcome: entry.outcome,
        latencyMs: entry.latencyMs,
      },
      confidence_scores: entry.topIntents?.reduce((acc, { intent, score }) => {
        acc[intent] = score;
        return acc;
      }, {} as Record<string, number>) || {},
      missing_fields: entry.error ? [entry.error] : [],
    });
  } catch (e) {
    console.error('[VOICE] Failed to persist log:', e);
  }
}
