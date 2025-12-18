/**
 * useVoicePlanner - Hook für Voice OS Integration
 * 
 * Kapselt die VoicePlanner-Logik und stellt
 * Plan-Ausführung und State-Management bereit
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { planVoiceCommand, type PlannerResult } from '@/lib/voice/planner';
import type { 
  VoicePlan, 
  QueryPlan, 
  MutationPlan, 
  NavigatePlan,
  SlotFillingPlan,
  QueryResult 
} from '@/lib/voice/planner/types';
import type { VoiceUserContext } from '@/lib/voice/planner/skills/types';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { supabase } from '@/integrations/supabase/client';
import { 
  getLatestEntry,
  getLatestMedicationIntake,
  countMedicationDays,
} from '@/lib/analytics/queryLatest';

// ============================================
// Types
// ============================================

export type PlannerState = 
  | 'idle'
  | 'processing'
  | 'slot_filling'
  | 'confirmation'
  | 'query_result'
  | 'not_supported'
  | 'success';

export interface UsePlannerResult {
  state: PlannerState;
  currentPlan: VoicePlan | null;
  queryResult: QueryResult | null;
  error: string | null;
  
  // Actions
  processTranscript: (transcript: string) => Promise<void>;
  executePlan: (plan: VoicePlan) => Promise<boolean>;
  fillSlot: (slotName: string, value: unknown) => void;
  reset: () => void;
}

// ============================================
// Route Mapping
// ============================================

const VIEW_ROUTES: Record<string, string> = {
  'analysis': '/',
  'diary': '/',
  'medications': '/medications',
  'reminders': '/reminders',
  'settings': '/settings',
  'doctors': '/settings/doctors',
  'profile': '/settings/account',
  'voice_notes': '/',
  'diary_report': '/',
  'medication_effects': '/medication-effects',
  'new_entry': '/',
};

// ============================================
// Hook
// ============================================

export function useVoicePlanner(
  userId: string | null,
  userMeds: Array<{ id?: string; name: string }>
): UsePlannerResult {
  const navigate = useNavigate();
  
  const [state, setState] = useState<PlannerState>('idle');
  const [currentPlan, setCurrentPlan] = useState<VoicePlan | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // For slot filling - accumulated slots
  const collectedSlotsRef = useRef<Record<string, unknown>>({});
  const originalTranscriptRef = useRef<string>('');
  
  // Build context
  const buildContext = useCallback((): VoiceUserContext => ({
    userMeds,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: 'de-DE',
  }), [userMeds]);
  
  // Process transcript and create plan
  const processTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    
    setState('processing');
    setError(null);
    originalTranscriptRef.current = transcript;
    collectedSlotsRef.current = {};
    
    try {
      const context = buildContext();
      const { plan } = planVoiceCommand(transcript, context);
      
      console.log('[useVoicePlanner] Plan:', plan.kind, plan.summary);
      setCurrentPlan(plan);
      
      // Determine state based on plan kind
      switch (plan.kind) {
        case 'slot_filling':
          setState('slot_filling');
          break;
        case 'confirm':
          setState('confirmation');
          break;
        case 'not_supported':
          setState('not_supported');
          break;
        case 'query':
        case 'navigate':
        case 'mutation':
        case 'open_entry':
        case 'open_list':
          // Check confidence for auto-execute vs confirm
          if (plan.confidence >= 0.80) {
            // Auto-execute
            const success = await executePlan(plan);
            if (success && plan.kind === 'query') {
              setState('query_result');
            } else if (success) {
              setState('success');
            }
          } else if (plan.confidence >= 0.55) {
            setState('confirmation');
          } else {
            setState('not_supported');
          }
          break;
      }
    } catch (err) {
      console.error('[useVoicePlanner] Error:', err);
      setError('Verarbeitung fehlgeschlagen');
      setState('not_supported');
    }
  }, [buildContext]);
  
  // Execute a plan
  const executePlan = useCallback(async (plan: VoicePlan): Promise<boolean> => {
    if (!userId) {
      setError('Nicht eingeloggt');
      return false;
    }
    
    try {
      switch (plan.kind) {
        case 'navigate': {
          const navPlan = plan as NavigatePlan;
          const route = VIEW_ROUTES[navPlan.targetView] || '/';
          navigate(route);
          toast.success(`Navigiere zu ${navPlan.summary}`);
          return true;
        }
        
        case 'query': {
          const queryPlan = plan as QueryPlan;
          const result = await executeQuery(queryPlan, userId);
          if (result) {
            setQueryResult(result);
            // Attach result to plan for UI
            queryPlan.result = result;
            setCurrentPlan({ ...queryPlan });
            return true;
          }
          return false;
        }
        
        case 'mutation': {
          const mutPlan = plan as MutationPlan;
          return await executeMutation(mutPlan, userId);
        }
        
        case 'open_entry': {
          // TODO: Open specific entry in diary
          toast.info('Eintrag öffnen (noch nicht implementiert)');
          return true;
        }
        
        case 'open_list': {
          // Navigate to appropriate list view
          navigate('/');
          return true;
        }
        
        default:
          return false;
      }
    } catch (err) {
      console.error('[useVoicePlanner] Execute error:', err);
      setError('Ausführung fehlgeschlagen');
      return false;
    }
  }, [userId, navigate]);
  
  // Fill a slot and re-process
  const fillSlot = useCallback((slotName: string, value: unknown) => {
    if (!currentPlan || currentPlan.kind !== 'slot_filling') return;
    
    const slotPlan = currentPlan as SlotFillingPlan;
    collectedSlotsRef.current[slotName] = value;
    
    // Merge with partial slots
    const allSlots = {
      ...slotPlan.partial.collectedSlots,
      ...collectedSlotsRef.current,
    };
    
    // Re-process with additional context
    const context = buildContext();
    const enhancedTranscript = `${originalTranscriptRef.current} ${slotName}:${value}`;
    
    // For now, just re-run the planner
    processTranscript(enhancedTranscript);
  }, [currentPlan, buildContext, processTranscript]);
  
  // Reset state
  const reset = useCallback(() => {
    setState('idle');
    setCurrentPlan(null);
    setQueryResult(null);
    setError(null);
    collectedSlotsRef.current = {};
    originalTranscriptRef.current = '';
  }, []);
  
  return {
    state,
    currentPlan,
    queryResult,
    error,
    processTranscript,
    executePlan,
    fillSlot,
    reset,
  };
}

// ============================================
// Query Execution
// ============================================

async function executeQuery(
  plan: QueryPlan, 
  userId: string
): Promise<QueryResult | null> {
  const { queryType, params } = plan;
  
  try {
    switch (queryType) {
      case 'last_entry': {
        const result = await getLatestEntry(userId);
        if (result.success && result.entry) {
          return {
            type: 'single',
            entry: {
              id: result.entry.id,
              date: result.entry.occurredAtFormatted,
              painLevel: result.entry.painLevel,
              medications: result.entry.medications,
              notes: result.entry.notes || undefined,
            },
            message: `Letzter Eintrag: ${result.entry.occurredAtFormatted}`,
          };
        }
        return {
          type: 'single',
          message: 'Keine Einträge gefunden',
        };
      }
      
      case 'last_intake_med': {
        if (!params.medName) {
          return { type: 'single', message: 'Kein Medikament angegeben' };
        }
        const result = await getLatestMedicationIntake(userId, params.medName);
        if (result.success && result.intake) {
          return {
            type: 'single',
            entry: {
              id: result.intake.entryId,
              date: result.intake.occurredAtFormatted,
              painLevel: result.intake.painLevel,
              medications: result.intake.allMedications,
            },
            message: `Zuletzt ${result.intake.medicationMatched}: ${result.intake.occurredAtFormatted}`,
          };
        }
        return {
          type: 'single',
          message: `Keine Einnahme von ${params.medName} gefunden`,
        };
      }
      
      case 'count_med_range': {
        if (!params.medName) {
          return { type: 'count', count: 0, message: 'Kein Medikament angegeben' };
        }
        const days = params.timeRange?.days || 30;
        const result = await countMedicationDays(userId, params.medName, days);
        return {
          type: 'count',
          count: result.count,
          message: result.formattedResult,
        };
      }
      
      case 'count_migraine_range': {
        const days = params.timeRange?.days || 30;
        // Query migraine days
        const from = new Date();
        from.setDate(from.getDate() - days);
        
        const { count } = await supabase
          .from('pain_entries')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('selected_date', from.toISOString().split('T')[0]);
        
        return {
          type: 'count',
          count: count || 0,
          message: `${count || 0} Einträge in den letzten ${days} Tagen`,
        };
      }
      
      case 'avg_pain_range': {
        const days = params.timeRange?.days || 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        
        const { data } = await supabase
          .from('pain_entries')
          .select('pain_level')
          .eq('user_id', userId)
          .gte('selected_date', from.toISOString().split('T')[0]);
        
        if (data && data.length > 0) {
          const avg = data.reduce((sum, e) => {
            const level = parseInt(e.pain_level, 10);
            return sum + (isNaN(level) ? 5 : level);
          }, 0) / data.length;
          
          return {
            type: 'average',
            average: avg,
            message: `Durchschnittliche Stärke: ${avg.toFixed(1)}`,
          };
        }
        
        return {
          type: 'average',
          average: 0,
          message: 'Keine Einträge im Zeitraum',
        };
      }
      
      default:
        return { type: 'single', message: 'Abfrage nicht unterstützt' };
    }
  } catch (err) {
    console.error('[executeQuery] Error:', err);
    return { type: 'single', message: 'Fehler bei der Abfrage' };
  }
}

// ============================================
// Mutation Execution
// ============================================

async function executeMutation(
  plan: MutationPlan,
  userId: string
): Promise<boolean> {
  const { mutationType, payload } = plan;
  
  try {
    switch (mutationType) {
      case 'save_voice_note': {
        const notePayload = payload as { text: string };
        const noteId = await saveVoiceNote({
          rawText: notePayload.text,
          sttConfidence: 0.95,
          source: 'voice',
        });
        
        toast.success('Notiz gespeichert', {
          description: notePayload.text.substring(0, 50) + (notePayload.text.length > 50 ? '...' : ''),
          action: {
            label: 'Rückgängig',
            onClick: async () => {
              await supabase
                .from('voice_notes')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', noteId);
              toast.success('Notiz rückgängig gemacht');
            },
          },
          duration: 8000,
        });
        
        window.dispatchEvent(new Event('voice-note-saved'));
        return true;
      }
      
      case 'create_reminder': {
        const reminderPayload = payload as {
          title: string;
          dateTime: string;
          medications?: string[];
          repeat?: string;
        };
        
        const { error } = await supabase
          .from('reminders')
          .insert({
            user_id: userId,
            title: reminderPayload.title,
            date_time: reminderPayload.dateTime,
            medications: reminderPayload.medications,
            repeat: reminderPayload.repeat || 'none',
            type: 'medication',
            status: 'active',
            notification_enabled: true,
          });
        
        if (error) throw error;
        
        toast.success('Erinnerung erstellt', {
          description: reminderPayload.title,
        });
        return true;
      }
      
      case 'quick_pain_entry': {
        const entryPayload = payload as {
          painLevel: number;
          medications?: string[];
          notes?: string;
        };
        
        const { error } = await supabase
          .from('pain_entries')
          .insert({
            user_id: userId,
            pain_level: String(entryPayload.painLevel),
            medications: entryPayload.medications,
            notes: entryPayload.notes,
            selected_date: new Date().toISOString().split('T')[0],
            selected_time: new Date().toTimeString().slice(0, 5),
          });
        
        if (error) throw error;
        
        toast.success(`Eintrag erstellt: Stärke ${entryPayload.painLevel}`);
        window.dispatchEvent(new Event('pain-entry-saved'));
        return true;
      }
      
      case 'rate_intake': {
        // TODO: Implement rating
        toast.info('Bewertung speichern (noch nicht implementiert)');
        return true;
      }
      
      default:
        toast.error('Aktion nicht unterstützt');
        return false;
    }
  } catch (err) {
    console.error('[executeMutation] Error:', err);
    toast.error('Aktion fehlgeschlagen');
    return false;
  }
}
