/**
 * Last Context Helper
 * Loads recent medication intakes and pain entries for context-aware defaults
 */

import { supabase } from '@/integrations/supabase/client';

export interface LastIntake {
  id: string;
  medicationName: string;
  medicationId?: string;
  entryId: number;
  timestamp: Date;
}

export interface LastPainEntry {
  id: number;
  painLevel: string;
  timestamp: Date;
  notes?: string;
  medications?: string[];
}

export interface LastRelevantContext {
  lastIntake: LastIntake | null;
  lastPainEntry: LastPainEntry | null;
  contextAge: {
    intakeHours: number | null;
    entryHours: number | null;
  };
}

const CONTEXT_MAX_HOURS = 48;

/**
 * Load the most recent relevant context for a user
 * Used for implicit references like "Wirkung war gut" (without specifying which medication)
 */
export async function loadLastContext(userId: string): Promise<LastRelevantContext> {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - CONTEXT_MAX_HOURS * 60 * 60 * 1000);
  
  const [intakesResult, entriesResult] = await Promise.all([
    // Last medication intake
    supabase
      .from('medication_intakes')
      .select('id, medication_name, medication_id, entry_id, created_at')
      .eq('user_id', userId)
      .gte('created_at', cutoffTime.toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
    
    // Last pain entry
    supabase
      .from('pain_entries')
      .select('id, pain_level, timestamp_created, notes, medications')
      .eq('user_id', userId)
      .gte('timestamp_created', cutoffTime.toISOString())
      .order('timestamp_created', { ascending: false })
      .limit(1),
  ]);
  
  let lastIntake: LastIntake | null = null;
  let lastPainEntry: LastPainEntry | null = null;
  let intakeHours: number | null = null;
  let entryHours: number | null = null;
  
  if (intakesResult.data && intakesResult.data.length > 0) {
    const intake = intakesResult.data[0];
    const intakeTime = new Date(intake.created_at);
    intakeHours = (now.getTime() - intakeTime.getTime()) / (1000 * 60 * 60);
    
    lastIntake = {
      id: intake.id,
      medicationName: intake.medication_name,
      medicationId: intake.medication_id || undefined,
      entryId: intake.entry_id,
      timestamp: intakeTime,
    };
  }
  
  if (entriesResult.data && entriesResult.data.length > 0) {
    const entry = entriesResult.data[0];
    const entryTime = new Date(entry.timestamp_created || new Date());
    entryHours = (now.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
    
    lastPainEntry = {
      id: entry.id,
      painLevel: entry.pain_level,
      timestamp: entryTime,
      notes: entry.notes || undefined,
      medications: entry.medications || undefined,
    };
  }
  
  return {
    lastIntake,
    lastPainEntry,
    contextAge: {
      intakeHours,
      entryHours,
    }
  };
}

/**
 * Check if context needs confirmation (older than threshold)
 */
export function needsContextConfirmation(
  context: LastRelevantContext, 
  thresholdHours: number = 24
): boolean {
  const { contextAge } = context;
  
  // If we have an intake and it's older than threshold, need confirmation
  if (contextAge.intakeHours !== null && contextAge.intakeHours > thresholdHours) {
    return true;
  }
  
  // If we have an entry and it's older than threshold, need confirmation
  if (contextAge.entryHours !== null && contextAge.entryHours > thresholdHours) {
    return true;
  }
  
  return false;
}

/**
 * Format context for display
 */
export function formatContextForDisplay(context: LastRelevantContext): string {
  const parts: string[] = [];
  
  if (context.lastIntake) {
    const hoursAgo = context.contextAge.intakeHours;
    const timeStr = hoursAgo !== null && hoursAgo < 1 
      ? 'gerade eben' 
      : hoursAgo !== null && hoursAgo < 24
        ? `vor ${Math.round(hoursAgo)} Std.`
        : formatDate(context.lastIntake.timestamp);
    parts.push(`${context.lastIntake.medicationName} (${timeStr})`);
  }
  
  if (context.lastPainEntry) {
    const hoursAgo = context.contextAge.entryHours;
    const timeStr = hoursAgo !== null && hoursAgo < 1 
      ? 'gerade eben' 
      : hoursAgo !== null && hoursAgo < 24
        ? `vor ${Math.round(hoursAgo)} Std.`
        : formatDate(context.lastPainEntry.timestamp);
    parts.push(`Eintrag Stärke ${context.lastPainEntry.painLevel} (${timeStr})`);
  }
  
  return parts.join(' | ') || 'Kein aktueller Kontext';
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'heute';
  if (diffDays === 1) return 'gestern';
  if (diffDays === 2) return 'vorgestern';
  
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
