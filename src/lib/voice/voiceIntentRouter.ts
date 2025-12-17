/**
 * Voice Intent Router
 * Zentrale Routing-Logik für Voice-Befehle
 * Prüft zuerst Navigations-Intents, dann Fach-Intents
 */

import type { VoiceUserContext, VoiceAnalysisResult } from '@/types/voice.types';
import { detectNavigationIntent, type NavigationIntent } from './navigationIntents';
import { analyzeVoiceTranscript } from './voiceNlp';

// ============================================
// Types
// ============================================

export type VoiceRouterResultType =
  // Navigation Intents
  | 'navigate_reminder_create'
  | 'navigate_appointment_create'
  | 'navigate_profile_edit'
  | 'navigate_doctor_edit'
  | 'navigate_diary'
  | 'navigate_analysis'
  | 'navigate_report'
  | 'navigate_medications'
  | 'navigate_settings'
  | 'help'
  // Content Intents
  | 'create_pain_entry'
  | 'create_quick_entry'
  | 'create_medication_update'
  | 'create_medication_effect'
  | 'create_note'
  | 'analytics_query'
  | 'unknown';

export interface VoiceRouterResult {
  type: VoiceRouterResultType;
  payload?: unknown;
  rawTranscript: string;
  confidence: number;
  source: 'navigation' | 'content' | 'fallback';
}

// ============================================
// Main Router Function
// ============================================

/**
 * Zentrale Routing-Funktion für Voice-Befehle
 * Prüft zuerst Navigations-Intents, dann Fach-Intents
 */
export function routeVoiceCommand(
  transcript: string,
  userContext: VoiceUserContext
): VoiceRouterResult {
  console.log('🎯 Voice Router: Processing transcript:', transcript.substring(0, 80));
  
  if (!transcript || transcript.trim().length < 3) {
    return {
      type: 'unknown',
      rawTranscript: transcript,
      confidence: 0,
      source: 'fallback'
    };
  }

  // 1. Prüfe Navigation-Intents (höchste Priorität)
  const navigationIntent = detectNavigationIntent(transcript, userContext.userMeds);
  
  if (navigationIntent) {
    console.log('✅ Navigation Intent detected:', navigationIntent.type);
    return {
      type: navigationIntent.type,
      payload: navigationIntent.payload,
      rawTranscript: transcript,
      confidence: 0.9,
      source: 'navigation'
    };
  }

  // 2. Prüfe Fach-Intents (Pain Entry, Medication Update, etc.)
  const contentAnalysis = analyzeVoiceTranscript(transcript, userContext);
  
  console.log('📊 Content Analysis:', {
    intent: contentAnalysis.intent,
    intentConfidence: contentAnalysis.intentConfidence
  });

  // Map content intents to router result
  switch (contentAnalysis.intent) {
    case 'pain_entry':
      return {
        type: 'create_pain_entry',
        payload: contentAnalysis.painEntry,
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'medication_update':
      return {
        type: 'create_medication_update',
        payload: contentAnalysis.medicationUpdate,
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'medication_effect':
      return {
        type: 'create_medication_effect',
        payload: { text: transcript },
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'reminder':
      // If reminder was detected by content analysis, route to navigation
      return {
        type: 'navigate_reminder_create',
        payload: contentAnalysis.reminder,
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'analytics_query':
      return {
        type: 'analytics_query',
        payload: contentAnalysis.analyticsQuery,
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'note':
      return {
        type: 'create_note',
        payload: { text: transcript },
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'content'
      };

    case 'unknown':
    default:
      return {
        type: 'unknown',
        rawTranscript: transcript,
        confidence: contentAnalysis.intentConfidence,
        source: 'fallback'
      };
  }
}

// ============================================
// Route Mapping
// ============================================

/**
 * Gibt die Ziel-Route für einen Intent zurück
 */
export function getRouteForIntent(intentType: VoiceRouterResultType): string | null {
  const routeMap: Record<VoiceRouterResultType, string | null> = {
    // Navigation
    navigate_reminder_create: '/reminders',
    navigate_appointment_create: '/reminders',
    navigate_profile_edit: '/settings/account',
    navigate_doctor_edit: '/settings/doctors',
    navigate_diary: '/diary',
    navigate_analysis: '/analysis',
    navigate_report: '/analysis', // Report generation is part of analysis
    navigate_medications: '/medications',
    navigate_settings: '/settings',
    help: null, // Help is shown as overlay
    
    // Content (these open modals, not routes)
    create_pain_entry: null,
    create_quick_entry: null,
    create_medication_update: null,
    create_medication_effect: '/medication-effects',
    create_note: null,
    analytics_query: null, // Handled in overlay
    unknown: null,
  };
  
  return routeMap[intentType] || null;
}

/**
 * Prüft ob ein Intent eine Navigation auslöst
 */
export function isNavigationIntent(intentType: VoiceRouterResultType): boolean {
  return intentType.startsWith('navigate_');
}

/**
 * Prüft ob ein Intent Inhalt erstellt
 */
export function isContentIntent(intentType: VoiceRouterResultType): boolean {
  return intentType.startsWith('create_');
}
