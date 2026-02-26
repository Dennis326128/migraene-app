/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useProphylaxisAnalysis — React Query hook for prophylaxis analysis
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Combines:
 * 1. Fetch raw data from Supabase (entries, intakes, reminders, completions)
 * 2. Map to ResolverInput
 * 3. Resolve DoseEvents
 * 4. Build DayFeatures
 * 5. Compute ProphylaxisAnalysis
 *
 * Returns analysis object ready for UI/KI/PDF consumption.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addBerlinDays, berlinDateKeyFromUtc } from '../dateKeyHelpers';
import { mapToResolverInput } from '../dataSourceMapper';
import { buildProphylaxisDayFeatures } from '../dayFeatures';
import { resolveDoseEvents } from '../cgrpDoseResolver';
import { computeProphylaxisAnalysis } from '../prePostAnalysis';
import { CGRP_DRUG_REGISTRY } from '../drugRegistry';
import type { ProphylaxisAnalysis, ProphylaxisDrug } from '../types';
import type {
  RawPainEntry,
  RawMedicationIntake,
  RawReminder,
  RawReminderCompletion,
} from '../dataSourceMapper';

const DEFAULT_LOOKBACK_DAYS = 180;

interface UseProphylaxisOptions {
  drug?: ProphylaxisDrug;
  lookbackDays?: number;
  enabled?: boolean;
}

async function fetchProphylaxisData(
  drug: ProphylaxisDrug,
  rangeStart: string,
  rangeEnd: string,
): Promise<ProphylaxisAnalysis> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch all sources in parallel
  const [entriesResult, intakesResult, remindersResult, completionsResult] = await Promise.all([
    // Pain entries with medications
    supabase
      .from('pain_entries')
      .select('id, medications, selected_date, selected_time, timestamp_created, notes, pain_level')
      .eq('user_id', user.id)
      .gte('selected_date', rangeStart)
      .lte('selected_date', rangeEnd)
      .order('selected_date', { ascending: true }),

    // Medication intakes
    supabase
      .from('medication_intakes')
      .select('id, medication_name, taken_date, taken_at, entry_id')
      .eq('user_id', user.id)
      .gte('taken_date', rangeStart)
      .lte('taken_date', rangeEnd),

    // Reminders (medication type only)
    supabase
      .from('reminders')
      .select('id, title, medications, date_time, status, type')
      .eq('user_id', user.id)
      .eq('type', 'medication')
      .gte('date_time', `${rangeStart}T00:00:00Z`)
      .lte('date_time', `${rangeEnd}T23:59:59Z`),

    // Reminder completions
    supabase
      .from('reminder_completions')
      .select('id, reminder_id, medication_name, scheduled_at, taken_at')
      .eq('user_id', user.id)
      .gte('taken_at', `${rangeStart}T00:00:00Z`)
      .lte('taken_at', `${rangeEnd}T23:59:59Z`),
  ]);

  if (entriesResult.error) throw entriesResult.error;
  if (intakesResult.error) throw intakesResult.error;
  if (remindersResult.error) throw remindersResult.error;
  if (completionsResult.error) throw completionsResult.error;

  const painEntries = (entriesResult.data || []) as RawPainEntry[];
  const medicationIntakes = (intakesResult.data || []) as RawMedicationIntake[];
  const reminders = (remindersResult.data || []) as RawReminder[];
  const reminderCompletions = (completionsResult.data || []) as RawReminderCompletion[];

  // 1. Map to ResolverInput
  const resolverInput = mapToResolverInput({
    drug,
    painEntries,
    medicationIntakes,
    reminders,
    reminderCompletions,
    timeRangeStartBerlin: rangeStart,
    timeRangeEndBerlin: rangeEnd,
  });

  // 2. Resolve dose events
  const doseEvents = resolveDoseEvents(resolverInput);

  // 3. Build day features
  const dayFeatures = buildProphylaxisDayFeatures({
    painEntries,
    rangeStartBerlin: rangeStart,
    rangeEndBerlin: rangeEnd,
  });

  // 4. Compute analysis
  const analysis = computeProphylaxisAnalysis(doseEvents, dayFeatures);

  return analysis;
}

/**
 * React Query hook for prophylaxis analysis.
 * Auto-detects CGRP drugs from user's medication list if drug not specified.
 */
export function useProphylaxisAnalysis(options: UseProphylaxisOptions = {}) {
  const {
    drug = 'ajovy',
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    enabled = true,
  } = options;

  const now = new Date();
  const rangeEnd = berlinDateKeyFromUtc(now);
  const rangeStart = addBerlinDays(rangeEnd, -lookbackDays);

  return useQuery<ProphylaxisAnalysis>({
    queryKey: ['prophylaxis-analysis', drug, rangeStart, rangeEnd],
    queryFn: () => fetchProphylaxisData(drug, rangeStart, rangeEnd),
    enabled,
    staleTime: 5 * 60_000,  // 5 minutes
    gcTime: 30 * 60_000,    // 30 minutes
  });
}

/**
 * Hook that auto-detects which CGRP drugs the user has documented.
 */
export function useDetectedCgrpDrugs() {
  return useQuery<ProphylaxisDrug[]>({
    queryKey: ['detected-cgrp-drugs'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Check user_medications for any CGRP drug
      const { data: meds } = await supabase
        .from('user_medications')
        .select('name')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!meds) return [];

      const detected = new Set<ProphylaxisDrug>();
      for (const med of meds) {
        const lower = med.name.toLowerCase();
        for (const profile of CGRP_DRUG_REGISTRY) {
          if (profile.names.some(n => lower.includes(n) || n.includes(lower))) {
            detected.add(profile.drug);
            detected.add(profile.drug);
          }
        }
      }

      return Array.from(detected);
    },
    staleTime: 60_000,
  });
}
