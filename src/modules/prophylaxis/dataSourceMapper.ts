/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Prophylaxis Data Source Mapper — Maps real Supabase data to ResolverInput
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bridges the gap between raw DB rows and the Phase-1 domain types.
 * No business logic here — pure mapping.
 */

import type {
  ProphylaxisDrug,
  ResolverInput,
  DiaryMedicationRecord,
  MedicationIntakeRecord,
  ReminderRecord,
  ReminderCompletionRecord,
} from './types';
import { berlinDateKeyFromUtc } from './dateKeyHelpers';
import { findDrugProfile } from './drugRegistry';

// ─── Raw DB Row Types (mirrors Supabase tables) ─────────────────────────

export interface RawPainEntry {
  id: number;
  medications: string[] | null;
  selected_date: string | null;
  selected_time: string | null;
  timestamp_created: string | null;
  notes: string | null;
  pain_level: string;
}

export interface RawMedicationIntake {
  id: string;
  medication_name: string;
  taken_date: string | null;
  taken_at: string | null;
  entry_id: number;
}

export interface RawReminder {
  id: string;
  title: string;
  medications: string[] | null;
  date_time: string;
  status: string;
  type: string;
}

export interface RawReminderCompletion {
  id: string;
  reminder_id: string;
  medication_name: string | null;
  scheduled_at: string;
  taken_at: string;
}

// ─── Mapper ─────────────────────────────────────────────────────────────

export interface MapperInput {
  drug: ProphylaxisDrug;
  painEntries: RawPainEntry[];
  medicationIntakes: RawMedicationIntake[];
  reminders: RawReminder[];
  reminderCompletions: RawReminderCompletion[];
  timeRangeStartBerlin: string;
  timeRangeEndBerlin: string;
}

/**
 * Maps raw Supabase rows to the domain ResolverInput.
 * Uses SSOT dateKeyBerlin derived from selected_date (preferred) or timestamp_created.
 */
export function mapToResolverInput(input: MapperInput): ResolverInput {
  const profile = findDrugProfile(input.drug);
  const drugNames = profile
    ? profile.names
    : [input.drug];

  // Map diary entries
  const diaryEntries: DiaryMedicationRecord[] = input.painEntries
    .filter(e => e.medications && e.medications.length > 0)
    .map(e => {
      // SSOT: use selected_date as authoritative calendar day
      const dateKeyBerlin = e.selected_date
        || (e.timestamp_created ? berlinDateKeyFromUtc(e.timestamp_created) : '');

      // Build timestampUtc from selected_date + selected_time, fallback to timestamp_created
      let timestampUtc: string | undefined;
      if (e.timestamp_created) {
        timestampUtc = e.timestamp_created;
      }

      return {
        entryId: e.id,
        dateKeyBerlin,
        timestampUtc,
        medicationNames: e.medications || [],
        notes: e.notes || undefined,
      };
    })
    .filter(e => e.dateKeyBerlin !== '');

  // Map medication intakes
  const medicationIntakes: MedicationIntakeRecord[] = input.medicationIntakes.map(i => ({
    id: i.id,
    medicationName: i.medication_name,
    dateKeyBerlin: i.taken_date || (i.taken_at ? berlinDateKeyFromUtc(i.taken_at) : ''),
    timestampUtc: i.taken_at || undefined,
  })).filter(i => i.dateKeyBerlin !== '');

  // Map reminders (only medication type)
  const reminders: ReminderRecord[] = input.reminders
    .filter(r => r.type === 'medication')
    .map(r => ({
      id: r.id,
      title: r.title,
      medications: r.medications || [],
      scheduledDateKeyBerlin: berlinDateKeyFromUtc(r.date_time),
      scheduledTimestampUtc: r.date_time,
    }));

  // Map reminder completions
  const reminderCompletions: ReminderCompletionRecord[] = input.reminderCompletions.map(c => ({
    reminderId: c.reminder_id,
    completedDateKeyBerlin: berlinDateKeyFromUtc(c.taken_at),
    completedTimestampUtc: c.taken_at,
  }));

  return {
    drug: input.drug,
    drugNames,
    diaryEntries,
    medicationIntakes,
    reminders,
    reminderCompletions,
    timeRangeStartBerlin: input.timeRangeStartBerlin,
    timeRangeEndBerlin: input.timeRangeEndBerlin,
  };
}
